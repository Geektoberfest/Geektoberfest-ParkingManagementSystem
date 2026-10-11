const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingLot = require('../models/ParkingLot');
const User = require('../models/User');
const Notification = require('../models/Notification');
const QRCode = require('qrcode');
const { sendBookingConfirmationEmail, sendCancellationEmail } = require('../services/emailService');
const { calculateParkingFare } = require('../services/parkingFeeService');

// @desc    Create booking
// @route   POST /api/bookings/create
exports.createBooking = async (req, res, next) => {
  try {
    const { slotId, parkingLotId, startTime, endTime, vehicleNumber } = req.body;

    // Check slot availability
    const slot = await ParkingSlot.findById(slotId);
    if (!slot || slot.status !== 'available') {
      return res.status(400).json({ success: false, message: 'Slot is not available' });
    }

    // Get parking lot for pricing
    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) {
      return res.status(404).json({ success: false, message: 'Parking lot not found' });
    }
    if (slot.parkingLotId.toString() !== lot._id.toString()) {
      return res.status(400).json({ success: false, message: 'Selected slot does not belong to this parking lot' });
    }

    // Calculate duration & cost
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ success: false, message: 'End time must be after start time' });
    }

    // ── Booking Overlap Protection ──
    const overlappingBooking = await Booking.findOne({
      slotId,
      bookingStatus: { $in: ['pending', 'confirmed', 'active'] },
      startTime: { $lt: end },
      endTime: { $gt: start },
    });
    if (overlappingBooking) {
      return res.status(409).json({
        success: false,
        message: 'This slot is already booked for the selected time period. Please choose a different time or slot.',
      });
    }
    const fareBreakdown = calculateParkingFare({ startTime: start, endTime: end, pricePerHour: lot.pricePerHour });

    // Create booking
    const booking = await Booking.create({
      userId: req.user._id,
      slotId,
      parkingLotId,
      vehicleNumber: vehicleNumber || req.user.vehicleNumber,
      startTime: start,
      endTime: end,
      duration: fareBreakdown.billableHours,
      totalAmount: fareBreakdown.totalAmount,
      fareBreakdown: {
        currency: fareBreakdown.currency,
        billableHours: fareBreakdown.billableHours,
        hourlyRatePaise: fareBreakdown.hourlyRatePaise,
        subtotalPaise: fareBreakdown.subtotalPaise,
        additionalChargesPaise: fareBreakdown.additionalChargesPaise,
        totalAmountPaise: fareBreakdown.totalAmountPaise,
        pricingPolicy: fareBreakdown.pricingPolicy,
      },
      bookingStatus: 'confirmed',
    });

    // Generate QR code
    const qrData = JSON.stringify({
      bookingId: booking._id,
      slotId,
      parkingLotId,
      vehicleNumber: booking.vehicleNumber,
    });
    const qrCode = await QRCode.toDataURL(qrData);
    booking.qrCode = qrCode;
    await booking.save();

    // Update slot status
    slot.status = 'reserved';
    await slot.save();

    // Update available slots count on the parking lot
    const availableCount = await ParkingSlot.countDocuments({ parkingLotId, status: 'available', isActive: true });
    await ParkingLot.findByIdAndUpdate(parkingLotId, { availableSlots: availableCount });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', { slotId: slot._id, status: 'reserved', parkingLotId });
      io.emit('lotUpdate', { lotId: parkingLotId, availableSlots: availableCount });
      io.emit('bookingUpdate', { type: 'new', booking });
    }

    // Add notification to user (legacy embedded)
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        notifications: {
          message: `Booking confirmed for slot ${slot.slotNumber} at ${lot.name}`,
          type: 'booking',
        },
      },
    });

    // Persistent notification + real-time push
    const notif = await Notification.create({
      userId: req.user._id,
      title: 'Booking Confirmed',
      message: `Your booking for slot ${slot.slotNumber} at ${lot.name} is confirmed.`,
      type: 'booking',
      link: `/dashboard/bookings`,
    });
    if (io) io.to(`user_${req.user._id}`).emit('newNotification', notif);

    // Send confirmation email (non-blocking)
    try {
      const user = await User.findById(req.user._id);
      await sendBookingConfirmationEmail(user, booking, lot, slot);
    } catch (emailErr) {
      console.error('Booking email failed:', emailErr.message);
    }

    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user bookings
