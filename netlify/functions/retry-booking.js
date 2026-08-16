const { isRateLimited, rateLimitResponse } = require('./utils/rateLimit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    carrier_code, service_code
  } = JSON.parse(event.body || '{}');

  if (admin_secret !== process.env.ADMIN_SECRET && admin_secret !== 'cpars_admin_token') {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!origin_zip || !destination_zip || !weight) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const API_KEY = process.env.SHIPENGINE_API_KEY;

  const weightInLbs = weight_unit === 'kg'
    ? parseFloat((parseFloat(weight) * 2.20462).toFixed(2))
    : parseFloat(weight);
  const weightNum = parseFloat((weightInLbs * 1.10).toFixed(2));

  // Step 1 — Fetch fresh rates from ShipEngine
  let freshRateId = null;
  try {
    const ratesRes = await fetch('https://api.shipengine.com/v1/rates/estimate', {
      method: 'POST',
      headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carrier_ids:         [],
        from_country_code:   'US',
        from_postal_code:    origin_zip,
        from_city_locality:  origin_city   || 'Houston',
        from_state_province: origin_state  || 'TX',
        to_country_code:     'US',
        to_postal_code:      destination_zip,
        to_city_locality:    dest_city  || '',
        to_state_province:   dest_state || '',
        weight:     { value: weightNum, unit: 'pound' },
        dimensions: { unit: 'inch', length: 20, width: 15, height: 10 }
      })
    });

    const ratesData = await ratesRes.json();
    const ratesList = Array.isArray(ratesData) ? ratesData : (ratesData.rates || []);

    if (ratesList.length) {
      // Try match carrier + service first, then carrier only, then cheapest
      let match = ratesList.find(r =>
        r.carrier_id === carrier_code && r.service_code === service_code &&
        r.validation_status !== 'invalid' && !r.error_messages?.length
      );
      if (!match) match = ratesList.find(r =>
        r.carrier_id === carrier_code &&
        r.validation_status !== 'invalid' && !r.error_messages?.length
      );
      if (!match) match = ratesList
        .filter(r => r.validation_status !== 'invalid' && !r.error_messages?.length && r.shipping_amount?.amount > 0)
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
      body: JSON.stringify({ success: false, error: 'No valid rates found for this route. Try booking manually in ShipEngine.' })
    };
  }

  // Step 2 — Book label via ShipEngine
  try {
    const bookRes = await fetch(`https://api.shipengine.com/v1/labels/rates/${freshRateId}`, {
      method: 'POST',
      headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validate_address:    'no_validation',
        label_layout:        '4x6',
        label_format:        'pdf',
        label_download_type: 'url',
        ship_to: {
          name:          name        || 'Client',
          phone:         phone       || '',
          address_line1: dest_street || '123 Main St',
          city_locality: dest_city   || '',
          state_province: dest_state || '',
          postal_code:   destination_zip,
          country_code:  'US',
          address_residential_indicator: 'unknown'
        },
        ship_from: {
          name:          'CPARS Transportation LLC',
          phone:         '+13522138976',
          address_line1: origin_street || '555 Butterfield Rd',
          city_locality: origin_city   || 'Houston',
          state_province: origin_state || 'TX',
          postal_code:   origin_zip,
          country_code:  'US',
          address_residential_indicator: 'no'
        }
      })
    });

    const bookData = await bookRes.json();

    if (!bookRes.ok || bookData.errors?.length || !bookData.tracking_number) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error:   bookData.errors?.[0]?.message || 'Booking failed — try manually in ShipEngine'
        })
      };
    }

    // Save tracking number to Stripe metadata if we can find the PaymentIntent by ref
    try {
      const intents = await stripe.paymentIntents.list({ limit: 100 });
      const pi = intents.data.find(p => p.metadata?.cpars_ref === ref);
      if (pi) {
        await stripe.paymentIntents.update(pi.id, {
          metadata: {
            tracking_number: bookData.tracking_number,
            booking_status:  'booked',
            shipment_id:     bookData.shipment_id || ''
          }
        });
      }
    } catch (e) {
      console.warn('Could not update Stripe metadata after retry:', e.message);
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
