'use strict';

const { rest, requireAdmin, readBody, fail } = require('./_lib/supa');
const { searchPlaces } = require('./_lib/places');
const { isThirdPartyProfile, normalizeUrl } = require('./_lib/url');

// POST { type, city } -> finds businesses on Google Maps and saves new ones as leads.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await requireAdmin(req);

    const body = readBody(req);
    const type = String(body.type || '').trim();
    const city = String(body.city || '').trim();
    if (!type || !city || type.length > 80 || city.length > 80) {
      return res.status(400).json({ error: 'Enter a business type and a city.' });
    }

    const query = `${type} in ${city}`;
    const places = await searchPlaces(query, 3);

    const byPlace = new Map();
    for (const p of places) {
      const site = p.website ? normalizeUrl(p.website) : null;
      const hasRealSite = !!site && !isThirdPartyProfile(site);
      byPlace.set(p.place_id, {
        place_id: p.place_id,
        name: p.name,
        address: p.address,
        phone: p.phone,
        website: site,
        rating: p.rating,
        review_count: p.review_count,
        query,
        score_status: hasRealSite ? 'pending' : 'no_website',
      });
    }
    const rows = [...byPlace.values()];
    if (!rows.length) return res.status(200).json({ found: 0, added: 0, noWebsite: 0 });

    // ignore-duplicates: re-running a search never overwrites scores or statuses you already have.
    // The response contains only the rows that were actually new.
    const inserted = await rest('outreach_leads?on_conflict=place_id&select=id,score_status', {
      method: 'POST',
      body: rows,
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    const added = inserted || [];

    res.status(200).json({
      found: rows.length,
      added: added.length,
      noWebsite: added.filter((r) => r.score_status === 'no_website').length,
    });
  } catch (e) {
    fail(res, e);
  }
};
