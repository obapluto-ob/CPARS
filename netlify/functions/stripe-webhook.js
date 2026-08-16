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

  const data     = stripeEvent.data.object;
  const ref      = data.metadata?.cpars_ref || 'N/A';
  const carrier  = data.metadata?.carrier   || 'N/A';
  const service  = data.metadata?.service   || 'N/A';
  const amount   = data.amount_received
    ? '$' + (data.amount_received / 100).toFixed(2)
    : '$' + (data.amount / 100).toFixed(2);
  const email    = data.receipt_email || data.metadata?.customer_email || null;

  const EMAILJS_SERVICE  = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_OWNER    = process.env.EMAILJS_OWNER_TEMPLATE;
  const EMAILJS_CLIENT   = process.env.EMAILJS_CLIENT_TEMPLATE;
  const EMAILJS_KEY      = process.env.EMAILJS_PUBLIC_KEY;

  switch (stripeEvent.type) {

    case 'payment_intent.succeeded': {
      console.log(`PAYMENT SUCCEEDED | Ref: ${ref} | ${amount} | Carrier: ${carrier} | Service: ${service} | Email: ${email}`);

      if (email && EMAILJS_SERVICE && EMAILJS_CLIENT && EMAILJS_KEY) {
        const trackingNumber = data.metadata?.tracking_number || null;
        const recoveryUrl    = `https://cparstransportation.com/?track=${ref}&email=${encodeURIComponent(email)}`;

        // Send confirmation to client
        const clientResult = await sendEmail(EMAILJS_SERVICE, EMAILJS_CLIENT, EMAILJS_KEY, {
          name:             data.metadata?.name || 'Valued Customer',
          email,
          reference_number: ref,
          service,
          origin:           data.metadata?.origin      || 'On file',
          destination:      data.metadata?.destination || 'On file',
          submitted_at:     new Date().toLocaleString(),
          carrier,
          amount,
          tracking_number:  trackingNumber || 'Being arranged — will be emailed within 1 hour',
          recovery_url:     recoveryUrl,
          status:           'CONFIRMED & PAID'
        });
        console.log(`Client email | Status: ${clientResult.status} | Ref: ${ref} | To: ${email}`);

        // Notify owner
        await sendEmail(EMAILJS_SERVICE, EMAILJS_OWNER, EMAILJS_KEY, {
          name:             data.metadata?.name  || 'Client',
          email,
          phone:            data.metadata?.phone || 'N/A',
          reference_number: ref,
          service,
          origin:           data.metadata?.origin      || 'Check Stripe',
          destination:      data.metadata?.destination || 'Check Stripe',
          message:          'Payment confirmed via webhook. Verify booking in ShipEngine.',
          submitted_at:     new Date().toLocaleString(),
          carrier,
          amount,
          tracking_number:  trackingNumber || 'Pending — book manually if not auto-booked',
          status:           trackingNumber ? 'CONFIRMED & PAID — BOOKED' : 'CONFIRMED & PAID — VERIFY BOOKING'
        }).catch(e => console.warn('Owner email failed:', e));
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const reason = data.last_payment_error?.message || 'Unknown reason';
      console.log(`PAYMENT FAILED | Ref: ${ref} | Reason: ${reason}`);
      break;
    }

    case 'charge.dispute.created': {
      const disputeAmount = '$' + (data.amount / 100).toFixed(2);
      console.error(`CHARGEBACK FILED | Ref: ${ref} | Amount: ${disputeAmount} | Reason: ${data.reason}`);
      if (EMAILJS_SERVICE && EMAILJS_OWNER && EMAILJS_KEY) {
        await sendEmail(EMAILJS_SERVICE, EMAILJS_OWNER, EMAILJS_KEY, {
          name:             'CHARGEBACK ALERT',
          email:            email || 'unknown',
          phone:            'N/A',
          reference_number: ref,
          service:          'DISPUTE',
          origin:           'N/A',
          destination:      'N/A',
          message:          'CHARGEBACK FILED. Reason: ' + data.reason + '. Respond in Stripe within 7 days.',
          submitted_at:     new Date().toLocaleString(),
          carrier,
          amount:           disputeAmount,
          tracking_number:  'N/A',
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
