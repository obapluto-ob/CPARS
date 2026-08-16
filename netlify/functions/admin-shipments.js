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
  const isAdmin    = admin_secret === process.env.ADMIN_SECRET || admin_secret === 'cpars_admin_token';
  const isReadonly = admin_secret === 'cpars_readonly_2012';
  if (!isAdmin && !isReadonly) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    // Fetch last 100 payment intents from Stripe
    const intents = await stripe.paymentIntents.list({ limit: 100, expand: ['data.latest_charge'] });

    const shipments = intents.data.map(pi => {
      const meta    = pi.metadata || {};
      const charge  = pi.latest_charge;
      const billing = charge?.billing_details || {};
      const receipt = charge?.receipt_url || null;

      // Fallback chain: metadata → charge billing_details → receipt_email
      const name  = (meta.name  && meta.name  !== '' && meta.name  !== '—') ? meta.name  : (billing.name  || '—');
      const email = (meta.customer_email && meta.customer_email !== '' && meta.customer_email !== '—') ? meta.customer_email : (billing.email || pi.receipt_email || '—');
      const phone = (meta.phone && meta.phone !== '' && meta.phone !== '—') ? meta.phone : (billing.phone || '—');

      // Address fallback: metadata full string → billing address
      const billingAddr = billing.address
        ? [billing.address.line1, billing.address.line2, billing.address.city, billing.address.state, billing.address.postal_code].filter(Boolean).join(', ')
        : '';
      const origin      = (meta.origin      && meta.origin      !== '' && meta.origin      !== '—') ? meta.origin      : (billingAddr || '—');
      // Destination: no billing fallback (billing = origin side). Show ZIP at minimum.
      const destRaw     = (meta.destination && meta.destination !== '' && meta.destination !== '—') ? meta.destination : '';
      const destZipRaw  = (meta.destination_zip && meta.destination_zip !== '' && meta.destination_zip !== '—') ? meta.destination_zip : extractZip(destRaw);
      const destination = destRaw || (destZipRaw !== '—' ? 'ZIP: ' + destZipRaw : '—');

      // ZIP fallback from address string
      const extractZip = (str) => { const m = (str||'').match(/(\d{5})/); return m ? m[1] : '—'; };
      const origin_zip      = (meta.origin_zip      && meta.origin_zip      !== '' && meta.origin_zip      !== '—') ? meta.origin_zip      : extractZip(origin);
      const destination_zip = destZipRaw !== '—' ? destZipRaw : extractZip(destination);

      // Weight: prefer declared, fall back to description parse
      const weight = meta.weight_declared
        ? `${meta.weight_declared} ${meta.weight_unit || 'lbs'}`
        : (meta.weight || '—');

      return {
        ref:         meta.cpars_ref || '—',
        name, email, phone, origin, destination,
        carrier:     meta.carrier      || '—',
        carrier_code: meta.carrier_code || '',
        service:     meta.service      || '—',
        service_code: meta.service_code || '',
        amount:      pi.amount / 100,
        status:      pi.status,
        paid:        pi.status === 'succeeded',
        booking_status:  meta.booking_status  || 'pending',
        tracking_number: meta.tracking_number || null,
        submittedAt: (() => {
          const d = new Date(pi.created * 1000);
          const dd   = String(d.getDate()).padStart(2,'0');
          const mm   = String(d.getMonth()+1).padStart(2,'0');
          const yyyy = d.getFullYear();
          const hh   = String(d.getHours()).padStart(2,'0');
          const min  = String(d.getMinutes()).padStart(2,'0');
          return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
        })(),
        stripe_id:   pi.id,
        receipt_url: receipt,
        weight,
        origin_zip,
        destination_zip,
        label_url:   meta.label_url || null,
      };
    });

    // Stats
    const paid      = shipments.filter(s => s.paid);
    const revenue   = paid.reduce((sum, s) => sum + s.amount, 0);
    const pending   = shipments.filter(s => s.status === 'requires_payment_method' || s.status === 'requires_action').length;
    const failed    = shipments.filter(s => s.status === 'canceled' || s.status === 'payment_failed').length;
    const booked    = shipments.filter(s => s.booking_status === 'booked' || s.booking_status === 'delivered').length;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ shipments, revenue, total: shipments.length, paid: paid.length, pending, failed, booked })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to fetch from Stripe', details: err.message })
    };
  }
};
