const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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

  const { amount, rate_id, customer_email, ref, carrier, service, carrier_code, service_code, weight_declared, weight_unit, weight_buffered_lbs, name, phone, origin, destination, origin_zip, destination_zip } = JSON.parse(event.body || '{}');

  if (!amount || !customer_email || !ref) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount:               Math.round(amount * 100),
      currency:             'usd',
      payment_method_types: ['card'],
      receipt_email:        customer_email,
      description:          `CPARS Transportation — Freight Shipment ${ref}`,
      metadata: {
        cpars_ref:            ref,
        rate_id:              rate_id              || '',
        carrier:              carrier              || '',
        carrier_code:         carrier_code         || '',
        service:              service              || '',
        service_code:         service_code         || '',
        weight_declared:      String(weight_declared      || ''),
        weight_unit:          weight_unit          || 'lbs',
        weight_buffered_lbs:  String(weight_buffered_lbs  || ''),
        name:                 name                 || '',
        phone:                phone                || '',
        customer_email:       customer_email       || '',
        origin:               origin               || '',
        destination:          destination          || '',
        origin_zip:           origin_zip           || '',
        destination_zip:      destination_zip      || '',
        tracking_number:      '',
        booking_status:       'pending'
      }
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        client_secret:     paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Payment setup failed', details: err.message })
    };
  }
};
