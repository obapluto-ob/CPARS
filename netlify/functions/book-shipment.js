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
    rate_id, ref, name, email, phone,
    origin_zip, destination_zip, weight,
    origin_street, origin_city, origin_state,
    dest_street, dest_city, dest_state,
    payment_intent_id
  } = JSON.parse(event.body || '{}');

  if (!rate_id || !origin_zip || !destination_zip) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const API_KEY = process.env.SHIPSTATION_API_KEY;

  try {
    // ShipEngine — create label from rate_id
    const res = await fetch(`https://api.shipengine.com/v1/labels/rates/${rate_id}`, {
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

    const data = await res.json();

    if (!res.ok || data.errors?.length) {
      const rawErr  = data.errors?.[0]?.message || data.message || 'Booking failed';
      const isLowBal = /insufficient|balance|funds|credit|payment required/i.test(rawErr);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success:            false,
          insufficient_funds: isLowBal,
          tracking_number:    null,
          label_url:          null,
          error: isLowBal
            ? '⚠️ ShipEngine account has insufficient funds. Top up your balance at app.shipengine.com, then retry.'
            : rawErr
        })
      };
    }

    const trackingNumber = data.tracking_number || null;
    const labelUrl       = data.label_download?.href || null;
    const shipmentId     = data.shipment_id || null;

    // Save tracking number back to Stripe metadata so client can track
    if (trackingNumber && payment_intent_id) {
      try {
        await stripe.paymentIntents.update(payment_intent_id, {
          metadata: {
            tracking_number: trackingNumber,
            booking_status:  'booked',
            shipment_id:     shipmentId || '',
            label_url:       labelUrl   || ''
          }
        });
      } catch (e) {
        console.warn('Failed to update Stripe metadata:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success:         true,
        tracking_number: trackingNumber,
        label_url:       labelUrl,
        shipment_id:     shipmentId
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
