import express from 'express';
import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';

const router = express.Router();

// 1. Get recent alerts with optional filters
router.get('/', async (req, res) => {
  try {
    const { severity, resolved, deviceId, limit = 50 } = req.query;
    const filter = {};

    if (severity) filter.severity = severity;
    if (resolved !== undefined) filter.resolved = resolved === 'true';
    if (deviceId) filter.deviceId = deviceId;

    const alerts = await Alert.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    const unresolvedCount = await Alert.countDocuments({ resolved: false });

    res.json({
      success: true,
      count: alerts.length,
      unresolvedCount,
      alerts,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Resolve an alert
router.patch('/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolvedBy } = req.body;

    const alert = await Alert.findOneAndUpdate(
      { alertId },
      {
        $set: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: resolvedBy || 'operator',
        },
      },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    // Restore device health score partially upon resolution
    await Device.updateOne(
      { deviceId: alert.deviceId },
      {
        $inc: { healthScore: 15 },
        $set: { status: 'online' },
      }
    );

    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Clear resolved alerts
router.delete('/clear', async (req, res) => {
  try {
    const result = await Alert.deleteMany({ resolved: true });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
