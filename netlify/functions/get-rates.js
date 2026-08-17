const { isRateLimited, rateLimitResponse } = require('./utils/rateLimit');
const { getCarrierIds } = require('./utils/getCarrierIds');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const MARGIN = 0.20; // 20% CPARS margin

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (isRateLimited(event)) return rateLimitResponse();

  const {
    weight, weight_unit,
    origin_zip, origin_street, origin_city, origin_state,
    destination_zip, dest_street, dest_city, dest_state
  } = JSON.parse(event.body || '{}');

  if (!weight || !origin_zip || !destination_zip) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // Convert kg to lbs if needed
  const weightInLbs = weight_unit === 'kg'
    ? parseFloat((parseFloat(weight) * 2.20462).toFixed(2))
    : parseFloat(weight);

  // 10% weight buffer
  const weightNum = parseFloat((weightInLbs * 1.10).toFixed(2));

  if (weightNum > 150) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ rates: [], exceeded_parcel_limit: true, max_parcel_weight: 150 })
    };
  }

  const API_KEY = process.env.SHIPSTATION_API_KEY;

  try {
    const carrierIds = await getCarrierIds(API_KEY);
    const rateRequest = {
      from_country_code: 'US',
      from_postal_code:  origin_zip,
      from_city_locality: origin_city   || 'Houston',
      from_state_province: origin_state || 'TX',
      to_country_code:   'US',
      to_postal_code:    destination_zip,
      to_city_locality:  dest_city   || '',
      to_state_province: dest_state  || '',
      weight: { value: weightNum, unit: 'pound' }
    };

    if (carrierIds.length) rateRequest.carrier_ids = carrierIds;

    console.log('ShipEngine rate request debug', {
      carrierCount: carrierIds.length,
      carrierIds: carrierIds.slice(0, 25),
      origin_zip,
      destination_zip,
      weightNum,
      fallbackUsed: carrierIds.length === 0
    });

    const res = await fetch('https://api.shipengine.com/v1/rates/estimate', {
      method: 'POST',
      headers: {
        'API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rateRequest)
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('ShipEngine rates error:', JSON.stringify(data));
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ rates: [], error: data.errors?.[0]?.message || 'Failed to fetch rates' })
      };
    }

    // data is an array of rate objects
    const rateList = Array.isArray(data) ? data : (data.rates || []);

    const carrierSummary = {};
    let rates = [];
    rateList.forEach(rate => {
      if (
        rate &&
        rate.shipping_amount?.amount > 0 &&
        rate.validation_status !== 'invalid' &&
        (!rate.error_messages || rate.error_messages.length === 0)
      ) {
        const base = rate.shipping_amount.amount;
        const carrierKey = (rate.carrier_friendly_name || rate.carrier_id || 'Unknown').toString();
        carrierSummary[carrierKey] = (carrierSummary[carrierKey] || 0) + 1;

        rates.push({
          carrier:        rate.carrier_friendly_name || rate.carrier_id,
          carrier_code:   rate.carrier_id,
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

    // Sort cheapest first
    rates.sort((a, b) => a.cpars_price - b.cpars_price);

    if (rates.length > 0) rates[0].tags = [...new Set([...rates[0].tags, 'best_value'])];
    const fastest = [...rates].sort((a, b) => (a.delivery_days || 99) - (b.delivery_days || 99))[0];
    if (fastest) fastest.tags = [...new Set([...fastest.tags, 'fastest'])];

    console.log('ShipEngine rate response debug', {
      totalReturned: rateList.length,
      validRates: rates.length,
      carrierSummary,
      carrierIdsUsed: carrierIds
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        rates,
        weight_used:     weightNum,
        weight_declared: parseFloat(weight),
        weight_unit:     weight_unit || 'lbs',
        weight_buffered: true,
        carrier_debug: {
          connected_carrier_count: carrierIds.length,
          connected_carriers: carrierIds,
          returned_carrier_summary: carrierSummary,
          fallback_used: carrierIds.length === 0
        }
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Rate fetch failed', details: err.message })
    };
  }
};
