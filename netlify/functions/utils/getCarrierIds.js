// Fetches connected carrier IDs from ShipEngine account
let _cached = null;

async function getCarrierIds(apiKey) {
  if (_cached && _cached.length) return _cached;
  const res = await fetch('https://api.shipengine.com/v1/carriers', {
    headers: { 'API-Key': apiKey }
  });
  const data = await res.json();
  const ids = (data.carriers || []).map(c => c.carrier_id).filter(Boolean);
  if (ids.length) _cached = ids;
  return ids;
}

module.exports = { getCarrierIds };
