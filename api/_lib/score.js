'use strict';

const { fetchAny } = require('./http');

// ---------------------------------------------------------------------------
// PageSpeed Insights (mobile). Takes 10-30 seconds per site.
// ---------------------------------------------------------------------------

async function runPageSpeed(url) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY is not set in Vercel environment variables');

  const params = new URLSearchParams({ url, strategy: 'mobile', key });
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) params.append('category', c);

  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
    signal: AbortSignal.timeout(50000),
  });

  if (!res.ok) {
    let message = '';
    try {
      const body = await res.json();
      message = (body && body.error && body.error.message) || '';
    } catch {
      /* ignore */
    }
    throw new Error(`PageSpeed ${res.status}: ${message.slice(0, 250) || 'request failed'}`);
  }

  const data = await res.json();
  const lh = data.lighthouseResult || {};
  const cats = lh.categories || {};
  const val = (c) => (c && typeof c.score === 'number' ? c.score : null);
  const lcp = lh.audits && lh.audits['largest-contentful-paint'];
  const lcpMs = lcp && lcp.numericValue;

  return {
    performance: val(cats.performance),
    seo: val(cats.seo),
    accessibility: val(cats.accessibility),
    bestPractices: val(cats['best-practices']),
    lcpSeconds: typeof lcpMs === 'number' ? lcpMs / 1000 : null,
    finalUrl: lh.finalUrl || lh.finalDisplayedUrl || null,
  };
}

// ---------------------------------------------------------------------------
// Files that live next to the homepage: robots.txt and the sitemap.
// ---------------------------------------------------------------------------

async function siteExtras(baseUrl) {
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return { sitemap: null, robotsBlocked: null };
  }
  const [robots, s1, s2] = await Promise.all([
    fetchAny(origin + '/robots.txt'),
    fetchAny(origin + '/sitemap.xml'),
    fetchAny(origin + '/sitemap_index.xml'),
  ]);

  let robotsBlocked = null;
  let robotsListsSitemap = false;
  if (robots && robots.status === 200 && !/<html/i.test(robots.text.slice(0, 500))) {
    robotsBlocked = false;
    robotsListsSitemap = /^\s*sitemap:/im.test(robots.text);
    let inStar = false;
    let prevWasAgent = false;
    for (const raw of robots.text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim();
      const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const k = m[1].toLowerCase();
      const v = m[2].trim();
      if (k === 'user-agent') {
        if (!prevWasAgent) inStar = false;
        if (v === '*') inStar = true;
        prevWasAgent = true;
      } else {
        prevWasAgent = false;
        if (inStar && k === 'disallow' && v === '/') robotsBlocked = true;
      }
    }
  }

  const isMap = (r) => !!r && r.status === 200 && /<urlset|<sitemapindex/i.test(r.text.slice(0, 2000));
  const sitemap = robots || s1 || s2 ? robotsListsSitemap || isMap(s1) || isMap(s2) : null;
  return { sitemap, robotsBlocked };
}

// "123 Main St, Denver, CO 80202, USA" -> "Denver"
function cityFromAddress(address) {
  if (!address) return null;
  const parts = String(address).split(',').map((p) => p.trim()).filter(Boolean);
  const i = parts.findIndex((p) => /^[A-Z]{2}\s+\d{5}/.test(p));
  if (i > 0) return parts[i - 1] || null;
  return null;
}

// ---------------------------------------------------------------------------
// Everything we can learn from the homepage HTML alone.
// ---------------------------------------------------------------------------

function metaTags(html) {
  const tags = [];
  const tagRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = {};
    const attrRe = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a;
    while ((a = attrRe.exec(m[0]))) {
      const v = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
      attrs[a[1].toLowerCase()] = v.trim();
    }
    tags.push(attrs);
  }
  return tags;
}

