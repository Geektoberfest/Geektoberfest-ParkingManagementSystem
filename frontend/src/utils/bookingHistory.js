/**
 * Pure helpers behind the booking history page (MyBookings).
 * Filtering, sorting and searching happen on the bookings already fetched for
 * the signed-in user, so nothing here performs or requires API access.
 */

export const DEFAULT_BOOKING_CATEGORY = 'all';
export const DEFAULT_BOOKING_SORT = 'recent';

// Reservation states that can still be upcoming.
export const UPCOMING_STATUSES = ['pending', 'confirmed'];

export const BOOKING_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'expired', label: 'Expired' },
];

export const BOOKING_SORT_OPTIONS = [
  { id: 'recent', label: 'Most recent first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'start-asc', label: 'Start date: soonest' },
  { id: 'start-desc', label: 'Start date: latest' },
];

export const PAYMENT_STATUS_LABELS = {
  pending: 'Payment pending',
  completed: 'Paid',
  refunded: 'Refunded',
  failed: 'Payment failed',
};

// Returns a comparable timestamp, or null when the value is missing/invalid.
export const toTimestamp = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

export const getBookingId = (booking) => (booking?._id ? String(booking._id) : '');

// Short, readable form of the MongoDB identifier.
export const shortBookingId = (id) => {
  const value = String(id ?? '').trim();
  if (!value) return '—';
  return `#${value.slice(-8).toUpperCase()}`;
};

export const isUpcomingBooking = (booking, now = new Date()) => {
  if (!booking || !UPCOMING_STATUSES.includes(booking.bookingStatus)) return false;
  const end = toTimestamp(booking.endTime);
  // Without a usable end time the reservation cannot be proven to have passed,
  // so it stays visible in the upcoming group instead of disappearing.
  if (end === null) return true;
  const reference = toTimestamp(now);
  return end >= (reference === null ? Date.now() : reference);
};

/**
 * Category of a booking. Stored statuses are never rewritten: an in-progress
 * session stays "active" and only pending/confirmed reservations in the future
 * are reported as "upcoming".
 */
export const classifyBooking = (booking, now = new Date()) => {
  if (!booking) return '';
  const status = booking.bookingStatus || '';
  if (isUpcomingBooking(booking, now)) return 'upcoming';
  return status;
};

export const getBookingStats = (bookings = [], now = new Date()) => {
  const stats = { total: 0, upcoming: 0, active: 0, completed: 0, cancelled: 0, expired: 0 };
  const list = Array.isArray(bookings) ? bookings : [];
  list.forEach((booking) => {
    stats.total += 1;
    const category = classifyBooking(booking, now);
    if (Object.prototype.hasOwnProperty.call(stats, category)) stats[category] += 1;
  });
  return stats;
};

export const matchesBookingSearch = (booking, term) => {
  const query = String(term ?? '').trim().toLowerCase();
  if (!query) return true;
  if (!booking) return false;

  const id = getBookingId(booking).toLowerCase();
  if (id && (id === query || id.slice(-8) === query)) return true;

  const haystack = [
    id,
    shortBookingId(booking._id),
    booking.parkingLotId?.name,
    booking.parkingLotId?.city,
    booking.slotId?.slotNumber,
    booking.vehicleNumber,
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value).toLowerCase());

  return haystack.some((value) => value.includes(query));
};

export const filterBookings = (
  bookings = [],
  { category = DEFAULT_BOOKING_CATEGORY, search = '', now = new Date() } = {}
) => {
  const list = Array.isArray(bookings) ? bookings : [];
  const term = String(search ?? '').trim();
  return list.filter((booking) => {
    if (category !== 'all' && classifyBooking(booking, now) !== category) return false;
    if (!term) return true;
    return matchesBookingSearch(booking, term);
  });
};

const timestampFor = (booking, field) => {
  const primary = toTimestamp(booking?.[field]);
  if (primary !== null) return primary;
  const fallbackField = field === 'createdAt' ? 'startTime' : 'createdAt';
  return toTimestamp(booking?.[fallbackField]) ?? 0;
};

export const sortBookings = (bookings = [], sortBy = DEFAULT_BOOKING_SORT) => {
  const list = Array.isArray(bookings) ? [...bookings] : [];
  const key = BOOKING_SORT_OPTIONS.some((option) => option.id === sortBy) ? sortBy : DEFAULT_BOOKING_SORT;
  const field = key === 'recent' || key === 'oldest' ? 'createdAt' : 'startTime';
  const direction = key === 'oldest' || key === 'start-asc' ? 1 : -1;

  // Array.prototype.sort is stable, so equal timestamps keep the API order.
  return list.sort((a, b) => (timestampFor(a, field) - timestampFor(b, field)) * direction);
};

export const paymentStatusLabel = (status) => {
  if (!status) return PAYMENT_STATUS_LABELS.pending;
  return PAYMENT_STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1);
};

/**
 * Display-safe values for a booking whose parking lot or slot may have been
 * removed since the booking was made.
 */
export const getBookingDisplay = (booking = {}) => {
  const lot = booking.parkingLotId || null;
  return {
    bookingId: getBookingId(booking),
    shortId: shortBookingId(booking._id),
    lotName: lot?.name || 'Parking lot unavailable',
    lotLocation:
      [lot?.address, lot?.city].filter((value) => Boolean(value)).join(', ') || 'Location unavailable',
    slotNumber: booking.slotId?.slotNumber || '—',
    vehicleNumber: booking.vehicleNumber || '—',
  };
};
