import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { connectSocket, joinLot, leaveLot } from '../../services/socket';
import MapView from '../../components/map/MapView';
import NearbySearchBar from '../../components/map/NearbySearchBar';
import ParkingListPanel from '../../components/map/ParkingListPanel';
import DirectionMap from '../../components/map/DirectionMap';
import ParkingSlotGrid from '../../components/parking/ParkingSlotGrid';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { formatCurrency, calculateDuration } from '../../utils/helpers';
import { HiOutlineArrowLeft, HiOutlineLocationMarker, HiOutlineMap, HiOutlineViewList, HiOutlinePhotograph, HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlinePhone, HiOutlineMail } from 'react-icons/hi';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const BookParking = () => {
  const { lotId } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [lots, setLots] = useState([]);
  const [filteredLots, setFilteredLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);

  // Slot selection & booking
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'slots' | 'booking' | 'directions'
  const [lotDetail, setLotDetail] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [bookedLot, setBookedLot] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);

  const [bookingForm, setBookingForm] = useState({
    vehicleNumber: user?.vehicleNumber || '',
    startTime: '',
    endTime: '',
  });

  // Fetch all parking lots
  useEffect(() => {
    const fetchLots = async () => {
      try {
        const res = await api.get('/parking-lots');
        setLots(res.data.data);
        setFilteredLots(res.data.data);
      } catch {
        toast.error('Failed to load parking locations');
      } finally {
        setLoading(false);
      }
    };
    fetchLots();
  }, []);

  // If lotId param is provided, directly open that lot's slots
  useEffect(() => {
    if (lotId && lots.length > 0) {
      const lot = lots.find((l) => l._id === lotId);
      if (lot) {
        handleViewSlots(lot);
      }
    }
  }, [lotId, lots]);

  // Get user location
  useEffect(() => {
    getUserLocation();
  }, []);

  useEffect(() => {
    if (user?.vehicleNumber) {
      setBookingForm((prev) => ({ ...prev, vehicleNumber: user.vehicleNumber }));
    }
  }, [user]);

  // Socket for real-time slot updates
  useEffect(() => {
    if (lotDetail?._id) {
      const socket = connectSocket();
      joinLot(lotDetail._id);
      socket.on('slotUpdate', (data) => {
        if (data.parkingLotId === lotDetail._id) {
          setSlots((prev) =>
            prev.map((s) => (s._id === data.slotId ? { ...s, status: data.status } : s))
          );
        }
      });
      return () => {
        leaveLot(lotDetail._id);
        socket.off('slotUpdate');
      };
    }
  }, [lotDetail?._id]);

  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
        toast.success('Location found!');
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('Location access denied. Please allow location access in your browser settings.');
        } else if (error.code === error.TIMEOUT) {
          toast.error('Location request timed out. Please try again.');
        } else {
          toast.error('Unable to get your location. Please try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
    );
  }, []);

  // Image helpers
  const getLotImages = useCallback((lot) => {
    if (!lot) return [];
    const imgs = [];
    if (lot.image) imgs.push(lot.image);
    if (lot.images?.length) imgs.push(...lot.images);
    return [...new Set(imgs)];
  }, []);

  const getImageUrl = useCallback((img) => {
    if (!img) return null;
    if (img.startsWith('http')) return img;
    return `${BACKEND_URL}${img.startsWith('/') ? '' : '/'}${img}`;
  }, []);

  const handleSearch = useCallback(
    (query) => {
      const q = query.toLowerCase();
      const filtered = lots.filter(
        (lot) =>
          lot.name.toLowerCase().includes(q) ||
          lot.city.toLowerCase().includes(q) ||
          lot.address.toLowerCase().includes(q)
      );
      setFilteredLots(filtered);
      if (filtered.length === 0) toast('No parking found', { icon: '🔍' });
    },
    [lots]
  );

  const handleSelectLot = useCallback((lot) => {
    setSelectedLot(lot);
  }, []);

  const handleViewSlots = useCallback(async (lot) => {
    setSlotsLoading(true);
    setViewMode('slots');
    setSelectedSlot(null);
    setImageIndex(0);
    try {
      const res = await api.get(`/parking-lots/${lot._id}`);
      setLotDetail(res.data.data);
      setSlots(res.data.data.slots || []);
    } catch {
      toast.error('Failed to load slots');
      setViewMode('map');
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const handleBackToMap = useCallback(() => {
    setViewMode('map');
    setLotDetail(null);
    setSlots([]);
    setSelectedSlot(null);
  }, []);

  const handleSlotSelect = useCallback((slot) => {
    setSelectedSlot(slot);
    setViewMode('booking');
  }, []);

  const duration =
    bookingForm.startTime && bookingForm.endTime
      ? calculateDuration(bookingForm.startTime, bookingForm.endTime)
      : 0;
  const totalCost = duration * (lotDetail?.pricePerHour || 0);

  const handleConfirmBooking = useCallback(async () => {
    if (!selectedSlot) return toast.error('Please select a slot');
    if (!bookingForm.startTime || !bookingForm.endTime) return toast.error('Select start and end time');
    if (!bookingForm.vehicleNumber) return toast.error('Enter vehicle number');
    if (new Date(bookingForm.endTime) <= new Date(bookingForm.startTime))
      return toast.error('End time must be after start time');

    setBookingInProgress(true);
    try {
      await api.post('/bookings/create', {
        slotId: selectedSlot._id,
        parkingLotId: lotDetail._id,
        startTime: bookingForm.startTime,
        endTime: bookingForm.endTime,
        vehicleNumber: bookingForm.vehicleNumber,
      });
      toast.success('🎉 Booking confirmed! Check My Bookings for QR code.');
      setBookedLot({ ...lotDetail });
      setViewMode('directions');
      setSelectedSlot(null);
      setBookingForm({ vehicleNumber: user?.vehicleNumber || '', startTime: '', endTime: '' });
      const res = await api.get('/parking-lots');
      setLots(res.data.data);
      setFilteredLots(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed');
    } finally {
      setBookingInProgress(false);
    }
  }, [selectedSlot, bookingForm, lotDetail, user]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="-m-4 md:-m-6 lg:-m-8">
      {/* Header */}
      <div className="bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              🗺️ Book Parking
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Search nearby, select a spot, and book instantly
            </p>
          </div>
          <button
            onClick={() => setShowMap(!showMap)}
            className="md:hidden btn-secondary text-xs py-2 px-3 flex items-center gap-1"
          >
            {showMap ? <><HiOutlineViewList size={14} /> Panel</> : <><HiOutlineMap size={14} /> Map</>}
          </button>
        </div>
        <NearbySearchBar onSearch={handleSearch} onLocateMe={getUserLocation} locating={locating} />
      </div>

      {/* Map + Panel */}
      <div className="flex flex-col md:flex-row" style={{ height: 'calc(100vh - 9rem)' }}>
        {/* Side Panel */}
        <div
          className={`${
            showMap ? 'hidden md:block' : 'block'
          } w-full md:w-[380px] bg-gray-50 dark:bg-dark-bg border-r border-gray-200 dark:border-dark-border overflow-hidden`}
        >
          <AnimatePresence mode="wait">
            {/* Parking List */}
            {viewMode === 'map' && (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-4 h-full overflow-y-auto"
              >
                <ParkingListPanel
                  lots={filteredLots}
                  selectedLot={selectedLot}
                  onSelect={handleSelectLot}
                  onViewSlots={handleViewSlots}
                  userLocation={userLocation}
                />
              </motion.div>
            )}

            {/* Slots Grid */}
            {viewMode === 'slots' && (
              <motion.div
                key="slots"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 h-full overflow-y-auto"
              >
                <button
                  onClick={handleBackToMap}
                  className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4"
                >
                  <HiOutlineArrowLeft size={16} />
                  Back to parking list
                </button>

                {slotsLoading ? (
                  <LoadingSpinner />
                ) : lotDetail ? (
                  <>
                    {/* Lot images carousel */}
                    {getLotImages(lotDetail).length > 0 && (
                      <div className="relative rounded-xl overflow-hidden mb-4 bg-gray-100 dark:bg-dark-border h-40">
                        <img
                          src={getImageUrl(getLotImages(lotDetail)[imageIndex] || getLotImages(lotDetail)[0])}
                          alt={lotDetail.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = 'https://via.placeholder.com/400x200?text=Parking'; }}
                        />
                        {getLotImages(lotDetail).length > 1 && (
                          <>
                            <button
                              onClick={() => setImageIndex((p) => (p - 1 + getLotImages(lotDetail).length) % getLotImages(lotDetail).length)}
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition"
                            >
                              <HiOutlineChevronLeft size={16} />
                            </button>
                            <button
                              onClick={() => setImageIndex((p) => (p + 1) % getLotImages(lotDetail).length)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition"
                            >
                              <HiOutlineChevronRight size={16} />
                            </button>
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                              {getLotImages(lotDetail).map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setImageIndex(idx)}
                                  className={`w-2 h-2 rounded-full transition ${idx === imageIndex ? 'bg-white scale-125' : 'bg-white/50'}`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                        <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                          <HiOutlinePhotograph size={10} />
                          {imageIndex + 1}/{getLotImages(lotDetail).length}
                        </div>
                      </div>
                    )}

                    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-100 dark:border-dark-border p-4 mb-4">
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg">{lotDetail.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                        <HiOutlineLocationMarker size={14} />
                        {lotDetail.address}, {lotDetail.city}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <span className="text-sm font-semibold text-green-600">
                          {slots.filter((s) => s.status === 'available').length} available
                        </span>
                        <span className="text-sm font-semibold text-primary-600">
                          {formatCurrency(lotDetail.pricePerHour)}/hr
                        </span>
                      </div>
                      {/* Contact Info */}
                      {(lotDetail.contactPhone || lotDetail.contactEmail) && (
                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-border space-y-1">
                          {lotDetail.contactPhone && (
                            <a href={`tel:${lotDetail.contactPhone}`} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5 hover:text-primary-600 transition">
                              <HiOutlinePhone size={13} /> {lotDetail.contactPhone}
                            </a>
                          )}
                          {lotDetail.contactEmail && (
                            <a href={`mailto:${lotDetail.contactEmail}`} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5 hover:text-primary-600 transition">
                              <HiOutlineMail size={13} /> {lotDetail.contactEmail}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">
                      Select a slot to book
                    </h4>
                    <ParkingSlotGrid
                      slots={slots}
                      onSlotClick={handleSlotSelect}
                      selectedSlot={selectedSlot}
                    />
                  </>
                ) : null}
              </motion.div>
            )}

            {/* Booking Form */}
            {viewMode === 'booking' && (
              <motion.div
                key="booking"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 h-full overflow-y-auto"
              >
                <button
                  onClick={() => setViewMode('slots')}
                  className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4"
                >
                  <HiOutlineArrowLeft size={16} />
                  Back to slots
                </button>

                {/* Lot images in booking view */}
                {getLotImages(lotDetail).length > 0 && (
                  <div className="rounded-xl overflow-hidden mb-4 bg-gray-100 dark:bg-dark-border">
                    <div className="flex overflow-x-auto snap-x snap-mandatory h-28 scrollbar-hide">
                      {getLotImages(lotDetail).map((img, idx) => (
                        <img
                          key={idx}
                          src={getImageUrl(img)}
                          alt={`${lotDetail?.name} - ${idx + 1}`}
                          className="h-full w-full object-cover snap-center flex-shrink-0"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-100 dark:border-dark-border p-4 mb-4">
                  <h3 className="font-bold text-gray-900 dark:text-white">{lotDetail?.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {lotDetail?.address}, {lotDetail?.city}
                  </p>
                  {/* Contact Info */}
                  {(lotDetail?.contactPhone || lotDetail?.contactEmail) && (
                    <div className="flex flex-wrap gap-3 mt-2">
                      {lotDetail.contactPhone && (
                        <a href={`tel:${lotDetail.contactPhone}`} className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 hover:text-primary-600 transition">
                          <HiOutlinePhone size={12} /> {lotDetail.contactPhone}
                        </a>
                      )}
                      {lotDetail.contactEmail && (
                        <a href={`mailto:${lotDetail.contactEmail}`} className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 hover:text-primary-600 transition">
                          <HiOutlineMail size={12} /> {lotDetail.contactEmail}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-4 border border-green-200 dark:border-green-800">
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                    ✅ Slot Selected: {selectedSlot?.slotNumber}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-0.5 capitalize">
                    Type: {selectedSlot?.vehicleType || 'car'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="MH 01 AB 1234"
                      value={bookingForm.vehicleNumber}
                      onChange={(e) => setBookingForm({ ...bookingForm, vehicleNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
                    <input
                      type="datetime-local"
                      className="input-field"
                      value={bookingForm.startTime}
                      onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                    <input
                      type="datetime-local"
                      className="input-field"
                      value={bookingForm.endTime}
                      onChange={(e) => setBookingForm({ ...bookingForm, endTime: e.target.value })}
                    />
                  </div>

                  {duration > 0 && (
                    <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4 space-y-2 border border-primary-200 dark:border-primary-800">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Duration</span>
                        <span className="font-medium text-gray-900 dark:text-white">{duration} hour(s)</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Rate</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatCurrency(lotDetail?.pricePerHour)}/hr
                        </span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t border-primary-200 dark:border-primary-700 pt-2">
                        <span className="text-gray-900 dark:text-white">Total</span>
                        <span className="text-primary-600">{formatCurrency(totalCost)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                        Estimate only — the server confirms the final fare from the parking-lot rate when you book.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleConfirmBooking}
                    disabled={bookingInProgress || !selectedSlot || duration <= 0}
                    className="btn-primary w-full disabled:opacity-50 text-base py-3"
                  >
                    {bookingInProgress ? '⏳ Booking...' : `🅿️ Confirm Booking — ${formatCurrency(totalCost)}`}
                  </button>
                  <p className="text-xs text-center text-gray-400">QR code will be generated after booking</p>
                </div>
              </motion.div>
            )}

            {/* Directions after booking */}
            {viewMode === 'directions' && bookedLot && (
              <motion.div
                key="directions"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="p-4 h-full overflow-y-auto"
              >
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-4 border border-green-200 dark:border-green-800 text-center">
                  <p className="text-3xl mb-2">🎉</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">Booking Confirmed!</p>
                  <p className="text-sm text-green-600 dark:text-green-500 mt-1">Navigate to your parking below</p>
                </div>

                <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-100 dark:border-dark-border p-3 mb-4">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">{bookedLot.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {bookedLot.address}, {bookedLot.city}
                  </p>
                </div>

                <DirectionMap parkingLot={bookedLot} userLocation={userLocation} height="250px" />

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => { setViewMode('map'); setBookedLot(null); setLotDetail(null); }}
                    className="btn-secondary flex-1"
                  >
                    ← Back to Map
                  </button>
                  <button
                    onClick={() => navigate('/dashboard/bookings')}
                    className="btn-primary flex-1"
                  >
                    My Bookings
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Map */}
        <div className={`flex-1 relative ${showMap ? 'block' : 'hidden md:block'}`} style={{ minHeight: '400px' }}>
          <MapView
            lots={filteredLots}
            userLocation={userLocation}
            onMarkerClick={handleSelectLot}
            onViewSlots={handleViewSlots}
            selectedLot={selectedLot}
            isAuthenticated={isAuthenticated}
            onLoginRequired={() => {}}
          />

          {/* Floating stats */}
          <div className="absolute top-4 right-4 z-[1000]">
            <div className="bg-white dark:bg-dark-card rounded-xl shadow-lg border border-gray-100 dark:border-dark-border px-4 py-2.5 flex items-center gap-4">
              <div className="text-center">
                <p className="text-lg font-bold text-primary-600">{filteredLots.length}</p>
                <p className="text-[10px] text-gray-500 leading-tight">Locations</p>
              </div>
              <div className="w-px h-8 bg-gray-200 dark:bg-dark-border" />
              <div className="text-center">
                <p className="text-lg font-bold text-green-600">
                  {filteredLots.reduce((sum, l) => sum + (l.availableSlots ?? l.totalSlots), 0)}
                </p>
                <p className="text-[10px] text-gray-500 leading-tight">Available</p>
              </div>
            </div>
          </div>

          {userLocation && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-white dark:bg-dark-card rounded-lg shadow-md border border-gray-100 dark:border-dark-border px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
              📍 {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookParking;
