import express from 'express';
import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import {
  authenticate,
  publicReadOrAuth,
  requireRole,
  resolveJunctionZone,
} from '../middleware/auth.js';

const router = express.Router();

// 1. Get recent alerts (public read-only when PUBLIC_READONLY=true)
router.get('/', publicReadOrAuth, async (req, res) => {
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

// 2. Resolve an alert (requires operator+ role & junction zone scope)
router.patch('/:alertId/resolve', authenticate, requireRole(['admin', 'operator']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const existingAlert = await Alert.findOne({ alertId });

    if (!existingAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    if (req.user.role === 'operator') {
      const alertZone =
        existingAlert.zoneId ||
        existingAlert.category ||
        (await resolveJunctionZone(existingAlert.junctionId || existingAlert.deviceId));
      const userZones = Array.isArray(req.user.zones) ? req.user.zones : [];
      if (!alertZone || !userZones.includes(alertZone)) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: alert junction belongs to zone '${alertZone}', outside operator zones [${userZones.join(', ')}]`,
        });
      }
    }

    existingAlert.resolved = true;
    existingAlert.resolvedAt = new Date();
    existingAlert.resolvedBy = req.user.name || req.user.email || 'Operator';
    await existingAlert.save();

    await Device.updateOne(
      { deviceId: existingAlert.deviceId },
      {
        $inc: { healthScore: 15 },
        $set: { status: 'online' },
      }
    );

    res.json({ success: true, alert: existingAlert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Clear resolved alerts across all zones (admin only)
router.delete('/clear', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    const result = await Alert.deleteMany({ resolved: true });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