const GENERIC_TITLE = /^(home|homepage|welcome|untitled|index|new site|my site|coming soon|just another wordpress site)$/i;
const CTA_RE =
  /(call\s+(us|now|today)|get\s+(a\s+)?(free\s+)?(quote|estimate)|free\s+(quote|estimate|consultation|inspection)|book(\s+(now|online|an?\s+\w+))?|schedule|request\s+(a\s+)?(quote|estimate|service|appointment|inspection)|contact\s+us|get\s+started|order\s+now|reserve)/i;
const PHONE_RE = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const REVIEW_RE = /testimonial|\breviews?\b|what (?:our )?(?:customers|clients|neighbors) (?:say|are saying)|5[- ]star|five[- ]star|★|⭐/i;
const LOCAL_SCHEMA_RE =
  /"@type"\s*:\s*(?:\[[^\]]*)?"(?:LocalBusiness|ProfessionalService|HomeAndConstructionBusiness|GeneralContractor|RoofingContractor|Plumber|Electrician|HVACBusiness|HousePainter|Locksmith|MovingCompany|AutomotiveBusiness|AutoRepair|Dentist|Restaurant|Store|HealthAndBeautyBusiness|BeautySalon|HairSalon|LegalService|RealEstateAgent|FoodEstablishment|LodgingBusiness|FinancialService|AccountingService|InsuranceAgency)"/i;
const FORM_EMBED_RE = /<iframe[^>]+(?:hubspot|jotform|typeform|forms\.gle|calendly|wufoo|formstack|paperform|cognito)/i;
const BUILDERS = [
  ['Wix', /wixstatic\.com|static\.parastorage\.com/i],
  ['GoDaddy Website Builder', /img\d*\.wsimg\.com|websitebuilder\.godaddy/i],
  ['Weebly', /weebly\.com|editmysite\.com/i],
  ['Jimdo', /jimdo(?:cdn|free)?\.com/i],
  ['Site123', /site123\.com/i],
];

function oldTechReasons(html) {
  const reasons = [];
  for (const tag of html.match(/<script\b[^>]*\bsrc\s*=[^>]*>/gi) || []) {
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const file = src.split('?')[0].split('/').pop() || '';
    if (!/^jquery([-.].*)?\.js$/i.test(file) || /migrate|ui|mobile|validate/i.test(file)) continue;
    const v = src.match(/(\d+)\.(\d+)(?:\.\d+)?/);
    if (v && Number(v[1]) < 3) {
      reasons.push('outdated scripts');
      break;
    }
  }
  if (/<(?:font|marquee|blink|frameset)\b/i.test(html)) reasons.push('page elements from the early 2000s');
  if (/\.swf\b|application\/x-shockwave-flash/i.test(html)) reasons.push('Flash');
  return reasons;
}

