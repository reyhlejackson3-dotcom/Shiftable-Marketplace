'use strict';

// Google Places API (New) - Text Search.
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'nextPageToken',
].join(',');

// Each page returns up to 20 businesses and Google allows 3 pages, so 60 per search.
async function searchPlaces(query, maxPages = 3) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY is not set in Vercel environment variables');

  const out = [];
  let pageToken;

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: 20,
        languageCode: 'en',
        regionCode: 'US',
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Places API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    for (const p of data.places || []) {
      if (!p.id || !(p.displayName && p.displayName.text)) continue;
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      out.push({
        place_id: p.id,
        name: p.displayName.text,
        address: p.formattedAddress || null,
        phone: p.nationalPhoneNumber || null,
        website: p.websiteUri || null,
        rating: p.rating == null ? null : p.rating,
        review_count: p.userRatingCount == null ? null : p.userRatingCount,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}

module.exports = { searchPlaces };
