const Booking = require('../models/Booking');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingLot = require('../models/ParkingLot');
const User = require('../models/User');
const Notification = require('../models/Notification');
const QRCode = require('qrcode');
const { sendBookingConfirmationEmail, sendCancellationEmail } = require('../services/emailService');

// @desc    Create booking
// @route   POST /api/bookings/create
exports.createBooking = async (req, res, next) => {
  // Tracks a slot we atomically reserved so we can release it if a later step
  // fails before the booking is persisted.
  let claimedSlot = null;
  try {
    const { slotId, parkingLotId, startTime, endTime, vehicleNumber } = req.body;

    // Validate the requested time range up front.
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ success: false, message: 'Invalid booking time range.' });
    }

    // Get parking lot for pricing
    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) {
      return res.status(404).json({ success: false, message: 'Parking lot not found' });
    }

    // ── Atomic slot claim (double-booking protection) ──
    // A single-document update is atomic in MongoDB, so when several requests
    // race for the same slot only one can flip it from 'available' to
    // 'reserved'; every other request gets null and is rejected. This closes
    // the check-then-create race that previously let two users reserve the
    // same slot when their requests arrived at the same time.
    claimedSlot = await ParkingSlot.findOneAndUpdate(
      { _id: slotId, status: 'available', isActive: true },
      { status: 'reserved' },
      { new: true }
    );
    if (!claimedSlot) {
      return res.status(409).json({
        success: false,
        message: 'This slot is already booked or unavailable. Please choose a different slot.',
      });
    }

    // Defensive guard against the booking history in case a slot's status is
    // ever stale: reject (and release the slot) if an active, non-cancelled
    // booking already overlaps the requested window.
    const overlappingBooking = await Booking.findOne({
      slotId,
      bookingStatus: { $in: ['pending', 'confirmed', 'active'] },
      startTime: { $lt: end },
      endTime: { $gt: start },
    });
    if (overlappingBooking) {
      await ParkingSlot.findByIdAndUpdate(slotId, { status: 'available' });
      claimedSlot = null;
      return res.status(409).json({
        success: false,
        message: 'This slot is already booked for the selected time period. Please choose a different time or slot.',
      });
    }

    const slot = claimedSlot;

    // Calculate duration & cost
    const durationHours = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));
    const totalAmount = durationHours * lot.pricePerHour;

    // Create booking
    const booking = await Booking.create({
      userId: req.user._id,
      slotId,
      parkingLotId,
      vehicleNumber: vehicleNumber || req.user.vehicleNumber,
      startTime: start,
      endTime: end,
      duration: durationHours,
      totalAmount,
      bookingStatus: 'confirmed',
    });

    // The booking now owns the slot; cancel/complete will release it. Clear the
    // rollback marker so the catch handler no longer frees the slot.
    claimedSlot = null;

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
    // If we reserved a slot but failed before persisting the booking, release
    // it so the slot does not get stuck in 'reserved' and leak availability.
    if (claimedSlot) {
      try {
        await ParkingSlot.findByIdAndUpdate(claimedSlot._id, { status: 'available' });
      } catch (releaseErr) {
        console.error('Failed to release slot after booking error:', releaseErr.message);
      }
    }
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

    booking.bookingStatus = 'cancelled';
    booking.paymentStatus = 'refunded';
    await booking.save();

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
      message: 'Your booking has been cancelled and refund will be processed.',
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
