const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateParkingFare, readStoredFareSnapshot } = require('../services/parkingFeeService');

test('charges a one-hour minimum for a partial hour', () => {
  const fare = calculateParkingFare({
    startTime: new Date('2026-01-01T10:00:00.000Z'),
    endTime: new Date('2026-01-01T10:20:00.000Z'),
    pricePerHour: 50,
  });

  assert.equal(fare.billableHours, 1);
  assert.equal(fare.totalAmountPaise, 5000);
  assert.equal(fare.totalAmount, 50);
});

test('rounds each started hour and calculates money in paise', () => {
  const fare = calculateParkingFare({
    startTime: new Date('2026-01-01T10:00:00.000Z'),
    endTime: new Date('2026-01-01T11:30:00.000Z'),
    pricePerHour: 49.99,
  });

  assert.equal(fare.billableHours, 2);
  assert.equal(fare.hourlyRatePaise, 4999);
  assert.equal(fare.totalAmountPaise, 9998);
  assert.equal(fare.totalAmount, 99.98);
});

test('rejects invalid dates, non-positive durations, and invalid rates', () => {
  assert.throws(() => calculateParkingFare({
    startTime: 'not-a-date', endTime: '2026-01-01T11:00:00.000Z', pricePerHour: 50,
  }));
  assert.throws(() => calculateParkingFare({
    startTime: '2026-01-01T11:00:00.000Z', endTime: '2026-01-01T11:00:00.000Z', pricePerHour: 50,
  }));
  assert.throws(() => calculateParkingFare({
    startTime: '2026-01-01T10:00:00.000Z', endTime: '2026-01-01T11:00:00.000Z', pricePerHour: -1,
  }));
});

test('accepts only internally consistent immutable fare snapshots', () => {
  const fare = readStoredFareSnapshot({
    currency: 'INR',
    billableHours: 2,
    hourlyRatePaise: 4999,
    subtotalPaise: 9998,
    additionalChargesPaise: 200,
    totalAmountPaise: 10198,
    pricingPolicy: 'Each started hour is billed, with a one-hour minimum.',
  });

  assert.equal(fare.totalAmount, 101.98);
  assert.throws(() => readStoredFareSnapshot({
    ...fare,
    totalAmountPaise: 1,
  }));
  assert.throws(() => readStoredFareSnapshot({ currency: 'INR', totalAmountPaise: 5000 }));
});
