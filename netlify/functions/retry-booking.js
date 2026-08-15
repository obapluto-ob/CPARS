const { isRateLimited, rateLimitResponse } = require('./utils/rateLimit');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (isRateLimited(event)) return rateLimitResponse();

  const {
    admin_secret,
    ref, name, email, phone,
    origin_zip, origin_street, origin_city, origin_state,
    destination_zip, dest_street, dest_city, dest_state,
    weight, weight_unit,
    carrier_code, service_code,
    message
  } = JSON.parse(event.body || '{}');

  // Simple admin secret check
  if (admin_secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!origin_zip || !destination_zip || !weight) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const API_KEY = process.env.SHIPSTATION_API_KEY;

  // Convert weight to lbs if needed
  const weightInLbs = weight_unit === 'kg'
    ? parseFloat((parseFloat(weight) * 2.20462).toFixed(2))
    : parseFloat(weight);

  // Apply same 10% buffer as original booking
  const weightNum = parseFloat((weightInLbs * 1.10).toFixed(2));

  // Step 1 — Fetch fresh rates using POST /v2/rates (real bookable rate_ids)
  let freshRateId = null;
  try {
    const ratesRes = await fetch('https://api.shipstation.com/v2/rates', {
      method: 'POST',
      headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipment: {
          validate_address: 'no_validation',
          ship_to: {
            name:           name        || 'Client',
            address_line1:  dest_street || '123 Main St',
            city_locality:  dest_city   || '',
            state_province: dest_state  || '',
            postal_code:    destination_zip,
            country_code:   'US',
            address_residential_indicator: 'unknown'
          },
          ship_from: {
            name:           'CPARS Transportation LLC',
            phone:          '+13522138976',
            address_line1:  origin_street || '555 Butterfield Rd',
            city_locality:  origin_city   || 'Houston',
            state_province: origin_state  || 'TX',
            postal_code:    origin_zip,
            country_code:   'US',
            address_residential_indicator: 'no'
          },
          packages: [{
            weight:     { value: weightNum, unit: 'pound' },
            dimensions: { unit: 'inch', length: 20, width: 15, height: 10 }
          }]
        }
      })
    });

    const ratesData = await ratesRes.json();
    const ratesList = ratesData.rate_response?.rates || ratesData.rates || [];

    if (Array.isArray(ratesList)) {
      let match = ratesList.find(r =>
        r.carrier_code === carrier_code && r.service_code === service_code &&
        r.validation_status !== 'invalid' && r.error_messages?.length === 0
      );
      if (!match) match = ratesList.find(r =>
        r.carrier_code === carrier_code &&
        r.validation_status !== 'invalid' && r.error_messages?.length === 0
      );
      if (!match) match = ratesList
        .filter(r => r.validation_status !== 'invalid' && r.error_messages?.length === 0 && r.shipping_amount?.amount > 0)
        .sort((a, b) => a.shipping_amount.amount - b.shipping_amount.amount)[0];

      if (match) freshRateId = match.rate_id;
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Failed to fetch fresh rates', details: err.message })
    };
  }

  if (!freshRateId) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'No valid rates found for this route. Try booking manually in ShipStation.' })
    };
  }

  // Step 2 — Book the label
  try {
    const bookRes = await fetch(`https://api.shipstation.com/v2/labels/rates/${freshRateId}`, {
      method: 'POST',
      headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validate_address:    'no_validation',
        label_layout:        '4x6',
        label_format:        'pdf',
        label_download_type: 'url',
        ship_to: {
          name:                          name        || 'Client',
          phone:                         phone       || '',
          address_line1:                 dest_street || '123 Main St',
          city_locality:                 dest_city   || '',
          state_province:                dest_state  || '',
          postal_code:                   destination_zip,
          country_code:                  'US',
          address_residential_indicator: 'unknown'
        },
        ship_from: {
          name:                          'CPARS Transportation LLC',
          phone:                         '+13522138976',
          address_line1:                 origin_street || '555 Butterfield Rd',
          city_locality:                 origin_city   || 'Houston',
          state_province:                origin_state  || 'TX',
          postal_code:                   origin_zip,
          country_code:                  'US',
          address_residential_indicator: 'no'
        }
      })
    });

    const bookData = await bookRes.json();

    if (!bookRes.ok || !bookData.tracking_number) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success:   false,
          error:     bookData.errors?.[0]?.message || 'Booking failed — try manually in ShipStation',
          raw:       bookData
        })
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success:         true,
        tracking_number: bookData.tracking_number,
        label_url:       bookData.label_download?.href || null,
        shipment_id:     bookData.shipment_id || null,
        ref
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Booking request failed', details: err.message })
    };
  }
};
