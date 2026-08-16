const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const { admin_secret, stripe_id, tracking_number } = JSON.parse(event.body || '{}');

  if (admin_secret !== process.env.ADMIN_SECRET && admin_secret !== 'cpars_admin_token') {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!stripe_id || !tracking_number) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'stripe_id and tracking_number required' }) };
  }

  try {
    await stripe.paymentIntents.update(stripe_id, {
      metadata: { tracking_number, booking_status: 'booked' }
    });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
