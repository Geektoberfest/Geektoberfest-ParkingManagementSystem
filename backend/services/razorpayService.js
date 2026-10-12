const crypto = require('crypto');

let cached = null;

// Lazy-load so missing keys fail only when Razorpay is actually used.
function getClient() {
  if (cached) return cached;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in backend/.env');
  }
  const Razorpay = require('razorpay');
  cached = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cached;
}

function getPublicKeyId() {
  return process.env.RAZORPAY_KEY_ID || '';
}

// HMAC-SHA256(order_id + '|' + payment_id) must equal razorpay_signature.
// Secret never leaves the server.
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Webhook verification per Razorpay docs: HMAC of raw body with webhook secret.
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Trusted server-side check: fetch the payment from Razorpay and confirm capture.
async function fetchPaymentFromProvider(paymentId) {
  const client = getClient();
  return client.payments.fetch(paymentId);
}

async function createOrder({ amountInPaise, currency = 'INR', receipt, notes = {} }) {
  const client = getClient();
  return client.orders.create({
    amount: amountInPaise,
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    notes,
  });
}

module.exports = {
  getClient,
  getPublicKeyId,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPaymentFromProvider,
  createOrder,
};
