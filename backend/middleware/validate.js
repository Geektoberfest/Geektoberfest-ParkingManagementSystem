const { validationResult, body } = require('express-validator');

// Validation error handler
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// Register validation
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const adminRegisterValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phoneNumber').optional().trim(),
];

// Login validation
const loginValidation = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Booking validation
const bookingValidation = [
  body('slotId').notEmpty().withMessage('Slot ID is required'),
  body('parkingLotId').notEmpty().withMessage('Parking Lot ID is required'),
  body('startTime').notEmpty().withMessage('Start time is required'),
  body('endTime').notEmpty().withMessage('End time is required'),
  body('vehicleNumber').notEmpty().withMessage('Vehicle number is required'),
];

// Parking Lot validation
const parkingLotValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('totalFloors').isInt({ min: 1 }).withMessage('Total floors must be at least 1'),
  body('totalSlots').isInt({ min: 1 }).withMessage('Total slots must be at least 1'),
  body('pricePerHour').isFloat({ min: 0 }).withMessage('Price per hour must be non-negative'),
];

module.exports = {
  validate,
  registerValidation,
  adminRegisterValidation,
  loginValidation,
  bookingValidation,
  parkingLotValidation,
};
