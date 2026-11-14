import express from 'express';
import { simulatorService } from '../services/simulatorService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { setAutoRemediationDeadline, getAutoRemediationDeadline } from '../services/anomalyEngine.js';

const router = express.Router();

// Get status (public view)
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: simulatorService.getStatus(),
    autoRemediationDeadlineSec: getAutoRemediationDeadline(),
  });
});

// Start simulator (Admin only)
router.post('/start', authenticate, requireRole('admin'), (req, res) => {
  const { rate = 12 } = req.body;
  simulatorService.start(parseInt(rate, 10));
  res.json({
    success: true,
    message: `Simulator started at ${rate} events/sec`,
    status: simulatorService.getStatus(),
  });
});

// Stop simulator (Admin only)
router.post('/stop', authenticate, requireRole('admin'), (req, res) => {
  simulatorService.stop();
  res.json({
    success: true,
    message: 'Simulator stopped',
    status: simulatorService.getStatus(),
  });
});

// Adjust rate (Admin only)
router.post('/rate', authenticate, requireRole('admin'), (req, res) => {
  const { rate } = req.body;
  if (!rate || isNaN(rate)) {
    return res.status(400).json({ success: false, error: 'Valid numeric rate is required' });
  }
  simulatorService.setRate(parseInt(rate, 10));
  res.json({
    success: true,
    message: `Simulation rate adjusted to ${rate} events/sec`,
    status: simulatorService.getStatus(),
  });
});

// Named Scenario 1: Sudden Blockage at a Junction (Section 5.6) (Admin only)
router.post('/scenario/blockage', authenticate, requireRole('admin'), (req, res) => {
  const { junctionId, road, durationSec = 35 } = req.body;
  if (!junctionId) {
    return res.status(400).json({ success: false, error: 'junctionId is required' });
  }
  const result = simulatorService.triggerBlockage(junctionId, road, parseInt(durationSec, 10));
  res.json(result);
});

// Named Scenario 2: Rush Hour Surge across a Zone (Section 5.6) (Admin only)
router.post('/scenario/rush-hour', authenticate, requireRole('admin'), (req, res) => {
  const { zoneId, multiplier = 1.9, durationSec = 45 } = req.body;
  const result = simulatorService.triggerRushHour(zoneId, parseFloat(multiplier), parseInt(durationSec, 10));
  res.json(result);
});

// Clear active scenarios (Admin only)
router.post('/scenario/clear', authenticate, requireRole('admin'), (req, res) => {
  const { junctionId } = req.body;
  const result = simulatorService.clearScenarios(junctionId);
  res.json(result);
});

// Configure auto-remediation countdown deadline (e.g. 20s for demo, 180s default) (Admin only)
router.post('/remediation-deadline', authenticate, requireRole('admin'), (req, res) => {
  const { seconds } = req.body;
  if (!seconds || isNaN(seconds)) {
    return res.status(400).json({ success: false, error: 'Valid numeric seconds is required' });
  }
  const updatedDeadline = setAutoRemediationDeadline(parseInt(seconds, 10));
  res.json({
    success: true,
    autoRemediationDeadlineSec: updatedDeadline,
    message: `Auto-remediation countdown deadline set to ${updatedDeadline}s`,
  });
});

// Backward-compatible chaos injection (Admin only)
router.post('/chaos', authenticate, requireRole('admin'), (req, res) => {
  const { deviceId, junctionId, metric, multiplier = 2.5, durationSec = 20 } = req.body;
  const targetId = junctionId || deviceId;
  if (!targetId || !metric) {
    return res.status(400).json({ success: false, error: 'junctionId/deviceId and metric are required' });
  }
  const result = simulatorService.injectChaos(targetId, metric, parseFloat(multiplier), parseInt(durationSec, 10));
  res.json(result);
});

export default router;
