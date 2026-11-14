import express from 'express';
import { Alert } from '../models/Alert.js';
import { CorridorTrip } from '../models/CorridorTrip.js';
import { Telemetry } from '../models/Telemetry.js';
import { JUNCTION_GRAPH } from '../data/junctionGraph.js';

const router = express.Router();

// List replayable incidents (resolved alerts and completed trips)
router.get('/recent', async (req, res) => {
  try {
    const alerts = await Alert.find({ status: { $in: ['resolved', 'action_applied', 'auto_applied', 'overridden'] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    const trips = await CorridorTrip.find({ status: { $in: ['completed', 'cancelled'] } })
      .sort({ endTime: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      alerts,
      trips,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Replay an incident alert (Section 5.15)
// Fetches telemetry for the affected junction and its 1-hop neighbours from -60s to +60s
router.get('/alert/:alertId', async (req, res) => {
  const { alertId } = req.params;

  try {
    const alert = await Alert.findOne({ alertId }).lean();
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    const alertTime = new Date(alert.timestamp || alert.createdAt).getTime();
    const resolvedTime = alert.resolvedAt ? new Date(alert.resolvedAt).getTime() : alertTime + 45000;

    const startWindow = new Date(alertTime - 60000);
    const endWindow = new Date(resolvedTime + 60000);

    const neighbours = JUNCTION_GRAPH[alert.junctionId] || [];
    const targetJunctions = [alert.junctionId, ...neighbours];

    const telemetry = await Telemetry.find({
      junctionId: { $in: targetJunctions },
      timestamp: { $gte: startWindow, $lte: endWindow },
    })
      .sort({ timestamp: 1 })
      .lean();

    res.json({
      success: true,
      type: 'alert_replay',
      alert,
      window: {
        startTime: startWindow.toISOString(),
        endTime: endWindow.toISOString(),
        durationSec: Math.round((endWindow.getTime() - startWindow.getTime()) / 1000),
      },
      affectedJunctions: targetJunctions,
      telemetry,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Replay a corridor trip (Section 5.15)
// Fetches ambulance movement positions and route telemetry
router.get('/corridor/:tripId', async (req, res) => {
  const { tripId } = req.params;

  try {
    const trip = await CorridorTrip.findOne({ tripId }).lean();
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Corridor trip not found' });
    }

    const startWindow = new Date(new Date(trip.startTime).getTime() - 15000);
    const endWindow = new Date(new Date(trip.endTime || trip.startTime).getTime() + 15000);

    const telemetry = await Telemetry.find({
      junctionId: { $in: trip.routeJunctionIds },
      timestamp: { $gte: startWindow, $lte: endWindow },
    })
      .sort({ timestamp: 1 })
      .lean();

    res.json({
      success: true,
      type: 'corridor_replay',
      trip,
      window: {
        startTime: startWindow.toISOString(),
        endTime: endWindow.toISOString(),
      },
      positions: trip.positions || [],
      telemetry,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

