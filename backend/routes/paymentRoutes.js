const express = require('express');
const router = express.Router();
const {
  getQuote,
  createOrder,
  verifyPayment,
  webhook,
  getStatusByBooking,
  processPayment,
  getPaymentHistory,
  getAllPayments,
  getReceipt,
} = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/auth');

// Webhook must receive the raw body for signature verification.
// server.js mounts this route with express.raw before express.json.
router.post('/webhook', webhook);

router.post('/quote', protect, getQuote);
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verifyPayment);
router.get('/status/:bookingId', protect, getStatusByBooking);

// Legacy manual/cash path (online payments must use Razorpay routes above).
router.post('/process', protect, processPayment);
router.get('/history', protect, getPaymentHistory);
router.get('/receipt/:id', protect, getReceipt);
router.get('/all', protect, adminOnly, getAllPayments);

module.exports = router;
