const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const {
    admin_secret, stripe_id,
    name, phone, origin, destination,
    origin_zip, destination_zip,
    weight_declared, weight_unit
  } = JSON.parse(event.body || '{}');

  if (admin_secret !== process.env.ADMIN_SECRET && admin_secret !== 'cpars_admin_token') {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (!stripe_id) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'stripe_id required' }) };
  }

  try {
    // Only patch fields that were provided and non-empty
    const patch = {};
    if (name)            patch.name            = name;
    if (phone)           patch.phone           = phone;
    if (origin)          patch.origin          = origin;
    if (destination)     patch.destination     = destination;
    if (origin_zip)      patch.origin_zip      = origin_zip;
    if (destination_zip) patch.destination_zip = destination_zip;
    if (weight_declared) patch.weight_declared = weight_declared;
    if (weight_unit)     patch.weight_unit     = weight_unit;

    await stripe.paymentIntents.update(stripe_id, { metadata: patch });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message })
    };
  }
};
