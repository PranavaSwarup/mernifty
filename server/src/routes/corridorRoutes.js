import express from 'express';
import { corridorService } from '../services/corridorService.js';
import { CorridorTrip } from '../models/CorridorTrip.js';
import { authenticate, publicReadOrAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// 1. Start an ambulance green corridor trip (Admin, Operator, or Ambulance role)
router.post('/start', authenticate, requireRole(['admin', 'operator', 'ambulance']), async (req, res) => {
  try {
    let { vehicleId, startJunctionId, destinationJunctionId, durationSeconds, avoidJams } = req.body || {};

    if (req.user?.role === 'ambulance') {
      vehicleId = req.user.vehicleId || 'AMB-BLR-01';
    }

    const result = await corridorService.startTrip({
      vehicleId: vehicleId || 'AMB-BLR-01',
      startJunctionId: startJunctionId || 'JNC-BLR-008',
      destinationJunctionId: destinationJunctionId || 'JNC-BLR-004',
      durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : 75,
      avoidJams: avoidJams !== undefined ? Boolean(avoidJams) : true,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2. Cancel an active corridor trip (Admin, Operator, or Ambulance role)
router.post('/cancel', authenticate, requireRole(['admin', 'operator', 'ambulance']), async (req, res) => {
  try {
    const { tripId } = req.body || {};
    const result = await corridorService.cancelTrip(tripId);
    res.json({ success: true, cancelled: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Get currently active trips (Public viewing allowed)
router.get('/active', publicReadOrAuth, (req, res) => {
  const active = Array.from(corridorService.activeTrips.values()).map((t) => ({
    tripId: t.tripId,
    vehicleId: t.vehicleId,
    route: t.route,
    startJunctionId: t.startJunctionId,
    destinationJunctionId: t.destinationJunctionId,
    progressPct: t.progressPct,
    sequence: t.sequence,
    startTime: t.startTime,
    isDynamicRerouted: t.isDynamicRerouted,
    rerouteReason: t.rerouteReason,
  }));
  res.json({ success: true, count: active.length, active });
});

// 4. Get historical completed trips (Public viewing allowed)
router.get('/history', publicReadOrAuth, async (req, res) => {
  try {
    const trips = await CorridorTrip.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json({ success: true, count: trips.length, trips });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

