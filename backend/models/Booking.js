const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSlot',
      required: true,
    },
    parkingLotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number, // in hours
      default: 1,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    fareBreakdown: {
      currency: { type: String, enum: ['INR'], default: 'INR' },
      billableHours: { type: Number, default: 0, min: 0 },
      hourlyRatePaise: { type: Number, default: 0, min: 0 },
      subtotalPaise: { type: Number, default: 0, min: 0 },
      additionalChargesPaise: { type: Number, default: 0, min: 0 },
      totalAmountPaise: { type: Number, default: 0, min: 0 },
      pricingPolicy: { type: String, default: '' },
    },
    bookingStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'refunded', 'failed'],
      default: 'pending',
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    qrCode: {
      type: String,
      default: '',
    },
    entryTime: {
      type: Date,
    },
    exitTime: {
      type: Date,
    },
    overdueCharge: {
      type: Number,
      default: 0,
    },
    overdueHours: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
