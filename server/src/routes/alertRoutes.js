import express from 'express';
import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import { authenticate, requireRole, checkAreaAuthorization } from '../middleware/auth.js';

const router = express.Router();

// 1. Get recent alerts with optional filters (Public viewing allowed)
router.get('/', async (req, res) => {
  try {
    const { severity, resolved, deviceId, junctionId, limit = 50 } = req.query;
    const filter = {};

    if (severity) filter.severity = severity;
    if (resolved !== undefined) filter.resolved = resolved === 'true';
    const targetId = junctionId || deviceId;
    if (targetId) filter.deviceId = targetId;

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

// 2. Resolve or tag an alert (Officer or Admin only, with area authorization)
router.patch('/:alertId/resolve', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { cause, note } = req.body;

    const existingAlert = await Alert.findOne({ alertId });
    if (!existingAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    // Check area authorization for officer
    if (!checkAreaAuthorization(req.user, existingAlert.zoneId, existingAlert.junctionId || existingAlert.deviceId)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. You are assigned to area '${req.user.assignedZoneId || req.user.assignedJunctionId}' and cannot act on this junction.`,
      });
    }

    const updates = {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: req.user.name || req.user.email,
      status: 'resolved',
    };
    if (cause) {
      updates.cause = cause;
      updates.causeSource = 'officer';
    }
    if (note) updates.officerNote = note;

    const alert = await Alert.findOneAndUpdate(
      { alertId },
      { $set: updates },
      { new: true }
    );

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

// 3. Clear resolved alerts (Admin only)
router.delete('/clear', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await Alert.deleteMany({ resolved: true });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
