/**
 * In-memory rate limiter — 10 requests per IP per 60 seconds.
 * For production scale, swap store with Upstash Redis free tier.
 */
const store = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_HITS  = 10;

function getIP(event) {
  return (
    event.headers['x-forwarded-for']?.split(',')[0].trim() ||
    event.headers['client-ip'] ||
    'unknown'
  );
}

function isRateLimited(event) {
  const ip  = getIP(event);
  const now = Date.now();

  if (!store.has(ip)) {
    store.set(ip, { count: 1, start: now });
    return false;
  }

  const entry = store.get(ip);
  if (now - entry.start > WINDOW_MS) {
    store.set(ip, { count: 1, start: now });
    return false;
  }

  entry.count++;
  return entry.count > MAX_HITS;
}

function rateLimitResponse() {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Retry-After': '60'
    },
    body: JSON.stringify({
      error: 'Too many requests. Please wait a moment and try again.',
      code:  'RATE_LIMITED'
    })
  };
}

module.exports = { isRateLimited, rateLimitResponse };
