const { isRateLimited, rateLimitResponse } = require('./utils/rateLimit');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (isRateLimited(event)) return rateLimitResponse();
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      publicKey:      process.env.EMAILJS_PUBLIC_KEY,
      serviceId:      process.env.EMAILJS_SERVICE_ID,
      clientTemplate: process.env.EMAILJS_CLIENT_TEMPLATE,
      ownerTemplate:  process.env.EMAILJS_OWNER_TEMPLATE,
    })
  };
};
