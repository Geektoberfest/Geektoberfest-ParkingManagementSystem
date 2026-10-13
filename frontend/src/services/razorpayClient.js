import api from './api';

let scriptPromise = null;

// Razorpay checkout.js is loaded on demand; no keys are bundled.
// The public key id comes from POST /api/payments/create-order.
export function loadRazorpayScript() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export async function fetchQuote(payload) {
  const res = await api.post('/payments/quote', payload);
  return res.data.data;
}

export async function createRazorpayOrder(bookingId) {
  const res = await api.post('/payments/create-order', { bookingId });
  return res.data.data;
}

export async function verifyRazorpayPayment(result) {
  const res = await api.post('/payments/verify', {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
  });
  return res.data;
}

export async function fetchBookingPaymentStatus(bookingId) {
  const res = await api.get(`/payments/status/${bookingId}`);
  return res.data.data;
}

// Full test-mode flow: quote is display-only; order + verify are server-authoritative.
export async function payWithRazorpay({ booking, prefill = {}, onStatus } = {}) {
  await loadRazorpayScript();
  const order = await createRazorpayOrder(booking._id || booking);
  if (onStatus) onStatus({ stage: 'order-created', order });

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amountInPaise,
      currency: order.currency || 'INR',
      name: 'SmartPark',
      description: `Parking payment${booking?.slotId ? '' : ''} (test mode)`,
      order_id: order.orderId,
      prefill: {
        email: prefill.email || '',
        contact: prefill.contact || '',
      },
      notes: { bookingId: booking._id || booking },
      theme: { color: '#4f46e5' },
      modal: {
        ondismiss: () => reject(new Error('Payment window closed before completion')),
      },
      handler: async (response) => {
        try {
          if (onStatus) onStatus({ stage: 'verifying', response });
          const verified = await verifyRazorpayPayment(response);
          resolve(verified);
        } catch (err) {
          reject(err);
        }
      },
    });
    rzp.on('payment.failed', (err) => {
      reject(new Error(err?.error?.description || 'Razorpay payment failed (test mode)'));
    });
    rzp.open();
  });
}
