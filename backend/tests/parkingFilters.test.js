const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SLOT_VEHICLE_TYPES,
  escapeRegex,
  normalizeSearchTerm,
  normalizeOptionList,
  normalizeAvailability,
  normalizeSlotType,
  buildParkingLotMatch,
  buildParkingSlotLookup,
  buildSlotFilterMatch,
  buildParkingLotPipeline,
} = require('../utils/parkingFilters');

test('escapeRegex escapes user supplied search text', () => {
  assert.equal(escapeRegex('F1-S2'), 'F1-S2');
  assert.equal(escapeRegex('a.b*c'), 'a\\.b\\*c');
  assert.equal(escapeRegex('(drop)'), '\\(drop\\)');
  assert.equal(escapeRegex('[x]'), '\\[x\\]');
  assert.equal(escapeRegex('C++'), 'C\\+\\+');
  assert.equal(escapeRegex(''), '');
  assert.equal(escapeRegex(undefined), '');
});

test('normalizeSearchTerm trims whitespace and ignores non strings', () => {
  assert.equal(normalizeSearchTerm('  Andheri  '), 'Andheri');
  assert.equal(normalizeSearchTerm('   '), '');
  assert.equal(normalizeSearchTerm(undefined), '');
  assert.equal(normalizeSearchTerm(42), '');
});

test('normalizeOptionList trims, drops empty values and removes duplicates', () => {
  assert.deepEqual(
    normalizeOptionList([' Mumbai ', 'mumbai', '', null, 'Pune', '  ']),
    ['Mumbai', 'Pune']
  );
  assert.deepEqual(normalizeOptionList(), []);
});

test('normalizeAvailability falls back to all for unsupported values', () => {
  assert.equal(normalizeAvailability('available'), 'available');
  assert.equal(normalizeAvailability('full'), 'full');
  assert.equal(normalizeAvailability('all'), 'all');
  assert.equal(normalizeAvailability('fullish'), 'all');
  assert.equal(normalizeAvailability(undefined), 'all');
});

test('normalizeSlotType only accepts real slot vehicle types', () => {
  SLOT_VEHICLE_TYPES.forEach((type) => assert.equal(normalizeSlotType(type), type));
  assert.equal(normalizeSlotType('bike'), '');
  assert.equal(normalizeSlotType('CAR'), '');
  assert.equal(normalizeSlotType(''), '');
});

test('buildParkingLotMatch matches city case-insensitively and escapes input', () => {
  const match = buildParkingLotMatch({ city: '  Mum.bai ' });
  assert.equal(match.isActive, true);
  assert.deepEqual(match.city, { $regex: 'Mum\\.bai', $options: 'i' });
  assert.equal(match.pricePerHour, undefined);
});

test('buildParkingLotMatch ignores empty city and invalid price bounds', () => {
  assert.deepEqual(buildParkingLotMatch({ city: '   ' }), { isActive: true });
  assert.deepEqual(buildParkingLotMatch({ minPrice: 'abc', maxPrice: '' }), { isActive: true });
  assert.deepEqual(buildParkingLotMatch({ minPrice: -10, maxPrice: 'NaN' }), { isActive: true });
});

test('buildParkingLotMatch anchors the zone filter and keeps city separate', () => {
  const match = buildParkingLotMatch({ area: 'Koramangala', city: 'Bengaluru', maxPrice: '300' });
  assert.equal(match.isActive, true);
  assert.deepEqual(match.area, { $regex: '^Koramangala$', $options: 'i' });
  assert.deepEqual(match.city, { $regex: 'Bengaluru', $options: 'i' });
  assert.deepEqual(match.pricePerHour, { $lte: 300 });
});

test('buildParkingSlotLookup only joins active slots of the same lot', () => {
  const lookup = buildParkingSlotLookup();
  assert.equal(lookup.$lookup.from, 'parkingslots');
  assert.equal(lookup.$lookup.as, 'activeSlots');
  assert.deepEqual(lookup.$lookup.let, { parkingLotId: '$_id' });
  assert.deepEqual(lookup.$lookup.pipeline[0].$match, {
    $expr: { $eq: ['$parkingLotId', '$$parkingLotId'] },
    isActive: true,
  });
});

