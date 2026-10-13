import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import api from '../../services/api';
import { connectSocket } from '../../services/socket';
import ParkingLotCard from '../../components/parking/ParkingLotCard';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { HiOutlineSearch, HiOutlineFilter, HiOutlineRefresh } from 'react-icons/hi';
import { FiChevronDown } from 'react-icons/fi';

const MIN_PRICE = 0;
const MAX_PRICE = 500;
const DEFAULT_PRICE_RANGE = [MIN_PRICE, MAX_PRICE];
const DEFAULT_SORT = 'name';
const SEARCH_DEBOUNCE_MS = 350;
const REALTIME_REFRESH_MS = 800;

const SLOT_TYPE_ORDER = ['car', 'motorcycle', 'truck', 'ev'];
const SLOT_TYPE_LABELS = {
  car: 'Car',
  motorcycle: 'Motorcycle / Bike',
  truck: 'Truck',
  ev: 'EV',
};

const slotTypeLabel = (type) =>
  SLOT_TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);

const sortSlotTypes = (types) =>
  [...types].sort((a, b) => {
    const indexA = SLOT_TYPE_ORDER.indexOf(a);
    const indexB = SLOT_TYPE_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

const ParkingLots = () => {
  const [lots, setLots] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [priceRange, setPriceRange] = useState(DEFAULT_PRICE_RANGE);
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [slotTypeFilter, setSlotTypeFilter] = useState('all');
  const [filterOptions, setFilterOptions] = useState({ cities: [], areas: [], slotTypes: [] });
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  const requestRef = useRef(0);
  const fetchLotsRef = useRef(null);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLots = useCallback(
    async (signal) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      setError('');

      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (availabilityFilter !== 'all') params.availability = availabilityFilter;
      if (cityFilter !== 'all') params.city = cityFilter;
      if (zoneFilter !== 'all') params.area = zoneFilter;
      if (slotTypeFilter !== 'all') params.slotType = slotTypeFilter;
      if (priceRange[1] < MAX_PRICE) params.maxPrice = priceRange[1];

      try {
        const res = await api.get('/parking-lots', { params, signal });
        if (requestRef.current !== requestId) return;
        const data = Array.isArray(res.data?.data) ? res.data.data : [];
        setLots(data);
        setTotal(typeof res.data?.total === 'number' ? res.data.total : data.length);
      } catch (err) {
        if (requestRef.current !== requestId) return;
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        setLots([]);
        setError(
          err.response?.data?.message ||
            'Unable to load parking lots right now. Please check your connection and try again.'
        );
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [debouncedSearch, availabilityFilter, cityFilter, zoneFilter, slotTypeFilter, priceRange]
  );

  useEffect(() => {
    fetchLotsRef.current = fetchLots;
  }, [fetchLots]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLots(controller.signal);
    return () => controller.abort();
  }, [fetchLots]);

  // Filter choices are populated from real records (fetched once).
  useEffect(() => {
    let active = true;
    api
      .get('/parking-lots/filters')
      .then((res) => {
        if (!active) return;
        const data = res.data?.data || {};
        setFilterOptions({
          cities: Array.isArray(data.cities) ? data.cities : [],
          areas: Array.isArray(data.areas) ? data.areas : [],
          slotTypes: Array.isArray(data.slotTypes) ? data.slotTypes : [],
        });
        setOptionsLoaded(true);
      })
      .catch(() => {
        // Optional refinement: the listing still works without the choices.
      });
    return () => {
      active = false;
    };
  }, []);

  // Refresh the visible results when slot availability changes elsewhere.
  useEffect(() => {
    const socket = connectSocket();
    let timer = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fetchLotsRef.current?.();
      }, REALTIME_REFRESH_MS);
    };

    socket.on('slotUpdate', scheduleRefresh);
    socket.on('lotUpdate', scheduleRefresh);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off('slotUpdate', scheduleRefresh);
      socket.off('lotUpdate', scheduleRefresh);
    };
  }, []);

  const cityOptions = useMemo(() => {
    if (optionsLoaded) return filterOptions.cities;
    return [...new Set(lots.map((lot) => lot.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [optionsLoaded, filterOptions.cities, lots]);

  const zoneOptions = filterOptions.areas;
  const slotTypeOptions = useMemo(() => sortSlotTypes(filterOptions.slotTypes), [filterOptions.slotTypes]);

  const sortedLots = useMemo(() => {
    const list = [...lots];
    list.sort((a, b) => {
      if (sortBy === 'price-low') return a.pricePerHour - b.pricePerHour;
      if (sortBy === 'price-high') return b.pricePerHour - a.pricePerHour;
      if (sortBy === 'available') return b.availableSlots - a.availableSlots;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [lots, sortBy]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setAvailabilityFilter('all');
    setZoneFilter('all');
    setSlotTypeFilter('all');
    setCityFilter('all');
    setPriceRange([...DEFAULT_PRICE_RANGE]);
    setSortBy(DEFAULT_SORT);
  }, []);

  const activeFilterCount = [
    search.trim() !== '',
    availabilityFilter !== 'all',
    zoneFilter !== 'all',
    slotTypeFilter !== 'all',
    cityFilter !== 'all',
    priceRange[1] < MAX_PRICE,
    sortBy !== DEFAULT_SORT,
  ].filter(Boolean).length;

  const hasQuery = debouncedSearch !== '';

  return (
    <div className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
            Find <span className="text-primary-600">Parking</span>
          </h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Browse available parking locations near you
          </p>
        </motion.div>

        {/* Search + Filter Toggle */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <label htmlFor="parking-search" className="sr-only">
                Search parking lots
              </label>
              <HiOutlineSearch size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="parking-search"
                type="text"
                name="search"
                autoComplete="off"
                placeholder="Search by name, zone, city, address, or slot (e.g. F1-S2)..."
                className="input-field pl-12"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-controls="parking-filter-panel"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                showFilters || activeFilterCount > 0
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <HiOutlineFilter size={18} />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-white/20 text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-2xl mx-auto mb-8"
          >
            <div
              id="parking-filter-panel"
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-5 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 dark:text-white">Filters</h2>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:text-blue-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 px-1"
                >
                  Clear All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Price Range */}
                <div>
                  <label
                    htmlFor="parking-max-price"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Max Price (₹/hr)
                  </label>
                  <input
                    id="parking-max-price"
                    type="range"
                    min={MIN_PRICE}
                    max={MAX_PRICE}
                    step="10"
                    value={priceRange[1]}
                    onChange={(e) => setPriceRange([MIN_PRICE, parseInt(e.target.value, 10)])}
                    className="w-full accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                    {priceRange[1] >= MAX_PRICE ? 'Any price' : `Up to ₹${priceRange[1]}/hr`}
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label
                    htmlFor="parking-sort"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Sort By
                  </label>
                  <div className="relative">
                    <select
                      id="parking-sort"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="name">Name</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="available">Most Available</option>
                    </select>
                    <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Availability */}
                <div>
                  <label
                    htmlFor="parking-availability"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Availability
                  </label>
                  <div className="relative">
                    <select
                      id="parking-availability"
                      value={availabilityFilter}
                      onChange={(e) => setAvailabilityFilter(e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="all">All</option>
                      <option value="available">Available</option>
                      <option value="full">Full</option>
                    </select>
                    <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Zone */}
                <div>
                  <label
                    htmlFor="parking-zone"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Zone / Area
                  </label>
                  <div className="relative">
                    <select
                      id="parking-zone"
                      value={zoneFilter}
                      onChange={(e) => setZoneFilter(e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="all">All Zones</option>
                      {zoneOptions.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Slot type */}
                <div>
                  <label
                    htmlFor="parking-slot-type"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Slot Type
                  </label>
                  <div className="relative">
                    <select
                      id="parking-slot-type"
                      value={slotTypeFilter}
                      onChange={(e) => setSlotTypeFilter(e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="all">All Types</option>
                      {slotTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {slotTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* City */}
                <div>
                  <label
                    htmlFor="parking-city"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    City
                  </label>
                  <div className="relative">
                    <select
                      id="parking-city"
                      value={cityFilter}
                      onChange={(e) => setCityFilter(e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="all">All Cities</option>
                      {cityOptions.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Results count */}
        <div
          className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-7xl text-right"
          aria-live="polite"
        >
          {loading
            ? 'Loading parking lots...'
            : error
            ? ''
            : `${sortedLots.length} of ${total} parking lots`}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div
            role="alert"
            className="text-center py-20 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
          >
            <p className="text-5xl mb-4">⚠️</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-white">
              Could not load parking lots
            </p>
            <p className="mt-2 text-sm max-w-md mx-auto">{error}</p>
            <button
              type="button"
              onClick={() => fetchLots()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <HiOutlineRefresh size={16} />
              Retry
            </button>
          </div>
        ) : sortedLots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedLots.map((lot) => (
              <ParkingLotCard key={lot._id} lot={lot} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">
            <p className="text-5xl mb-4">🅿️</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-white">
              {total === 0 ? 'No parking lots available yet' : 'No parking lots found'}
            </p>
            <p className="mt-2 text-sm">
              {total === 0
                ? 'Parking locations will appear here once they are added.'
                : 'Try adjusting your search or filters.'}
            </p>
            {hasQuery && total > 0 && (
              <p className="mt-1 text-sm">
                No matches for <span className="font-medium">“{debouncedSearch}”</span>.
              </p>
            )}
            {(total > 0 || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParkingLots;
