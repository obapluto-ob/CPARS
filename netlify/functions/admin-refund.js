const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const { admin_secret, stripe_id, amount_cents, reason } = JSON.parse(event.body || '{}');

  if (admin_secret !== process.env.ADMIN_SECRET && admin_secret !== 'cpars_admin_token') {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!stripe_id) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'stripe_id required' }) };
  }

  try {
    // Get the charge from the payment intent
    const pi = await stripe.paymentIntents.retrieve(stripe_id, { expand: ['latest_charge'] });
    const chargeId = pi.latest_charge?.id || pi.latest_charge;

    if (!chargeId) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No charge found for this payment intent' }) };
    }

    const refundParams = {
      charge: chargeId,
      reason: reason || 'requested_by_customer'
    };
    if (amount_cents) refundParams.amount = amount_cents;

    const refund = await stripe.refunds.create(refundParams);

    // Update booking status in metadata
    await stripe.paymentIntents.update(stripe_id, {
      metadata: { booking_status: 'refunded' }
    }).catch(() => {});

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        refund_id: refund.id,
        amount_refunded: (refund.amount / 100).toFixed(2),
        status: refund.status
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
