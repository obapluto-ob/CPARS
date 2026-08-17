// Fetches connected carrier IDs from ShipEngine account
// Cache with 5-min TTL so new carriers are picked up; never caches empty array
let _cache = null;

async function getCarrierIds(apiKey) {
  const now = Date.now();
  if (_cache && _cache.ids.length && (now - _cache.fetchedAt) < 5 * 60 * 1000) {
    return _cache.ids;
  }
  try {
    const res  = await fetch('https://api.shipengine.com/v1/carriers', {
      headers: { 'API-Key': apiKey }
    });
    const data = await res.json();
    const ids  = (data.carriers || []).map(c => c.carrier_id).filter(Boolean);
    if (ids.length) _cache = { ids, fetchedAt: now };
    return ids; // return empty array if none — callers handle it
  } catch (e) {
    console.error('getCarrierIds failed:', e.message);
    return []; // graceful fallback — ShipEngine will return its own error
  }
}

module.exports = { getCarrierIds };
