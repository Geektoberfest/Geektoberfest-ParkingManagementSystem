const crypto = require('crypto');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const ParkingLot = require('../models/ParkingLot');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getPricingConfig, calculateFee, toPaise } = require('../services/pricingService');
const razorpay = require('../services/razorpayService');

// Recompute the payable amount on the server. Client totals are ignored.
async function buildServerQuote(booking) {
  const lot = await ParkingLot.findById(booking.parkingLotId);
  if (!lot) throw new Error('Parking lot not found');
  const config = await getPricingConfig();
  const fee = calculateFee({
    startTime: booking.startTime,
    endTime: booking.endTime,
    pricePerHour: lot.pricePerHour,
    overdueHours: booking.overdueHours || 0,
    config,
  });
  return { lot, config, fee };
}

async function notifyPaymentSuccess(io, userId, { amount, transactionId, link }) {
  await User.findByIdAndUpdate(userId, {
    $push: {
      notifications: {
        message: `Payment of ₹${amount} successful. Transaction: ${transactionId}`,
        type: 'payment',
      },
    },
  });
  const notif = await Notification.create({
    userId,
    title: 'Payment Successful',
    message: `Payment of ₹${amount} processed. Transaction: ${transactionId}`,
    type: 'payment',
    link: link || '/dashboard/payments',
  });
  if (io) io.to(`user_${userId}`).emit('newNotification', notif);
  return notif;
}

// Idempotent success transition shared by verify + webhook.
async function markPaymentSuccess(payment, { razorpayPaymentId, razorpaySignature }) {
  if (payment.status === 'success') return { payment, duplicate: true };
  payment.status = 'success';
  if (razorpayPaymentId) payment.razorpayPaymentId = razorpayPaymentId;
  if (razorpaySignature) payment.razorpaySignature = razorpaySignature;
  payment.paymentDate = new Date();
  await payment.save();

  const booking = await Booking.findById(payment.bookingId);
  if (booking && booking.paymentStatus !== 'completed') {
    booking.paymentStatus = 'completed';
    await booking.save();
  }
  return { payment, duplicate: false };
}

