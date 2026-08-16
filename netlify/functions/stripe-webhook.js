const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const https  = require('https');

// Send email via EmailJS REST API (server-side)
async function sendEmail(serviceId, templateId, publicKey, params) {
  const payload = JSON.stringify({
    service_id:      serviceId,
    template_id:     templateId,
    user_id:         publicKey,
    accessToken:     process.env.EMAIL_PRIVATE_KEY,
    template_params: params
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.emailjs.com',
      path:     '/api/v1.0/email/send',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig    = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const data         = stripeEvent.data.object;

  // Expand latest charge to get billing_details as fallback for missing metadata
  let charge = null;
  try {
    if (data.latest_charge) {
      charge = typeof data.latest_charge === 'string'
        ? await stripe.charges.retrieve(data.latest_charge)
        : data.latest_charge;
    } else if (data.object === 'charge') {
      charge = data;
    }
  } catch(e) { console.warn('Could not retrieve charge:', e.message); }

  const billing      = charge?.billing_details || {};
  const meta         = data.metadata || {};
  const ref          = meta.cpars_ref || 'N/A';
  const carrier      = meta.carrier   || 'N/A';
  const service      = meta.service   || 'N/A';
  const amount       = data.amount_received
    ? '$' + (data.amount_received / 100).toFixed(2)
    : '$' + (data.amount / 100).toFixed(2);
  const email        = meta.customer_email || data.receipt_email || billing.email || null;
  const clientName   = (meta.name  && meta.name  !== '') ? meta.name  : (billing.name  || 'Valued Customer');
  const clientPhone  = (meta.phone && meta.phone !== '') ? meta.phone : (billing.phone || 'N/A');

  // Build address fallback from billing_details.address
  const billingAddrStr = billing.address
    ? [billing.address.line1, billing.address.line2, billing.address.city,
       billing.address.state, billing.address.postal_code].filter(Boolean).join(', ')
    : '';
  const originAddr   = (meta.origin      && meta.origin      !== '') ? meta.origin      : (billingAddrStr || meta.origin_zip      || 'On file');
  const destAddr     = (meta.destination && meta.destination !== '') ? meta.destination : (meta.destination_zip || 'On file');
  const weightStr    = meta.weight_declared
    ? `${meta.weight_declared} ${meta.weight_unit || 'lbs'}`
    : (meta.weight_buffered_lbs ? `${meta.weight_buffered_lbs} lbs` : 'On file');

  const EMAILJS_SERVICE  = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_OWNER    = process.env.EMAILJS_OWNER_TEMPLATE;
  const EMAILJS_CLIENT   = process.env.EMAILJS_CLIENT_TEMPLATE;
  const EMAILJS_KEY      = process.env.EMAILJS_PUBLIC_KEY;

  switch (stripeEvent.type) {

    case 'payment_intent.succeeded': {
      console.log(`PAYMENT SUCCEEDED | Ref: ${ref} | ${amount} | Carrier: ${carrier} | Service: ${service} | Email: ${email}`);

      if (email && EMAILJS_SERVICE && EMAILJS_CLIENT && EMAILJS_KEY) {
        const trackingNumber = meta.tracking_number || null;
        const trackUrl       = `https://cparstransportation.com/?track=${ref}&email=${encodeURIComponent(email)}`;
        const labelUrl       = meta.label_url || null;

        // Send confirmation to client
        const clientResult = await sendEmail(EMAILJS_SERVICE, EMAILJS_CLIENT, EMAILJS_KEY, {
          name:             clientName,
          email,
          reference_number: ref,
          service,
          origin:           originAddr,
          destination:      destAddr,
          weight:           weightStr,
          submitted_at:     new Date().toLocaleString(),
          carrier,
          amount,
          tracking_number:  trackingNumber || 'Being arranged — will be emailed within 1 hour',
          tracking_url:     trackUrl,
          label_url:        labelUrl || 'Will be emailed separately once booked',
          status:           'CONFIRMED & PAID'
        });
        console.log(`Client email | Status: ${clientResult.status} | Ref: ${ref} | To: ${email}`);

        // Notify owner
        await sendEmail(EMAILJS_SERVICE, EMAILJS_OWNER, EMAILJS_KEY, {
          name:             clientName,
          email,
          phone:            clientPhone,
          reference_number: ref,
          service,
          origin:           originAddr,
          destination:      destAddr,
          weight:           weightStr,
          message:          'Payment confirmed via webhook. Verify booking in ShipEngine.',
          submitted_at:     new Date().toLocaleString(),
          carrier,
          amount,
          tracking_number:  trackingNumber || 'Pending — book manually if not auto-booked',
          tracking_url:     trackUrl,
          label_url:        labelUrl || 'Not yet generated',
          status:           trackingNumber ? 'CONFIRMED & PAID — BOOKED' : 'CONFIRMED & PAID — VERIFY BOOKING'
        }).catch(e => console.warn('Owner email failed:', e));
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const reason = data.last_payment_error?.message || 'Unknown reason';
      console.log(`PAYMENT FAILED | Ref: ${ref} | Reason: ${reason}`);
      if (email && EMAILJS_SERVICE && EMAILJS_CLIENT && EMAILJS_KEY) {
        await sendEmail(EMAILJS_SERVICE, EMAILJS_CLIENT, EMAILJS_KEY, {
          name:             clientName,
          email,
          reference_number: ref,
          service:          service,
          origin:           originAddr,
          destination:      destAddr,
          weight:           weightStr,
          submitted_at:     new Date().toLocaleString(),
          carrier:          carrier,
          amount:           amount,
          tracking_number:  'N/A',
          tracking_url:     `https://cparstransportation.com/#contact`,
          label_url:        'N/A',
          message:          `Your payment could not be processed. Reason: ${reason}. Please try again or contact us at +1 (352) 213-8976.`,
          status:           'PAYMENT FAILED — PLEASE RETRY'
        }).catch(() => {});
      }
      break;
    }

    case 'charge.dispute.created': {
      const disputeAmount = '$' + (data.amount / 100).toFixed(2);
      console.error(`CHARGEBACK FILED | Ref: ${ref} | Amount: ${disputeAmount} | Reason: ${data.reason}`);
      if (EMAILJS_SERVICE && EMAILJS_OWNER && EMAILJS_KEY) {
        await sendEmail(EMAILJS_SERVICE, EMAILJS_OWNER, EMAILJS_KEY, {
          name:             'CHARGEBACK ALERT',
          email:            email || 'unknown',
          phone:            clientPhone || 'N/A',
          reference_number: ref,
          service:          'DISPUTE',
          origin:           originAddr,
          destination:      destAddr,
          message:          'CHARGEBACK FILED. Reason: ' + data.reason + '. Respond in Stripe within 7 days.',
          submitted_at:     new Date().toLocaleString(),
          carrier,
          amount:           disputeAmount,
          tracking_number:  'N/A',
          tracking_url:     'N/A',
          label_url:        'N/A',
          status:           'CHARGEBACK'
        }).catch(() => {});
      }
      break;
    }

    case 'charge.refunded': {
      console.log(`REFUND ISSUED | Ref: ${ref} | Amount: ${amount}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${stripeEvent.type}`);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
