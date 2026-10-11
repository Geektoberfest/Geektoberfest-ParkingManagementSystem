const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const bookingController = require('../controllers/bookingController');
const Booking = require('../models/Booking');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingLot = require('../models/ParkingLot');
const User = require('../models/User');

let mongoServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Booking.deleteMany({}),
    ParkingSlot.deleteMany({}),
    ParkingLot.deleteMany({}),
    User.deleteMany({}),
  ]);
});

// Minimal req/res doubles. res resolves a promise with the final status + body
// as soon as the controller responds (or calls next with an error).
function makeReqRes(user, body) {
  const req = { user, body, app: { get: () => null } };
  let resolve;
  const done = new Promise((r) => (resolve = r));
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolve({ status: this.statusCode, body: payload });
      return this;
    },
  };
  const next = (err) => resolve({ status: res.statusCode, body: { error: err?.message }, errored: true });
  return { req, res, next, done };
}

async function seedScenario() {
  const user = await User.create({ name: 'Tester', email: `t${Date.now()}@ex.com`, password: 'secret12' });
  const lot = await ParkingLot.create({
    name: 'Lot A', address: '1 St', city: 'Metro', totalFloors: 1, totalSlots: 1, pricePerHour: 10,
  });
  const slot = await ParkingSlot.create({
    slotNumber: 'A1', floorId: new mongoose.Types.ObjectId(), parkingLotId: lot._id, status: 'available',
  });
  return { user, lot, slot };
}

test('two simultaneous bookings for the same slot: exactly one succeeds', async () => {
  const { user, lot, slot } = await seedScenario();
  const body = {
    slotId: slot._id.toString(),
    parkingLotId: lot._id.toString(),
    startTime: '2030-01-01T10:00:00.000Z',
    endTime: '2030-01-01T12:00:00.000Z',
    vehicleNumber: 'KA01AB1234',
  };

  const callers = Array.from({ length: 2 }, () => {
    const { req, res, next, done } = makeReqRes({ _id: user._id, vehicleNumber: 'KA01AB1234' }, body);
    return bookingController.createBooking(req, res, next).then(() => done);
  });
  const results = await Promise.all((await Promise.all(callers)));

  const created = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);

  assert.equal(created.length, 1, 'exactly one booking should succeed');
  assert.equal(conflicts.length, 1, 'the other request should be rejected with 409');

  // The database must hold only one active booking and the slot is reserved.
  const activeBookings = await Booking.countDocuments({ slotId: slot._id });
  assert.equal(activeBookings, 1, 'only one booking persisted');
  const refreshed = await ParkingSlot.findById(slot._id);
  assert.equal(refreshed.status, 'reserved');
});

test('ten simultaneous bookings for the same slot: exactly one succeeds', async () => {
  const { user, lot, slot } = await seedScenario();
  const body = {
    slotId: slot._id.toString(),
    parkingLotId: lot._id.toString(),
    startTime: '2030-02-01T08:00:00.000Z',
    endTime: '2030-02-01T09:00:00.000Z',
    vehicleNumber: 'KA01AB1234',
  };

  const callers = Array.from({ length: 10 }, () => {
    const { req, res, next, done } = makeReqRes({ _id: user._id, vehicleNumber: 'KA01AB1234' }, body);
    return bookingController.createBooking(req, res, next).then(() => done);
  });
  const results = await Promise.all((await Promise.all(callers)));

  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(await Booking.countDocuments({ slotId: slot._id }), 1);
});

test('a cancelled booking frees the slot for a new reservation', async () => {
  const { user, lot, slot } = await seedScenario();
  const body = {
    slotId: slot._id.toString(),
    parkingLotId: lot._id.toString(),
    startTime: '2030-03-01T08:00:00.000Z',
    endTime: '2030-03-01T09:00:00.000Z',
    vehicleNumber: 'KA01AB1234',
  };

  // First booking succeeds.
  const first = makeReqRes({ _id: user._id, vehicleNumber: 'KA01AB1234' }, body);
  await bookingController.createBooking(first.req, first.res, first.next);
  const firstResult = await first.done;
  assert.equal(firstResult.status, 201);

  // Cancel it, which should set the slot back to 'available'.
  const booking = await Booking.findOne({ slotId: slot._id });
  const cancel = makeReqRes(
    { _id: user._id, role: 'user' },
    {},
  );
  cancel.req.params = { id: booking._id.toString() };
  await bookingController.cancelBooking(cancel.req, cancel.res, cancel.next);
  await cancel.done;
  assert.equal((await ParkingSlot.findById(slot._id)).status, 'available');

  // A new booking for the same slot now succeeds.
  const second = makeReqRes({ _id: user._id, vehicleNumber: 'KA01AB1234' }, body);
  await bookingController.createBooking(second.req, second.res, second.next);
  const secondResult = await second.done;
  assert.equal(secondResult.status, 201, 'slot should be bookable again after cancellation');
});
