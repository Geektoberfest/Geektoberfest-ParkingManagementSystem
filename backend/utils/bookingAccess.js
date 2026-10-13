/**
 * Ownership rules for booking records.
 *
 * A booking may only be read or acted upon by the user who created it, or by
 * an administrator. Kept dependency free so the rules can be unit tested.
 */
const isAdmin = (user) => Boolean(user && user.role === 'admin');

const isBookingOwner = (booking, user) => {
  if (!booking || !user || !booking.userId || !user._id) return false;
  const ownerId = typeof booking.userId === 'object' && booking.userId._id ? booking.userId._id : booking.userId;
  return ownerId.toString() === user._id.toString();
};

const canAccessBooking = (booking, user) => isBookingOwner(booking, user) || isAdmin(user);

module.exports = { isAdmin, isBookingOwner, canAccessBooking };
