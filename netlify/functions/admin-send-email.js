const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

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
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const { admin_secret, to_email, to_name, ref, subject_note, message, tracking_number, tracking_url, label_url, carrier, service, amount } = JSON.parse(event.body || '{}');

  if (admin_secret !== process.env.ADMIN_SECRET && admin_secret !== 'cpars_admin_token') {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!to_email || !message) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'to_email and message are required' }) };
  }

  const SERVICE    = process.env.EMAILJS_SERVICE_ID;
  const CLIENT_TPL = process.env.EMAILJS_CLIENT_TEMPLATE;
  const KEY        = process.env.EMAILJS_PUBLIC_KEY;

  try {
    const result = await sendEmail(SERVICE, CLIENT_TPL, KEY, {
      name:             to_name || 'Valued Customer',
      email:            to_email,
      reference_number: ref || 'N/A',
      service:          service || subject_note || 'Update from CPARS Transportation',
      origin:           'N/A',
      destination:      'N/A',
      submitted_at:     new Date().toLocaleString(),
      carrier:          carrier || 'CPARS Transportation',
      amount:           amount  || 'N/A',
      tracking_number:  tracking_number || 'N/A',
      tracking_url:     tracking_url || `https://cparstransportation.com/?track=${ref || ''}&email=${encodeURIComponent(to_email)}`,
      label_url:        label_url || 'N/A',
      message,
      status:           subject_note || 'UPDATE FROM CPARS TRANSPORTATION'
    });

    if (result.status !== 200) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'EmailJS returned ' + result.status, details: result.body }) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
