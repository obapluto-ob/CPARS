const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Carrier weight limits in lbs
const CARRIERS = [
  { id: 'se-6652340', name: 'UPS',        maxWeight: 150,  code: 'ups' },
  { id: 'se-6652342', name: 'FedEx',      maxWeight: 150,  code: 'fedex_walleted' },
  { id: 'se-6652339', name: 'Stamps.com', maxWeight: 70,   code: 'stamps_com' },
  { id: 'se-6652341', name: 'GlobalPost', maxWeight: 70,   code: 'globalpost' },
];

const MARGIN = 0.20; // 20% CPARS margin

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { weight, origin_zip, destination_zip } = JSON.parse(event.body || '{}');

  if (!weight || !origin_zip || !destination_zip) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const weightNum = parseFloat(weight);
  const API_KEY   = process.env.SHIPSTATION_API_KEY;

  // Only query carriers that support this weight
  const eligibleCarriers = CARRIERS.filter(c => weightNum <= c.maxWeight);

  if (eligibleCarriers.length === 0) {
    // Weight exceeds all parcel carriers — return empty so frontend uses estimator
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ rates: [], exceeded_parcel_limit: true, max_parcel_weight: 150 })
    };
  }

  const rateRequests = eligibleCarriers.map(carrier =>
    fetch('https://api.shipstation.com/v2/rates/estimate', {
      method: 'POST',
      headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carrier_id:        carrier.id,
        from_country_code: 'US',
        from_postal_code:  origin_zip,
        to_country_code:   'US',
        to_postal_code:    destination_zip,
        weight:            { value: weightNum, unit: 'pound' },
        dimensions:        { unit: 'inch', length: 20, width: 15, height: 10 }
      })
    })
    .then(r => r.json())
    .then(data => ({ carrier, data }))
    .catch(() => null)
  );

  const results = await Promise.all(rateRequests);

  let rates = [];
  results.forEach(result => {
    if (!result || !Array.isArray(result.data)) return;
    result.data.forEach(rate => {
      if (
        rate &&
        rate.shipping_amount &&
        rate.shipping_amount.amount > 0 &&
        rate.validation_status !== 'invalid' &&
        rate.error_messages.length === 0
      ) {
        const base = rate.shipping_amount.amount;
        rates.push({
          carrier:        rate.carrier_friendly_name || result.carrier.name,
          carrier_code:   result.carrier.code,
          service:        rate.service_type || 'Standard',
          service_code:   rate.service_code,
          delivery_days:  rate.delivery_days || null,
          delivery_label: rate.carrier_delivery_days || (rate.delivery_days ? `${rate.delivery_days} business day(s)` : 'Contact for ETA'),
          carrier_price:  base,
          cpars_price:    parseFloat((base * (1 + MARGIN)).toFixed(2)),
          rate_id:        rate.rate_id,
          trackable:      rate.trackable,
          guaranteed:     rate.guaranteed_service,
          estimated:      false,
          tags:           rate.rate_attributes || []
        });
      }
    });
  });

  // Sort: cheapest first
  rates.sort((a, b) => a.cpars_price - b.cpars_price);

  // Tag best value and fastest
  if (rates.length > 0) rates[0].tags = [...new Set([...rates[0].tags, 'best_value'])];
  const fastest = [...rates].sort((a, b) => (a.delivery_days || 99) - (b.delivery_days || 99))[0];
  if (fastest) fastest.tags = [...new Set([...fastest.tags, 'fastest'])];

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      rates,
      eligible_carriers: eligibleCarriers.map(c => c.name),
      weight_used: weightNum
    })
  };
};
