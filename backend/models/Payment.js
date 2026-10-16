const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'upi', 'wallet', 'cash', 'razorpay'],
      default: 'card',
    },
    // Payment provider (test mode). Secrets are env-only, never stored here.
    provider: {
      type: String,
      default: 'razorpay',
    },
    razorpayOrderId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      unique: true,
      sparse: true,
    },
    razorpaySignature: {
      type: String,
      select: false,
    },
    receipt: {
      type: String,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    // Server-computed fare breakdown snapshot (hours, base, tax, fees, total).
    breakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    transactionId: {
      type: String,
      unique: true,
      default: () => `TXN-${uuidv4().slice(0, 12).toUpperCase()}`,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
