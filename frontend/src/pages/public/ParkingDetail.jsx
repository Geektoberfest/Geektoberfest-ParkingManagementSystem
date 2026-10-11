import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { connectSocket, joinLot, leaveLot } from '../../services/socket';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/helpers';
import {
  HiOutlineLocationMarker, HiOutlinePhone, HiOutlineMail,
  HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineX,
  HiOutlineClock, HiOutlineShieldCheck, HiOutlineStar,
  HiStar, HiOutlineExternalLink, HiOutlinePhotograph,
  HiOutlineExclamationCircle,
} from 'react-icons/hi';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const ParkingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [lot, setLot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  // Fetch full lot detail
  const fetchLot = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLot(null);
    try {
      const res = await api.get(`/parking-lots/${id}`);
      setLot(res.data.data);
    } catch (err) {
      const status = err.response?.status;

      if (status === 404) {
        setLoadError('not-found');
      } else if (status === 401) {
        setLoadError('unauthenticated');
      } else if (status === 403) {
        setLoadError('unauthorized');
      } else if (!err.response) {
        setLoadError('network-error');
        toast.error('Unable to reach the server. Please check your connection.');
      } else {
        setLoadError('server-error');
        toast.error(err.response?.data?.message || 'Failed to load parking lot details');
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { fetchLot(); }, [fetchLot]);

  // Real-time slot updates
  useEffect(() => {
    if (!lot?._id) return;
    const socket = connectSocket();
    joinLot(lot._id);
    socket.on('slotUpdate', (data) => {
      if (data.parkingLotId === lot._id) {
        setLot((prev) => {
          if (!prev) return prev;
          const updatedSlots = prev.slots.map((s) =>
            s._id === data.slotId ? { ...s, status: data.status } : s
          );
          return {
            ...prev,
            slots: updatedSlots,
            availableSlots: updatedSlots.filter((s) => s.status === 'available').length,
            occupiedSlots: updatedSlots.filter((s) => s.status !== 'available').length,
          };
        });
      }
    });
    return () => { leaveLot(lot._id); socket.off('slotUpdate'); };
  }, [lot?._id]);

  // Image helpers
  const getLotImages = useCallback((l) => {
    if (!l) return [];
    const imgs = [];
    if (l.image) imgs.push(l.image);
    if (l.images?.length) imgs.push(...l.images);
    return [...new Set(imgs)];
  }, []);

  const getImageUrl = useCallback((img) => {
    if (!img) return null;
    if (img.startsWith('http')) return img;
    return `${BACKEND_URL}${img.startsWith('/') ? '' : '/'}${img}`;
  }, []);

  const openDirections = () => {
    if (!lot?.locationCoordinates?.lat || !lot?.locationCoordinates?.lng) return;
    const dest = `${lot.locationCoordinates.lat},${lot.locationCoordinates.lng}`;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
  };

  const handleSubmitReview = async () => {
    if (!isAuthenticated) { toast.error('Please login to submit a review'); navigate('/login'); return; }
    if (!reviewForm.comment.trim()) { toast.error('Please write a comment'); return; }
    setSubmittingReview(true);
    try {
      // User must have a completed booking to review via the existing review system
      // As a convenience, we try posting directly; backend validates booking ownership.
      await api.post('/reviews', {
        parkingLotId: lot._id,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      });
      toast.success('Review submitted!');
      setReviewForm({ rating: 5, comment: '' });
      fetchLot();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit review';
      toast.error(msg);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  if (loadError) {
    const isMissingLot = loadError === 'not-found';
    const needsLogin = loadError === 'unauthenticated';
    const isUnauthorized = loadError === 'unauthorized';
    const isNetworkError = loadError === 'network-error';

    const title = isMissingLot
      ? 'Parking lot not found'
      : needsLogin
        ? 'Please sign in to continue'
        : isUnauthorized
          ? 'You do not have access to this parking lot'
          : isNetworkError
            ? 'Unable to reach the server'
            : 'Unable to load this parking lot';

    const message = isMissingLot
      ? 'This parking lot may have been removed or the link is no longer valid.'
      : needsLogin
        ? 'Your session may have expired. Sign in and try again.'
        : isUnauthorized
          ? 'Your account is not permitted to view this parking lot.'
          : isNetworkError
            ? 'Please check your connection and try again.'
            : 'The server could not load this parking lot. Please try again later.';

    return (
      <main className="min-h-screen px-4 py-12 sm:px-6" aria-labelledby="parking-load-title">
        <section className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-dark-border dark:bg-dark-card sm:p-10">
          <HiOutlineExclamationCircle size={44} className="text-primary-600" aria-hidden="true" />
          <h1 id="parking-load-title" className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-3 text-gray-600 dark:text-gray-300">
            {message}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {isMissingLot || isUnauthorized ? (
              <Link to="/parking" className="btn-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card">
                Browse parking lots
              </Link>
            ) : needsLogin ? (
              <Link to="/login" className="btn-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card">
                Sign in
              </Link>
            ) : (
              <button type="button" onClick={fetchLot} className="btn-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card">
                Try again
              </button>
            )}
            <button type="button" onClick={() => navigate('/nearby')} className="btn-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card">
              View nearby parking
            </button>
          </div>
        </section>
      </main>
    );
  }
  if (!lot) return null;

  const images = getLotImages(lot);
  const available = lot.availableSlots ?? lot.slots?.filter((s) => s.status === 'available').length ?? 0;
  const occupied = lot.occupiedSlots ?? (lot.totalSlots - available);
  const stats = lot.reviewStats || { totalReviews: 0, avgRating: 0, ratingDistribution: [] };
  const reviews = lot.reviews || [];
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 4);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg">
      {/* Fullscreen Image Modal */}
      <AnimatePresence>
        {fullscreenImage !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center"
            onClick={() => setFullscreenImage(null)}
          >
            <button className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10" onClick={() => setFullscreenImage(null)}>
              <HiOutlineX size={28} />
            </button>
            <img
              src={getImageUrl(images[fullscreenImage])}
              alt=""
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            {images.length > 1 && (
              <>
                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2"
                  onClick={(e) => { e.stopPropagation(); setFullscreenImage((p) => (p - 1 + images.length) % images.length); }}
                >
                  <HiOutlineChevronLeft size={24} />
                </button>
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2"
                  onClick={(e) => { e.stopPropagation(); setFullscreenImage((p) => (p + 1) % images.length); }}
                >
                  <HiOutlineChevronRight size={24} />
                </button>
              </>
            )}
            <div className="absolute bottom-4 text-white/70 text-sm">
              {fullscreenImage + 1} / {images.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Back Button */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4">
          <HiOutlineChevronLeft size={16} /> Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN — Main Details */}
          <div className="lg:col-span-2 space-y-6">

            {/* ===== IMAGE GALLERY ===== */}
            {images.length > 0 ? (
              <div className="space-y-2">
                {/* Cover Image */}
                <div className="relative rounded-2xl overflow-hidden bg-gray-200 dark:bg-dark-border h-64 sm:h-80 cursor-pointer" onClick={() => setFullscreenImage(imageIndex)}>
                  <img
                    src={getImageUrl(images[imageIndex])}
                    alt={lot.name}
                    className="w-full h-full object-cover transition-transform duration-300"
                    onError={(e) => { e.target.src = 'https://via.placeholder.com/800x400?text=Parking'; }}
                  />
                  {images.length > 1 && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setImageIndex((p) => (p - 1 + images.length) % images.length); }}
                        className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition">
                        <HiOutlineChevronLeft size={20} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setImageIndex((p) => (p + 1) % images.length); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition">
                        <HiOutlineChevronRight size={20} />
                      </button>
                    </>
                  )}
                  <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                    <HiOutlinePhotograph size={12} /> {imageIndex + 1}/{images.length}
                  </div>
                </div>
                {/* Thumbnail Grid */}
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {images.map((img, idx) => (
                      <button key={idx} onClick={() => setImageIndex(idx)}
                        className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition ${idx === imageIndex ? 'border-primary-500 ring-2 ring-primary-300' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                        <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-gray-100 dark:bg-dark-border h-48 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <HiOutlinePhotograph size={48} className="mx-auto mb-2 opacity-50" />
                  <p>No photos available</p>
                </div>
              </div>
            )}

            {/* ===== HEADER INFO ===== */}
            <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-100 dark:border-dark-border">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{lot.name}</h1>
                  <p className="text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                    <HiOutlineLocationMarker size={16} />
                    {lot.address}{lot.area ? `, ${lot.area}` : ''}, {lot.city}
                  </p>
                  {lot.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{lot.description}</p>
                  )}
                </div>
                {/* Rating badge */}
                {stats.totalReviews > 0 && (
                  <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-xl">
                    <HiStar size={20} className="text-yellow-500" />
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{stats.avgRating}</span>
                    <span className="text-xs text-gray-500">({stats.totalReviews})</span>
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{available}</p>
                  <p className="text-xs text-green-700 dark:text-green-400">Available</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{occupied}</p>
                  <p className="text-xs text-red-600 dark:text-red-400">Occupied</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{lot.totalSlots}</p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">Total Slots</p>
                </div>
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-primary-600">{formatCurrency(lot.pricePerHour)}</p>
                  <p className="text-xs text-primary-700 dark:text-primary-400">Per Hour</p>
                </div>
              </div>
            </div>

            {/* ===== PARKING DETAILS ===== */}
            <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-100 dark:border-dark-border">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Parking Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <DetailItem icon="🏢" label="Floors" value={lot.totalFloors} />
                <DetailItem icon="🅿️" label="Parking Type" value={
                  lot.parkingType === 'car' ? 'Car Only' : lot.parkingType === 'bike' ? 'Bike Only' : 'Car & Bike'
                } />
                <DetailItem icon={<HiOutlineClock size={18} />} label="Hours" value={`${lot.operatingHours?.open || '06:00'} – ${lot.operatingHours?.close || '22:00'}`} />
                <DetailItem icon="🛡️" label="Security" value={lot.securityAvailable ? '✅ Yes' : '❌ No'} />
                <DetailItem icon="📹" label="CCTV" value={lot.cctvAvailable ? '✅ Yes' : '❌ No'} />
                <DetailItem icon="⚡" label="EV Charging" value={lot.evChargingAvailable ? '✅ Yes' : '❌ No'} />
              </div>
              {lot.amenities?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-border">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amenities</p>
                  <div className="flex flex-wrap gap-2">
                    {lot.amenities.map((a, i) => (
                      <span key={i} className="text-xs bg-gray-100 dark:bg-dark-border text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-full">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ===== REAL-TIME SLOT STATUS ===== */}
            <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-100 dark:border-dark-border">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Real-Time Slot Status</h2>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-green-500" /> <span className="text-sm text-gray-600 dark:text-gray-400">Available ({available})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500" /> <span className="text-sm text-gray-600 dark:text-gray-400">Occupied ({occupied})</span>
                </div>
              </div>
              {/* Slot capacity bar */}
              <div className="w-full bg-gray-200 dark:bg-dark-border rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${available === 0 ? 'bg-red-500' : available < lot.totalSlots * 0.2 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${lot.totalSlots > 0 ? (available / lot.totalSlots) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-right">{lot.totalSlots > 0 ? Math.round((available / lot.totalSlots) * 100) : 0}% available</p>

              {/* Floor-wise breakdown */}
              {lot.floors?.length > 0 && (
                <div className="mt-4 space-y-2">
                  {lot.floors.map((floor) => {
                    const floorSlots = lot.slots?.filter((s) => (s.floorId?._id || s.floorId) === floor._id) || [];
                    const floorAvail = floorSlots.filter((s) => s.status === 'available').length;
                    return (
                      <div key={floor._id} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">{floor.label || `Floor ${floor.floorNumber}`}</span>
                        <div className="flex-1 bg-gray-100 dark:bg-dark-border rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${floorAvail === 0 ? 'bg-red-400' : 'bg-green-400'}`}
                            style={{ width: `${floorSlots.length > 0 ? (floorAvail / floorSlots.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">{floorAvail}/{floorSlots.length}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ===== REVIEWS & RATINGS ===== */}
            <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-100 dark:border-dark-border">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Reviews & Ratings</h2>

              {/* Stats Summary */}
              <div className="flex items-start gap-6 mb-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-gray-900 dark:text-white">{stats.avgRating || '—'}</p>
                  <div className="flex items-center justify-center gap-0.5 my-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <HiStar key={s} size={16} className={s <= Math.round(stats.avgRating) ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">{stats.totalReviews} review{stats.totalReviews !== 1 ? 's' : ''}</p>
                </div>
                {/* Distribution bars */}
                <div className="flex-1 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const d = stats.ratingDistribution?.find((r) => r.star === star);
                    const count = d?.count || 0;
                    const pct = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-3">{star}</span>
                        <HiStar size={12} className="text-yellow-400" />
                        <div className="flex-1 bg-gray-100 dark:bg-dark-border rounded-full h-2 overflow-hidden">
                          <div className="bg-yellow-400 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Review List */}
              {displayedReviews.length > 0 ? (
                <div className="space-y-4 mb-4">
                  {displayedReviews.map((review) => (
                    <div key={review._id} className="border-b border-gray-50 dark:border-dark-border pb-3 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                          {review.userId?.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{review.userId?.name || 'User'}</p>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <HiStar key={s} size={12} className={s <= review.rating ? 'text-yellow-400' : 'text-gray-300'} />
                            ))}
                            <span className="text-[10px] text-gray-400 ml-1">{new Date(review.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      {review.comment && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 ml-11">{review.comment}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-4">No reviews yet. Be the first to review!</p>
              )}

              {reviews.length > 4 && (
                <button onClick={() => setShowAllReviews(!showAllReviews)} className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-4">
                  {showAllReviews ? 'Show less' : `Show all ${reviews.length} reviews`}
                </button>
              )}

              {/* Add Review (informational — reviews require completed booking via existing system) */}
              {isAuthenticated && (
                <div className="border-t border-gray-100 dark:border-dark-border pt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Leave a Review</p>
                  <p className="text-xs text-gray-400 mb-3">You can review after completing a booking from My Bookings.</p>
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} onClick={() => setReviewForm((f) => ({ ...f, rating: s }))}>
                        <HiStar size={24} className={s <= reviewForm.rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'} />
                      </button>
                    ))}
                    <span className="text-sm text-gray-500 ml-2">{reviewForm.rating}/5</span>
                  </div>
                  <textarea
                    className="input-field min-h-[60px]"
                    placeholder="Share your experience..."
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
                    maxLength={500}
                    rows={2}
                  />
                  <p className="text-xs text-gray-400 mt-1">{reviewForm.comment.length}/500</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — Map + Contact + Actions */}
          <div className="space-y-6">
            {/* ===== MAP ===== */}
            {lot.locationCoordinates?.lat && lot.locationCoordinates?.lng ? (
              <div className="bg-white dark:bg-dark-card rounded-2xl overflow-hidden border border-gray-100 dark:border-dark-border">
                <iframe
                  title="Parking Location"
                  width="100%"
                  height="250"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${lot.locationCoordinates.lng - 0.005},${lot.locationCoordinates.lat - 0.005},${lot.locationCoordinates.lng + 0.005},${lot.locationCoordinates.lat + 0.005}&layer=mapnik&marker=${lot.locationCoordinates.lat},${lot.locationCoordinates.lng}`}
                />
                <div className="p-4 space-y-2">
                  <button onClick={openDirections}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                    <HiOutlineExternalLink size={16} /> Get Directions
                  </button>
                  <p className="text-[10px] text-gray-400 text-center">Opens Google Maps</p>
                </div>
              </div>
            ) : null}

            {/* ===== BOOK SLOT CTA ===== */}
            <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl p-6 text-white">
              <h3 className="text-lg font-bold mb-1">Book a Slot</h3>
              <p className="text-primary-100 text-sm mb-4">Reserve your parking spot instantly</p>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold">{formatCurrency(lot.pricePerHour)}</span>
                <span className="text-primary-200">/hour</span>
              </div>
              <button
                onClick={() => {
                  if (!isAuthenticated) { toast.error('Please login to book'); navigate('/login'); return; }
                  navigate(`/dashboard/book/${lot._id}`);
                }}
                className="w-full bg-white text-primary-700 font-bold py-3 rounded-xl hover:bg-primary-50 transition-colors"
              >
                🅿️ View Slots & Book Now
              </button>
            </div>

            {/* ===== CONTACT INFO ===== */}
            <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-100 dark:border-dark-border">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Contact Information</h2>
              <div className="space-y-3">
                {lot.ownerName && (
                  <ContactRow icon={<span className="text-base">👤</span>} label="Owner" value={lot.ownerName} />
                )}
                {lot.ownerPhone && (
                  <ContactRow icon={<HiOutlinePhone size={16} className="text-gray-400" />} label="Owner Phone" value={lot.ownerPhone} href={`tel:${lot.ownerPhone}`} />
                )}
                {lot.ownerEmail && (
                  <ContactRow icon={<HiOutlineMail size={16} className="text-gray-400" />} label="Owner Email" value={lot.ownerEmail} href={`mailto:${lot.ownerEmail}`} />
                )}
                {lot.contactPhone && (
                  <ContactRow icon={<HiOutlinePhone size={16} className="text-green-500" />} label="Support Phone" value={lot.contactPhone} href={`tel:${lot.contactPhone}`} />
                )}
                {lot.contactEmail && (
                  <ContactRow icon={<HiOutlineMail size={16} className="text-blue-500" />} label="Support Email" value={lot.contactEmail} href={`mailto:${lot.contactEmail}`} />
                )}
                {lot.managerContact && (
                  <ContactRow icon={<HiOutlineShieldCheck size={16} className="text-purple-500" />} label="Manager" value={lot.managerContact} href={`tel:${lot.managerContact}`} />
                )}
              </div>

              {/* Quick action buttons */}
              <div className="flex gap-2 mt-4">
                {(lot.contactPhone || lot.ownerPhone) && (
                  <a
                    href={`tel:${lot.contactPhone || lot.ownerPhone}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 text-green-700 dark:text-green-400 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    <HiOutlinePhone size={16} /> Call
                  </a>
                )}
                {(lot.contactEmail || lot.ownerEmail) && (
                  <a
                    href={`mailto:${lot.contactEmail || lot.ownerEmail}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 text-blue-700 dark:text-blue-400 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    <HiOutlineMail size={16} /> Email
                  </a>
                )}
              </div>
            </div>

            {/* ===== OPERATING HOURS ===== */}
            <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-100 dark:border-dark-border">
              <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <HiOutlineClock size={18} /> Operating Hours
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {lot.operatingHours?.open || '06:00'} — {lot.operatingHours?.close || '22:00'}
                </span>
                <IsOpenBadge open={lot.operatingHours?.open} close={lot.operatingHours?.close} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ===== Sub-components ===== */

const DetailItem = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-border/50 rounded-xl">
    <span className="text-lg">{icon}</span>
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  </div>
);

const ContactRow = ({ icon, label, value, href }) => (
  <div className="flex items-center gap-3">
    {icon}
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
      {href ? (
        <a href={href} className="text-sm text-primary-600 hover:text-primary-700 font-medium truncate block">{value}</a>
      ) : (
        <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{value}</p>
      )}
    </div>
  </div>
);

const IsOpenBadge = ({ open, close }) => {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isOpen = currentTime >= (open || '06:00') && currentTime <= (close || '22:00');
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOpen ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
      {isOpen ? 'Open Now' : 'Closed'}
    </span>
  );
};

export default ParkingDetail;
