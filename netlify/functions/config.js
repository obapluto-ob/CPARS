exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({
    stripeKey: process.env.STRIPE_PUBLISHABLE_KEY,
  })
});
