const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const https  = require('https');

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

// Find Stripe PaymentIntent by cpars_ref
async function findPaymentIntent(ref) {
  const list = await stripe.paymentIntents.list({ limit: 100 });
  return list.data.find(pi => pi.metadata?.cpars_ref === ref) || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify ShipEngine webhook secret
  const secret = process.env.SHIPENGINE_WEBHOOK_SECRET;
  if (secret) {
    const incoming = event.headers['x-shipengine-signature'] || event.headers['authorization'] || '';
    if (!incoming.includes(secret)) {
      console.warn('ShipEngine webhook signature mismatch');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventType     = payload.event || payload.resource_type || '';
  const resourceUrl   = payload.resource_url || '';
  const data          = payload.data || payload.resource || {};

  console.log(`ShipEngine webhook: ${eventType}`, JSON.stringify(data).slice(0, 300));

  const EMAILJS_SERVICE = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_CLIENT  = process.env.EMAILJS_CLIENT_TEMPLATE;
  const EMAILJS_OWNER   = process.env.EMAILJS_OWNER_TEMPLATE;
  const EMAILJS_KEY     = process.env.EMAILJS_PUBLIC_KEY;

  // ── label_created ──────────────────────────────────────────────────────────
  if (eventType === 'label_created') {
    const trackingNumber = data.tracking_number || null;
    const shipmentId     = data.shipment_id     || null;
    const labelUrl       = data.label_download?.href || null;
    const carrierCode    = data.carrier_id       || '';

    if (!trackingNumber) {
      console.warn('label_created event missing tracking_number');
      return { statusCode: 200, body: 'ok' };
    }

    // Try to find the matching Stripe PaymentIntent via shipment_id in metadata
    // ShipEngine doesn't know our ref — we search by shipment_id or tracking_number
    try {
      const list = await stripe.paymentIntents.list({ limit: 100 });
      const pi   = list.data.find(p =>
        p.metadata?.shipment_id     === shipmentId ||
        p.metadata?.tracking_number === trackingNumber
      );

      if (pi) {
        await stripe.paymentIntents.update(pi.id, {
          metadata: {
            tracking_number: trackingNumber,
            booking_status:  'booked',
            shipment_id:     shipmentId || pi.metadata.shipment_id || ''
          }
        });
        console.log(`Updated Stripe PI ${pi.id} with tracking ${trackingNumber}`);

        // Email client their tracking number
        const meta  = pi.metadata;
        const email = meta.customer_email || pi.receipt_email;
        if (email && EMAILJS_SERVICE && EMAILJS_CLIENT && EMAILJS_KEY) {
          await sendEmail(EMAILJS_SERVICE, EMAILJS_CLIENT, EMAILJS_KEY, {
            name:             meta.name             || 'Valued Customer',
            email,
            reference_number: meta.cpars_ref        || 'N/A',
            service:          meta.service          || 'N/A',
            origin:           meta.origin           || 'On file',
            destination:      meta.destination      || 'On file',
            submitted_at:     new Date().toLocaleString(),
            carrier:          meta.carrier          || carrierCode,
            amount:           '$' + ((pi.amount || 0) / 100).toFixed(2),
            tracking_number:  trackingNumber,
            label_url:        labelUrl || 'Will be emailed separately',
            status:           'BOOKED — LABEL CREATED'
          }).catch(e => console.warn('Client label email failed:', e));
        }
      } else {
        console.warn(`label_created: no Stripe PI found for shipment_id=${shipmentId} tracking=${trackingNumber}`);
      }
    } catch (e) {
      console.error('label_created Stripe update failed:', e.message);
    }
  }

  // ── tracking_update ────────────────────────────────────────────────────────
  else if (eventType === 'tracking_update' || eventType === 'track') {
    const trackingNumber = data.tracking_number || data.tracking?.tracking_number || null;
    const statusCode     = data.status_code     || data.tracking?.status_code     || '';
    const statusDesc     = data.status_description || data.tracking?.status_description || statusCode;
    const location       = data.events?.[0]?.city_locality || '';

    console.log(`Tracking update: ${trackingNumber} → ${statusDesc} ${location ? '@ ' + location : ''}`);

    // Update Stripe metadata with latest tracking status
    if (trackingNumber) {
      try {
        const list = await stripe.paymentIntents.list({ limit: 100 });
        const pi   = list.data.find(p => p.metadata?.tracking_number === trackingNumber);
        if (pi) {
          await stripe.paymentIntents.update(pi.id, {
            metadata: { booking_status: statusCode || 'in_transit' }
          });
        }
      } catch (e) {
        console.warn('tracking_update Stripe update failed:', e.message);
      }
    }
  }

  // ── delivery ───────────────────────────────────────────────────────────────
  else if (eventType === 'delivery') {
    const trackingNumber = data.tracking_number || null;
    console.log(`Delivery confirmed: ${trackingNumber}`);

    if (trackingNumber) {
      try {
        const list = await stripe.paymentIntents.list({ limit: 100 });
        const pi   = list.data.find(p => p.metadata?.tracking_number === trackingNumber);
        if (pi) {
          await stripe.paymentIntents.update(pi.id, {
            metadata: { booking_status: 'delivered' }
          });

          // Email client delivery confirmation
          const meta  = pi.metadata;
          const email = meta.customer_email || pi.receipt_email;
          if (email && EMAILJS_SERVICE && EMAILJS_CLIENT && EMAILJS_KEY) {
            await sendEmail(EMAILJS_SERVICE, EMAILJS_CLIENT, EMAILJS_KEY, {
              name:             meta.name        || 'Valued Customer',
              email,
              reference_number: meta.cpars_ref   || 'N/A',
              service:          meta.service     || 'N/A',
              origin:           meta.origin      || 'On file',
              destination:      meta.destination || 'On file',
              submitted_at:     new Date().toLocaleString(),
              carrier:          meta.carrier     || 'N/A',
              amount:           '$' + ((pi.amount || 0) / 100).toFixed(2),
              tracking_number:  trackingNumber,
              status:           '✅ DELIVERED'
            }).catch(e => console.warn('Delivery email failed:', e));
          }
        }
      } catch (e) {
        console.error('delivery Stripe update failed:', e.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
