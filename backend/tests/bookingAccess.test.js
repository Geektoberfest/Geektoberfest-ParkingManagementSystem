const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { isAdmin, isBookingOwner, canAccessBooking } = require('../utils/bookingAccess');

const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();

const owner = { _id: userId, role: 'user' };
const otherUser = { _id: otherUserId, role: 'user' };
const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin' };

test('isBookingOwner matches the booking owner by id', () => {
  assert.equal(isBookingOwner({ userId }, owner), true);
  assert.equal(isBookingOwner({ userId: userId.toString() }, owner), true);
  assert.equal(isBookingOwner({ userId: otherUserId }, owner), false);
});

test('isBookingOwner handles populated and missing references safely', () => {
  assert.equal(isBookingOwner({ userId: { _id: userId } }, owner), true);
  assert.equal(isBookingOwner({ userId: { _id: otherUserId } }, owner), false);
  assert.equal(isBookingOwner({}, owner), false);
  assert.equal(isBookingOwner(null, owner), false);
  assert.equal(isBookingOwner({ userId }, null), false);
});

test('isAdmin only accepts the admin role', () => {
  assert.equal(isAdmin(admin), true);
  assert.equal(isAdmin(owner), false);
  assert.equal(isAdmin({ role: 'Admin' }), false);
  assert.equal(isAdmin(undefined), false);
});

test('canAccessBooking allows owners and admins only', () => {
  assert.equal(canAccessBooking({ userId }, owner), true);
  assert.equal(canAccessBooking({ userId: otherUserId }, otherUser), true);
  assert.equal(canAccessBooking({ userId: otherUserId }, owner), false);
  assert.equal(canAccessBooking({ userId }, admin), true);
  assert.equal(canAccessBooking({ userId: otherUserId }, admin), true);
  assert.equal(canAccessBooking({ userId: otherUserId }, undefined), false);
});
