const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');

const basePayment = () => ({
  userId: new mongoose.Types.ObjectId(),
  bookingId: new mongoose.Types.ObjectId(),
  amount: 50,
  amountPaise: 5000,
  currency: 'INR',
});

test('requires integer paise and INR for newly created Razorpay payments', () => {
  assert.equal(new Payment(basePayment()).validateSync(), undefined);

  const fractionalPaise = new Payment({ ...basePayment(), amountPaise: 5000.5 });
  assert.ok(fractionalPaise.validateSync()?.errors.amountPaise);

  const unsupportedCurrency = new Payment({ ...basePayment(), currency: 'USD' });
  assert.ok(unsupportedCurrency.validateSync()?.errors.currency);
});
