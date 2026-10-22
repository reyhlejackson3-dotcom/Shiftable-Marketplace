'use strict';

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
// Checks the PageSpeed API doesn't cover, read straight from the homepage HTML.
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
  /(call\s+(us|now|today)|get\s+(a\s+)?(free\s+)?(quote|estimate)|free\s+(quote|estimate|consultation)|book(\s+(now|online|an?\s+\w+))?|schedule|request\s+(a\s+)?(quote|estimate|service|appointment)|contact\s+us|get\s+started|order\s+now|reserve)/i;
const PHONE_RE = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;

function analyzeHtml(html) {
  const metas = metaTags(html);
  const viewport = metas.some((t) => (t.name || '').toLowerCase() === 'viewport');
  const descTag = metas.find((t) => (t.name || '').toLowerCase() === 'description');
  const description = (descTag && descTag.content) || '';

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = ((titleMatch && titleMatch[1]) || '').replace(/\s+/g, ' ').trim();

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const phone = /href\s*=\s*["']tel:/i.test(html) || PHONE_RE.test(text);

  let cta = /<form\b/i.test(html);
  if (!cta) {
    const re = /<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(html))) {
      if (CTA_RE.test(m[2].replace(/<[^>]+>/g, ' '))) {
        cta = true;
        break;
      }
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

  return {
    viewport,
    titleOk: title.length >= 4 && !GENERIC_TITLE.test(title),
    descriptionOk: description.length >= 20,
    phone,
    cta,
    copyrightYear,
    textLength: text.length,
  };
}

// ---------------------------------------------------------------------------
// Combine everything into one 0-100 score and plain-English issues.
// ---------------------------------------------------------------------------

const PASS_AT = 0.9;

function speedDetail(psi) {
  if (psi.lcpSeconds && psi.lcpSeconds > 3) {
    return `Your site takes about ${psi.lcpSeconds.toFixed(1)} seconds to show its main content on a phone. Most visitors leave if a page takes longer than 3 seconds.`;
  }
  return `Google's mobile speed test rates your site ${Math.round((psi.performance || 0) * 100)}/100. Slow, heavy pages lose visitors and rank lower in local search.`;
}

function buildReport(psi, html, finalUrl) {
  const thisYear = new Date().getFullYear();
  // Sites built with JS frameworks can have almost no text in the raw HTML,
  // so text-based checks (phone, call-to-action) would give false failures.
  const hasText = !!html && html.textLength > 500;

  // earned: 0..1, or null when the check couldn't be run (left out of the total instead of failing).
  const items = [
    {
      key: 'speed', weight: 30, earned: psi.performance,
      fail: { title: 'Slow on phones', detail: speedDetail(psi) },
      pass: 'Loads quickly on phones',
    },
    {
      key: 'seo', weight: 10, earned: psi.seo,
      fail: {
        title: 'Missing basics Google looks for',
        detail: 'Your site is missing basic information Google uses to list it (page details, readable links, and similar), which hurts how you show up in local searches.',
      },
      pass: 'Covers the SEO basics',
    },
    {
      key: 'accessibility', weight: 10, earned: psi.accessibility,
      fail: {
        title: 'Hard to read or use for some visitors',
        detail: 'Parts of your site are hard to read or use for some visitors, such as low-contrast text or missing labels. That turns people away.',
      },
      pass: 'Easy to read and use',
    },
    {
      key: 'best-practices', weight: 5, earned: psi.bestPractices,
      fail: {
        title: 'Technical errors browsers flag',
        detail: 'Your site has technical problems or outdated code that browsers flag, which can make it look unprofessional or unsafe.',
      },
      pass: 'No major technical errors',
    },
    {
      key: 'https', weight: 10, earned: finalUrl.startsWith('https://') ? 1 : 0,
      fail: {
        title: 'Not secure (no HTTPS)',
        detail: 'Your site loads without a secure (HTTPS) connection. Browsers label it "Not secure," which scares customers away and hurts Google rankings.',
      },
      pass: 'Uses a secure connection (HTTPS)',
    },
    {
      key: 'viewport', weight: 10, earned: html ? (html.viewport ? 1 : 0) : null,
      fail: {
        title: 'Not built for mobile screens',
        detail: "Your site isn't set up for phone screens. Visitors see a tiny desktop page they have to pinch and zoom, and most will leave.",
      },
      pass: 'Set up for mobile screens',
    },
    {
      key: 'title', weight: 5, earned: html ? (html.titleOk ? 1 : 0) : null,
      fail: {
        title: 'No useful page title',
        detail: 'Your homepage has no meaningful page title, so Google results and browser tabs say nothing useful about your business.',
      },
      pass: 'Has a clear page title',
    },
    {
      key: 'description', weight: 5, earned: html ? (html.descriptionOk ? 1 : 0) : null,
      fail: {
        title: 'No search description',
        detail: 'Your homepage has no search description, so Google picks random text to show under your listing.',
      },
      pass: 'Has a search description',
    },
    {
      key: 'phone', weight: 5, earned: html && hasText ? (html.phone ? 1 : 0) : null,
      fail: {
        title: 'Phone number hard to find',
        detail: "We couldn't find a phone number on your homepage. Visitors who can't find it quickly call a competitor instead.",
      },
      pass: 'Phone number is visible',
    },
    {
      key: 'cta', weight: 5, earned: html && hasText ? (html.cta ? 1 : 0) : null,
      fail: {
        title: 'No clear next step',
        detail: 'There\'s no obvious next step on your homepage (like "Get a free quote" or "Call now"), so interested visitors don\'t know what to do.',
      },
      pass: 'Has a clear call to action',
    },
    {
      key: 'copyright', weight: 5,
      earned: html && html.copyrightYear ? (html.copyrightYear >= thisYear - 1 ? 1 : 0) : null,
      fail: {
        title: 'Outdated footer',
        detail: `Your footer says © ${html && html.copyrightYear ? html.copyrightYear : ''}. An out-of-date footer makes a business look closed or neglected.`,
      },
      pass: 'Footer is up to date',
    },
  ];

  const available = items.filter((i) => i.earned !== null);
  const totalWeight = available.reduce((s, i) => s + i.weight, 0);
  const earnedWeight = available.reduce((s, i) => s + i.weight * i.earned, 0);
  const score = totalWeight ? Math.max(0, Math.min(100, Math.round((earnedWeight / totalWeight) * 100))) : 0;

  const issues = available
    .filter((i) => i.earned < PASS_AT)
    .map((i) => ({
      key: i.key,
      title: i.fail.title,
      detail: i.fail.detail,
      points: Math.round(i.weight * (1 - i.earned)),
    }))
    .sort((a, b) => b.points - a.points);

  const passes = available
    .filter((i) => i.earned >= PASS_AT)
    .map((i) => ({ key: i.key, title: i.pass }))
    .slice(0, 4);

  return { score, report: { issues, passes, psi, finalUrl, checkedAt: new Date().toISOString() } };
}

module.exports = { runPageSpeed, analyzeHtml, buildReport };
