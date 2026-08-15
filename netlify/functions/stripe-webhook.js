const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

  const data   = stripeEvent.data.object;
  const ref    = data.metadata?.cpars_ref    || 'N/A';
  const carrier = data.metadata?.carrier     || 'N/A';
  const service = data.metadata?.service     || 'N/A';
  const amount  = data.amount_received
    ? '$' + (data.amount_received / 100).toFixed(2)
    : '$' + (data.amount / 100).toFixed(2);

  switch (stripeEvent.type) {

    case 'payment_intent.succeeded': {
      // Payment confirmed server-side — log it
      console.log(`PAYMENT SUCCEEDED | Ref: ${ref} | ${amount} | Carrier: ${carrier} | Service: ${service}`);
      // You can trigger EmailJS here via fetch if needed as a backup
      // or call book-shipment again if it failed the first time
      break;
    }

    case 'payment_intent.payment_failed': {
      const reason = data.last_payment_error?.message || 'Unknown reason';
      console.log(`PAYMENT FAILED | Ref: ${ref} | Reason: ${reason}`);
      break;
    }

    case 'charge.dispute.created': {
      // Someone filed a chargeback — critical alert
      const disputeAmount = '$' + (data.amount / 100).toFixed(2);
      console.error(`CHARGEBACK FILED | Ref: ${ref} | Amount: ${disputeAmount} | Reason: ${data.reason}`);
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
