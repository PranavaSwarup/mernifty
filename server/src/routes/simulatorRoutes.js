import express from 'express';
import { simulatorService } from '../services/simulatorService.js';

const router = express.Router();

// Get status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: simulatorService.getStatus(),
  });
});

// Start simulator
router.post('/start', (req, res) => {
  const { rate = 10 } = req.body;
  simulatorService.start(parseInt(rate, 10));
  res.json({
    success: true,
    message: `Simulator started at ${rate} events/sec`,
    status: simulatorService.getStatus(),
  });
});

// Stop simulator
router.post('/stop', (req, res) => {
  simulatorService.stop();
  res.json({
    success: true,
    message: 'Simulator stopped',
    status: simulatorService.getStatus(),
  });
});

// Adjust rate
router.post('/rate', (req, res) => {
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

// Inject chaos
router.post('/chaos', (req, res) => {
  const { deviceId, metric, multiplier = 2.5, durationSec = 15 } = req.body;
  if (!deviceId || !metric) {
    return res.status(400).json({ success: false, error: 'deviceId and metric are required for chaos injection' });
  }
  const result = simulatorService.injectChaos(deviceId, metric, parseFloat(multiplier), parseInt(durationSec, 10));
  res.json(result);
});

export default router;
