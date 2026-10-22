'use strict';

const { rest, requireAdmin, readBody, fail, LIST_COLUMNS } = require('./_lib/supa');
const { fetchHtml } = require('./_lib/http');
const { findBestEmail } = require('./_lib/emails');
const { analyzeHtml, buildReport, runPageSpeed } = require('./_lib/score');
const { isSafePublicHost, normalizeUrl } = require('./_lib/url');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { id } -> scores ONE lead. PageSpeed alone takes 10-30s, so the leads page loops over
// leads and calls this once per lead instead of doing a big batch inside a single function.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await requireAdmin(req);

    const id = String(readBody(req).id || '');
    if (!UUID.test(id)) return res.status(400).json({ error: 'Missing or invalid id' });

    const found = await rest(`outreach_leads?id=eq.${id}&select=id,website,email`);
    const lead = found && found[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const save = async (patch) => {
      const rows = await rest(`outreach_leads?id=eq.${id}&select=${LIST_COLUMNS}`, {
        method: 'PATCH',
        body: patch,
        prefer: 'return=representation',
      });
      return res.status(200).json({ lead: rows && rows[0] });
    };

    const url = lead.website ? normalizeUrl(lead.website) : null;
    if (!url) return save({ score_status: 'no_website', score_error: null });
    if (!isSafePublicHost(url)) {
      return save({ score_status: 'error', score_error: "Website address isn't a public site" });
    }

    try {
      // PageSpeed and the homepage/email lookup run at the same time.
      const pageWork = fetchHtml(url).then(async (page) => {
        const email = lead.email ? null : await findBestEmail(page ? page.url : url, page ? page.html : null);
        return { page, email };
      });
      const [psi, work] = await Promise.all([runPageSpeed(url), pageWork]);
      const page = work.page;
      const email = work.email;

      const finalUrl = (page && page.url) || psi.finalUrl || url;
      const { score, report } = buildReport(psi, page ? analyzeHtml(page.html) : null, finalUrl);

      return save({
        score,
        score_status: 'scored',
        score_error: null,
        report,
        scored_at: new Date().toISOString(),
        ...(email ? { email: email.email, email_source: email.source } : {}),
      });
    } catch (e) {
      // A site that fails to score is recorded on the lead so it can be retried; it isn't a server error.
      const message = (e && e.message) || 'Scoring failed';
      return save({ score_status: 'error', score_error: message.slice(0, 300) });
    }
  } catch (e) {
    fail(res, e);
  }
};