function analyzeHtml(html, city) {
  const metas = metaTags(html);
  const named = (n) => metas.find((t) => (t.name || '').toLowerCase() === n);
  const description = ((named('description') || {}).content || '').trim();
  const noindex = /noindex/i.test((named('robots') || {}).content || '');

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = ((titleMatch && titleMatch[1]) || '').replace(/\s+/g, ' ').trim();

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text ? text.split(' ').length : 0;
  const lower = text.toLowerCase();
  const cityLower = city ? city.toLowerCase() : null;

  // Sites drawn entirely by JavaScript have almost no text in the raw HTML. Judging them on
  // text-based checks would give false failures, so those checks are skipped for them.
  const spa = text.length < 400 && /id=["'](?:root|__next|app)["']|ng-version|data-reactroot|id=["']__nuxt["']/i.test(html);

  const imgs = (html.match(/<img\b[^>]*>/gi) || []).filter((t) => !/\b(?:width|height)\s*=\s*["']?1["']?(?:\s|>|\/)/i.test(t));
  const withAlt = imgs.filter((t) => {
    const a = t.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    return a && (a[1] || a[2] || '').trim().length > 0;
  });

  const ld = (html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []).join(' ');

  let cta = false;
  const re = /<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (CTA_RE.test(m[2].replace(/<[^>]+>/g, ' '))) {
      cta = true;
      break;
    }
  }

  let hasForm = FORM_EMBED_RE.test(html);
  for (const f of html.match(/<form\b[\s\S]*?<\/form>/gi) || []) {
    if (/<textarea|type\s*=\s*["']?email|name\s*=\s*["']?(?:email|message|phone|your-)/i.test(f)) {
      hasForm = true;
      break;
    }
  }

  const thisYear = new Date().getFullYear();
  let copyrightYear = null;
  const yearRe = /(?:©|&copy;|&#169;|\(c\)|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi;
  let y;
  while ((y = yearRe.exec(html))) {
    const n = Number(y[1]);
    if (n >= 1990 && n <= thisYear + 1) copyrightYear = Math.max(copyrightYear || 0, n);
  }

  const builder = (BUILDERS.find((b) => b[1].test(html)) || [null])[0];

  return {
    spa,
    words,
    viewport: !!named('viewport'),
    noindex,
    title,
    titleOk: title.length >= 4 && !GENERIC_TITLE.test(title),
    titleHasCity: !!cityLower && title.toLowerCase().includes(cityLower),
    descriptionLength: description.length,
    h1Count: (html.match(/<h1\b/gi) || []).length,
    cityMentioned: !!cityLower && lower.includes(cityLower),
    imgCount: imgs.length,
    altMissingPct: imgs.length ? Math.round(((imgs.length - withAlt.length) / imgs.length) * 100) : 0,
    localSchema: LOCAL_SCHEMA_RE.test(ld),
    shareImage: metas.some((t) => (t.property || '').toLowerCase() === 'og:image' && t.content),
    phoneVisible: /href\s*=\s*["']tel:/i.test(html) || PHONE_RE.test(text),
    phoneTappable: /href\s*=\s*["']tel:/i.test(html),
    cta,
    hasForm,
    hasReviews: REVIEW_RE.test(text),
    copyrightYear,
    oldTech: oldTechReasons(html),
    builder,
  };
}

// ---------------------------------------------------------------------------
// Four categories, each out of 25 points, added up to a score out of 100.
//   1. Works on a phone, 2. Shows up on Google, 3. Turns visitors into customers
//      -> real checks, scored strictly (see `strict` below).
//   4. Design -> an ESTIMATE from site-age signals, never 25/25:
//      any one of (DIY builder, old footer year, old code) = 1-7, otherwise 15-23.
//      The exact number varies from site to site but is the same every time the
//      same site is scored (it is derived from the domain name, not a fresh dice roll).
// ---------------------------------------------------------------------------

const PASS_AT = 0.9;
const CAT_MAX = 25;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const strict = (s) => (typeof s === 'number' ? clamp01((s - 0.5) / 0.4) : null);
const rnd1 = (n) => Math.round(n * 10) / 10;

const CATEGORY_NAMES = {
  phone: 'Works on a phone',
  google: 'Shows up on Google',
  customers: 'Turns visitors into customers',
  design: 'Design',
};

function speedDetail(psi) {
  if (psi.lcpSeconds && psi.lcpSeconds > 3) {
    return `Your homepage takes about ${psi.lcpSeconds.toFixed(1)} seconds to show up on a phone. Most people give up after 3 seconds, and Google ranks slow sites lower.`;
  }
  return `Google's phone speed test scored your site ${Math.round((psi.performance || 0) * 100)} out of 100. Slow pages lose customers and rank lower on Google.`;
}

function gradeLetter(score) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
}

// Small stable hash so a given domain always gets the same design number.
function seedHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
const pickInRange = (seed, lo, hi) => lo + (seed % (hi - lo + 1));

function hostKey(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return String(url || '');
  }
}

function buildReport(psi, h, finalUrl, ex) {
  ex = ex || {};
  const city = ex.city || null;
  const thisYear = new Date().getFullYear();
  const t = h && !h.spa; // text-based checks are only trustworthy on normal pages
  const where = city || 'your area';

  let titleEarned = null;
  if (h && city) titleEarned = h.titleOk && h.titleHasCity ? 1 : h.titleOk ? 0.4 : 0;

  const blocked = !!(ex.robotsBlocked || (h && h.noindex));

  // `weight` values add up to exactly 25 inside each category.
  const items = [
    // ---- Works on a phone (25) ----
    {
      cat: 'phone', key: 'speed', weight: 11, earned: strict(psi.performance),
      title: 'Slow to load on phones', detail: speedDetail(psi), pass: 'Loads quickly on phones',
    },
    {
      cat: 'phone', key: 'mobile', weight: 5, earned: h ? (h.viewport ? 1 : 0) : null,
      title: 'Not set up for phones',
      detail: "Your site isn't built for phone screens. Visitors get a tiny desktop page they have to pinch and zoom, and most leave. Most local searches happen on a phone.",
      pass: 'Set up for phone screens',
    },
    {
      cat: 'phone', key: 'secure', weight: 4, earned: finalUrl.startsWith('https://') ? 1 : 0,
      title: 'Browsers warn visitors your site is "Not secure"',
      detail: 'Your site is missing the secure padlock. Browsers show a "Not secure" warning next to your address, which scares customers away.',
      pass: 'Has the secure padlock',
    },
    {
      cat: 'phone', key: 'readable', weight: 3, earned: strict(psi.accessibility),
      title: 'Hard to read in places',
      detail: 'Parts of your site are hard to read, like faint text on a similar-colored background or buttons with no label. That turns visitors away, especially older ones.',
      pass: 'Easy to read',
    },
    {
      cat: 'phone', key: 'errors', weight: 2, earned: strict(psi.bestPractices),
      title: 'Behind-the-scenes errors',
      detail: 'Your site has technical errors that web browsers flag. They make it look unprofessional and can cause parts of it to break.',
      pass: 'No major technical errors',
    },

    // ---- Shows up on Google (25) ----
    {
      cat: 'google', key: 'title', weight: 5, earned: titleEarned,
      title: h && !h.titleOk ? 'Your homepage has no real title' : `Your Google title doesn't say you're in ${where}`,
      detail: h && !h.titleOk
        ? 'The title shown on Google and in browser tabs is missing or just says "Home". It is the first thing Google reads to decide who to show.'
        : `The title people see on Google and in their browser tab doesn't mention ${where}. It's the first thing Google reads to decide who to show for local searches.`,
      pass: `Google title mentions ${where}`,
    },
    {
      cat: 'google', key: 'headline', weight: 3, earned: t ? (h.h1Count >= 1 ? 1 : 0) : null,
      title: 'No main headline',
      detail: 'Your homepage has no clear main headline. Visitors and Google both use it to quickly understand what you do.',
      pass: 'Has a clear main headline',
    },
    {
      cat: 'google', key: 'city', weight: 2, earned: t && city ? (h.cityMentioned ? 1 : 0) : null,
      title: `Your site never mentions ${where}`,
      detail: `The words on your homepage don't mention ${where}, so Google has little reason to show you to people searching nearby.`,
      pass: `Mentions ${where} on the page`,
    },
    {
      cat: 'google', key: 'description', weight: 3,
      earned: h ? (h.descriptionLength >= 50 ? 1 : h.descriptionLength >= 20 ? 0.5 : 0) : null,
      title: 'Nothing to convince people to click your Google listing',
      detail: 'You have no short description for your Google listing, so Google grabs random text from your page instead. This is your chance to win the click over competitors.',
      pass: 'Has a Google listing description',
    },
    {
      cat: 'google', key: 'photos', weight: 2,
      earned: h && h.imgCount ? clamp01((1 - h.altMissingPct / 100) / 0.8) : null,
      title: 'Photos have no descriptions',
      detail: `About ${h ? h.altMissingPct : 0}% of your photos have no description. Google can't tell what they show, so they never appear in image search, and blind visitors can't use them.`,
      pass: 'Photos are described',
    },
    {
      cat: 'google', key: 'details', weight: 3, earned: h ? (h.localSchema ? 1 : 0) : null,
      title: "Google can't read your business details",
      detail: "Your site doesn't hand Google your address, hours, phone and services in the format it prefers. Competitors that do can show up with richer listings.",
      pass: 'Google can read your business details',
    },
    {
      cat: 'google', key: 'sitemap', weight: 2, earned: typeof ex.sitemap === 'boolean' ? (ex.sitemap ? 1 : 0) : null,
      title: 'No site map for Google',
      detail: "There's no site map telling Google about all your pages, so some of them may never get listed.",
      pass: 'Has a site map',
    },
    {
      cat: 'google', key: 'preview', weight: 2, earned: h ? (h.shareImage ? 1 : 0) : null,
      title: 'Blank preview when your link is shared',
      detail: 'When someone texts or posts a link to your site, it shows a blank box instead of your logo or a photo, which looks unfinished.',
      pass: 'Looks good when shared',
    },
    {
      cat: 'google', key: 'listed', weight: 3, earned: h || typeof ex.robotsBlocked === 'boolean' ? (blocked ? 0 : 1) : null,
      title: 'Your site is telling Google not to list it',
      detail: 'A setting on your website asks Google to skip it. That can keep you from showing up in searches at all.',
      pass: 'Open to being listed on Google',
    },

    // ---- Turns visitors into customers (25) ----
    {
      cat: 'customers', key: 'phone', weight: 6, earned: t ? (h.phoneVisible ? 1 : 0) : null,
      title: "Phone number isn't easy to find",
      detail: "We couldn't find a phone number on your homepage. People who are ready to hire will call someone else instead.",
      pass: 'Phone number is easy to find',
    },
    {
      cat: 'customers', key: 'tap', weight: 4, earned: t && h.phoneVisible ? (h.phoneTappable ? 1 : 0) : null,
      title: "Phone number can't be tapped to call",
      detail: "On a phone, visitors can't just tap your number to call. They have to copy it by hand, and many won't bother.",
      pass: 'Tap-to-call works',
    },
    {
      cat: 'customers', key: 'button', weight: 6, earned: t ? (h.cta ? 1 : 0) : null,
      title: 'No clear "next step" button',
      detail: 'There\'s no obvious button like "Get a free quote" or "Call now", so visitors aren\'t sure what to do next.',
      pass: 'Has a clear next-step button',
    },
    {
      cat: 'customers', key: 'form', weight: 3, earned: t ? (h.hasForm ? 1 : 0) : null,
      title: 'No way to request a quote on the page',
      detail: "Your homepage has no contact or quote form. Many people would rather send a quick message than call, and you're losing them.",
      pass: 'Has a contact or quote form',
    },
    {
      cat: 'customers', key: 'reviews', weight: 4, earned: t ? (h.hasReviews ? 1 : 0) : null,
      title: 'No customer reviews on your site',
      detail: "Your homepage doesn't show any reviews or testimonials. Most people check reviews before hiring a local company, and seeing them on your own site builds trust fast.",
      pass: 'Shows customer reviews',
    },
    {
      cat: 'customers', key: 'content', weight: 2, earned: t ? (h.words >= 300 ? 1 : h.words >= 150 ? 0.5 : 0) : null,
      title: 'Very little to read',
      detail: `Your homepage has only about ${h ? h.words : 0} words. Visitors and Google don't get enough to decide you're the right company.`,
      pass: 'Enough on the page to read',
    },
  ];

  const issues = [];
  const passes = [];
  const categories = [];
  let checked = 0;

  for (const cat of ['phone', 'google', 'customers']) {
    const its = items.filter((i) => i.cat === cat);
    const avail = its.filter((i) => i.earned !== null);
    const totalW = its.reduce((s, i) => s + i.weight, 0);
    const availW = avail.reduce((s, i) => s + i.weight, 0);
    // If we couldn't check at least half of a category (e.g. the homepage wouldn't load), say "n/a"
    // instead of grading it on a couple of leftovers.
    let score = null;
    if (availW >= totalW * 0.5) {
      const raw = (avail.reduce((s, i) => s + i.weight * i.earned, 0) / availW) * CAT_MAX;
      score = Math.max(0, Math.min(CAT_MAX, Math.round(raw)));
    }
    checked += avail.length;
    for (const i of avail) {
      if (i.earned < PASS_AT) {
        issues.push({ key: i.key, title: i.title, detail: i.detail, points: Math.max(1, Math.round(i.weight * (1 - i.earned))) });
      } else {
        passes.push({ key: i.key, title: i.pass });
      }
    }
    categories.push({
      key: cat,
      name: CATEGORY_NAMES[cat],
      max: CAT_MAX,
      score,
      items: its.map((i) => ({
        key: i.key,
        label: i.pass,
        max: i.weight,
        earned: i.earned === null ? null : rnd1(i.weight * i.earned),
        status: i.earned === null ? 'skipped' : i.earned >= PASS_AT ? 'pass' : 'fail',
      })),
    });
  }

  // ---- Design (25): an estimate, not a measurement ----
  let designScore = null;
  const designItems = [];
  if (h) {
    const yearOld = !!(h.copyrightYear && h.copyrightYear < thisYear - 1);
    const triggers = [
      {
        key: 'builder', hit: !!h.builder, skipped: false, label: 'Not on a do-it-yourself website builder',
        title: `Built on ${h.builder || 'a DIY builder'}, a do-it-yourself website tool`,
        detail: 'Template sites like this usually load slower, look like thousands of others, and limit how well you can show up on Google.',
      },
      {
        key: 'year', hit: yearOld, skipped: !h.copyrightYear, label: 'Footer date is current',
        title: 'Footer is out of date',
        detail: `The bottom of your site says © ${h.copyrightYear || ''}. An old date makes a business look closed or forgotten.`,
      },
      {
        key: 'oldtech', hit: h.oldTech.length > 0, skipped: false, label: 'Not built on old technology',
        title: 'Built with old website technology',
        detail: `The code behind your site looks like it's from the early 2010s or older (${h.oldTech.join(', ')}). That usually means it's slower, harder to update and less secure.`,
      },
    ];
    const hits = triggers.filter((x) => x.hit);
    const seed = seedHash(hostKey(finalUrl) + '|design');
    designScore = hits.length ? pickInRange(seed, 1, 7) : pickInRange(seed, 15, 23);
    const each = Math.max(1, Math.round((CAT_MAX - designScore) / Math.max(1, hits.length)));
    for (const x of triggers) {
      designItems.push({ key: x.key, label: x.label, max: null, earned: null, status: x.skipped ? 'skipped' : x.hit ? 'fail' : 'pass' });
      if (x.skipped) continue;
      checked += 1;
      if (x.hit) issues.push({ key: x.key, title: x.title, detail: x.detail, points: each });
      else passes.push({ key: x.key, title: x.label });
    }
  }
  categories.push({
    key: 'design',
    name: CATEGORY_NAMES.design,
    max: CAT_MAX,
    score: designScore,
    estimate: true,
    note: 'An estimate from how old the site looks, not a measurement. A DIY builder, an old footer year or old code puts it at 1-7; otherwise 15-23. It is never 25.',
    items: designItems,
  });

  const have = categories.filter((c) => c.score !== null);
  const sum = have.reduce((s, c) => s + c.score, 0);
  const score = have.length ? Math.round((sum / (CAT_MAX * have.length)) * 100) : 0;

  issues.sort((a, b) => b.points - a.points);

  return {
    score,
    report: {
      version: 3,
      categories,
      issues,
      passes: passes.slice(0, 6),
      psi,
      finalUrl,
      checked,
      meta: h ? { city, builder: h.builder, oldTech: h.oldTech, words: h.words, spa: h.spa } : { city },
      checkedAt: new Date().toISOString(),
    },
  };
}

module.exports = { runPageSpeed, siteExtras, cityFromAddress, analyzeHtml, buildReport, gradeLetter };
