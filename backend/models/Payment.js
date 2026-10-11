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
    amountPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value) => Number.isSafeInteger(value),
        message: 'amountPaise must be a safe integer',
      },
    },
    currency: {
      type: String,
      enum: ['INR'],
      required: true,
      default: 'INR',
      uppercase: true,
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'upi', 'wallet', 'cash', 'netbanking'],
      default: 'card',
    },
    transactionId: {
      type: String,
      default: () => `TXN-${uuidv4().slice(0, 12).toUpperCase()}`,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'cancelled', 'refunded', 'manual_review'],
      default: 'pending',
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    provider: {
      type: String,
      enum: ['razorpay'],
      default: 'razorpay',
    },
    providerOrderId: {
      type: String,
    },
    providerPaymentId: {
      type: String,
    },
    orderCreationInProgress: {
      type: Boolean,
      default: false,
    },
    verifiedAt: Date,
    failureCode: String,
    processedWebhookEventIds: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Only one active checkout may exist per booking; provider references are immutable identifiers.
paymentSchema.index({ bookingId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
paymentSchema.index({ providerOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
