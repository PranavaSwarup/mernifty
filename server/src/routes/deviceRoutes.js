import express from 'express';
import { Device } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import { INITIAL_DEVICES } from '../services/simulatorService.js';

const router = express.Router();

// 1. Get all registered traffic junctions
router.get('/', async (req, res) => {
  try {
    const { category, zoneId, status } = req.query;
    const filter = {};
    const targetZone = zoneId || category;
    if (targetZone && targetZone !== 'all') {
      filter.category = targetZone;
    }
    if (status && status !== 'all') {
      filter.status = status;
    }

    let devices = await Device.find(filter).sort({ zoneId: 1, name: 1 }).lean();

    // If database is brand new and has no devices yet, return initial seed devices
    if (devices.length === 0 && (!targetZone || targetZone === 'all') && (!status || status === 'all')) {
      devices = INITIAL_DEVICES.map((d) => ({
        junctionId: d.junctionId,
        deviceId: d.deviceId,
        name: d.name,
        zoneId: d.zoneId,
        zoneName: d.zoneName,
        category: d.category,
        region: d.region,
        status: 'online',
        healthScore: 100,
        lastSeen: new Date(),
        lastLocation: d.location,
        vehicleMix: d.vehicleMix,
        approaches: d.baseApproaches,
        tags: [d.zoneId, 'bengaluru-traffic'],
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

// 2. Get junction by ID with recent telemetry
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    let device = await Device.findOne({
      $or: [{ deviceId }, { junctionId: deviceId }],
    }).lean();

    if (!device) {
      const initDev = INITIAL_DEVICES.find((d) => d.deviceId === deviceId || d.junctionId === deviceId);
      if (initDev) {
        device = {
          junctionId: initDev.junctionId,
          deviceId: initDev.deviceId,
          name: initDev.name,
          zoneId: initDev.zoneId,
          zoneName: initDev.zoneName,
          category: initDev.category,
          region: initDev.region,
          status: 'online',
          healthScore: 100,
          lastSeen: new Date(),
          lastLocation: initDev.location,
          approaches: initDev.baseApproaches,
          vehicleMix: initDev.vehicleMix,
        };
      } else {
        return res.status(404).json({ success: false, error: 'Traffic junction not found' });
      }
    }

    // Fetch recent 50 telemetry points for this junction
    const recentTelemetry = await Telemetry.find({
      $or: [{ deviceId }, { junctionId: deviceId }],
    })
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

// 3. Register a new traffic junction
router.post('/', async (req, res) => {
  try {
    const { junctionId, deviceId, name, zoneId, category, region, metadata, location } = req.body;
    const juncId = junctionId || deviceId;
    const zId = zoneId || category;

    if (!juncId || !name || !zId) {
      return res.status(400).json({ success: false, error: 'junctionId, name, and zoneId are required' });
    }

    const device = await Device.findOneAndUpdate(
      { deviceId: juncId },
      {
        $set: {
          junctionId: juncId,
          name,
          zoneId: zId,
          category: zId,
          region: region || 'Bengaluru Metro Area',
          status: 'online',
          lastSeen: new Date(),
          ...(location ? { lastLocation: location } : {}),
          ...(metadata ? { metadata } : {}),
        },
        $setOnInsert: {
          healthScore: 100,
          tags: [zId, 'bengaluru-traffic'],
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      device,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Update junction metadata / configuration
router.patch('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const updates = req.body;

    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { junctionId: deviceId }] },
      { $set: updates },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ success: false, error: 'Traffic junction not found' });
    }

    res.json({
      success: true,
      device,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
