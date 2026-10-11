const crypto = require('crypto');
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { readStoredFareSnapshot } = require('../services/parkingFeeService');

const ALLOWED_PAYMENT_BOOKING_STATUSES = ['confirmed', 'active'];
const PAYABLE_BOOKING_PAYMENT_STATUSES = ['pending', 'failed'];
const RAZORPAY_ORDER_ID = /^order_[A-Za-z0-9]+$/;
const RAZORPAY_PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;
const RAZORPAY_SIGNATURE = /^[a-f0-9]{64}$/i;

const createRequestError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const createRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};

const toPaymentMethod = (method) => (
  ['card', 'upi', 'wallet', 'cash', 'netbanking'].includes(method) ? method : 'card'
);

const sameSignature = (expected, received) => {
  if (typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const getAuthoritativeFare = (booking) => readStoredFareSnapshot(booking.fareBreakdown);

const requireBookingId = (bookingId) => {
  if (typeof bookingId !== 'string' || !/^[a-f\d]{24}$/i.test(bookingId)) {
    throw createRequestError('A valid booking ID is required');
  }
  return bookingId;
};

const requireCheckoutResponse = ({ orderId, paymentId, signature }) => {
  if (!RAZORPAY_ORDER_ID.test(orderId || '') || !RAZORPAY_PAYMENT_ID.test(paymentId || '') || !RAZORPAY_SIGNATURE.test(signature || '')) {
    throw createRequestError('Invalid payment verification data');
  }
};

const getOwnedBooking = async (bookingId, userId, includeDetails = false) => {
  const query = Booking.findOne({ _id: bookingId, userId });
  if (includeDetails) {
    query.populate('parkingLotId', 'name address city').populate('slotId', 'slotNumber');
  }
  return query;
};

const ensureEligibleForPayment = (booking) => {
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }
  if (booking.paymentStatus === 'completed') {
    const error = new Error('Payment already completed');
    error.statusCode = 409;
    throw error;
  }
  if (!PAYABLE_BOOKING_PAYMENT_STATUSES.includes(booking.paymentStatus)) {
    const error = new Error('This booking is not eligible for payment');
    error.statusCode = 409;
    throw error;
  }
  if (!ALLOWED_PAYMENT_BOOKING_STATUSES.includes(booking.bookingStatus)) {
    const error = new Error('This booking is not eligible for payment');
    error.statusCode = 400;
    throw error;
  }
};

const paymentResponse = (payment, fareBreakdown) => ({
  paymentId: payment._id,
  orderId: payment.providerOrderId,
  amountPaise: payment.amountPaise,
  currency: payment.currency,
  fareBreakdown,
  keyId: process.env.RAZORPAY_KEY_ID,
});

const paymentMatchesFare = (payment, fareBreakdown) => (
  Number.isSafeInteger(payment.amountPaise) &&
  payment.amountPaise === fareBreakdown.totalAmountPaise &&
  payment.currency === fareBreakdown.currency
);

const validateProviderPayment = (providerPayment, payment, expectedPaymentId) => {
  if (
    providerPayment?.id !== expectedPaymentId ||
    providerPayment.order_id !== payment.providerOrderId ||
    !Number.isSafeInteger(providerPayment.amount) ||
    providerPayment.amount !== payment.amountPaise ||
    providerPayment.currency !== payment.currency
  ) {
    throw createRequestError('Payment details do not match the server order');
  }
};

const markCapturedIneligiblePaymentForReview = async (payment, providerPayment) => {
  await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['pending', 'failed', 'cancelled'] } },
    {
      $set: {
        status: 'manual_review',
        providerPaymentId: providerPayment.id,
        verifiedAt: new Date(),
        failureCode: 'captured_for_ineligible_booking',
      },
    }
  );
};

