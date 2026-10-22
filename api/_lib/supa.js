'use strict';

// Files in api/_lib start with an underscore, so Vercel does not expose them as endpoints.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://obuudbrlurybwcvuungr.supabase.co';
// Public key. It's the same one dashboard.html already ships to every browser.
const PUBLISHABLE_KEY = 'sb_publishable_uyqV26xV1aLF_HjhIdCYcA_fUgo0KkY';

const LIST_COLUMNS =
  'id,name,address,phone,website,rating,review_count,query,email,score,score_status,score_error,status,created_at,scored_at';

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function serviceKey() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw httpError(500, 'SUPABASE_SERVICE_ROLE_KEY is not set in Vercel environment variables');
  return k;
}

// Talks to Supabase's REST API with the service role key. Server-side only: this key can bypass
// every row-level-security rule, so it must never be sent to the browser or committed to GitHub.
async function rest(path, opts = {}) {
  const key = serviceKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    if (/relation .*outreach_leads.* does not exist|PGRST205/i.test(text)) {
      msg = 'The outreach_leads table is missing. Run supabase/outreach_leads.sql in the Supabase SQL editor first.';
    }
    throw httpError(500, `Database error (${res.status}): ${msg}`);
  }
  return text ? JSON.parse(text) : null;
}

// Checks the Supabase session token the browser sends, then checks that user is in the admins table.
async function requireAdmin(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/i);
  if (!m) throw httpError(401, 'Not signed in');

  let user;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${m[1]}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw httpError(401, 'Session expired. Sign in again.');
    user = await r.json();
  } catch (e) {
    throw e.status ? e : httpError(502, 'Could not reach Supabase to check your login');
  }
  if (!user || !user.id) throw httpError(401, 'Session expired. Sign in again.');

  const rows = await rest(`admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
  if (!rows || !rows.length) throw httpError(403, 'Admins only');
  return user;
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return {};
}

function fail(res, e) {
  const status = e && e.status ? e.status : 500;
  res.status(status).json({ error: (e && e.message) || 'Something went wrong' });
}

module.exports = { rest, requireAdmin, readBody, fail, httpError, LIST_COLUMNS };
