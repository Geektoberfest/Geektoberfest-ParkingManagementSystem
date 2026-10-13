const express = require('express');
const router = express.Router();
const {
  getParkingLots, getParkingLot, createParkingLot,
  updateParkingLot, deleteParkingLot,
  getParkingFilters,
  getParkingSlots, recommendSlot, updateSlotStatus,
  uploadParkingImages, deleteParkingImage,
} = require('../controllers/parkingController');
const { getLotReviews } = require('../controllers/reviewController');
const { protect, adminOnly } = require('../middleware/auth');
const { parkingLotValidation, validate } = require('../middleware/validate');
const upload = require('../middleware/upload');

// Parking lots
router.get('/', getParkingLots);
// Filter choices must be declared before the /:id route
router.get('/filters', getParkingFilters);
router.get('/:id', getParkingLot);
router.post('/', protect, adminOnly, parkingLotValidation, validate, createParkingLot);
router.put('/:id', protect, adminOnly, updateParkingLot);
router.delete('/:id', protect, adminOnly, deleteParkingLot);

// Image upload
router.post('/:id/images', protect, adminOnly, upload.array('images', 10), uploadParkingImages);
router.delete('/:id/images', protect, adminOnly, deleteParkingImage);

// Reviews shortcut (same as /api/reviews/lot/:lotId)
router.get('/:lotId/reviews', getLotReviews);

// Parking slots
router.get('/:lotId/slots', getParkingSlots);
router.get('/:lotId/slots/recommend', protect, recommendSlot);
router.put('/slots/:id/status', protect, adminOnly, updateSlotStatus);

module.exports = router;
