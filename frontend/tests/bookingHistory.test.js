import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOKING_CATEGORIES,
  BOOKING_SORT_OPTIONS,
  DEFAULT_BOOKING_SORT,
  classifyBooking,
  filterBookings,
  getBookingDisplay,
  getBookingId,
  getBookingStats,
  isUpcomingBooking,
  matchesBookingSearch,
  paymentStatusLabel,
  shortBookingId,
  sortBookings,
  toTimestamp,
} from '../src/utils/bookingHistory.js';

const NOW = new Date('2026-05-10T12:00:00.000Z');
const past = (days = 2) => new Date(NOW.getTime() - days * 86400000).toISOString();
const future = (days = 2) => new Date(NOW.getTime() + days * 86400000).toISOString();

const lot = (name = 'City Center Parking', city = 'Pune') => ({
  _id: `lot-${name}`,
  name,
  city,
  address: '12 Main Road',
});

const booking = (overrides = {}) => ({
  _id: '65f1a2b3c4d5e6f7a8b9c0d1',
  userId: 'user-1',
  parkingLotId: lot(),
  slotId: { _id: 'slot-1', slotNumber: 'F1-S2' },
  vehicleNumber: 'MH 12 AB 1234',
  startTime: future(1),
  endTime: future(2),
  createdAt: past(1),
  duration: 1,
  totalAmount: 120,
  bookingStatus: 'confirmed',
  paymentStatus: 'pending',
  ...overrides,
});

test('toTimestamp returns null for missing or invalid dates', () => {
  assert.equal(toTimestamp('2026-05-10T12:00:00.000Z'), Date.parse('2026-05-10T12:00:00.000Z'));
  assert.equal(toTimestamp(null), null);
  assert.equal(toTimestamp(undefined), null);
  assert.equal(toTimestamp(''), null);
  assert.equal(toTimestamp('not-a-date'), null);
  assert.equal(toTimestamp(new Date('2026-05-10T12:00:00.000Z')), Date.parse('2026-05-10T12:00:00.000Z'));
});

test('booking ids are exposed in a readable short form', () => {
  const b = booking();
  assert.equal(getBookingId(b), '65f1a2b3c4d5e6f7a8b9c0d1');
  assert.equal(getBookingId({}), '');
  assert.equal(getBookingId(null), '');
  assert.equal(shortBookingId(b._id), '#A8B9C0D1');
  assert.equal(shortBookingId(''), '—');
  assert.equal(shortBookingId(undefined), '—');
});

test('classifyBooking keeps stored statuses and only derives upcoming', () => {
  assert.equal(classifyBooking(booking(), NOW), 'upcoming');
  assert.equal(classifyBooking(booking({ bookingStatus: 'pending' }), NOW), 'upcoming');
  assert.equal(classifyBooking(booking({ bookingStatus: 'active' }), NOW), 'active');
  assert.equal(classifyBooking(booking({ bookingStatus: 'completed' }), NOW), 'completed');
  assert.equal(classifyBooking(booking({ bookingStatus: 'cancelled' }), NOW), 'cancelled');
  assert.equal(classifyBooking(booking({ bookingStatus: 'expired' }), NOW), 'expired');
  assert.equal(classifyBooking(null, NOW), '');
  assert.equal(classifyBooking({}, NOW), '');
});

test('a reservation whose end time has passed is no longer upcoming', () => {
  const stale = booking({ bookingStatus: 'confirmed', startTime: past(3), endTime: past(1) });
  assert.equal(isUpcomingBooking(stale, NOW), false);
  assert.equal(classifyBooking(stale, NOW), 'confirmed');
  assert.equal(isUpcomingBooking(booking({ bookingStatus: 'confirmed' }), NOW), true);
  assert.equal(isUpcomingBooking(booking({ bookingStatus: 'completed' }), NOW), false);
});

test('missing or invalid end times do not hide reservations', () => {
  assert.equal(classifyBooking(booking({ endTime: null }), NOW), 'upcoming');
  assert.equal(classifyBooking(booking({ endTime: 'garbage' }), NOW), 'upcoming');
  const boundary = booking({ endTime: NOW.toISOString() });
  assert.equal(classifyBooking(boundary, NOW), 'upcoming');
});

