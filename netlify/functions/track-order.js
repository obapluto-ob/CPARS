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

  const { ref, email } = JSON.parse(event.body || '{}');

  if (!ref || !email) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Reference number and email are required.' }) };
  }

  try {
    // Use list + find — avoids 30-60s search index delay
    const intents = await stripe.paymentIntents.list({ limit: 100 });
    const pi = intents.data.find(p => p.metadata?.cpars_ref === ref);

    if (!pi) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ found: false, error: 'No order found with that reference number. Please check and try again.' })
      };
    }

    const meta   = pi.metadata || {};
    const charge = await stripe.charges.list({ payment_intent: pi.id, limit: 1 })
      .then(r => r.data[0]).catch(() => null);

    // Verify email matches — security check
    const storedEmail = (meta.customer_email || charge?.billing_details?.email || pi.receipt_email || '').toLowerCase().trim();
    if (storedEmail && storedEmail !== email.toLowerCase().trim()) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ found: false, error: 'Reference number and email do not match. Please check your confirmation email.' })
      };
    }

    // Build accurate status
    let statusLabel, statusColor, statusIcon, statusMessage;
    const trackingNumber = meta.tracking_number || null;

    if (pi.status === 'succeeded') {
      if (trackingNumber) {
        statusLabel   = 'Booked & In Transit';
        statusColor   = '#16a34a';
        statusIcon    = 'fa-truck-fast';
        statusMessage = 'Your shipment has been booked and is on its way.';
      } else {
        statusLabel   = 'Payment Confirmed — Booking Pending';
        statusColor   = '#d97706';
        statusIcon    = 'fa-clock';
        statusMessage = 'Your payment was received successfully. Our team is arranging your shipment and will email your tracking number within 1 hour. If you have not heard from us, please call +1 (352) 213-8976.';
      }
    } else if (pi.status === 'canceled') {
      statusLabel   = 'Payment Failed';
      statusColor   = '#dc2626';
      statusIcon    = 'fa-circle-xmark';
      statusMessage = 'Your payment did not go through. No charge was made. Please try booking again or contact us for help.';
    } else {
      statusLabel   = 'Payment Pending';
      statusColor   = '#2563eb';
      statusIcon    = 'fa-hourglass-half';
      statusMessage = 'Your payment is still being processed. Please wait a few minutes and check again.';
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        found:           true,
        ref:             meta.cpars_ref   || ref,
        name:            meta.name        || '—',
        email:           storedEmail      || email,
        carrier:         meta.carrier     || '—',
        service:         meta.service     || '—',
        origin:          meta.origin      || '—',
        destination:     meta.destination || '—',
        weight:          meta.weight_declared
          ? `${meta.weight_declared} ${meta.weight_unit || 'lbs'}`
          : (meta.weight_buffered_lbs ? `${meta.weight_buffered_lbs} lbs` : '—'),
        amount:          (pi.amount / 100).toFixed(2),
        paid:            pi.status === 'succeeded',
        tracking_number: trackingNumber,
        receipt_url:     charge?.receipt_url || null,
        submittedAt:     new Date(pi.created * 1000).toLocaleString(),
        statusLabel,
        statusColor,
        statusIcon,
        statusMessage
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Lookup failed. Please try again or contact us directly.', details: err.message })
    };
  }
};