const sendSuccessNotification = async (req, payment, booking) => {
  await User.findByIdAndUpdate(booking.userId, {
    $push: { notifications: { message: `Payment of ₹${payment.amount} successful. Transaction: ${payment.transactionId}`, type: 'payment' } },
  });

  const notification = await Notification.create({
    userId: booking.userId,
    title: 'Payment Successful',
    message: `Payment of ₹${payment.amount} processed. Transaction: ${payment.transactionId}`,
    type: 'payment',
    link: '/dashboard/payments',
  });
  const io = req.app.get('io');
  if (io) io.to(`user_${booking.userId}`).emit('newNotification', notification);
};

const settleCapturedPayment = async ({ req, payment, booking, providerPayment }) => {
  if (!['pending', 'failed', 'success'].includes(payment.status)) {
    throw createRequestError('Payment cannot be completed from its current status', 409);
  }
  const bookingAlreadyPaidByThisPayment = (
    booking?.paymentStatus === 'completed' && booking.paymentId?.toString() === payment._id.toString()
  );
  if (payment.status === 'success' && bookingAlreadyPaidByThisPayment) {
    return { payment, alreadyProcessed: true };
  }
  if (!bookingAlreadyPaidByThisPayment) ensureEligibleForPayment(booking);
  if (!paymentMatchesFare(payment, getAuthoritativeFare(booking))) {
    throw createRequestError('Payment amount does not match the booking fare', 409);
  }
  validateProviderPayment(providerPayment, payment, providerPayment.id);

  let paidBooking = bookingAlreadyPaidByThisPayment ? booking : null;
  if (!paidBooking) {
    paidBooking = await Booking.findOneAndUpdate(
      {
        _id: booking?._id,
        userId: booking?.userId,
        paymentStatus: { $ne: 'completed' },
        bookingStatus: { $in: ALLOWED_PAYMENT_BOOKING_STATUSES },
      },
      { $set: { paymentStatus: 'completed', paymentId: payment._id } },
      { new: true }
    );

    if (!paidBooking) {
      const currentBooking = booking?._id ? await Booking.findById(booking._id) : null;
      if (currentBooking?.paymentStatus !== 'completed' || currentBooking.paymentId?.toString() !== payment._id.toString()) {
        throw createRequestError('This booking is no longer eligible for payment', 409);
      }
      paidBooking = currentBooking;
    }
  }

  if (payment.status === 'success') return { payment, alreadyProcessed: true };

  const updatedPayment = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['pending', 'failed'] } },
    {
      $set: {
        status: 'success',
        providerPaymentId: providerPayment.id,
        paymentMethod: toPaymentMethod(providerPayment.method),
        paymentDate: new Date(),
        verifiedAt: new Date(),
        failureCode: undefined,
      },
    },
    { new: true }
  );

  if (!updatedPayment) {
    const currentPayment = await Payment.findById(payment._id);
    if (currentPayment?.status === 'success') return { payment: currentPayment, alreadyProcessed: true };
    const error = new Error('Payment cannot be completed from its current status');
    error.statusCode = 409;
    throw error;
  }

  // An older failed attempt can capture after a newer checkout was opened. Keep only this verified payment payable.
  await Payment.updateMany(
    { bookingId: payment.bookingId, _id: { $ne: payment._id }, status: 'pending' },
    { $set: { status: 'cancelled', failureCode: 'superseded_by_captured_payment', orderCreationInProgress: false } }
  );
  await sendSuccessNotification(req, updatedPayment, paidBooking);
  return { payment: updatedPayment, alreadyProcessed: false };
};

