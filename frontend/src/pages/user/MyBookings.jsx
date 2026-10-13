import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DirectionMap from '../../components/map/DirectionMap';
import toast from 'react-hot-toast';
import { formatCurrency, formatDateTime, getStatusBadge } from '../../utils/helpers';
import {
  BOOKING_CATEGORIES,
  BOOKING_SORT_OPTIONS,
  DEFAULT_BOOKING_CATEGORY,
  DEFAULT_BOOKING_SORT,
  filterBookings,
  getBookingDisplay,
  getBookingStats,
  paymentStatusLabel,
  sortBookings,
  toTimestamp,
} from '../../utils/bookingHistory';
import { QRCodeSVG } from 'qrcode.react';
import { HiOutlineLocationMarker, HiOutlineMap, HiOutlineExclamation, HiOutlineSearch } from 'react-icons/hi';
import { FiStar, FiLogIn, FiLogOut, FiDownload, FiX, FiChevronDown } from 'react-icons/fi';
import { connectSocket } from '../../services/socket';

// Haversine distance
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

// Never render "Invalid Date" for missing or malformed timestamps.
const formatOptionalDateTime = (value) => (toTimestamp(value) === null ? '—' : formatDateTime(value));

const formatOptionalAmount = (value) => (Number.isFinite(value) ? formatCurrency(value) : '—');

const categoryCount = (stats, categoryId) =>
  categoryId === 'all' ? stats.total : stats[categoryId] ?? 0;

const Field = ({ label, value, emphasis = false }) => (
  <div className="min-w-0">
    <span className="text-xs text-gray-400">{label}</span>
    <p
      className={`font-medium truncate ${
        emphasis ? 'font-bold text-primary-600' : 'text-gray-700 dark:text-gray-300'
      }`}
      title={typeof value === 'string' ? value : undefined}
    >
      {value}
    </p>
  </div>
);

const MyBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [category, setCategory] = useState(DEFAULT_BOOKING_CATEGORY);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(DEFAULT_BOOKING_SORT);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showDirections, setShowDirections] = useState(false);
  const [directionsBooking, setDirectionsBooking] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [showReview, setShowReview] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    setSessionExpired(false);
    try {
      const res = await api.get('/bookings/user');
      setBookings(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setBookings([]);
      if (err.response?.status === 401) {
        setSessionExpired(true);
        setError('Your session has expired. Please sign in again to view your bookings.');
      } else {
        setError(
          err.response?.data?.message ||
            'We could not load your bookings right now. Please check your connection and try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch bookings whenever the logged-in user changes
  useEffect(() => {
    setBookings([]);
    setSelectedBooking(null);
    setError('');
    setCategory(DEFAULT_BOOKING_CATEGORY);
    setSearch('');
    setSortBy(DEFAULT_BOOKING_SORT);
    fetchBookings();
  }, [user?._id, fetchBookings]);

  // Get user location for distance calculations
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    }
  }, []);

  // Keep the history in sync with live booking changes
  const refetchRef = useRef(fetchBookings);
  useEffect(() => {
    refetchRef.current = fetchBookings;
  }, [fetchBookings]);

  useEffect(() => {
    const socket = connectSocket();
    let timer = null;

    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refetchRef.current?.();
      }, 600);
    };

    const handleExpired = ({ bookingId }) => {
      setBookings((prev) =>
        prev.map((b) => (b._id === bookingId ? { ...b, bookingStatus: 'expired' } : b))
      );
      toast('A booking has expired', { icon: '⏰' });
    };

    const handleBookingUpdate = (payload) => {
      if (payload?.type !== 'new') return;
      const ownerId = payload?.booking?.userId;
      if (ownerId && user?._id && String(ownerId) !== String(user._id)) return;
      scheduleRefetch();
    };

    socket.on('bookingExpired', handleExpired);
    socket.on('bookingUpdate', handleBookingUpdate);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off('bookingExpired', handleExpired);
      socket.off('bookingUpdate', handleBookingUpdate);
    };
  }, [user?._id]);

  const stats = useMemo(() => getBookingStats(bookings), [bookings]);

  const visibleBookings = useMemo(
    () => sortBookings(filterBookings(bookings, { category, search }), sortBy),
    [bookings, category, search, sortBy]
  );

  const hasActiveFilters = category !== DEFAULT_BOOKING_CATEGORY || search.trim() !== '' || sortBy !== DEFAULT_BOOKING_SORT;

  const clearFilters = () => {
    setCategory(DEFAULT_BOOKING_CATEGORY);
    setSearch('');
    setSortBy(DEFAULT_BOOKING_SORT);
  };

  const handleCancel = async (id) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await api.delete(`/bookings/cancel/${id}`);
      toast.success('Booking cancelled');
      fetchBookings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel');
    }
  };

  const handlePay = async (bookingId) => {
    try {
      await api.post('/payments/process', { bookingId, paymentMethod: 'card' });
      toast.success('Payment successful!');
      fetchBookings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    }
  };

  const handleGetDirections = (booking) => {
    setDirectionsBooking(booking);
    setShowDirections(true);
  };

  // Check-in / Check-out
  const handleCheckIn = async (id) => {
    try {
      await api.put(`/bookings/check-in/${id}`);
      toast.success('Checked in successfully!');
      fetchBookings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-in failed');
    }
  };

  const handleCheckOut = async (id) => {
    try {
      await api.put(`/bookings/check-out/${id}`);
      toast.success('Checked out successfully!');
      fetchBookings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-out failed');
    }
  };

  const handleSubmitReview = async () => {
    try {
      await api.post('/reviews', {
        bookingId: showReview._id,
        parkingLotId: showReview.parkingLotId?._id,
        rating: reviewRating,
        comment: reviewComment,
      });
      toast.success('Review submitted!');
      setShowReview(null);
      setReviewRating(5);
      setReviewComment('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit review');
    }
  };

  // Download receipt
  const handleDownloadReceipt = async (bookingId) => {
    try {
      const paymentsRes = await api.get('/payments/history');
      const payment = paymentsRes.data.data.find((p) => p.bookingId === bookingId || p.bookingId?._id === bookingId);
      if (!payment) return toast.error('No payment found for this booking');

      const receiptRes = await api.get(`/payments/receipt/${payment._id}`);
      const receipt = receiptRes.data.data;

      const text = `
========================================
         SMARTPARK RECEIPT
========================================
Receipt No: ${receipt.receiptNo}
Date: ${new Date(receipt.date).toLocaleString()}

Customer: ${receipt.customer.name}
Email: ${receipt.customer.email}

Parking Lot: ${receipt.booking?.parkingLot || 'N/A'}
Slot: ${receipt.booking?.slotNumber || 'N/A'}
Vehicle: ${receipt.booking?.vehicleNumber || 'N/A'}
Duration: ${receipt.booking?.duration || 0} hours

Amount: ₹${receipt.amount}
Payment Method: ${receipt.paymentMethod}
Transaction ID: ${receipt.transactionId}
Status: ${receipt.status}
========================================
       Thank you for using SmartPark!
========================================
      `.trim();

      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${receipt.receiptNo}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Receipt downloaded');
    } catch (err) {
      toast.error('Failed to download receipt');
    }
  };

  // Download exports
  const handleExportCSV = async () => {
    try {
      const res = await api.get('/export/bookings/csv', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bookings.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch { toast.error('Export failed'); }
  };

  const handleExportPDF = async () => {
    try {
      const res = await api.get('/export/bookings/pdf', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bookings.pdf';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch { toast.error('Export failed'); }
  };

  const selectedDisplay = selectedBooking ? getBookingDisplay(selectedBooking) : null;
  const directionDisplay = directionsBooking ? getBookingDisplay(directionsBooking) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Bookings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Your parking booking history — past, current and upcoming reservations
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500">
            <FiDownload size={14} /> CSV
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500">
            <FiDownload size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter bookings by category">
        {BOOKING_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            aria-pressed={category === c.id}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center gap-2 ${
              category === c.id
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-dark-card text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-border'
            }`}
          >
            {c.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                category === c.id ? 'bg-white/20' : 'bg-white dark:bg-dark-border text-gray-500 dark:text-gray-400'
              }`}
            >
              {categoryCount(stats, c.id)}
            </span>
          </button>
        ))}
      </div>

      {/* Search + sort */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-2">
          <label htmlFor="booking-search" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Search bookings
          </label>
          <div className="relative">
            <HiOutlineSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="booking-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Booking ID, parking lot, slot, or vehicle number..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label htmlFor="booking-sort" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Sort by
          </label>
          <div className="relative">
            <select
              id="booking-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm appearance-none focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              {BOOKING_SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Result summary */}
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-right" aria-live="polite">
        {loading || error
          ? ''
          : `Showing ${visibleBookings.length} of ${stats.total} booking${stats.total === 1 ? '' : 's'}`}
      </div>

      {loading ? (
        <LoadingSpinner text="Loading your bookings..." />
      ) : error ? (
        <div
          role="alert"
          className="card text-center py-12 border border-red-100 dark:border-red-900/30"
        >
          <p className="text-5xl mb-4">⚠️</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            Could not load your bookings
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">{error}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {sessionExpired ? (
              <Link to="/login" className="btn-primary text-sm">
                Sign in again
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => fetchBookings()}
                className="btn-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      ) : visibleBookings.length > 0 ? (
        <div className="space-y-4">
          {visibleBookings.map((b) => {
            const display = getBookingDisplay(b);
            const statusLabel = b.bookingStatus || 'unknown';
            return (
              <motion.div
                key={b._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card hover:shadow-lg"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-bold text-gray-900 dark:text-white">{display.lotName}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(b.bookingStatus)}`}>
                        {statusLabel}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(b.paymentStatus)}`}
                        title="Payment status"
                      >
                        {paymentStatusLabel(b.paymentStatus)}
                      </span>
                      {/* Distance badge */}
                      {userLocation && b.parkingLotId?.locationCoordinates?.lat && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
                          <HiOutlineLocationMarker size={12} />
                          {formatDist(getDistance(
                            userLocation[0], userLocation[1],
                            b.parkingLotId.locationCoordinates.lat, b.parkingLotId.locationCoordinates.lng
                          ))}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
                      <span>
                        Booking ID{' '}
                        <span className="font-mono font-semibold text-gray-600 dark:text-gray-300" title={display.bookingId}>
                          {display.shortId}
                        </span>
                      </span>
                      <span className="hidden sm:inline">·</span>
                      <span className="truncate">{display.lotLocation}</span>
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                      <Field label="Vehicle" value={display.vehicleNumber} />
                      <Field label="Slot" value={display.slotNumber} />
                      <Field label="Booked on" value={formatOptionalDateTime(b.createdAt)} />
                      <Field label="Starts" value={formatOptionalDateTime(b.startTime)} />
                      <Field label="Ends" value={formatOptionalDateTime(b.endTime)} />
                      <Field label="Duration" value={`${Number.isFinite(b.duration) ? b.duration : 0} hrs`} />
                      <Field label="Amount" value={formatOptionalAmount(b.totalAmount)} emphasis />
                    </div>

                    {/* Overdue charge info */}
                    {b.overdueCharge > 0 && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-1.5">
                        <HiOutlineExclamation size={16} />
                        <span>Overdue: {b.overdueHours}h extra — Charge: {formatCurrency(b.overdueCharge)}</span>
                      </div>
                    )}

                    {/* Expired notice */}
                    {b.bookingStatus === 'expired' && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5">
                        <HiOutlineExclamation size={16} />
                        <span>Expired — you did not check in before the booking ended</span>
                      </div>
                    )}

                    {/* Active overdue warning */}
                    {b.bookingStatus === 'active' && new Date(b.endTime) < new Date() && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-1.5 animate-pulse">
                        <HiOutlineExclamation size={16} />
                        <span>Your booking time has ended — overdue charges are being applied. Please check out now.</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedBooking(b)}
                      className="btn-secondary text-sm py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      View
                    </button>
                    {/* Get Directions button for confirmed/active bookings */}
                    {['confirmed', 'active'].includes(b.bookingStatus) && b.parkingLotId?.locationCoordinates?.lat && (
                      <button
                        onClick={() => handleGetDirections(b)}
                        className="text-sm py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <HiOutlineMap size={14} />
                        Directions
                      </button>
                    )}
                    {/* Check-in for confirmed bookings */}
                    {b.bookingStatus === 'confirmed' && (
                      <button
                        onClick={() => handleCheckIn(b._id)}
                        className="text-sm py-1.5 px-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <FiLogIn size={14} /> Check In
                      </button>
                    )}
                    {/* Check-out for active bookings */}
                    {b.bookingStatus === 'active' && (
                      <button
                        onClick={() => handleCheckOut(b._id)}
                        className="text-sm py-1.5 px-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <FiLogOut size={14} /> Check Out
                      </button>
                    )}
                    {b.bookingStatus === 'confirmed' && b.paymentStatus !== 'completed' && (
                      <button
                        onClick={() => handlePay(b._id)}
                        className="btn-success text-sm py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        Pay Now
                      </button>
                    )}
                    {['confirmed', 'pending'].includes(b.bookingStatus) && (
                      <button
                        onClick={() => handleCancel(b._id)}
                        className="btn-danger text-sm py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        Cancel
                      </button>
                    )}
                    {/* Review for completed */}
                    {b.bookingStatus === 'completed' && (
                      <button
                        onClick={() => setShowReview(b)}
                        className="text-sm py-1.5 px-3 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      >
                        <FiStar size={14} /> Review
                      </button>
                    )}
                    {/* Download receipt for completed & paid */}
                    {b.bookingStatus === 'completed' && b.paymentStatus === 'completed' && (
                      <button
                        onClick={() => handleDownloadReceipt(b._id)}
                        className="text-sm py-1.5 px-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      >
                        <FiDownload size={14} /> Receipt
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : stats.total === 0 ? (
        <div className="card text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">No bookings yet</p>
          <p className="mt-2 text-sm">You have not made any parking bookings so far.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link to="/dashboard/book" className="btn-primary text-sm">
              Book Parking
            </Link>
            <Link to="/parking" className="btn-secondary text-sm">
              Browse parking lots
            </Link>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">No bookings match your filters</p>
          <p className="mt-2 text-sm">
            {search.trim()
              ? `No bookings match “${search.trim()}” in this category.`
              : 'No bookings in this category yet.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Booking Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBooking(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-dark-card rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Booking Details</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Booking ID</span>
                <span className="font-mono font-medium break-all text-right">{selectedDisplay.bookingId || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Parking Lot</span>
                <span className="font-medium text-right">{selectedDisplay.lotName}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Slot</span>
                <span className="font-medium">{selectedDisplay.slotNumber}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Vehicle</span>
                <span className="font-medium">{selectedDisplay.vehicleNumber}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Status</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(selectedBooking.bookingStatus)}`}>
                  {selectedBooking.bookingStatus || 'unknown'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Payment</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(selectedBooking.paymentStatus)}`}>
                  {paymentStatusLabel(selectedBooking.paymentStatus)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Booked on</span>
                <span className="font-medium">{formatOptionalDateTime(selectedBooking.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Start</span>
                <span className="font-medium">{formatOptionalDateTime(selectedBooking.startTime)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">End</span>
                <span className="font-medium">{formatOptionalDateTime(selectedBooking.endTime)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Duration</span>
                <span className="font-medium">{Number.isFinite(selectedBooking.duration) ? selectedBooking.duration : 0} hrs</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t dark:border-dark-border">
                <span>Total</span>
                <span className="text-primary-600">{formatOptionalAmount(selectedBooking.totalAmount)}</span>
              </div>
              {selectedBooking.overdueCharge > 0 && (
                <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400">
                  <span>Overdue ({selectedBooking.overdueHours}h extra)</span>
                  <span>{formatCurrency(selectedBooking.overdueCharge)}</span>
                </div>
              )}
            </div>

            {/* QR Code */}
            {selectedBooking.bookingStatus === 'confirmed' && (
              <div className="mt-6 flex flex-col items-center">
                <p className="text-sm text-gray-500 mb-3">Scan at parking gate</p>
                <QRCodeSVG
                  value={JSON.stringify({ bookingId: selectedBooking._id, slot: selectedBooking.slotId?.slotNumber })}
                  size={160}
                  bgColor="transparent"
                  fgColor={document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#1e293b'}
                />
              </div>
            )}

            {/* Directions Map inside modal */}
            {selectedBooking.parkingLotId?.locationCoordinates?.lat && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <HiOutlineMap size={16} /> Directions to Parking
                </h3>
                <DirectionMap
                  parkingLot={selectedBooking.parkingLotId}
                  userLocation={userLocation}
                  height="220px"
                />
              </div>
            )}

            <button onClick={() => setSelectedBooking(null)} className="btn-secondary w-full mt-6">
              Close
            </button>
          </motion.div>
        </div>
      )}

      {/* Full Directions Modal */}
      {showDirections && directionsBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDirections(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-dark-card rounded-xl shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <HiOutlineMap size={22} />
                  Directions to {directionDisplay.lotName}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {directionDisplay.lotLocation}
                  {' · '}Slot: {directionDisplay.slotNumber}
                </p>
              </div>
              <button
                onClick={() => setShowDirections(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Close directions"
              >
                ✕
              </button>
            </div>

            <DirectionMap
              parkingLot={directionsBooking.parkingLotId}
              userLocation={userLocation}
              height="400px"
            />

            <button onClick={() => setShowDirections(false)} className="btn-secondary w-full mt-4">
              Close
            </button>
          </motion.div>
        </div>
      )}

      {/* Review Modal */}
      <AnimatePresence>
        {showReview && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowReview(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Rate Your Experience</h2>
                <button onClick={() => setShowReview(null)} className="text-gray-400 hover:text-gray-600" aria-label="Close review form">
                  <FiX size={20} />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {getBookingDisplay(showReview).lotName} - Slot {getBookingDisplay(showReview).slotNumber}
              </p>

              {/* Star Rating */}
              <div className="flex items-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setReviewRating(star)}
                    className="focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded"
                    aria-label={`Rate ${star} of 5`}
                  >
                    <FiStar
                      size={28}
                      className={`transition ${star <= reviewRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                    />
                  </button>
                ))}
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{reviewRating}/5</span>
              </div>

              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your experience (optional)..."
                rows={4}
                maxLength={500}
                aria-label="Review comment"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 text-right mt-1">{reviewComment.length}/500</p>

              <button
                onClick={handleSubmitReview}
                className="w-full mt-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition"
              >
                Submit Review
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MyBookings;
