'use strict';

// Sites where a "website" is really just a social/directory profile. Those businesses
// effectively have no site, so we don't score them like one.
const THIRD_PARTY_HOSTS = [
  'facebook.com', 'instagram.com', 'yelp.com', 'linkedin.com', 'twitter.com', 'x.com',
  'tiktok.com', 'youtube.com', 'nextdoor.com', 'angi.com', 'homeadvisor.com',
  'thumbtack.com', 'yellowpages.com', 'mapquest.com', 'bbb.org', 'linktr.ee',
];

function normalizeUrl(raw) {
  try {
    let s = String(raw).trim();
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isThirdPartyProfile(url) {
  const host = hostOf(url);
  return THIRD_PARTY_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

// Basic guard so the scorer never fetches localhost or private network addresses.
function isSafePublicHost(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.startsWith('[')) return false; // IPv6 literal

  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

module.exports = { normalizeUrl, hostOf, isThirdPartyProfile, isSafePublicHost };
