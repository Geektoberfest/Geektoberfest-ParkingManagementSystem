import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency } from '../../utils/helpers';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlineLocationMarker, HiOutlineExternalLink, HiOutlineClock, HiOutlinePhotograph, HiOutlineSearch, HiOutlineFilter, HiX } from 'react-icons/hi';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const ParkingListPanel = ({ lots, selectedLot, onSelect, onViewSlots, userLocation }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [routeData, setRouteData] = useState({});
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all'); // 'all' | 'available'
  const [zoneFilter, setZoneFilter] = useState('all');
  const [slotTypeFilter, setSlotTypeFilter] = useState('all');

  // Extract unique zones for filter dropdown
  const uniqueZones = [...new Set(lots.map((l) => l.zone || l.city).filter(Boolean))];

  // Calculate distance between two coordinates (Haversine)
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

  const formatDistance = (km) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)} km`);
  const formatDuration = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  // Filter and Sort lots
  const filteredLots = lots.filter((lot) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      lot.name?.toLowerCase().includes(query) ||
      lot.address?.toLowerCase().includes(query) ||
      lot.zone?.toLowerCase().includes(query) ||
      lot.city?.toLowerCase().includes(query);

    const matchesAvailability =
      availabilityFilter === 'all' || (lot.availableSlots ?? lot.totalSlots) > 0;

    const matchesZone =
      zoneFilter === 'all' || lot.zone === zoneFilter || lot.city === zoneFilter;

    const matchesSlotType =
      slotTypeFilter === 'all' ||
      lot.slotTypes?.includes(slotTypeFilter) ||
      lot.type === slotTypeFilter;

    return matchesSearch && matchesAvailability && matchesZone && matchesSlotType;
  });

  const sortedLots = userLocation
    ? [...filteredLots]
        .filter((l) => l.locationCoordinates?.lat && l.locationCoordinates?.lng)
        .map((l) => ({
          ...l,
          distance: getDistance(
            userLocation[0], userLocation[1],
            l.locationCoordinates.lat, l.locationCoordinates.lng
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
    : filteredLots;

  // Fetch driving routes for all filtered lots when user location changes
  useEffect(() => {
    if (!userLocation || sortedLots.length === 0) return;

    const fetchRoutes = async () => {
      setLoadingRoutes(true);
      const results = {};
      const batches = [];
      for (let i = 0; i < sortedLots.length; i += 5) {
        batches.push(sortedLots.slice(i, i + 5));
      }

      for (const batch of batches) {
        await Promise.all(
          batch.map(async (lot) => {
            if (!lot.locationCoordinates?.lat || !lot.locationCoordinates?.lng) return;
            try {
              const url = `https://router.project-osrm.org/route/v1/driving/${userLocation[1]},${userLocation[0]};${lot.locationCoordinates.lng},${lot.locationCoordinates.lat}?overview=false`;
              const res = await fetch(url);
              const data = await res.json();
              if (data.routes?.[0]) {
                results[lot._id] = {
                  distance: data.routes[0].distance / 1000,
                  duration: data.routes[0].duration,
                };
              }
            } catch {
              // Fallback
            }
          })
        );
      }
      setRouteData(results);
      setLoadingRoutes(false);
    };

    fetchRoutes();
  }, [userLocation, sortedLots.length]);

  const openDirections = (lot) => {
    if (!lot.locationCoordinates?.lat || !lot.locationCoordinates?.lng) return;
    const dest = `${lot.locationCoordinates.lat},${lot.locationCoordinates.lng}`;
    const url = userLocation
      ? `https://www.google.com/maps/dir/${userLocation[0]},${userLocation[1]}/${dest}`
      : `https://www.google.com/maps/search/?api=1&query=${dest}`;
    window.open(url, '_blank');
  };

  const getLotImages = (lot) => {
    const imgs = [];
    if (lot.image) imgs.push(lot.image);
    if (lot.images?.length) imgs.push(...lot.images);
    return [...new Set(imgs)];
  };

  const getImageUrl = (img) => {
    if (!img) return null;
    if (img.startsWith('http')) return img;
    return `${BACKEND_URL}${img.startsWith('/') ? '' : '/'}${img}`;
  };

  const clearFilters = () => {
    setSearchQuery('');
    setAvailabilityFilter('all');
    setZoneFilter('all');
    setSlotTypeFilter('all');
  };

  const hasActiveFilters = searchQuery || availabilityFilter !== 'all' || zoneFilter !== 'all' || slotTypeFilter !== 'all';

  return (
    <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-16rem)] pr-1 custom-scrollbar">
      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-dark-card p-3 rounded-xl border border-gray-100 dark:border-dark-border space-y-2.5 shadow-sm">
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by zone, name, or location..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50 dark:bg-dark-border/50 border border-gray-200 dark:border-dark-border rounded-lg focus:outline-none focus:border-primary-500 text-gray-800 dark:text-gray-100 placeholder-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <HiX size={14} />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-3 gap-1.5">
          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value)}
            className="text-[11px] bg-gray-50 dark:bg-dark-border/50 border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Status</option>
            <option value="available">Available Only</option>
          </select>

          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="text-[11px] bg-gray-50 dark:bg-dark-border/50 border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Zones</option>
            {uniqueZones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          <select
            value={slotTypeFilter}
            onChange={(e) => setSlotTypeFilter(e.target.value)}
            className="text-[11px] bg-gray-50 dark:bg-dark-border/50 border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Types</option>
            <option value="Car">Car</option>
            <option value="Bike">Bike</option>
            <option value="EV">EV Charging</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-primary-600 dark:text-primary-400 font-medium">Filters applied</span>
            <button
              onClick={clearFilters}
              className="text-[11px] text-red-500 hover:underline flex items-center gap-0.5 font-medium"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium px-1">
        {sortedLots.length} parking location{sortedLots.length !== 1 ? 's' : ''} found
        {loadingRoutes && <span className="ml-2 text-xs text-primary-500 animate-pulse">• Calculating routes...</span>}
      </p>

      {sortedLots.map((lot, i) => {
        const route = routeData[lot._id];
        const images = getLotImages(lot);

        return (
          <motion.div
            key={lot._id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect?.(lot)}
            className={`rounded-xl border-2 cursor-pointer transition-all duration-200 overflow-hidden ${
              selectedLot?._id === lot._id
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-100 dark:border-dark-border bg-white dark:bg-dark-card hover:border-primary-300'
            }`}
          >
            {images.length > 0 && (
              <div className="relative h-32 overflow-hidden bg-gray-100 dark:bg-dark-border">
                <div className="flex overflow-x-auto snap-x snap-mandatory h-full scrollbar-hide">
                  {images.map((img, idx) => (
                    <img
                      key={idx}
                      src={getImageUrl(img)}
                      alt={`${lot.name} - ${idx + 1}`}
                      className="h-full w-full object-cover snap-center flex-shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ))}
                </div>
                {images.length > 1 && (
                  <div className="absolute bottom-1.5 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    <HiOutlinePhotograph size={10} className="inline mr-0.5" />
                    {images.length}
                  </div>
                )}
              </div>
            )}

            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">{lot.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                    <HiOutlineLocationMarker size={12} />
                    {lot.address}, {lot.city}
                  </p>
                </div>
                {lot.distance !== undefined && (
                  <span className="text-xs font-semibold text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full whitespace-nowrap ml-2">
                    {lot.distance < 1
                      ? `${Math.round(lot.distance * 1000)}m`
                      : `${lot.distance.toFixed(1)}km`}
                  </span>
                )}
              </div>

              {(route || lot.distance !== undefined) && (
                <div className="flex items-center gap-3 mt-2 text-xs">
                  {route ? (
                    <>
                      <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        🚗 {formatDistance(route.distance)}
                      </span>
                      <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        <HiOutlineClock size={12} /> {formatDuration(route.duration)}
                      </span>
                    </>
                  ) : lot.distance !== undefined ? (
                    <span className="text-gray-500 dark:text-gray-400 italic">
                      ~{formatDistance(lot.distance)} straight-line
                    </span>
                  ) : null}
                </div>
              )}

              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-semibold text-green-600">
                      {lot.availableSlots ?? lot.totalSlots}/{lot.totalSlots} slots
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="font-semibold text-blue-600">
                      {formatCurrency(lot.pricePerHour)}/hr
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/parking/${lot._id}`);
                  }}
                  className="flex-1 text-xs bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors text-center"
                >
                  View Details
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAuthenticated) {
                      toast.error('Please login to view slots and book');
                      navigate('/login', { state: { from: `/dashboard/book/${lot._id}` } });
                      return;
                    }
                    if (onViewSlots) {
                      onViewSlots(lot);
                    } else {
                      navigate(`/dashboard/book/${lot._id}`);
                    }
                  }}
                  className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors text-center"
                >
                  Book Now
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDirections(lot);
                  }}
                  className="text-xs bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold py-2 px-3 rounded-lg transition-colors flex items-center gap-1"
                >
                  <HiOutlineExternalLink size={14} />
                  Directions
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}

      {sortedLots.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-white dark:bg-dark-card rounded-xl border border-gray-100 dark:border-dark-border p-6">
          <p className="text-4xl mb-2">🔍</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">No parking locations found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your search query or filters.</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium px-3 py-1.5 rounded-lg"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ParkingListPanel;