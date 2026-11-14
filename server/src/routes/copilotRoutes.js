import express from 'express';
import { copilotService } from '../services/copilotService.js';
import {
  authenticate,
  publicReadOrAuth,
  requireRole,
  requireJunctionZoneAccess,
} from '../middleware/auth.js';

const router = express.Router();

// Run evidence-based K=12 CRN model-predictive diagnosis on a junction device (public read-only if configured)
router.get('/diagnose/:deviceId', publicReadOrAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const diagnosis = await copilotService.analyzeDevice(deviceId);
    if (!diagnosis) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    res.json({ success: true, diagnosis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Execute physical live-twin remediation (requires operator+ role & junction zone scope)
router.post(
  '/remediate',
  authenticate,
  requireRole(['admin', 'operator']),
  requireJunctionZoneAccess,
  async (req, res) => {
    try {
      const { deviceId, action, params = {} } = req.body || {};
      if (!deviceId || !action) {
        return res.status(400).json({ success: false, error: 'deviceId and action are required' });
      }

      const actor = req.user.name || req.user.email || 'Operator';
      const actorRole = req.user.role || 'operator';
      const mergedParams = {
        ...params,
        actorRole,
        ...(req.body.controller ? { controller: req.body.controller } : {}),
        ...(req.body.findingId ? { findingId: req.body.findingId } : {}),
      };

      const result = await copilotService.executeRemediation(deviceId, action, actor, mergedParams);
      res.json(result);
    } catch (err) {
      const statusCode =
        err.message?.includes('not found') || err.message?.includes('Unsupported') ? 400 : 500;
      res.status(statusCode).json({ success: false, error: err.message });
    }
  }
);

export default router;
