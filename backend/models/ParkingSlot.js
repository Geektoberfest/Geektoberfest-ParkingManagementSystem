const mongoose = require('mongoose');

const parkingSlotSchema = new mongoose.Schema(
  {
    slotNumber: {
      type: String,
      required: true,
    },
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingFloor',
      required: true,
    },
    parkingLotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    status: {
      type: String,
      enum: ['available', 'reserved', 'occupied'],
      default: 'available',
    },
    vehicleType: {
      type: String,
      enum: ['car', 'motorcycle', 'truck', 'ev'],
      default: 'car',
    },
    distanceFromEntrance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Short-lived lock taken while a booking is being created (see services/slotLock.js)
    bookingLockToken: {
      type: String,
      default: null,
    },
    bookingLockExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

parkingSlotSchema.index({ parkingLotId: 1, floorId: 1, slotNumber: 1 }, { unique: true });

module.exports = mongoose.model('ParkingSlot', parkingSlotSchema);
