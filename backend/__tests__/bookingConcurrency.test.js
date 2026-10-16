process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../services/emailService', () => ({
  sendBookingConfirmationEmail: jest.fn().mockResolvedValue(),
  sendCancellationEmail: jest.fn().mockResolvedValue(),
}));

const { app } = require('../server');
const Booking = require('../models/Booking');
const ParkingLot = require('../models/ParkingLot');
const ParkingSlot = require('../models/ParkingSlot');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

let mongo;
let users;
let lot;

// Use a fixed future day so the tests do not depend on the current date
const at = (hour) => new Date(Date.UTC(2030, 0, 1, hour)).toISOString();

const createSlot = () =>
  ParkingSlot.create({
    slotNumber: `S${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    floorId: new mongoose.Types.ObjectId(),
    parkingLotId: lot._id,
  });

const bookSlot = (user, slot, startHour, endHour) =>
  request(app)
    .post('/api/bookings/create')
    .set('Authorization', `Bearer ${generateToken(user._id)}`)
    .send({
      slotId: slot._id.toString(),
      parkingLotId: lot._id.toString(),
      startTime: at(startHour),
      endTime: at(endHour),
      vehicleNumber: 'KA01AB1234',
    });

const countBookings = (slot) => Booking.countDocuments({ slotId: slot._id, bookingStatus: { $in: ['confirmed', 'active'] } });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  lot = await ParkingLot.create({
    name: 'Test Lot',
    address: '1 Test Road',
    city: 'Pune',
    totalFloors: 1,
    totalSlots: 10,
    pricePerHour: 50,
  });

  users = [];
  for (let i = 0; i < 10; i++) {
    users.push(
      await User.create({
        name: `Tester ${i}`,
        email: `tester${i}@example.com`,
        password: 'password123',
        vehicleNumber: 'KA01AB1234',
      })
    );
  }
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Double booking prevention', () => {
  test('concurrent requests for the same slot and time: exactly one succeeds', async () => {
    const slot = await createSlot();

    const responses = await Promise.all(users.map((user) => bookSlot(user, slot, 10, 12)));

    const created = responses.filter((res) => res.status === 201);
    const conflicts = responses.filter((res) => res.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(users.length - 1);
    conflicts.forEach((res) => expect(res.body.message).toMatch(/already booked/));

    expect(await countBookings(slot)).toBe(1);

    // The lock must be released after the requests finish
    const freshSlot = await ParkingSlot.findById(slot._id);
    expect(freshSlot.bookingLockToken).toBeNull();
  });

  test('concurrent requests with partially overlapping windows: exactly one succeeds', async () => {
    const slot = await createSlot();
    const windows = [
      [10, 12],
      [11, 13],
      [9, 11],
      [10, 11],
      [11, 14],
    ];

    const responses = await Promise.all(
      windows.map(([start, end], i) => bookSlot(users[i], slot, start, end))
    );

    expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
    expect(await countBookings(slot)).toBe(1);
  });

  test('back-to-back bookings on the same slot both succeed', async () => {
    const slot = await createSlot();

    const first = await bookSlot(users[0], slot, 10, 11);
    const second = await bookSlot(users[1], slot, 11, 12);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await countBookings(slot)).toBe(2);
  });

  test('concurrent bookings on different slots in the same window all succeed', async () => {
    const slots = await Promise.all([createSlot(), createSlot(), createSlot()]);

    const responses = await Promise.all(
      slots.map((slot, i) => bookSlot(users[i], slot, 10, 12))
    );

    responses.forEach((res) => expect(res.status).toBe(201));
  });

  test('cancelling a booking frees its time window', async () => {
    const slot = await createSlot();

    const first = await bookSlot(users[0], slot, 14, 15);
    expect(first.status).toBe(201);

    const cancel = await request(app)
      .delete(`/api/bookings/cancel/${first.body.data._id}`)
      .set('Authorization', `Bearer ${generateToken(users[0]._id)}`);
    expect(cancel.status).toBe(200);

    const rebook = await bookSlot(users[1], slot, 14, 15);
    expect(rebook.status).toBe(201);
  });

  test('expired, cancelled and completed bookings do not block the window', async () => {
    const slot = await createSlot();

    for (const bookingStatus of ['expired', 'cancelled', 'completed']) {
      await Booking.create({
        userId: users[0]._id,
        slotId: slot._id,
        parkingLotId: lot._id,
        vehicleNumber: 'KA01AB1234',
        startTime: new Date(at(16)),
        endTime: new Date(at(17)),
        totalAmount: 50,
        bookingStatus,
      });
    }

    const res = await bookSlot(users[1], slot, 16, 17);
    expect(res.status).toBe(201);
  });

  test('rejects an end time that is not after the start time', async () => {
    const slot = await createSlot();

    const res = await bookSlot(users[0], slot, 12, 10);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('End time must be after start time');
    expect(await countBookings(slot)).toBe(0);
  });

  test('an expired lock from a crashed request does not block new bookings', async () => {
    const slot = await createSlot();
    await ParkingSlot.updateOne(
      { _id: slot._id },
      { $set: { bookingLockToken: 'crashed-request', bookingLockExpiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await bookSlot(users[0], slot, 9, 10);

    expect(res.status).toBe(201);
  });

  test('a live lock held by another request makes the new request return 409', async () => {
    const slot = await createSlot();
    await ParkingSlot.updateOne(
      { _id: slot._id },
      { $set: { bookingLockToken: 'other-request', bookingLockExpiresAt: new Date(Date.now() + 60 * 1000) } }
    );

    const res = await bookSlot(users[0], slot, 9, 10);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/busy/);
    expect(await countBookings(slot)).toBe(0);
  });
});
