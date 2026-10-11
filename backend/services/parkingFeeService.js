const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const SUPPORTED_CURRENCY = 'INR';

const isSafeNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

const toPaise = (amount) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new Error('Parking price must be a non-negative number');
  }

  const paise = Math.round((numericAmount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(paise)) {
    throw new Error('Parking price is outside the supported range');
  }

  return paise;
};

const toRupees = (paise) => paise / 100;

const createFareError = (message) => {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
};

const readStoredFareSnapshot = (snapshot) => {
  if (!snapshot || snapshot.currency !== SUPPORTED_CURRENCY) {
    throw createFareError('This booking does not have a verified fare snapshot');
  }

  const {
    billableHours,
    hourlyRatePaise,
    subtotalPaise,
    additionalChargesPaise,
    totalAmountPaise,
    pricingPolicy,
  } = snapshot;

  if (
    !Number.isSafeInteger(billableHours) || billableHours < 1 ||
    ![hourlyRatePaise, subtotalPaise, additionalChargesPaise, totalAmountPaise].every(isSafeNonNegativeInteger) ||
    subtotalPaise !== billableHours * hourlyRatePaise ||
    totalAmountPaise !== subtotalPaise + additionalChargesPaise ||
    totalAmountPaise < 1 ||
    typeof pricingPolicy !== 'string' || !pricingPolicy.trim()
  ) {
    throw createFareError('This booking has an invalid fare snapshot');
  }

  return {
    currency: SUPPORTED_CURRENCY,
    billableHours,
    hourlyRatePaise,
    subtotalPaise,
    additionalChargesPaise,
    totalAmountPaise,
    hourlyRate: toRupees(hourlyRatePaise),
    subtotal: toRupees(subtotalPaise),
    additionalCharges: toRupees(additionalChargesPaise),
    totalAmount: toRupees(totalAmountPaise),
    pricingPolicy,
  };
};

const calculateParkingFare = ({ startTime, endTime, pricePerHour, additionalChargesPaise = 0 }) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error('End time must be after start time');
  }

  if (!Number.isSafeInteger(additionalChargesPaise) || additionalChargesPaise < 0) {
    throw new Error('Additional charges must be a non-negative integer in paise');
  }

  // SmartPark charges each started hour, with a one-hour minimum.
  const billableHours = Math.max(1, Math.ceil((end - start) / MILLISECONDS_PER_HOUR));
  const hourlyRatePaise = toPaise(pricePerHour);
  const subtotalPaise = billableHours * hourlyRatePaise;
  const totalAmountPaise = subtotalPaise + additionalChargesPaise;

  if (!Number.isSafeInteger(subtotalPaise) || !Number.isSafeInteger(totalAmountPaise)) {
    throw new Error('Calculated parking fee is outside the supported range');
  }

  return {
    currency: SUPPORTED_CURRENCY,
    billableHours,
    hourlyRatePaise,
    subtotalPaise,
    additionalChargesPaise,
    totalAmountPaise,
    hourlyRate: toRupees(hourlyRatePaise),
    subtotal: toRupees(subtotalPaise),
    additionalCharges: toRupees(additionalChargesPaise),
    totalAmount: toRupees(totalAmountPaise),
    pricingPolicy: 'Each started hour is billed, with a minimum charge of one hour.',
  };
};

module.exports = { calculateParkingFare, readStoredFareSnapshot, toPaise, toRupees };
