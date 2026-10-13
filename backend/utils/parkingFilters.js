const ParkingSlot = require('../models/ParkingSlot');

// Slot vehicle types that a parking lot can be filtered by.
const SLOT_VEHICLE_TYPES = ['car', 'motorcycle', 'truck', 'ev'];

// Availability filter values accepted by the public listing endpoint.
const AVAILABILITY_FILTERS = ['all', 'available', 'full'];

// Escape user supplied text before turning it into a regular expression.
const escapeRegex = (value) => String(value == null ? '' : value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSearchTerm = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Unknown availability values fall back to "all" so invalid input is ignored.
const normalizeAvailability = (value) => (AVAILABILITY_FILTERS.includes(value) ? value : 'all');

// Unknown slot types are ignored instead of producing an empty result set.
const normalizeSlotType = (value) => (SLOT_VEHICLE_TYPES.includes(value) ? value : '');

// Clean up distinct values coming from the database: trim, drop empties, dedupe.
const normalizeOptionList = (values = []) => {
  const seen = new Set();
  const options = [];
  values.forEach((value) => {
    const term = normalizeSearchTerm(value);
    if (!term) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push(term);
  });
  return options.sort((a, b) => a.localeCompare(b));
};

// Lot level criteria (city, zone/area and price range).
// Search text and slot criteria are applied after the slot lookup so they can
// also match real slot records.
const buildParkingLotMatch = (query = {}) => {
  const match = { isActive: true };

  const city = normalizeSearchTerm(query.city);
  if (city) match.city = { $regex: escapeRegex(city), $options: 'i' };

  const area = normalizeSearchTerm(query.area);
  if (area) match.area = { $regex: `^${escapeRegex(area)}$`, $options: 'i' };

  const price = {};
  const minPrice = normalizeNumber(query.minPrice);
  if (minPrice !== null && minPrice > 0) price.$gte = minPrice;
  const maxPrice = normalizeNumber(query.maxPrice);
  if (maxPrice !== null && maxPrice >= 0) price.$lte = maxPrice;
  if (Object.keys(price).length > 0) match.pricePerHour = price;

  return match;
};

// Join the active slots of every candidate lot in a single query instead of
// running one count query per lot (no N+1).
const buildParkingSlotLookup = () => ({
  $lookup: {
    from: ParkingSlot.collection.name,
    let: { parkingLotId: '$_id' },
    pipeline: [
      { $match: { $expr: { $eq: ['$parkingLotId', '$$parkingLotId'] }, isActive: true } },
    ],
    as: 'activeSlots',
  },
});

// Derived counts calculated from the active slots only.
// Reserved/occupied slots never count as available.
const buildSlotDerivedFields = (query = {}) => {
  const fields = {
    availableSlots: {
      $size: {
        $filter: {
          input: '$activeSlots',
          as: 'slot',
          cond: { $eq: ['$$slot.status', 'available'] },
        },
      },
    },
  };

  const slotType = normalizeSlotType(query.slotType);
  if (slotType) {
    fields.slotTypeMatchCount = {
      $size: {
        $filter: {
          input: '$activeSlots',
          as: 'slot',
          cond: { $eq: ['$$slot.vehicleType', slotType] },
        },
      },
    };
  }

  const search = normalizeSearchTerm(query.search);
  if (search) {
    fields.slotNumberMatchCount = {
      $size: {
        $filter: {
          input: '$activeSlots',
          as: 'slot',
          cond: {
            $regexMatch: {
              input: '$$slot.slotNumber',
              regex: escapeRegex(search),
              options: 'i',
            },
          },
        },
      },
    };
  }

  return { $addFields: fields };
};

// Search, slot type and availability conditions combined with AND semantics.
const buildSlotFilterMatch = (query = {}) => {
  const conditions = [];
  const search = normalizeSearchTerm(query.search);

  if (search) {
    const regex = escapeRegex(search);
    conditions.push({
      $or: [
        { name: { $regex: regex, $options: 'i' } },
        { area: { $regex: regex, $options: 'i' } },
        { city: { $regex: regex, $options: 'i' } },
        { address: { $regex: regex, $options: 'i' } },
        { slotNumberMatchCount: { $gt: 0 } },
      ],
    });
  }

  const slotType = normalizeSlotType(query.slotType);
  if (slotType) conditions.push({ slotTypeMatchCount: { $gt: 0 } });

  const availability = normalizeAvailability(query.availability);
  if (availability === 'available') conditions.push({ availableSlots: { $gt: 0 } });
  else if (availability === 'full') conditions.push({ availableSlots: { $eq: 0 } });

  if (conditions.length === 0) return null;
  return { $match: conditions.length === 1 ? conditions[0] : { $and: conditions } };
};

const buildParkingLotPipeline = (query = {}) => {
  const pipeline = [
    { $match: buildParkingLotMatch(query) },
    buildParkingSlotLookup(),
    buildSlotDerivedFields(query),
  ];

  const slotFilter = buildSlotFilterMatch(query);
  if (slotFilter) pipeline.push(slotFilter);

  // Matches the ordering of the original endpoint.
  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({
    $project: {
      activeSlots: 0,
      slotTypeMatchCount: 0,
      slotNumberMatchCount: 0,
    },
  });

  return pipeline;
};

module.exports = {
  SLOT_VEHICLE_TYPES,
  AVAILABILITY_FILTERS,
  escapeRegex,
  normalizeSearchTerm,
  normalizeOptionList,
  normalizeAvailability,
  normalizeSlotType,
  buildParkingLotMatch,
  buildParkingSlotLookup,
  buildSlotDerivedFields,
  buildSlotFilterMatch,
  buildParkingLotPipeline,
};
