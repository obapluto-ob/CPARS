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

  const { amount, rate_id, customer_email, ref, carrier, service } = JSON.parse(event.body || '{}');

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
        cpars_ref: ref,
        rate_id:   rate_id   || '',
        carrier:   carrier   || '',
        service:   service   || ''
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