// @desc    Server-side fare quote + breakdown (review before checkout)
// @route   POST /api/payments/quote
exports.getQuote = async (req, res, next) => {
  try {
    const { bookingId, parkingLotId, startTime, endTime } = req.body;
    let fee;
    let lot;

    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
      if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
      const q = await buildServerQuote(booking);
      lot = q.lot;
      fee = q.fee;
    } else {
      if (!parkingLotId || !startTime || !endTime) {
        return res.status(400).json({ success: false, message: 'Provide bookingId or parkingLotId + startTime + endTime' });
      }
      lot = await ParkingLot.findById(parkingLotId);
      if (!lot) return res.status(404).json({ success: false, message: 'Parking lot not found' });
      const config = await getPricingConfig();
      fee = calculateFee({ startTime, endTime, pricePerHour: lot.pricePerHour, config });
    }

    res.json({
      success: true,
      data: {
        breakdown: fee,
        amount: fee.totalAmount,
        amountInPaise: toPaise(fee.totalAmount),
        currency: fee.currency,
        testMode: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Razorpay order (server-computed amount only)
// @route   POST /api/payments/create-order
exports.createOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ success: false, message: 'bookingId is required' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Payment already completed' });
    }

    const { fee } = await buildServerQuote(booking);

    // Keep stored booking total in sync with server truth.
    if (booking.totalAmount !== fee.totalAmount) {
      booking.totalAmount = fee.totalAmount;
      await booking.save();
    }

    // Idempotency: reuse an existing pending payment for this booking+amount.
    const existing = await Payment.findOne({
      bookingId: booking._id,
      status: 'pending',
      razorpayOrderId: { $exists: true, $ne: null },
    }).sort('-createdAt');
    if (existing && existing.amount === fee.totalAmount) {
      return res.json({
        success: true,
        reused: true,
        data: {
          orderId: existing.razorpayOrderId,
          paymentId: existing._id,
          amount: existing.amount,
          amountInPaise: toPaise(existing.amount),
          currency: existing.currency || fee.currency,
          breakdown: existing.breakdown || fee,
          keyId: razorpay.getPublicKeyId(),
          testMode: true,
        },
      });
    }

    const receipt = `bk_${booking._id.toString().slice(-12)}_${Date.now().toString().slice(-8)}`;
    const order = await razorpay.createOrder({
      amountInPaise: toPaise(fee.totalAmount),
      currency: fee.currency,
      receipt,
      notes: { bookingId: booking._id.toString(), userId: req.user._id.toString() },
    });

    const payment = await Payment.create({
      userId: booking.userId,
      bookingId: booking._id,
      amount: fee.totalAmount,
      paymentMethod: 'razorpay',
      provider: 'razorpay',
      status: 'pending',
      razorpayOrderId: order.id,
      receipt,
      currency: fee.currency,
      breakdown: fee,
    });

    res.status(201).json({
      success: true,
      data: {
        orderId: order.id,
        paymentId: payment._id,
        amount: fee.totalAmount,
        amountInPaise: order.amount,
        currency: order.currency,
        breakdown: fee,
        keyId: razorpay.getPublicKeyId(),
        testMode: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Razorpay payment signature + provider status
// @route   POST /api/payments/verify
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing Razorpay payment fields' });
    }

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });
    if (payment.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Duplicate notification: already successful -> ack without side effects.
    if (payment.status === 'success') {
      return res.json({ success: true, duplicate: true, data: payment });
    }

    const valid = razorpay.verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) {
      payment.status = 'failed';
      await payment.save();
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Trusted provider check: confirm Razorpay says captured/authorized.
    try {
      const providerPayment = await razorpay.fetchPaymentFromProvider(razorpay_payment_id);
      if (providerPayment && ['failed'].includes(providerPayment.status)) {
        payment.status = 'failed';
        payment.razorpayPaymentId = razorpay_payment_id;
        await payment.save();
        return res.status(400).json({ success: false, message: 'Provider reports failed payment' });
      }
      if (providerPayment && !['captured', 'authorized'].includes(providerPayment.status)) {
        payment.status = 'pending';
        payment.razorpayPaymentId = razorpay_payment_id;
        await payment.save();
        return res.json({ success: true, pending: true, data: payment, message: 'Payment pending at provider' });
      }
    } catch (fetchErr) {
      // Test-mode tolerance: signature valid but fetch failed -> keep pending, don't fail.
      payment.status = 'pending';
      payment.razorpayPaymentId = razorpay_payment_id;
      await payment.save();
      return res.json({ success: true, pending: true, data: payment, message: 'Signature valid, provider confirmation pending' });
    }

    const { duplicate } = await markPaymentSuccess(payment, {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });
    const io = req.app.get('io');
    if (!duplicate) {
      await notifyPaymentSuccess(io, payment.userId, {
        amount: payment.amount,
        transactionId: payment.transactionId,
      });
    }

    res.json({ success: true, duplicate, data: payment });
  } catch (error) {
    next(error);
  }
};

// @desc    Razorpay webhook (no auth; verified by signature, idempotent)
// @route   POST /api/payments/webhook
exports.webhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload' });
    }

    const entity = event?.payload?.payment?.entity || event?.payload?.order?.entity || {};
    const orderId = entity.order_id || entity.id;
    const razorpayPaymentId = entity.id && entity.entity === 'payment' ? entity.id : entity.payment_id;

    if (!orderId) return res.json({ success: true, message: 'Ignored: no order reference' });

    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) return res.json({ success: true, message: 'Ignored: unknown order' });

    // Duplicate delivery guard.
    if (payment.status === 'success' && ['payment.captured', 'order.paid'].includes(event.event)) {
      return res.json({ success: true, duplicate: true });
    }

    if (['payment.captured', 'order.paid'].includes(event.event)) {
      await markPaymentSuccess(payment, { razorpayPaymentId });
      const io = req.app.get('io');
      await notifyPaymentSuccess(io, payment.userId, {
        amount: payment.amount,
        transactionId: payment.transactionId,
      }).catch(() => {});
    } else if (['payment.failed'].includes(event.event)) {
      if (payment.status !== 'success') {
        payment.status = 'failed';
        if (razorpayPaymentId) payment.razorpayPaymentId = razorpayPaymentId;
        await payment.save();
      }
    }
    // Other events (pending/refunded) intentionally acked without state churn.

    res.json({ success: true });
  } catch {
    res.status(200).json({ success: true });
  }
};

