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

  const { admin_secret } = JSON.parse(event.body || '{}');
  if (admin_secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    // Fetch last 100 payment intents from Stripe
    const intents = await stripe.paymentIntents.list({ limit: 100, expand: ['data.latest_charge'] });

    const shipments = intents.data.map(pi => {
      const meta    = pi.metadata || {};
      const charge  = pi.latest_charge;
      const receipt = charge?.receipt_url || null;

      return {
        ref:         meta.cpars_ref      || '—',
        name:        meta.name           || '—',
        email:       meta.customer_email || charge?.billing_details?.email || pi.receipt_email || '—',
        phone:       meta.phone          || '—',
        origin:      meta.origin         || '—',
        destination: meta.destination    || '—',
        carrier:     meta.carrier        || '—',
        service:     meta.service        || '—',
        amount:      pi.amount / 100,
        status:      pi.status,
        paid:        pi.status === 'succeeded',
        booking_status: meta.booking_status || 'pending',
        tracking_number: meta.tracking_number || null,
        submittedAt: new Date(pi.created * 1000).toLocaleString(),
        stripe_id:   pi.id,
        receipt_url: receipt,
        weight:      meta.weight_declared ? `${meta.weight_declared} ${meta.weight_unit || 'lbs'}` : '—',
        origin_zip:      meta.origin_zip      || '—',
        destination_zip: meta.destination_zip || '—',
      };
    });

    // Stats
    const paid      = shipments.filter(s => s.paid);
    const revenue   = paid.reduce((sum, s) => sum + s.amount, 0);
    const pending   = shipments.filter(s => s.status === 'requires_payment_method').length;
    const failed    = shipments.filter(s => s.status === 'canceled').length;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ shipments, revenue, total: shipments.length, paid: paid.length, pending, failed })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to fetch from Stripe', details: err.message })
    };
  }
};
