// Fetches connected carrier IDs from ShipEngine account.
// We cache only successful responses so we can detect new carriers quickly,
// but we still retry if the result is empty because that usually means the
// account is not fully configured for that route yet.
let _cache = { ids: [], fetchedAt: 0 };

async function getCarrierIds(apiKey) {
  const now = Date.now();
  if (_cache.ids.length && (now - _cache.fetchedAt) < 5 * 60 * 1000) {
    return _cache.ids;
  }

  try {
    if (!apiKey) return [];

    const res = await fetch('https://api.shipengine.com/v1/carriers', {
      headers: { 'API-Key': apiKey }
    });

    const data = await res.json();
    const carriers = Array.isArray(data.carriers) ? data.carriers : [];
    const ids = carriers
      .filter(c => c && c.carrier_id && c.is_enabled !== false)
      .map(c => c.carrier_id)
      .filter(Boolean);

    _cache = { ids, fetchedAt: now };
    return ids;
  } catch (e) {
    console.error('getCarrierIds failed:', e.message);
    return [];
  }
}

module.exports = { getCarrierIds };
