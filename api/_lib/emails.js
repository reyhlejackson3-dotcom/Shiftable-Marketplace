'use strict';

const { fetchHtml } = require('./http');
const { hostOf } = require('./url');

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

const FILE_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'woff', 'woff2', 'ico', 'pdf']);
const JUNK_DOMAINS = [
  'example.com', 'domain.com', 'yourdomain.com', 'email.com', 'sentry.io', 'wixpress.com',
  'godaddy.com', 'squarespace.com', 'wordpress.com', 'schema.org', 'w3.org',
];
const JUNK_LOCALS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster',
  'abuse', 'privacy', 'unsubscribe', 'webmaster',
];
const PREFERRED_LOCALS = ['info', 'contact', 'hello', 'office', 'service', 'sales', 'support', 'admin', 'team', 'mail'];

function extractEmails(html) {
  const decoded = html
    .replace(/&#0*64;|&#x0*40;|&commat;|%40/gi, '@')
    .replace(/&#0*46;|&#x0*2e;|&period;/gi, '.');
  const found = new Set();
  for (const raw of decoded.match(EMAIL_RE) || []) {
    const email = raw.toLowerCase().replace(/^[.%+-]+/, '');
    const [local, domain] = email.split('@');
    if (!local || !domain) continue;
    const tld = domain.split('.').pop() || '';
    if (FILE_TLDS.has(tld)) continue;
    if (JUNK_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) continue;
    if (JUNK_LOCALS.includes(local)) continue;
    if (/^\d+x?$/.test(local)) continue;
    found.add(email);
  }
  return [...found];
}

// Prefer an address on the business's own domain, then generic role addresses (info@, contact@...).
function pickBestEmail(emails, siteUrl) {
  if (!emails.length) return null;
  const siteHost = hostOf(siteUrl);
  const rank = (email) => {
    const [local, domain] = email.split('@');
    let score = 0;
    if (siteHost && (siteHost === domain || siteHost.endsWith('.' + domain) || domain.endsWith('.' + siteHost))) score += 100;
    const idx = PREFERRED_LOCALS.indexOf(local);
    if (idx >= 0) score += 20 - idx;
    return score;
  };
  return [...emails].sort((a, b) => rank(b) - rank(a))[0];
}

function contactLinks(html, baseUrl) {
  const out = new Set();
  const base = new URL(baseUrl);
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!/contact|about/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      if (u.hostname === base.hostname && /^https?:$/.test(u.protocol)) out.add(u.toString());
    } catch {
      /* ignore bad hrefs */
    }
    if (out.size >= 2) break;
  }
  return [...out];
}

// Looks on the homepage first. If there's no email there, checks up to 3 contact/about pages.
async function findBestEmail(baseUrl, homepageHtml) {
  if (homepageHtml) {
    const best = pickBestEmail(extractEmails(homepageHtml), baseUrl);
    if (best) return { email: best, source: baseUrl };
  }

  let origin;
  try {
    origin = new URL(baseUrl);
  } catch {
    return null;
  }
  const candidates = new Set(homepageHtml ? contactLinks(homepageHtml, baseUrl) : []);
  candidates.add(new URL('/contact', origin).toString());
  candidates.add(new URL('/contact-us', origin).toString());

  const pages = await Promise.all([...candidates].slice(0, 3).map((u) => fetchHtml(u, 6000)));
  const emails = [];
  const sourceFor = new Map();
  for (const page of pages) {
    if (!page) continue;
    for (const e of extractEmails(page.html)) {
      emails.push(e);
      if (!sourceFor.has(e)) sourceFor.set(e, page.url);
    }
  }
  const best = pickBestEmail(emails, baseUrl);
  return best ? { email: best, source: sourceFor.get(best) || baseUrl } : null;
}

module.exports = { extractEmails, pickBestEmail, findBestEmail };
