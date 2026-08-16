const https = require('https');
const { isRateLimited, rateLimitResponse } = require('./utils/rateLimit');

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

  if (isRateLimited(event)) return rateLimitResponse();

  const { name, email, phone, ref, issue_type, message } = JSON.parse(event.body || '{}');

  if (!name || !email || !message) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Name, email and message are required.' }) };
  }

  const SERVICE  = process.env.EMAILJS_SERVICE_ID;
  const OWNER    = process.env.EMAILJS_OWNER_TEMPLATE;
  const CLIENT   = process.env.EMAILJS_CLIENT_TEMPLATE;
  const KEY      = process.env.EMAILJS_PUBLIC_KEY;
  const submittedAt = new Date().toLocaleString();

  try {
    // Notify owner
    await sendEmail(SERVICE, OWNER, KEY, {
      name,
      email,
      phone:            phone || 'Not provided',
      reference_number: ref   || 'Not provided',
      service:          `SUPPORT QUERY — ${issue_type || 'General'}`,
      origin:           'N/A',
      destination:      'N/A',
      message:          `SUPPORT REQUEST\nType: ${issue_type || 'General'}\nRef: ${ref || 'N/A'}\n\n${message}`,
      submitted_at:     submittedAt,
      carrier:          'N/A',
      amount:           'N/A',
      tracking_number:  'N/A',
      status:           'SUPPORT QUERY'
    });

    // Confirm to user
    await sendEmail(SERVICE, CLIENT, KEY, {
      name,
      email,
      reference_number: ref || 'N/A',
      service:          `Support Query — ${issue_type || 'General'}`,
      origin:           'N/A',
      destination:      'N/A',
      submitted_at:     submittedAt,
      carrier:          'CPARS Support Team',
      amount:           'N/A',
      tracking_number:  'We will respond within 2 hours',
      status:           'QUERY RECEIVED'
    });

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };

  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to send query', details: err.message }) };
  }
};
