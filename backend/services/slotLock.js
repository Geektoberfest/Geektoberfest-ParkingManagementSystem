const crypto = require('crypto');
const ParkingSlot = require('../models/ParkingSlot');

const LOCK_TTL_MS = 10 * 1000; // a crashed request cannot hold the slot forever
const RETRY_DELAY_MS = 50;
const MAX_ATTEMPTS = 40;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs fn while holding an exclusive lock on the slot document.
// The lock is a conditional update, so only one request can take it at a time,
// even across multiple server instances. Throws a 409 if the lock cannot be taken.
const withSlotLock = async (slotId, fn) => {
  const token = crypto.randomUUID();

  let acquired = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !acquired; attempt++) {
    const now = new Date();
    const result = await ParkingSlot.updateOne(
      {
        _id: slotId,
        $or: [{ bookingLockExpiresAt: null }, { bookingLockExpiresAt: { $lt: now } }],
      },
      {
        $set: {
          bookingLockToken: token,
          bookingLockExpiresAt: new Date(now.getTime() + LOCK_TTL_MS),
        },
      }
    );
    acquired = result.matchedCount === 1;
    if (!acquired) await sleep(RETRY_DELAY_MS);
  }

  if (!acquired) {
    const err = new Error('This slot is busy with another booking request. Please try again.');
    err.statusCode = 409;
    throw err;
  }

  try {
    return await fn();
  } finally {
    // Only release our own lock, in case it expired and was taken over
    await ParkingSlot.updateOne(
      { _id: slotId, bookingLockToken: token },
      { $set: { bookingLockToken: null, bookingLockExpiresAt: null } }
    );
  }
};

module.exports = { withSlotLock };
