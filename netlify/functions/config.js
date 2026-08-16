exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({
    stripeKey:             process.env.STRIPE_PUBLISHABLE_KEY,
    emailjsPublicKey:      process.env.EMAILJS_PUBLIC_KEY,
    emailjsServiceId:      process.env.EMAILJS_SERVICE_ID,
    emailjsClientTemplate: process.env.EMAILJS_CLIENT_TEMPLATE,
    emailjsOwnerTemplate:  process.env.EMAILJS_OWNER_TEMPLATE,
  })
});
