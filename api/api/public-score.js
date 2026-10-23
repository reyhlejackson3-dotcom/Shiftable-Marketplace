'use strict';

const { rest, readBody, httpError } = require('./_lib/supa');
const { fetchHtml } = require('./_lib/http');
const { analyzeHtml, buildReport, runPageSpeed, siteExtras, gradeLetter } = require('./_lib/score');
const { normalizeUrl, hostOf, isSafePublicHost, isThirdPartyProfile } = require('./_lib/url');
const { ipHash, teaser } = require('./_lib/pub');

const PER_IP_PER_HOUR = 6;      // scans one visitor can start per hour (cached ones count too)
const FRESH_PER_DAY = 250;      // brand-new PageSpeed runs per day across everyone: protects your Google quota
const CACHE_DAYS = 7;           // a site scored in the last week is reused, not re-run

const ago = (ms) => new Date(Date.now() - ms).toISOString();

// POST { url } -> { scan_id, host, grade, weakest, problems, categories }
// Public (no login). The full report stays in the database until /api/public-unlock is called.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rowId = null;
  try {
    const raw = String(readBody(req).url || '').trim();
    const url = raw.length <= 300 ? normalizeUrl(raw) : null;
    const host = url ? hostOf(url) : '';
    if (!url || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
      throw httpError(400, 'Enter a website address like yourbusiness.com');
    }
    if (isThirdPartyProfile(url)) {
      throw httpError(400, "That's a social or directory page, not a website. Enter your own site's address.");
    }
    if (!isSafePublicHost(url)) throw httpError(400, 'Enter a website address like yourbusiness.com');

    const hash = ipHash(req);

    // 1. Per-visitor limit.
    const recent = await rest(`scorer_scans?ip_hash=eq.${hash}&created_at=gte.${encodeURIComponent(ago(3600e3))}&select=id&limit=${PER_IP_PER_HOUR + 1}`);
    if (recent.length >= PER_IP_PER_HOUR) {
      throw httpError(429, "You've scored a lot of sites in the last hour. Try again a bit later.");
    }

    // 2. Reuse a recent score for the same site.
    const hit = await rest(
      `scorer_scans?host=eq.${encodeURIComponent(host)}&status=eq.scored&created_at=gte.${encodeURIComponent(ago(CACHE_DAYS * 864e5))}` +
        `&select=score,grade,report&order=created_at.desc&limit=1`
    );
    const cached = hit && hit[0];

    // 3. Global daily cap on fresh runs.
    if (!cached) {
      const fresh = await rest(`scorer_scans?cached=eq.false&created_at=gte.${encodeURIComponent(ago(864e5))}&select=id&limit=${FRESH_PER_DAY + 1}`);
      if (fresh.length >= FRESH_PER_DAY) {
        throw httpError(503, "We're getting a lot of scores today and have hit our daily limit. Try again tomorrow, or message us below.");
      }
    }

    // The row is created first, so a burst of parallel requests still counts against the limits.
    const made = await rest('scorer_scans?select=id', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        host, url, ip_hash: hash, cached: !!cached,
        ...(cached ? { status: 'scored', score: cached.score, grade: cached.grade, report: cached.report } : { status: 'pending' }),
      },
    });
    rowId = made[0].id;

    if (cached) {
      return res.status(200).json(teaser({ id: rowId, host, grade: cached.grade, score: cached.score, report: cached.report }));
    }

    const [psi, page, extras] = await Promise.all([runPageSpeed(url), fetchHtml(url), siteExtras(url)]);
    const finalUrl = (page && page.url) || psi.finalUrl || url;
    const { score, report } = buildReport(psi, page ? analyzeHtml(page.html, null) : null, finalUrl, { ...extras, city: null });
    const grade = gradeLetter(score);

    await rest(`scorer_scans?id=eq.${rowId}`, { method: 'PATCH', body: { status: 'scored', score, grade, report } });
    return res.status(200).json(teaser({ id: rowId, host, grade, score, report }));
  } catch (e) {
    if (rowId) {
      try { await rest(`scorer_scans?id=eq.${rowId}`, { method: 'PATCH', body: { status: 'error' } }); } catch { /* ignore */ }
    }
    if (e && e.status && e.status < 500) return res.status(e.status).json({ error: e.message });
    if (e && e.status === 503) return res.status(503).json({ error: e.message });
    // Anything else (PageSpeed couldn't load the site, database hiccup): don't leak internals.
    console.error('public-score failed:', e && e.message);
    const unreachable = e && /PageSpeed (400|500)|FAILED_DOCUMENT_REQUEST|ERR_/i.test(e.message || '');
    return res.status(502).json({
      error: unreachable
        ? "We couldn't open that site. Check the address and try again."
        : 'Something went wrong scoring that site. Please try again in a minute.',
    });
  }
};