// @route   GET /api/bookings/user
exports.getUserBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('parkingLotId', 'name address city pricePerHour locationCoordinates')
      .populate('slotId', 'slotNumber')
      .sort('-createdAt');
    res.json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all bookings (admin)
// @route   GET /api/bookings/all
exports.getAllBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .populate('userId', 'name email vehicleNumber')
      .populate('parkingLotId', 'name address city')
      .populate('slotId', 'slotNumber')
      .sort('-createdAt');
    res.json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel booking
// @route   DELETE /api/bookings/cancel/:id
exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (booking.bookingStatus === 'completed' || booking.bookingStatus === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot cancel this booking' });
    }
    if (booking.paymentStatus === 'completed') {
      return res.status(409).json({
        success: false,
        message: 'Paid bookings require a verified refund workflow and cannot be cancelled here',
      });
    }

    booking.bookingStatus = 'cancelled';
    booking.paymentStatus = 'failed';
    await booking.save();
    await Payment.updateMany(
      { bookingId: booking._id, status: 'pending' },
      { $set: { status: 'cancelled', failureCode: 'booking_cancelled', orderCreationInProgress: false } }
    );

    // Free up the slot
    await ParkingSlot.findByIdAndUpdate(booking.slotId, { status: 'available' });

    // Update available slots count
    const availableCount = await ParkingSlot.countDocuments({ parkingLotId: booking.parkingLotId, status: 'available', isActive: true });
    await ParkingLot.findByIdAndUpdate(booking.parkingLotId, { availableSlots: availableCount });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', { slotId: booking.slotId, status: 'available', parkingLotId: booking.parkingLotId });
      io.emit('lotUpdate', { lotId: booking.parkingLotId, availableSlots: availableCount });
    }

    // Add notification
    await User.findByIdAndUpdate(booking.userId, {
      $push: {
        notifications: {
          message: 'Your booking has been cancelled successfully',
          type: 'booking',
        },
      },
    });

    // Persistent notification + real-time push
    const cancelNotif = await Notification.create({
      userId: booking.userId,
      title: 'Booking Cancelled',
      message: 'Your booking has been cancelled before payment was completed.',
      type: 'booking',
      link: '/dashboard/bookings',
    });
    if (io) io.to(`user_${booking.userId}`).emit('newNotification', cancelNotif);

    // Send cancellation email (non-blocking)
    try {
      const user = await User.findById(booking.userId);
      const lot = await ParkingLot.findById(booking.parkingLotId);
      await sendCancellationEmail(user, booking, lot ? lot.name : 'Parking Lot');
    } catch (emailErr) {
      console.error('Cancel email failed:', emailErr.message);
    }

    res.json({ success: true, message: 'Booking cancelled', data: booking });
  } catch (error) {
    next(error);
  }
};

// @desc    Complete booking (check out)
// @route   PUT /api/bookings/complete/:id
exports.completeBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    booking.bookingStatus = 'completed';
    booking.exitTime = new Date();
    await booking.save();

    // Free up the slot
    await ParkingSlot.findByIdAndUpdate(booking.slotId, { status: 'available' });

    // Update available slots count
    const availableCount = await ParkingSlot.countDocuments({ parkingLotId: booking.parkingLotId, status: 'available', isActive: true });
    await ParkingLot.findByIdAndUpdate(booking.parkingLotId, { availableSlots: availableCount });

    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', { slotId: booking.slotId, status: 'available', parkingLotId: booking.parkingLotId });
      io.emit('lotUpdate', { lotId: booking.parkingLotId, availableSlots: availableCount });
    }

    res.json({ success: true, message: 'Booking completed', data: booking });
  } catch (error) {
    next(error);
  }
};

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('parkingLotId', 'name address city pricePerHour')
      .populate('slotId', 'slotNumber');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, data: booking });
  } catch (error) {
    next(error);
  }
};

