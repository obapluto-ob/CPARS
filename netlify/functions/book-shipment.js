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
    rate_id, ref, name, email, phone,
    origin_zip, destination_zip, weight, message,
    origin_street, origin_city, origin_state,
    dest_street, dest_city, dest_state
  } = JSON.parse(event.body || '{}');

  if (!rate_id || !origin_zip || !destination_zip) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const API_KEY = process.env.SHIPSTATION_API_KEY;

  try {
    const res = await fetch(`https://api.shipstation.com/v2/labels/rates/${rate_id}`, {
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

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success:         false,
          tracking_number: null,
          label_url:       null,
          error:           data.errors?.[0]?.message || 'Booking failed'
        })
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success:         true,
        tracking_number: data.tracking_number  || null,
        label_url:       data.label_download?.href || null,
        shipment_id:     data.shipment_id      || null
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Booking failed', details: err.message })
    };
  }
};
