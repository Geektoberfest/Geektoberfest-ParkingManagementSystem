import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DirectionMap from '../../components/map/DirectionMap';
import toast from 'react-hot-toast';
import { formatCurrency, formatDateTime, getStatusBadge } from '../../utils/helpers';
import { QRCodeSVG } from 'qrcode.react';
import { HiOutlineLocationMarker, HiOutlineMap, HiOutlineExclamation } from 'react-icons/hi';
import { FiStar, FiLogIn, FiLogOut, FiDownload, FiX } from 'react-icons/fi';
import { getSocket } from '../../services/socket';
import { loadRazorpayCheckout } from '../../utils/razorpay';

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

const MyBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showDirections, setShowDirections] = useState(false);
  const [directionsBooking, setDirectionsBooking] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [payingBookingId, setPayingBookingId] = useState(null);

  // Re-fetch bookings whenever the logged-in user changes
  useEffect(() => {
    setBookings([]);
    setSelectedBooking(null);
    setFilter('all');
    setLoading(true);
    fetchBookings();
  }, [user?._id]);

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

  // Listen for real-time booking expiry
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleExpired = ({ bookingId }) => {
      setBookings((prev) =>
        prev.map((b) => (b._id === bookingId ? { ...b, bookingStatus: 'expired' } : b))
      );
      toast('A booking has expired', { icon: '⏰' });
    };
    socket.on('bookingExpired', handleExpired);
    return () => socket.off('bookingExpired', handleExpired);
  }, []);

  const fetchBookings = async () => {
    try {
      const res = await api.get('/bookings/user');
      setBookings(res.data.data);
    } catch (err) {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
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
    setPayingBookingId(bookingId);
    try {
      // The amount used below comes only from the authenticated server response.
      const [fareRes, orderRes] = await Promise.all([
        api.get(`/payments/fare/${bookingId}`),
        api.post('/payments/orders', { bookingId }),
      ]);
      const fare = fareRes.data.data.fareBreakdown;
      const checkout = orderRes.data.data;
      const checkoutLoaded = await loadRazorpayCheckout();
      if (!checkoutLoaded) {
        toast.error('Secure checkout could not be loaded. Please try again.');
        setPayingBookingId(null);
        return;
      }

      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        name: 'SmartPark',
        description: `${fare.billableHours} started hour(s) of parking`,
        order_id: checkout.orderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phoneNumber || '',
        },
        theme: { color: '#2563eb' },
        handler: async (response) => {
          try {
            const verification = await api.post('/payments/verify', response);
            if (verification.data.success) {
              toast.success('Payment verified successfully.');
              fetchBookings();
            } else {
              toast('Payment is awaiting confirmation. We will update the booking shortly.', { icon: '⏳' });
            }
          } catch (err) {
            toast.error(err.response?.data?.message || 'We could not verify the payment yet. Please retry shortly.');
          } finally {
            setPayingBookingId(null);
          }
        },
        modal: {
          ondismiss: () => setPayingBookingId(null),
        },
      });
      razorpay.on('payment.failed', () => {
        toast.error('Payment was not completed. You can retry securely.');
        setPayingBookingId(null);
      });
      razorpay.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
      setPayingBookingId(null);
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

  // Review
  const [showReview, setShowReview] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

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
      // First get payment for this booking
      const paymentsRes = await api.get('/payments/history');
      const payment = paymentsRes.data.data.find((p) => p.bookingId === bookingId || p.bookingId?._id === bookingId);
      if (!payment) return toast.error('No payment found for this booking');

      const receiptRes = await api.get(`/payments/receipt/${payment._id}`);
      const receipt = receiptRes.data.data;

      // Generate a simple receipt text file
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

  const filtered = filter === 'all' ? bookings : bookings.filter((b) => b.bookingStatus === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Bookings</h1>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors">
            <FiDownload size={14} /> CSV
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors">
            <FiDownload size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'confirmed', 'active', 'completed', 'expired', 'cancelled'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-dark-card text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-border'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

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
              <div className="flex justify-between">
                <span className="text-gray-500">Parking Lot</span>
                <span className="font-medium">{selectedBooking.parkingLotId?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Slot</span>
                <span className="font-medium">{selectedBooking.slotId?.slotNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vehicle</span>
                <span className="font-medium">{selectedBooking.vehicleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Start</span>
                <span className="font-medium">{formatDateTime(selectedBooking.startTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">End</span>
                <span className="font-medium">{formatDateTime(selectedBooking.endTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="font-medium">{selectedBooking.duration} hrs</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t">
                <span>Total</span>
                <span className="text-primary-600">{formatCurrency(selectedBooking.totalAmount)}</span>
              </div>
              {selectedBooking.fareBreakdown?.totalAmountPaise > 0 && (
                <div className="rounded-lg bg-primary-50 dark:bg-primary-900/20 p-3 space-y-1.5 text-sm">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">Server-calculated fare</p>
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>Started hours</span>
                    <span>{selectedBooking.fareBreakdown.billableHours}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>Hourly rate</span>
                    <span>{formatCurrency(selectedBooking.fareBreakdown.hourlyRatePaise / 100)}</span>
                  </div>
                  {selectedBooking.fareBreakdown.additionalChargesPaise > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>Additional charges</span>
                      <span>{formatCurrency(selectedBooking.fareBreakdown.additionalChargesPaise / 100)}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">{selectedBooking.fareBreakdown.pricingPolicy}</p>
                </div>
              )}
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

      {/* Bookings List */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((b) => (
            <motion.div
              key={b._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card hover:shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-gray-900 dark:text-white">
                      {b.parkingLotId?.name || 'Parking Lot'}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(b.bookingStatus)}`}>
                      {b.bookingStatus}
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <div>
                      <span className="text-xs text-gray-400">Slot</span>
                      <p className="font-medium text-gray-700 dark:text-gray-300">{b.slotId?.slotNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">Date</span>
                      <p className="font-medium text-gray-700 dark:text-gray-300">{formatDateTime(b.startTime)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">Duration</span>
                      <p className="font-medium text-gray-700 dark:text-gray-300">{b.duration} hrs</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">Amount</span>
                      <p className="font-bold text-primary-600">{formatCurrency(b.totalAmount)}</p>
                    </div>
                  </div>
                  {b.fareBreakdown?.totalAmountPaise > 0 && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Server-calculated: {b.fareBreakdown.billableHours} started hour(s) × {formatCurrency(b.fareBreakdown.hourlyRatePaise / 100)}
                    </p>
                  )}

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
                    className="btn-secondary text-sm py-1.5 px-3"
                  >
                    View
                  </button>
                  {/* Get Directions button for confirmed/active bookings */}
                  {['confirmed', 'active'].includes(b.bookingStatus) && b.parkingLotId?.locationCoordinates?.lat && (
                    <button
                      onClick={() => handleGetDirections(b)}
                      className="text-sm py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <HiOutlineMap size={14} />
                      Directions
                    </button>
                  )}
                  {/* Check-in for confirmed bookings */}
                  {b.bookingStatus === 'confirmed' && (
                    <button
                      onClick={() => handleCheckIn(b._id)}
                      className="text-sm py-1.5 px-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <FiLogIn size={14} /> Check In
                    </button>
                  )}
                  {/* Check-out for active bookings */}
                  {b.bookingStatus === 'active' && (
                    <button
                      onClick={() => handleCheckOut(b._id)}
                      className="text-sm py-1.5 px-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <FiLogOut size={14} /> Check Out
                    </button>
                  )}
                  {b.bookingStatus === 'confirmed' && b.paymentStatus !== 'completed' && (
                    <button
                      onClick={() => handlePay(b._id)}
                      disabled={payingBookingId === b._id}
                      className="btn-success text-sm py-1.5 px-3 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {payingBookingId === b._id ? 'Opening checkout…' : 'Pay Now'}
                    </button>
                  )}
                  {['confirmed', 'pending'].includes(b.bookingStatus) && b.paymentStatus !== 'completed' && (
                    <button
                      onClick={() => handleCancel(b._id)}
                      className="btn-danger text-sm py-1.5 px-3"
                    >
                      Cancel
                    </button>
                  )}
                  {/* Review for completed */}
                  {b.bookingStatus === 'completed' && (
                    <button
                      onClick={() => setShowReview(b)}
                      className="text-sm py-1.5 px-3 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <FiStar size={14} /> Review
                    </button>
                  )}
                  {/* Download receipt for completed & paid */}
                  {b.bookingStatus === 'completed' && b.paymentStatus === 'completed' && (
                    <button
                      onClick={() => handleDownloadReceipt(b._id)}
                      className="text-sm py-1.5 px-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <FiDownload size={14} /> Receipt
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12 text-gray-500">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-lg font-semibold">No bookings found</p>
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
                  Directions to {directionsBooking.parkingLotId?.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {directionsBooking.parkingLotId?.address}, {directionsBooking.parkingLotId?.city} 
                  {' · '}Slot: {directionsBooking.slotId?.slotNumber}
                </p>
              </div>
              <button
                onClick={() => setShowDirections(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
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
                <button onClick={() => setShowReview(null)} className="text-gray-400 hover:text-gray-600">
                  <FiX size={20} />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {showReview.parkingLotId?.name} - Slot {showReview.slotId?.slotNumber}
              </p>

              {/* Star Rating */}
              <div className="flex items-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setReviewRating(star)}
                    className="focus:outline-none"
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