// @desc    Check-in (scan QR)
// @route   PUT /api/bookings/check-in/:id
exports.checkIn = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('parkingLotId', 'name')
      .populate('slotId', 'slotNumber');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (booking.bookingStatus !== 'confirmed') {
      return res.status(400).json({ success: false, message: `Cannot check-in: booking is ${booking.bookingStatus}` });
    }

    booking.bookingStatus = 'active';
    booking.entryTime = new Date();
    await booking.save();

    // Update slot to occupied
    await ParkingSlot.findByIdAndUpdate(booking.slotId._id || booking.slotId, { status: 'occupied' });

    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', { slotId: booking.slotId._id || booking.slotId, status: 'occupied', parkingLotId: booking.parkingLotId._id || booking.parkingLotId });
    }

    const checkinNotif = await Notification.create({
      userId: booking.userId,
      title: 'Checked In',
      message: `You have checked in at ${booking.parkingLotId.name || 'the parking lot'}.`,
      type: 'checkin',
      link: '/dashboard/bookings',
    });
    if (io) io.to(`user_${booking.userId}`).emit('newNotification', checkinNotif);

    res.json({ success: true, message: 'Checked in successfully', data: booking });
  } catch (error) {
    next(error);
  }
};

// @desc    Check-out
// @route   PUT /api/bookings/check-out/:id
exports.checkOut = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('parkingLotId', 'name pricePerHour')
      .populate('slotId', 'slotNumber');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (booking.bookingStatus !== 'active') {
      return res.status(400).json({ success: false, message: `Cannot check-out: booking is ${booking.bookingStatus}` });
    }

    const now = new Date();
    booking.bookingStatus = 'completed';
    booking.exitTime = now;

    // Calculate overdue charge if checked out after endTime
    if (now > booking.endTime) {
      const overdueMs = now - booking.endTime;
      const overdueHours = Math.ceil(overdueMs / (1000 * 60 * 60));
      const pricePerHour = booking.parkingLotId?.pricePerHour || 0;
      booking.overdueHours = overdueHours;
      booking.overdueCharge = overdueHours * pricePerHour;
      booking.totalAmount = booking.totalAmount + booking.overdueCharge;
    }

    await booking.save();

    // Free up the slot
    await ParkingSlot.findByIdAndUpdate(booking.slotId._id || booking.slotId, { status: 'available' });

    // Update available slots count on the parking lot
    const lotId = booking.parkingLotId._id || booking.parkingLotId;
    const availableCount = await ParkingSlot.countDocuments({ parkingLotId: lotId, status: 'available', isActive: true });
    await ParkingLot.findByIdAndUpdate(lotId, { availableSlots: availableCount });

    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', { slotId: booking.slotId._id || booking.slotId, status: 'available', parkingLotId: lotId });
      io.emit('lotUpdate', { lotId, availableSlots: availableCount });
    }

    const checkoutMsg = booking.overdueCharge > 0
      ? `Checked out from ${booking.parkingLotId.name || 'the parking lot'}. Overdue charge: ₹${booking.overdueCharge} (${booking.overdueHours}h extra).`
      : `You have checked out from ${booking.parkingLotId.name || 'the parking lot'}. Thank you!`;

    const checkoutNotif = await Notification.create({
      userId: booking.userId,
      title: 'Checked Out',
      message: checkoutMsg,
      type: 'checkin',
      link: '/dashboard/bookings',
    });
    if (io) io.to(`user_${booking.userId}`).emit('newNotification', checkoutNotif);

    res.json({ success: true, message: 'Checked out successfully', data: booking });
  } catch (error) {
    next(error);
  }
};
