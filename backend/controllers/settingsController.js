const Settings = require('../models/Settings');
const ActivityLog = require('../models/ActivityLog');

// Default settings to seed
const DEFAULT_SETTINGS = [
  { key: 'siteName', value: 'SmartPark', label: 'Site Name', category: 'general' },
  { key: 'supportEmail', value: 'support@smartpark.com', label: 'Support Email', category: 'general' },
  { key: 'supportPhone', value: '+91 98765 43210', label: 'Support Phone', category: 'general' },
  { key: 'cancellationFeePercent', value: 10, label: 'Cancellation Fee (%)', category: 'booking' },
  { key: 'maxBookingHours', value: 24, label: 'Max Booking Duration (hours)', category: 'booking' },
  { key: 'parkingTaxPercent', value: 0, label: 'Parking Tax (%)', category: 'booking' },
  { key: 'serviceFeeFlat', value: 0, label: 'Service Fee (₹ flat)', category: 'booking' },
  { key: 'overdueMultiplier', value: 1, label: 'Overdue Rate Multiplier', category: 'booking' },
];

const VALID_KEYS = DEFAULT_SETTINGS.map((s) => s.key);

// @desc    Get all settings (admin)
// @route   GET /api/settings
exports.getSettings = async (req, res, next) => {
  try {
    // Remove any old/unused settings
    await Settings.deleteMany({ key: { $nin: VALID_KEYS } });

    let settings = await Settings.find({ key: { $in: VALID_KEYS } }).sort('category key');

    // Seed defaults if empty
    if (settings.length === 0) {
      settings = await Settings.insertMany(DEFAULT_SETTINGS);
    }

    // Group by category
    const grouped = {};
    settings.forEach((s) => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });

    res.json({ success: true, data: settings, grouped });
  } catch (error) {
    next(error);
  }
};

// @desc    Update settings (admin)
// @route   PUT /api/settings
exports.updateSettings = async (req, res, next) => {
  try {
    const updates = req.body; // Array of { key, value }

    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'Expected array of { key, value }' });
    }

    for (const { key, value } of updates) {
      await Settings.findOneAndUpdate({ key }, { value }, { upsert: true });
    }

    // Log activity
    await ActivityLog.create({
      userId: req.user._id,
      action: 'updated',
      entity: 'settings',
      details: `Updated ${updates.length} setting(s): ${updates.map((u) => u.key).join(', ')}`,
      ipAddress: req.ip,
    });

    const settings = await Settings.find().sort('category key');
    const grouped = {};
    settings.forEach((s) => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });
    res.json({ success: true, message: 'Settings updated', data: settings, grouped });
  } catch (error) {
    next(error);
  }
};

// @desc    Get public settings (non-sensitive)
// @route   GET /api/settings/public
exports.getPublicSettings = async (req, res, next) => {
  try {
    const settings = await Settings.find({
      key: { $in: ['siteName', 'supportEmail', 'supportPhone'] },
    });
    const obj = {};
    settings.forEach((s) => (obj[s.key] = s.value));
    res.json({ success: true, data: obj });
  } catch (error) {
    next(error);
  }
};

// ─── Activity Log ────────────────────────────────────────────────

// @desc    Get activity logs (admin)
// @route   GET /api/settings/activity-log
exports.getActivityLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const total = await ActivityLog.countDocuments();
    const logs = await ActivityLog.find()
      .populate('userId', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: logs,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};
