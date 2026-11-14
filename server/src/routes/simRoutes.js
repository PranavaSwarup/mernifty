import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/config.js';
import { OperatorAction } from '../models/OperatorAction.js';
import { Device } from '../models/Device.js';
import { simulatorService } from '../services/simulatorService.js';
import { rolloutPredictedEffect } from '../services/copilotService.js';

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
      // Non-blocking fallback until T04 auth hardening
    }
  }
  return {
    actor: req.body?.actor || 'Operator',
    actorRole: req.body?.actorRole || 'operator',
  };
}

// Live simulation state, per-junction active controller specs, and study supervisory policy
router.get('/state', (req, res) => {
  try {
    res.json({
      success: true,
      ...simulatorService.getState(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Paired CRN counterfactual comparison between Live Twin and Fixed-TOD Baseline Twin
router.get('/counterfactual', (req, res) => {
  try {
    res.json({
      success: true,
      ...simulatorService.getCounterfactual(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Switch active controller on one junction or 'all' (live twin only)
// TODO(T04): enforce admin/operator auth via authenticate + requireRole(['admin', 'operator'])
router.post('/controller', async (req, res) => {
  try {
    const { junctionId, controller } = req.body || {};
    if (!junctionId || !controller) {
      return res.status(400).json({
        success: false,
        error: 'junctionId (or "all") and controller are required',
      });
    }

    const { actor, actorRole } = resolveActor(req);
    const liveWorld = simulatorService.pair.live;
    const isAll = junctionId === 'all' || junctionId === '*';

    let predictedEffect = null;
    let baselineMetricsAtAction = {};
    if (!isAll && liveWorld.junctionIndexById.has(junctionId)) {
      const startSnap = liveWorld.snapshot(junctionId);
      const cf = simulatorService.pair.comparison();
      predictedEffect = rolloutPredictedEffect(
        liveWorld,
        junctionId,
        (w) => w.setController(junctionId, controller),
        300
      );
      baselineMetricsAtAction = {
        junctionDelayVehSec: startSnap.kpi.delayVehSec,
        avgDelayPerVehSec: startSnap.kpi.avgDelayPerVehSec,
        maxQueueLengthM: startSnap.maxQueueLengthM,
        avgSpeedKmph: startSnap.avgSpeedKmph,
        congestionScore: startSnap.congestionScore,
        cfDelaySavedVehSecAtAction: cf.byJunction[junctionId]?.delaySavedVehSec ?? 0,
      };
    }

    const result = simulatorService.setController(junctionId, controller, actor);

    const actionId = `ACT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const actionRecord = {
      actionId,
      junctionId: result.target,
      deviceId: result.target,
      actor,
      actorRole,
      actionType: 'switch_controller',
      findingId: null,
      params: {
        controller,
        previousControllers: result.previousControllers,
      },
      studyEvidence: null,
      simTimeAtAction: new Date(liveWorld.simTimeMs),
      elapsedSecAtAction: liveWorld.elapsedSec,
      targetMeasureElapsedSec: liveWorld.elapsedSec + 300,
      baselineMetricsAtAction,
      predictedEffect: predictedEffect || { scope: 'network-wide', controller },
      realisedEffect: null,
      status: isAll ? 'measured' : 'pending',
      resolvedAlertsCount: 0,
    };

    if (mongoose.connection?.readyState === 1) {
      await OperatorAction.create(actionRecord);
      const filter = isAll ? {} : { deviceId: junctionId };
      await Device.updateMany(filter, { $set: { adaptiveSignalMode: controller } });
    }

    if (!isAll) {
      simulatorService.registerPendingAction(actionRecord);
    } else {
      simulatorService.recentActions.unshift(actionRecord);
    }

    res.json({
      success: true,
      ...result,
      actionRecord,
    });
  } catch (err) {
    const statusCode =
      err.message?.includes('Unsupported') || err.message?.includes('Unknown') ? 400 : 500;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

export default router;