// @desc    Poll latest payment status for a booking (handles pending UI)
// @route   GET /api/payments/status/:bookingId
exports.getStatusByBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const payment = await Payment.findOne({ bookingId: booking._id }).sort('-createdAt');
    res.json({
      success: true,
      data: {
        bookingPaymentStatus: booking.paymentStatus,
        payment: payment
          ? { _id: payment._id, status: payment.status, amount: payment.amount, razorpayOrderId: payment.razorpayOrderId, updatedAt: payment.updatedAt }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Legacy cash/manual processing (amount always from server booking)
// @route   POST /api/payments/process
exports.processPayment = async (req, res, next) => {
  try {
    const { bookingId, paymentMethod } = req.body;
    if (paymentMethod && !['cash'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Use Razorpay checkout for online payments' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Payment already completed' });
    }

    // Server truth: recompute in case booking total drifted.
    const { fee } = await buildServerQuote(booking);
    if (booking.totalAmount !== fee.totalAmount) {
      booking.totalAmount = fee.totalAmount;
      await booking.save();
    }

    const payment = await Payment.create({
      userId: req.user._id,
      bookingId,
      amount: fee.totalAmount,
      paymentMethod: paymentMethod || 'cash',
      provider: 'manual',
      status: 'success',
      breakdown: fee,
      paymentDate: new Date(),
    });

    booking.paymentStatus = 'completed';
    await booking.save();

    const io = req.app.get('io');
    await notifyPaymentSuccess(io, req.user._id, {
      amount: fee.totalAmount,
      transactionId: payment.transactionId,
    });

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user payment history
// @route   GET /api/payments/history
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const payments = await Payment.find({ userId: req.user._id })
      .populate({
        path: 'bookingId',
        populate: [
          { path: 'parkingLotId', select: 'name address' },
          { path: 'slotId', select: 'slotNumber' },
        ],
      })
      .sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all payments (admin)
// @route   GET /api/payments/all
exports.getAllPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find()
      .populate('userId', 'name email')
      .populate({
        path: 'bookingId',
        populate: { path: 'parkingLotId', select: 'name' },
      })
      .sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

// @desc    Get receipt data for a payment
// @route   GET /api/payments/receipt/:id
exports.getReceipt = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('userId', 'name email phoneNumber')
      .populate({
        path: 'bookingId',
        populate: [
          { path: 'parkingLotId', select: 'name address city' },
          { path: 'slotId', select: 'slotNumber' },
        ],
      });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const receipt = {
      receiptNo: `REC-${payment.transactionId}`,
      transactionId: payment.transactionId,
      razorpayOrderId: payment.razorpayOrderId || null,
      razorpayPaymentId: payment.razorpayPaymentId || null,
      date: payment.paymentDate,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      breakdown: payment.breakdown || null,
      customer: {
        name: payment.userId.name,
        email: payment.userId.email,
        phone: payment.userId.phoneNumber,
      },
      booking: payment.bookingId
        ? {
            id: payment.bookingId._id,
            vehicleNumber: payment.bookingId.vehicleNumber,
            startTime: payment.bookingId.startTime,
            endTime: payment.bookingId.endTime,
            duration: payment.bookingId.duration,
            parkingLot: payment.bookingId.parkingLotId?.name,
            address: payment.bookingId.parkingLotId?.address,
            city: payment.bookingId.parkingLotId?.city,
            slotNumber: payment.bookingId.slotId?.slotNumber,
          }
        : null,
    };

    res.json({ success: true, data: receipt });
  } catch (error) {
    next(error);
  }
};
