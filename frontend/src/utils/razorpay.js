const SCRIPT_ID = 'razorpay-checkout-js';

// The checkout SDK is loaded only when a user chooses to pay. No credentials are bundled here.
export const loadRazorpayCheckout = () => new Promise((resolve) => {
  if (window.Razorpay) {
    resolve(true);
    return;
  }

  const existingScript = document.getElementById(SCRIPT_ID);
  if (existingScript) {
    existingScript.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });
    existingScript.addEventListener('error', () => resolve(false), { once: true });
    return;
  }

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.async = true;
  script.onload = () => resolve(Boolean(window.Razorpay));
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});
