import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import { ActionLog } from '../models/ActionLog.js';
import { authenticate, requireRole, checkAreaAuthorization } from '../middleware/auth.js';
import { simulatorService } from '../services/simulatorService.js';
import { socketService } from '../services/socketService.js';

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

// 2. Tag cause of an alert (Section 5.6) (Officer or Admin with area authorization)
router.patch('/:alertId/cause', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { cause, note } = req.body;

    if (!cause) {
      return res.status(400).json({ success: false, error: 'Field "cause" is required' });
    }

    const existingAlert = await Alert.findOne({ alertId });
    if (!existingAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    if (!checkAreaAuthorization(req.user, existingAlert.zoneId, existingAlert.junctionId || existingAlert.deviceId)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. You are assigned to area '${req.user.assignedZoneId || req.user.assignedJunctionId}' and cannot act on this junction.`,
      });
    }

    existingAlert.cause = cause;
    existingAlert.causeSource = 'officer';
    if (note) existingAlert.officerNote = note;
    await existingAlert.save();

    // Broadcast alert:updated to junction and zone rooms
    if (socketService?.io) {
      socketService.broadcastAlertUpdate({
        alertId: existingAlert.alertId,
        cause: existingAlert.cause,
        causeSource: existingAlert.causeSource,
        officerNote: existingAlert.officerNote,
        junctionId: existingAlert.junctionId,
        zoneId: existingAlert.zoneId,
      });
    }

    res.json({ success: true, alert: existingAlert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Acknowledge an alert (Section 5.10) (Officer or Admin with area authorization - stops countdown)
router.patch('/:alertId/acknowledge', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const existingAlert = await Alert.findOne({ alertId });
    if (!existingAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    if (!checkAreaAuthorization(req.user, existingAlert.zoneId, existingAlert.junctionId || existingAlert.deviceId)) {
      return res.status(403).json({
        success: false,
        error: `Access denied for your assigned area.`,
      });
    }

    existingAlert.status = 'acknowledged';
    await existingAlert.save();

    if (socketService?.io) {
      socketService.broadcastAlertUpdate({
        alertId: existingAlert.alertId,
        status: 'acknowledged',
        junctionId: existingAlert.junctionId,
        zoneId: existingAlert.zoneId,
      });
    }

    res.json({ success: true, alert: existingAlert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Apply action to alert (Section 5.10) (Officer or Admin with area authorization)
router.patch('/:alertId/action', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { action, note } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, error: 'Field "action" is required' });
    }

    const existingAlert = await Alert.findOne({ alertId });
    if (!existingAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    if (!checkAreaAuthorization(req.user, existingAlert.zoneId, existingAlert.junctionId || existingAlert.deviceId)) {
      return res.status(403).json({
        success: false,
        error: `Access denied for your assigned area.`,
      });
    }

    const juncId = existingAlert.junctionId || existingAlert.deviceId;

    // Apply action in simulator to actually drain queue
    simulatorService.applyRemediationAction(juncId, action, existingAlert.affectedRoad);

    existingAlert.status = 'action_applied';
    existingAlert.actionApplied = {
      action,
      appliedBy: req.user.email || req.user.name,
      appliedAt: new Date(),
    };
    if (note) existingAlert.officerNote = note;
    await existingAlert.save();

    // Log to ActionLog
    if (mongoose.connection?.readyState === 1) {
      await ActionLog.create({
        logId: `LOG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
        alertId: existingAlert.alertId,
        junctionId: juncId,
        zoneId: existingAlert.zoneId,
        action,
        actor: req.user.email || req.user.name,
        actorRole: req.user.role,
        details: note || `Officer manually applied action "${action}" to relieve congestion.`,
      });
    }

    if (socketService?.io) {
      socketService.broadcastAlertUpdate({
        alertId: existingAlert.alertId,
        status: 'action_applied',
        actionApplied: existingAlert.actionApplied,
        junctionId: existingAlert.junctionId,
        zoneId: existingAlert.zoneId,
      });
    }

    res.json({ success: true, alert: existingAlert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Override action on alert (Section 5.10) (Officer or Admin with area authorization)
router.patch('/:alertId/override', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { note } = req.body;

    const existingAlert = await Alert.findOne({ alertId });
    if (!existingAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    if (!checkAreaAuthorization(req.user, existingAlert.zoneId, existingAlert.junctionId || existingAlert.deviceId)) {
      return res.status(403).json({
        success: false,
        error: `Access denied for your assigned area.`,
      });
    }

    const juncId = existingAlert.junctionId || existingAlert.deviceId;

    // Switch signal to manual override
    simulatorService.overrideSignalMode(juncId, 'manual-override');

    existingAlert.status = 'overridden';
    if (note) existingAlert.officerNote = note;
    await existingAlert.save();

    // Log to ActionLog
    if (mongoose.connection?.readyState === 1) {
      await ActionLog.create({
        logId: `LOG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
        alertId: existingAlert.alertId,
        junctionId: juncId,
        zoneId: existingAlert.zoneId,
        action: 'manual-override',
        actor: req.user.email || req.user.name,
        actorRole: req.user.role,
        details: note || 'Officer manually overrode automated signal timing.',
      });
    }

    if (socketService?.io) {
      socketService.broadcastAlertUpdate({
        alertId: existingAlert.alertId,
        status: 'overridden',
        junctionId: existingAlert.junctionId,
        zoneId: existingAlert.zoneId,
      });
    }

    res.json({ success: true, alert: existingAlert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Resolve an alert (Officer or Admin only, with area authorization)
router.patch('/:alertId/resolve', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { cause, note } = req.body;

    const existingAlert = await Alert.findOne({ alertId });
    if (!existingAlert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

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

    if (socketService?.io) {
      socketService.broadcastAlertUpdate({
        alertId: alert.alertId,
        resolved: true,
        status: 'resolved',
        junctionId: alert.junctionId,
        zoneId: alert.zoneId,
      });
    }

    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Action Logs (Public viewing for accountability - Section 5.10)
router.get('/actions/logs', async (req, res) => {
  try {
    const { junctionId, limit = 50 } = req.query;
    const filter = {};
    if (junctionId) filter.junctionId = junctionId;

    const logs = await ActionLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Clear resolved alerts (Admin only)
router.delete('/clear', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await Alert.deleteMany({ resolved: true });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