test('buildSlotFilterMatch returns null when no slot filters are requested', () => {
  assert.equal(buildSlotFilterMatch({}), null);
  assert.equal(buildSlotFilterMatch({ availability: 'all' }), null);
  assert.equal(buildSlotFilterMatch({ slotType: 'spaceship' }), null);
  assert.equal(buildSlotFilterMatch({ search: '   ' }), null);
});

test('buildSlotFilterMatch maps availability to derived available counts', () => {
  assert.deepEqual(buildSlotFilterMatch({ availability: 'available' }), {
    $match: { availableSlots: { $gt: 0 } },
  });
  assert.deepEqual(buildSlotFilterMatch({ availability: 'full' }), {
    $match: { availableSlots: { $eq: 0 } },
  });
});

test('buildSlotFilterMatch searches lot text fields and real slot numbers', () => {
  const filter = buildSlotFilterMatch({ search: ' F1-S2 ' });
  const or = filter.$match.$or;
  assert.equal(or.length, 5);
  assert.deepEqual(or[0], { name: { $regex: 'F1-S2', $options: 'i' } });
  assert.deepEqual(or[1], { area: { $regex: 'F1-S2', $options: 'i' } });
  assert.deepEqual(or[2], { city: { $regex: 'F1-S2', $options: 'i' } });
  assert.deepEqual(or[3], { address: { $regex: 'F1-S2', $options: 'i' } });
  assert.deepEqual(or[4], { slotNumberMatchCount: { $gt: 0 } });
});

test('buildSlotFilterMatch combines search, slot type and availability with AND', () => {
  const filter = buildSlotFilterMatch({ search: 'Koramangala', slotType: 'ev', availability: 'available' });
  assert.ok(Array.isArray(filter.$match.$and));
  assert.equal(filter.$match.$and.length, 3);
  assert.deepEqual(filter.$match.$and[1], { slotTypeMatchCount: { $gt: 0 } });
  assert.deepEqual(filter.$match.$and[2], { availableSlots: { $gt: 0 } });
});

test('buildParkingLotPipeline derives counts only from active slots', () => {
  const pipeline = buildParkingLotPipeline({});
  const [lotMatch, lookup, derived] = pipeline;

  assert.deepEqual(lotMatch, { $match: { isActive: true } });
  assert.equal(lookup.$lookup.as, 'activeSlots');
  assert.deepEqual(derived.$addFields.availableSlots, {
    $size: {
      $filter: {
        input: '$activeSlots',
        as: 'slot',
        cond: { $eq: ['$$slot.status', 'available'] },
      },
    },
  });
  // Reserved/occupied slots are never counted as available.
  assert.ok(!Object.keys(derived.$addFields).includes('slotTypeMatchCount'));

  const last = pipeline[pipeline.length - 1];
  assert.deepEqual(last.$project, {
    activeSlots: 0,
    slotTypeMatchCount: 0,
    slotNumberMatchCount: 0,
  });
  assert.deepEqual(pipeline[pipeline.length - 2], { $sort: { createdAt: -1 } });
  // No slot based filter is added when nothing is requested.
  assert.equal(pipeline.filter((stage) => stage.$match).length, 1);
});

test('buildParkingLotPipeline adds compatible slot match counts when filters are used', () => {
  const pipeline = buildParkingLotPipeline({ search: 'F1', slotType: 'car', availability: 'full' });
  const derived = pipeline.find((stage) => stage.$addFields);
  assert.ok(derived.$addFields.slotTypeMatchCount);
  assert.ok(derived.$addFields.slotNumberMatchCount);
  assert.equal(derived.$addFields.slotTypeMatchCount.$size.$filter.cond.$eq[1], 'car');
  assert.equal(derived.$addFields.slotNumberMatchCount.$size.$filter.cond.$regexMatch.input, '$$slot.slotNumber');
  assert.equal(derived.$addFields.slotNumberMatchCount.$size.$filter.cond.$regexMatch.options, 'i');
  assert.ok(pipeline.some((stage) => stage.$match && stage.$match.$and));
});
