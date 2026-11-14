import express from 'express';
import mongoose from 'mongoose';
import { OperatorAction } from '../models/OperatorAction.js';
import { simulatorService } from '../services/simulatorService.js';
import { publicReadOrAuth } from '../middleware/auth.js';

const router = express.Router();

// List operator actions with predicted vs realised 300s outcomes
router.get('/', publicReadOrAuth, async (req, res) => {
  try {
    const { junctionId, status } = req.query;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

    let actions = [];
    if (mongoose.connection?.readyState === 1) {
      const filter = {};
      if (junctionId) filter.junctionId = junctionId;
      if (status) filter.status = status;
      actions = await OperatorAction.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    } else {
      actions = simulatorService.recentActions
        .filter((a) => (!junctionId || a.junctionId === junctionId) && (!status || a.status === status))
        .slice(0, limit);
    }

    res.json({
      success: true,
      count: actions.length,
      actions,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
