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
    // Search Stripe payment intents by ref in metadata
    const intents = await stripe.paymentIntents.search({
      query: `metadata['cpars_ref']:'${ref}'`,
      expand: ['data.latest_charge']
    });

    if (!intents.data.length) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ found: false, error: 'No order found with that reference number. Please check and try again.' })
      };
    }

    const pi     = intents.data[0];
    const meta   = pi.metadata || {};
    const charge = pi.latest_charge;

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

    if (pi.status === 'succeeded') {
      // Payment went through — check if booking happened
      const trackingNumber = meta.tracking_number || null;

      if (trackingNumber) {
        statusLabel   = 'Booked & In Transit';
        statusColor   = '#16a34a';
        statusIcon    = 'fa-truck-fast';
        statusMessage = 'Your shipment has been booked and is on its way.';
      } else {
        // Paid but no tracking yet — this is the affected client scenario
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
        found:          true,
        ref:            meta.cpars_ref    || ref,
        name:           meta.name         || '—',
        email:          storedEmail       || email,
        carrier:        meta.carrier      || '—',
        service:        meta.service      || '—',
        origin:         meta.origin       || '—',
        destination:    meta.destination  || '—',
        weight:         meta.weight_declared ? `${meta.weight_declared} ${meta.weight_unit || 'lbs'}` : '—',
        amount:         (pi.amount / 100).toFixed(2),
        paid:           pi.status === 'succeeded',
        tracking_number: meta.tracking_number || null,
        receipt_url:    charge?.receipt_url   || null,
        submittedAt:    new Date(pi.created * 1000).toLocaleString(),
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
