const express = require('express');
const router = express.Router();
const {
  processPayment,
  createPaymentOrder,
  verifyPayment,
  getFareBreakdown,
  getPaymentHistory,
  getAllPayments,
  getReceipt,
} = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/fare/:bookingId', protect, getFareBreakdown);
router.post('/orders', protect, createPaymentOrder);
router.post('/verify', protect, verifyPayment);
// Preserved for existing consumers. It now creates a pending checkout order only.
router.post('/process', protect, processPayment);
router.get('/history', protect, getPaymentHistory);
router.get('/receipt/:id', protect, getReceipt);
router.get('/all', protect, adminOnly, getAllPayments);

module.exports = router;
