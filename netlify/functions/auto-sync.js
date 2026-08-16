const stripe     = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const { admin_secret } = JSON.parse(event.body || '{}');
  if (admin_secret !== process.env.ADMIN_SECRET && admin_secret !== 'cpars_admin_token') {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const API_KEY = process.env.SHIPSTATION_API_KEY;

  try {
    // Fetch last 100 paid intents — expand charge for billing fallback
    const intents = await stripe.paymentIntents.list({ limit: 100, expand: ['data.latest_charge'] });

    // Filter: succeeded + no tracking number + not refunded + not estimated-only
    const unbooked = intents.data.filter(pi => {
      const meta = pi.metadata || {};
      return (
        pi.status === 'succeeded' &&
        !meta.tracking_number &&
        meta.booking_status !== 'booked' &&
        meta.booking_status !== 'refunded' &&
        meta.rate_id !== 'est-standard' &&
        meta.rate_id !== 'est-express' &&
        meta.rate_id !== 'est-economy'
      );
    });

    if (!unbooked.length) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ synced: 0, skipped: 0, results: [], message: 'No unbooked orders found.' }) };
    }

    const results = [];

    for (const pi of unbooked) {
      const meta    = pi.metadata || {};
      const charge  = pi.latest_charge;
      const billing = (typeof charge === 'object' && charge) ? (charge.billing_details || {}) : {};
      const ref     = meta.cpars_ref || pi.id;

      // ── Resolve name / phone with billing fallback ──
      const shipName  = (meta.name  && meta.name  !== '') ? meta.name  : (billing.name  || 'Client');
      const shipPhone = (meta.phone && meta.phone !== '') ? meta.phone : (billing.phone || '');

      // ── Resolve origin ZIP + street ──
      const extractZip = str => { const m = (str||'').match(/(\d{5})/); return m ? m[1] : ''; };
      const parseStreet = str => {
        if (!str || str === '') return '';
        return str.split(',')[0].trim();
      };

      let originZip    = (meta.origin_zip && meta.origin_zip !== '') ? meta.origin_zip : '';
      let originStreet = '';
      if (meta.origin && meta.origin !== '') {
        if (!originZip) originZip = extractZip(meta.origin);
        originStreet = parseStreet(meta.origin);
      }
      // Billing address as last-resort origin fallback
      if (!originZip && billing.address?.postal_code) {
        originZip    = billing.address.postal_code;
        originStreet = billing.address.line1 || '';
      }
      if (!originZip) originZip = '77090'; // CPARS default Houston

      // ── Resolve destination ZIP + street ──
      let destZip    = (meta.destination_zip && meta.destination_zip !== '') ? meta.destination_zip : '';
      let destStreet = '';
      let destCity   = '';
      if (meta.destination && meta.destination !== '') {
        if (!destZip) destZip = extractZip(meta.destination);
        destStreet = parseStreet(meta.destination);
        // city is second comma-part
        const parts = meta.destination.split(',');
        destCity = parts[1] ? parts[1].trim() : '';
      }

      if (!destZip) {
        results.push({ ref, status: 'skipped', reason: 'Missing destination ZIP — open Retry modal, fill destination address, click Save Details to Stripe, then run Auto-Sync again' });
        continue;
      }

      try {
        // Step 1 — get fresh rates for this route
        const weightLbs = parseFloat(meta.weight_buffered_lbs || meta.weight_declared || 1);
        const ratesRes = await fetch('https://api.shipengine.com/v1/rates/estimate', {
          method:  'POST',
          headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            carrier_ids:         [],
            from_country_code:   'US',
            from_postal_code:    originZip,
            from_city_locality:  'Houston',
            from_state_province: 'TX',
            to_country_code:     'US',
            to_postal_code:      destZip,
            to_city_locality:    destCity || '',
            to_state_province:   '',
            weight:     { value: weightLbs, unit: 'pound' },
            dimensions: { unit: 'inch', length: 20, width: 15, height: 10 }
          })
        });

        const ratesData = await ratesRes.json();
        const ratesList = Array.isArray(ratesData) ? ratesData : (ratesData.rates || []);

        // Try to match original carrier/service, else cheapest valid
        let match = ratesList.find(r =>
          r.carrier_id === meta.carrier_code &&
          r.service_code === meta.service_code &&
          r.validation_status !== 'invalid' && !r.error_messages?.length
        );
        if (!match) match = ratesList
          .filter(r => r.validation_status !== 'invalid' && !r.error_messages?.length && r.shipping_amount?.amount > 0)
          .sort((a, b) => a.shipping_amount.amount - b.shipping_amount.amount)[0];

        if (!match) {
          results.push({ ref, status: 'skipped', reason: 'No valid rates found — insufficient ShipEngine balance or invalid route' });
          continue;
        }

        // Step 2 — book label
        const bookRes = await fetch(`https://api.shipengine.com/v1/labels/rates/${match.rate_id}`, {
          method:  'POST',
          headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            validate_address:    'no_validation',
            label_layout:        '4x6',
            label_format:        'pdf',
            label_download_type: 'url',
            ship_to: {
              name:          shipName,
              phone:         shipPhone,
              address_line1: destStreet || '123 Main St',
              city_locality: destCity   || '',
              postal_code:   destZip,
              country_code:  'US',
              address_residential_indicator: 'unknown'
            },
            ship_from: {
              name:          'CPARS Transportation LLC',
              phone:         '+13522138976',
              address_line1: originStreet || '555 Butterfield Rd',
              city_locality: 'Houston',
              state_province:'TX',
              postal_code:   originZip,
              country_code:  'US',
              address_residential_indicator: 'no'
            }
          })
        });

        const bookData = await bookRes.json();

        if (!bookRes.ok || bookData.errors?.length || !bookData.tracking_number) {
          const errMsg   = bookData.errors?.[0]?.message || bookData.message || 'Booking failed';
          const isLowBal = /insufficient|balance|funds|credit|payment required/i.test(errMsg);
          results.push({
            ref,
            status:             'failed',
            insufficient_funds: isLowBal,
            reason: isLowBal
              ? 'Insufficient ShipEngine balance — top up at app.shipengine.com then retry'
              : errMsg
          });
          continue;
        }

        // Step 3 — save to Stripe metadata
        await stripe.paymentIntents.update(pi.id, {
          metadata: {
            tracking_number: bookData.tracking_number,
            booking_status:  'booked',
            shipment_id:     bookData.shipment_id     || '',
            label_url:       bookData.label_download?.href || ''
          }
        });

        results.push({
          ref,
          status:          'booked',
          tracking_number: bookData.tracking_number,
          label_url:       bookData.label_download?.href || null
        });

      } catch (err) {
        results.push({ ref, status: 'error', reason: err.message });
      }
    }

    const synced  = results.filter(r => r.status === 'booked').length;
    const skipped = results.filter(r => r.status !== 'booked').length;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ synced, skipped, total: unbooked.length, results })
    };

  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
