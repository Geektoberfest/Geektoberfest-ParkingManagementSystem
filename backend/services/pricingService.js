const Settings = require('../models/Settings');

// Defaults used when Settings keys are absent. Admins can change these
// via PUT /api/settings (keys: parkingTaxPercent, serviceFeeFlat,
// overdueMultiplier). All fee math stays on the server.
const DEFAULTS = {
  parkingTaxPercent: 0,
  serviceFeeFlat: 0,
  overdueMultiplier: 1,
  currency: 'INR',
};

async function getPricingConfig() {
  try {
    const docs = await Settings.find({
      key: { $in: ['parkingTaxPercent', 'serviceFeeFlat', 'overdueMultiplier'] },
    });
    const cfg = { ...DEFAULTS };
    for (const d of docs) {
      if (d.key === 'parkingTaxPercent') cfg.parkingTaxPercent = Number(d.value) || 0;
      if (d.key === 'serviceFeeFlat') cfg.serviceFeeFlat = Number(d.value) || 0;
      if (d.key === 'overdueMultiplier') cfg.overdueMultiplier = Number(d.value) || 1;
    }
    cfg.currency = process.env.CURRENCY || 'INR';
    return cfg;
  } catch {
    return { ...DEFAULTS, currency: process.env.CURRENCY || 'INR' };
  }
}

function billableHoursBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    throw new Error('Invalid start/end time');
  }
  if (e <= s) throw new Error('End time must be after start time');
  return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60)));
}

// Single source of truth for parking fees. Never trust client totals.
function calculateFee({ startTime, endTime, pricePerHour, overdueHours = 0, config = DEFAULTS }) {
  const rate = Number(pricePerHour) || 0;
  if (rate < 0) throw new Error('Invalid pricePerHour');
  const hours = billableHoursBetween(startTime, endTime);
  const baseAmount = hours * rate;

  const extraHours = Math.max(0, Math.ceil(Number(overdueHours) || 0));
  const overdueRate = rate * (Number(config.overdueMultiplier) || 1);
  const overdueCharge = extraHours * overdueRate;

  const subtotal = baseAmount + overdueCharge;
  const taxPercent = Number(config.parkingTaxPercent) || 0;
  const taxAmount = Math.round(subtotal * (taxPercent / 100));
  const serviceFee = Math.max(0, Number(config.serviceFeeFlat) || 0);
  const totalAmount = subtotal + taxAmount + serviceFee;

  return {
    billableHours: hours,
    pricePerHour: rate,
    baseAmount,
    overdueHours: extraHours,
    overdueRatePerHour: overdueRate,
    overdueCharge,
    subtotal,
    taxPercent,
    taxAmount,
    serviceFee,
    totalAmount,
    currency: config.currency || 'INR',
  };
}

function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

module.exports = { DEFAULTS, getPricingConfig, billableHoursBetween, calculateFee, toPaise };
