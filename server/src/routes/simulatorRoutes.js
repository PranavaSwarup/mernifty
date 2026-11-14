import express from 'express';
import { simulatorService } from '../services/simulatorService.js';
import {
  authenticate,
  publicReadOrAuth,
  requireRole,
  requireJunctionZoneAccess,
} from '../middleware/auth.js';

const router = express.Router();

// Get simulator status (public read-only when PUBLIC_READONLY=true)
router.get('/status', publicReadOrAuth, (req, res) => {
  res.json({
    success: true,
    status: simulatorService.getStatus(),
  });
});

// Start simulator (requires operator+ role)
router.post('/start', authenticate, requireRole(['admin', 'operator']), (req, res) => {
  const { rate = 24 } = req.body || {};
  simulatorService.start(parseInt(rate, 10));
  res.json({
    success: true,
    message: `Simulator started at ${rate} events/sec`,
    status: simulatorService.getStatus(),
  });
});

// Stop simulator (requires operator+ role)
router.post('/stop', authenticate, requireRole(['admin', 'operator']), (req, res) => {
  simulatorService.stop();
  res.json({
    success: true,
    message: 'Simulator stopped',
    status: simulatorService.getStatus(),
  });
});

// Adjust emission rate (requires operator+ role)
router.post('/rate', authenticate, requireRole(['admin', 'operator']), (req, res) => {
  const { rate } = req.body || {};
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

// Adjust simulation speed multiplier (admin only: 1x, 2x, 5x)
router.post('/speed', authenticate, requireRole(['admin']), (req, res) => {
  const parsed = Number(req.body?.speed);
  if (![1, 2, 5].includes(parsed)) {
    return res.status(400).json({
      success: false,
      error: 'speed must be one of 1, 2, or 5',
    });
  }
  const simSpeed = simulatorService.setSimSpeed(parsed);
  res.json({
    success: true,
    simSpeed,
    status: simulatorService.getStatus(),
  });
});

// Inject chaos / physical incident (requires operator+ & junction zone scope; city-wide monsoon requires admin)
router.post(
  '/chaos',
  authenticate,
  requireRole(['admin', 'operator']),
  requireJunctionZoneAccess,
  (req, res) => {
    const { deviceId, junctionId, metric, multiplier = 2.5, durationSec = 20, flags = {} } = req.body || {};
    const isMonsoon = metric === 'monsoon' || Boolean(flags.monsoon);
    const targetId = junctionId || deviceId || (isMonsoon ? 'JNC-BLR-001' : null);
    if (!targetId || !metric) {
      return res.status(400).json({
        success: false,
        error: 'junctionId/deviceId and metric are required for chaos injection',
      });
    }
    const result = simulatorService.injectChaos(
      targetId,
      metric,
      parseFloat(multiplier),
      parseInt(durationSec, 10),
      flags
    );
    res.json(result);
  }
);

export default router;
