import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { copilotService } from '../services/copilotService.js';

const router = express.Router();

function resolveActor(req) {
  if (req.user) {
    return {
      actor: req.user.name || req.user.email || 'Operator',
      actorRole: req.user.role || 'operator',
    };
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], config.jwtSecret);
      return {
        actor: decoded.name || decoded.email || 'Operator',
        actorRole: decoded.role || 'operator',
      };
    } catch {
      // Non-blocking fallback when T04 auth middleware is not yet enforced
    }
  }
  return {
    actor: req.body?.actor || 'Operator',
    actorRole: req.body?.actorRole || 'operator',
  };
}

// Run evidence-based model-predictive diagnosis on a junction device
router.get('/diagnose/:deviceId', async (req, res) => {
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

// Execute physical live-twin remediation with 300s MPC rollout & audit trail
router.post('/remediate', async (req, res) => {
  try {
    const { deviceId, action, params = {} } = req.body;
    if (!deviceId || !action) {
      return res.status(400).json({ success: false, error: 'deviceId and action are required' });
    }

    const { actor, actorRole } = resolveActor(req);
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
});

export default router;