// @desc    Get the server-calculated fare for a booking
// @route   GET /api/payments/fare/:bookingId
exports.getFareBreakdown = async (req, res, next) => {
  try {
    const booking = await getOwnedBooking(requireBookingId(req.params.bookingId), req.user._id, true);
    ensureEligibleForPayment(booking);
    const fareBreakdown = getAuthoritativeFare(booking);
    res.json({
      success: true,
      data: { bookingId: booking._id, parkingLot: booking.parkingLotId?.name, slot: booking.slotId?.slotNumber, fareBreakdown },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or resume a Razorpay checkout order
// @route   POST /api/payments/orders
exports.createPaymentOrder = async (req, res, next) => {
  try {
    const razorpay = createRazorpayClient();
    if (!razorpay) return res.status(503).json({ success: false, message: 'Payments are not configured yet' });

    const booking = await getOwnedBooking(requireBookingId(req.body?.bookingId), req.user._id, true);
    ensureEligibleForPayment(booking);
    const fareBreakdown = getAuthoritativeFare(booking);

    const existingPayment = await Payment.findOne({ bookingId: booking._id, userId: req.user._id, status: 'pending' });
    if (existingPayment && !paymentMatchesFare(existingPayment, fareBreakdown)) {
      return res.status(409).json({ success: false, message: 'The existing checkout amount does not match this booking fare' });
    }
    if (existingPayment?.providerOrderId) {
      return res.json({ success: true, data: paymentResponse(existingPayment, fareBreakdown) });
    }

    let payment = existingPayment;
    if (!payment) {
      try {
        payment = await Payment.create({
          userId: req.user._id,
          bookingId: booking._id,
          amount: fareBreakdown.totalAmount,
          amountPaise: fareBreakdown.totalAmountPaise,
          currency: fareBreakdown.currency,
          paymentMethod: 'card',
          status: 'pending',
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        payment = await Payment.findOne({ bookingId: booking._id, userId: req.user._id, status: 'pending' });
        if (payment?.providerOrderId) {
          return res.json({ success: true, data: paymentResponse(payment, fareBreakdown) });
        }
        if (!payment) throw error;
      }
    }

    // Claim order creation so concurrent requests cannot create two provider orders for one pending payment.
    payment = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: 'pending',
        providerOrderId: { $exists: false },
        orderCreationInProgress: { $ne: true },
      },
      { $set: { orderCreationInProgress: true } },
      { new: true }
    );
    if (!payment) {
      const currentPayment = await Payment.findOne({ bookingId: booking._id, userId: req.user._id, status: 'pending' });
      if (currentPayment?.providerOrderId) {
        return res.json({ success: true, data: paymentResponse(currentPayment, fareBreakdown) });
      }
      return res.status(409).json({ success: false, message: 'Checkout is already being prepared. Please retry shortly.' });
    }

    try {
      const order = await razorpay.orders.create({
        amount: fareBreakdown.totalAmountPaise,
        currency: fareBreakdown.currency,
        receipt: `booking_${booking._id.toString().slice(-18)}_${payment._id.toString().slice(-8)}`,
        notes: { bookingId: booking._id.toString(), userId: req.user._id.toString() },
      });
      payment.providerOrderId = order.id;
      payment.orderCreationInProgress = false;
      await payment.save();
      res.status(201).json({ success: true, data: paymentResponse(payment, fareBreakdown) });
    } catch (error) {
      await Payment.findByIdAndUpdate(payment._id, {
        $set: { status: 'failed', failureCode: 'order_creation_failed', orderCreationInProgress: false },
      });
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Verify a Razorpay Checkout result with the provider
// @route   POST /api/payments/verify
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    requireCheckoutResponse({ orderId, paymentId, signature });

    const payment = await Payment.findOne({ providerOrderId: orderId, userId: req.user._id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment order not found' });
    if (payment.status === 'success') {
      const booking = await getOwnedBooking(payment.bookingId, req.user._id);
      if (booking?.paymentStatus !== 'completed' || booking.paymentId?.toString() !== payment._id.toString()) {
        return res.status(409).json({ success: false, message: 'Payment is awaiting booking reconciliation' });
      }
      return res.json({ success: true, data: payment, alreadyProcessed: true });
    }
    if (!['pending', 'failed'].includes(payment.status)) return res.status(409).json({ success: false, message: 'Payment cannot be verified from its current status' });

    const razorpay = createRazorpayClient();
    if (!razorpay) return res.status(503).json({ success: false, message: 'Payments are not configured yet' });

    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`).digest('hex');
    if (!sameSignature(expectedSignature, signature)) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const providerPayment = await razorpay.payments.fetch(paymentId);
    validateProviderPayment(providerPayment, payment, paymentId);
    if (providerPayment.status !== 'captured') {
      if (providerPayment.status === 'failed') {
        await Payment.findOneAndUpdate(
          { _id: payment._id, status: 'pending' },
          { $set: { status: 'failed', failureCode: providerPayment.error_code || 'payment_failed' } }
        );
      }
      return res.status(202).json({ success: false, pending: true, message: 'Payment is awaiting capture confirmation' });
    }

    const booking = await getOwnedBooking(payment.bookingId, req.user._id);
    const result = await settleCapturedPayment({ req, payment, booking, providerPayment });
    res.json({ success: true, data: result.payment, alreadyProcessed: result.alreadyProcessed });
  } catch (error) {
    next(error);
  }
};

// @desc    Process signed Razorpay webhook events using the raw request body
// @route   POST /api/payments/webhook
exports.handleRazorpayWebhook = async (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.get('x-razorpay-signature');
    const rawBody = req.body;
    if (!webhookSecret || !signature || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook request' });
    }

    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!sameSignature(expectedSignature, signature)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const providerPayment = event.payload?.payment?.entity;
    const eventId = req.get('x-razorpay-event-id');
    if (!providerPayment?.order_id) return res.status(200).json({ success: true, ignored: true });

    const payment = await Payment.findOne({ providerOrderId: providerPayment.order_id });
    if (!payment) return res.status(200).json({ success: true, ignored: true });
    if (eventId && payment.processedWebhookEventIds?.includes(eventId)) {
      return res.status(200).json({ success: true, duplicate: true });
    }

    if (event.event === 'payment.captured' && providerPayment.status === 'captured') {
      const booking = await Booking.findById(payment.bookingId);
      if (
        !booking ||
        !ALLOWED_PAYMENT_BOOKING_STATUSES.includes(booking.bookingStatus) ||
        booking.paymentStatus === 'refunded' ||
        (booking.paymentStatus === 'completed' && booking.paymentId?.toString() !== payment._id.toString())
      ) {
        validateProviderPayment(providerPayment, payment, providerPayment.id);
        await markCapturedIneligiblePaymentForReview(payment, providerPayment);
      } else {
        await settleCapturedPayment({ req, payment, booking, providerPayment });
      }
    } else if (event.event === 'payment.failed') {
      await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        { $set: { status: 'failed', failureCode: providerPayment.error_code || 'payment_failed' } }
      );
    }

    if (eventId) await Payment.findByIdAndUpdate(payment._id, { $addToSet: { processedWebhookEventIds: eventId } });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Legacy route now safely creates an order and never marks a booking paid.
exports.processPayment = exports.createPaymentOrder;

exports.getPaymentHistory = async (req, res, next) => {
  try {
    const payments = await Payment.find({ userId: req.user._id })
      .populate({ path: 'bookingId', populate: [{ path: 'parkingLotId', select: 'name address' }, { path: 'slotId', select: 'slotNumber' }] })
      .sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

exports.getAllPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find()
      .populate('userId', 'name email')
      .populate({ path: 'bookingId', populate: { path: 'parkingLotId', select: 'name' } })
      .sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

exports.getReceipt = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('userId', 'name email phoneNumber')
      .populate({ path: 'bookingId', populate: [{ path: 'parkingLotId', select: 'name address city' }, { path: 'slotId', select: 'slotNumber' }] });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.json({
      success: true,
      data: {
        receiptNo: `REC-${payment.transactionId}`,
        transactionId: payment.transactionId,
        providerPaymentId: payment.providerPaymentId,
        date: payment.paymentDate,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        customer: { name: payment.userId.name, email: payment.userId.email, phone: payment.userId.phoneNumber },
        booking: payment.bookingId ? {
          id: payment.bookingId._id,
          vehicleNumber: payment.bookingId.vehicleNumber,
          startTime: payment.bookingId.startTime,
          endTime: payment.bookingId.endTime,
          duration: payment.bookingId.duration,
          parkingLot: payment.bookingId.parkingLotId?.name,
          address: payment.bookingId.parkingLotId?.address,
          city: payment.bookingId.parkingLotId?.city,
          slotNumber: payment.bookingId.slotId?.slotNumber,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
