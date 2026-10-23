'use strict';

const dns = require('dns').promises;
const net = require('net');
const { isSafePublicHost } = require('./url');

const UA = 'Mozilla/5.0 (compatible; SiteCheck/1.0)';
const MAX_HOPS = 5;

// True for any address that is not on the public internet (loopback, private ranges, link-local
// such as the cloud metadata address, carrier-grade NAT, multicast, and their IPv6 equivalents).
function isPrivateIp(ip) {
  const s = String(ip).toLowerCase();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  if (net.isIPv4(s)) {
    const [a, b] = s.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(s)) {
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s);
  }
  return true; // not an IP we understand: refuse
}

// Throws unless the URL points at the public internet. Checks the hostname text AND what it
// resolves to, so a name that secretly points at a private address is refused too.
async function assertPublic(url) {
  if (!isSafePublicHost(url)) throw new Error('blocked host');
  const host = new URL(url).hostname;
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('blocked host');
    return;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('blocked host');
}

// fetch that follows redirects by hand so every hop is checked before it is requested.
// Returns { res, url } where url is the final address.
async function safeFetch(url, init, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertPublic(current);
    const res = await fetch(current, { ...init, redirect: 'manual', signal });
    const loc = res.status >= 300 && res.status < 400 && res.headers && res.headers.get('location');
    if (loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return { res, url: current };
  }
  throw new Error('too many redirects');
}

// Fetch a page as HTML. Returns null on any failure (timeout, 4xx/5xx, non-HTML, blocked host),
// because a site that blocks bots shouldn't crash the whole scoring run.
async function fetchHtml(url, timeoutMs = 8000) {
  try {
    const { res, url: finalUrl } = await safeFetch(
      url,
      { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } },
      timeoutMs
    );
    const type = res.headers.get('content-type') || '';
    if (!res.ok || (type && !type.includes('html'))) return null;
    const text = await res.text();
    return { url: finalUrl, status: res.status, html: text.slice(0, 1500000) };
  } catch {
    return null;
  }
}

// Fetch any text file (robots.txt, sitemap.xml). Unlike fetchHtml it returns the status
// even for 404s, because "the file doesn't exist" is itself an answer. Null only means
// the request never completed (or the host was refused).
async function fetchAny(url, timeoutMs = 6000) {
  try {
    const { res } = await safeFetch(url, { headers: { 'User-Agent': UA } }, timeoutMs);
    const text = (await res.text()).slice(0, 200000);
    return { status: res.status, text };
  } catch {
    return null;
  }
}

module.exports = { fetchHtml, fetchAny, isPrivateIp, assertPublic };
