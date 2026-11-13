import express from 'express';
import { Device } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import { INITIAL_DEVICES } from '../services/simulatorService.js';

const router = express.Router();

// 1. Get all registered devices
router.get('/', async (req, res) => {
  try {
    const { category, status } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;

    let devices = await Device.find(filter).sort({ category: 1, name: 1 }).lean();

    // If database is brand new and has no devices yet, return initial seed devices
    if (devices.length === 0 && !category && !status) {
      devices = INITIAL_DEVICES.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        category: d.category,
        region: d.region,
        status: 'online',
        healthScore: 100,
        lastSeen: new Date(),
        lastMetrics: d.baseMetrics,
        lastLocation: d.location,
        tags: [d.category],
      }));
    }

    res.json({
      success: true,
      count: devices.length,
      devices,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get device by ID with recent telemetry
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    let device = await Device.findOne({ deviceId }).lean();

    if (!device) {
      const initDev = INITIAL_DEVICES.find((d) => d.deviceId === deviceId);
      if (initDev) {
        device = {
          deviceId: initDev.deviceId,
          name: initDev.name,
          category: initDev.category,
          region: initDev.region,
          status: 'online',
          healthScore: 100,
          lastSeen: new Date(),
          lastMetrics: initDev.baseMetrics,
          lastLocation: initDev.location,
        };
      } else {
        return res.status(404).json({ success: false, error: 'Device not found' });
      }
    }

    // Fetch recent 50 telemetry points for this device
    const recentTelemetry = await Telemetry.find({ deviceId })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      device,
      recentTelemetry: recentTelemetry.reverse(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Register a new device
router.post('/', async (req, res) => {
  try {
    const { deviceId, name, category, region, metadata, location } = req.body;
    if (!deviceId || !name || !category) {
      return res.status(400).json({ success: false, error: 'deviceId, name, and category are required' });
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          name,
          category,
          region: region || 'Global',
          status: 'online',
          healthScore: 100,
          lastSeen: new Date(),
          metadata: metadata || {},
          ...(location ? { lastLocation: location } : {}),
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, device });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