test('getBookingStats counts every stored status', () => {
  const bookings = [
    booking({ _id: 'a', bookingStatus: 'confirmed' }),
    booking({ _id: 'b', bookingStatus: 'pending' }),
    booking({ _id: 'c', bookingStatus: 'active' }),
    booking({ _id: 'd', bookingStatus: 'completed' }),
    booking({ _id: 'e', bookingStatus: 'cancelled' }),
    booking({ _id: 'f', bookingStatus: 'expired' }),
    booking({ _id: 'g', bookingStatus: 'weird' }),
  ];
  assert.deepEqual(getBookingStats(bookings, NOW), {
    total: 7,
    upcoming: 2,
    active: 1,
    completed: 1,
    cancelled: 1,
    expired: 1,
  });
  assert.deepEqual(getBookingStats([], NOW), {
    total: 0,
    upcoming: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    expired: 0,
  });
});

test('filterBookings applies the selected category', () => {
  const bookings = [
    booking({ _id: 'a', bookingStatus: 'confirmed' }),
    booking({ _id: 'b', bookingStatus: 'active' }),
    booking({ _id: 'c', bookingStatus: 'completed' }),
    booking({ _id: 'd', bookingStatus: 'cancelled' }),
    booking({ _id: 'e', bookingStatus: 'expired' }),
    booking({ _id: 'f', bookingStatus: 'confirmed', startTime: past(4), endTime: past(3) }),
  ];
  const ids = (list) => list.map((b) => b._id);

  assert.deepEqual(ids(filterBookings(bookings, { category: 'all', now: NOW })), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(ids(filterBookings(bookings, { category: 'upcoming', now: NOW })), ['a']);
  assert.deepEqual(ids(filterBookings(bookings, { category: 'active', now: NOW })), ['b']);
  assert.deepEqual(ids(filterBookings(bookings, { category: 'completed', now: NOW })), ['c']);
  assert.deepEqual(ids(filterBookings(bookings, { category: 'cancelled', now: NOW })), ['d']);
  assert.deepEqual(ids(filterBookings(bookings, { category: 'expired', now: NOW })), ['e']);
  // A reservation that is no longer upcoming is still reachable through All.
  assert.equal(filterBookings(bookings, { category: 'all', now: NOW }).length, 6);
});

test('filterBookings combines category and search', () => {
  const bookings = [
    booking({ _id: 'a', bookingStatus: 'completed', parkingLotId: lot('Airport Long Stay') }),
    booking({ _id: 'b', bookingStatus: 'completed', parkingLotId: lot('City Center Parking') }),
    booking({ _id: 'c', bookingStatus: 'cancelled', parkingLotId: lot('Airport Long Stay') }),
  ];
  const found = filterBookings(bookings, { category: 'completed', search: 'airport', now: NOW });
  assert.deepEqual(found.map((b) => b._id), ['a']);
});

test('search matches id, lot, slot and vehicle number, ignoring case and whitespace', () => {
  const b = booking();
  assert.equal(matchesBookingSearch(b, '65f1a2b3c4d5e6f7a8b9c0d1'), true);
  assert.equal(matchesBookingSearch(b, 'A8B9C0D1'), true);
  assert.equal(matchesBookingSearch(b, '#a8b9c0d1'), true);
  assert.equal(matchesBookingSearch(b, '  city center  '), true);
  assert.equal(matchesBookingSearch(b, 'pune'), true);
  assert.equal(matchesBookingSearch(b, 'f1-s2'), true);
  assert.equal(matchesBookingSearch(b, 'mh 12 ab'), true);
  assert.equal(matchesBookingSearch(b, 'nope'), false);
  assert.equal(matchesBookingSearch(b, ''), true);
  assert.equal(matchesBookingSearch(null, 'anything'), false);
});

test('search does not match bookings on empty optional fields', () => {
  const b = booking({ vehicleNumber: '', parkingLotId: null, slotId: null });
  assert.equal(matchesBookingSearch(b, 'undefined'), false);
  assert.equal(matchesBookingSearch(b, 'null'), false);
  assert.equal(matchesBookingSearch(b, '65f1a2b3c4d5e6f7a8b9c0d1'), true);
});

test('sortBookings orders by booking date, oldest and by start date', () => {
  const oldest = booking({ _id: 'oldest', createdAt: '2026-01-01T10:00:00.000Z', startTime: future(5) });
  const middle = booking({ _id: 'middle', createdAt: '2026-03-01T10:00:00.000Z', startTime: future(2) });
  const newest = booking({ _id: 'newest', createdAt: '2026-04-01T10:00:00.000Z', startTime: future(9) });
  const list = [middle, newest, oldest];
  const ids = (items) => items.map((b) => b._id);

  assert.equal(DEFAULT_BOOKING_SORT, 'recent');
  assert.deepEqual(ids(sortBookings(list)), ['newest', 'middle', 'oldest']);
  assert.deepEqual(ids(sortBookings(list, 'recent')), ['newest', 'middle', 'oldest']);
  assert.deepEqual(ids(sortBookings(list, 'oldest')), ['oldest', 'middle', 'newest']);
  assert.deepEqual(ids(sortBookings(list, 'start-asc')), ['middle', 'oldest', 'newest']);
  assert.deepEqual(ids(sortBookings(list, 'start-desc')), ['newest', 'oldest', 'middle']);
  // Unknown sort keys fall back to the default ordering.
  assert.deepEqual(ids(sortBookings(list, 'bogus')), ['newest', 'middle', 'oldest']);
});

test('sortBookings tolerates missing or invalid dates without crashing', () => {
  const valid = booking({ _id: 'valid', createdAt: '2026-04-01T10:00:00.000Z' });
  const missing = booking({ _id: 'missing', createdAt: undefined, startTime: undefined });
  const invalid = booking({ _id: 'invalid', createdAt: 'garbage', startTime: 'garbage' });
  const sorted = sortBookings([missing, valid, invalid], 'recent');
  assert.equal(sorted[0]._id, 'valid');
  assert.equal(sorted.length, 3);
  assert.deepEqual(sortBookings([], 'recent'), []);
  assert.deepEqual(sortBookings(undefined, 'recent'), []);
});

test('filtering and sorting never mutate the fetched bookings', () => {
  const a = booking({ _id: 'a', createdAt: '2026-01-01T10:00:00.000Z' });
  const b = booking({ _id: 'b', createdAt: '2026-04-01T10:00:00.000Z' });
  const list = [a, b];
  const snapshot = JSON.stringify(list);

  filterBookings(list, { category: 'upcoming', search: 'city', now: NOW });
  sortBookings(list, 'oldest');
  getBookingStats(list, NOW);

  assert.equal(JSON.stringify(list), snapshot);
  assert.deepEqual(list.map((x) => x._id), ['a', 'b']);
  assert.notEqual(sortBookings(list, 'oldest'), list);
});

test('getBookingDisplay provides safe fallbacks for removed references', () => {
  const removed = getBookingDisplay({
    _id: 'abc12345defg',
    parkingLotId: null,
    slotId: null,
    vehicleNumber: '',
  });
  assert.equal(removed.bookingId, 'abc12345defg');
  assert.equal(removed.shortId, '#2345DEFG');
  assert.equal(removed.lotName, 'Parking lot unavailable');
  assert.equal(removed.lotLocation, 'Location unavailable');
  assert.equal(removed.slotNumber, '—');
  assert.equal(removed.vehicleNumber, '—');
  assert.equal(getBookingDisplay({}).lotName, 'Parking lot unavailable');
  assert.equal(getBookingDisplay({}).shortId, '—');
});

test('getBookingDisplay exposes lot and slot details when present', () => {
  const display = getBookingDisplay(booking());
  assert.equal(display.bookingId, '65f1a2b3c4d5e6f7a8b9c0d1');
  assert.equal(display.shortId, '#A8B9C0D1');
  assert.equal(display.lotName, 'City Center Parking');
  assert.equal(display.lotLocation, '12 Main Road, Pune');
  assert.equal(display.slotNumber, 'F1-S2');
  assert.equal(display.vehicleNumber, 'MH 12 AB 1234');
});

test('paymentStatusLabel maps stored values to readable labels', () => {
  assert.equal(paymentStatusLabel('pending'), 'Payment pending');
  assert.equal(paymentStatusLabel('completed'), 'Paid');
  assert.equal(paymentStatusLabel('refunded'), 'Refunded');
  assert.equal(paymentStatusLabel('failed'), 'Payment failed');
  assert.equal(paymentStatusLabel('somethingelse'), 'Somethingelse');
  assert.equal(paymentStatusLabel(undefined), 'Payment pending');
});

test('category and sort option lists stay in sync with the helpers', () => {
  assert.deepEqual(BOOKING_CATEGORIES.map((c) => c.id), [
    'all', 'upcoming', 'active', 'completed', 'cancelled', 'expired',
  ]);
  assert.deepEqual(BOOKING_SORT_OPTIONS.map((s) => s.id), ['recent', 'oldest', 'start-asc', 'start-desc']);
});
