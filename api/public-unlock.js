'use strict';

const { rest, readBody, httpError } = require('./_lib/supa');
const { fullReport, cleanPhone, cleanEmail } = require('./_lib/pub');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { scan_id, email, phone, name?, consent, website(honeypot) } -> the full report.
// The report is only returned here, after valid contact details are saved.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = readBody(req);
    if (b.website) throw httpError(400, 'Something went wrong. Please try again.'); // honeypot: real visitors never see this field

    const id = String(b.scan_id || '');
    if (!UUID.test(id)) throw httpError(400, 'Score your site first.');

    const email = cleanEmail(b.email);
    if (!email) throw httpError(400, 'Enter a valid email address.');
    const phone = cleanPhone(b.phone);
    if (!phone) throw httpError(400, 'Enter a valid 10-digit US phone number.');
    if (b.consent !== true) throw httpError(400, 'Please tick the box so we can send your results.');
    const name = String(b.name || '').trim().slice(0, 120) || null;

    const found = await rest(`scorer_scans?id=eq.${id}&select=id,host,status,score,grade,report`);
    const row = found && found[0];
    if (!row) throw httpError(404, 'That score has expired. Score your site again.');
    if (row.status !== 'scored') throw httpError(409, 'That score is not ready. Score your site again.');

    await rest(`scorer_scans?id=eq.${id}`, {
      method: 'PATCH',
      body: { email, phone, name, consent: true, unlocked_at: new Date().toISOString() },
    });
    return res.status(200).json(fullReport(row));
  } catch (e) {
    if (e && e.status && e.status < 500) return res.status(e.status).json({ error: e.message });
    console.error('public-unlock failed:', e && e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
