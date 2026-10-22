'use strict';

const UA = 'Mozilla/5.0 (compatible; SiteCheck/1.0)';

// Fetch a page as HTML. Returns null on any failure (timeout, 4xx/5xx, non-HTML),
// because a site that blocks bots shouldn't crash the whole scoring run.
async function fetchHtml(url, timeoutMs = 8000) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || (type && !type.includes('html'))) return null;
    const text = await res.text();
    return { url: res.url || url, status: res.status, html: text.slice(0, 1500000) };
  } catch {
    return null;
  }
}

module.exports = { fetchHtml };
