import express from 'express';
import { simulatorService } from '../services/simulatorService.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get status (public view)
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: simulatorService.getStatus(),
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

// Inject chaos / scenario (Admin only)
router.post('/chaos', authenticate, requireRole('admin'), (req, res) => {
  const { deviceId, junctionId, metric, multiplier = 2.5, durationSec = 20, flags = {} } = req.body;
  const targetId = junctionId || deviceId;
  if (!targetId || !metric) {
    return res.status(400).json({ success: false, error: 'junctionId/deviceId and metric are required for chaos injection' });
  }
  const result = simulatorService.injectChaos(targetId, metric, parseFloat(multiplier), parseInt(durationSec, 10), flags);
  res.json(result);
});

export default router;
