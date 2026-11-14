import express from 'express';
import { Telemetry } from '../models/Telemetry.js';
import { ingestionBuffer } from '../services/ingestionBuffer.js';
import { anomalyEngine } from '../services/anomalyEngine.js';
import { socketService } from '../services/socketService.js';
import { metricsService } from '../services/metricsService.js';
import { authenticateIngest, publicReadOrAuth } from '../middleware/auth.js';
import { tokenBucketRateLimiter } from '../middleware/rateLimiter.js';
import { validateTelemetryEvent, validateTelemetryBatch } from '../middleware/validator.js';

const router = express.Router();
const MAX_REJECTION_DETAILS = 20;

function checkBufferBackpressure(req, res, next) {
  if (ingestionBuffer.isBackpressured(0.8)) {
    const incomingCount = Array.isArray(req.body)
      ? req.body.length
      : Array.isArray(req.body?.events)
        ? req.body.events.length
        : 1;
    metricsService.recordLoadShed(Math.max(1, incomingCount));
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        ((ingestionBuffer.getQueueLength() / Math.max(1, ingestionBuffer.batchSize)) *
          ingestionBuffer.flushIntervalMs) /
          1000
      )
    );
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(503).json({
      success: false,
      error: 'Server overloaded: ingestion buffer exceeds 80% capacity. Retry after backoff.',
      bufferUtilizationPct: Number(
        ((ingestionBuffer.getQueueLength() / ingestionBuffer.maxQueueSize) * 100).toFixed(1)
      ),
      retryAfterSeconds,
    });
  }
  next();
}

function batchCostFn(req) {
  if (Array.isArray(req.body)) return Math.max(1, req.body.length);
  if (Array.isArray(req.body?.events)) return Math.max(1, req.body.events.length);
  return 1;
}

const ingestRateLimiter = tokenBucketRateLimiter({ scope: 'ingest', costFn: () => 1 });
const batchRateLimiter = tokenBucketRateLimiter({ scope: 'ingest', costFn: batchCostFn });

// 1. Single Traffic Junction Ingestion Endpoint (requires DeviceKey or Admin JWT)
router.post(
  '/ingest',
  authenticateIngest,
  checkBufferBackpressure,
  ingestRateLimiter,
  validateTelemetryEvent,
  async (req, res) => {
    const startT = Date.now();
    const event = req.validatedEvent;

    if (
      req.deviceKey?.allowedJunctionIds?.length > 0 &&
      !req.deviceKey.allowedJunctionIds.includes(event.junctionId)
    ) {
      return res.status(403).json({
        success: false,
        error: `DeviceKey '${req.deviceKey.prefix}' is not permitted to ingest for junction '${event.junctionId}'`,
      });
    }

    const bufferRes = ingestionBuffer.enqueue(event);
    if (!bufferRes.accepted) {
      if (bufferRes.classification === 'duplicate') {
        return res.status(202).json({
          success: true,
          accepted: false,
          duplicate: true,
          classification: 'duplicate',
          eventId: event.eventId,
          junctionId: event.junctionId,
          reason: bufferRes.reason,
        });
      }
      res.setHeader('Retry-After', '2');
      return res.status(503).json({
        success: false,
        error: bufferRes.reason,
        retryAfterSeconds: 2,
      });
    }

    let alert = null;
    if (!bufferRes.late) {
      alert = anomalyEngine.evaluate(event);
      socketService.broadcastTelemetry(event);
    }

    const latency = Date.now() - startT;
    metricsService.recordIngest(1, latency);

    res.status(202).json({
      success: true,
      accepted: true,
      classification: bufferRes.classification,
      late: Boolean(bufferRes.late),
      gapMissing: bufferRes.gapMissing || 0,
      eventId: event.eventId,
      junctionId: event.junctionId,
      zoneId: event.zoneId,
      anomalyDetected: !!alert,
      alertTitle: alert ? alert.title : null,
      processingLatencyMs: latency,
    });
  }
);

// 2. Batch High-Throughput Traffic Ingestion Endpoint (partial acceptance 207-style body with HTTP 202)
router.post(
  '/batch',
  authenticateIngest,
  checkBufferBackpressure,
  batchRateLimiter,
  validateTelemetryBatch,
  async (req, res) => {
    const startT = Date.now();
    const validItems = req.validatedBatchItems || [];
    const rejected = [...(req.rejectedBatchItems || [])];

    let acceptedCount = 0;
    let duplicateCount = 0;
    let lateCount = 0;
    let gapCount = 0;
    let anomaliesCount = 0;

    for (const { index, event } of validItems) {
      if (
        req.deviceKey?.allowedJunctionIds?.length > 0 &&
        !req.deviceKey.allowedJunctionIds.includes(event.junctionId)
      ) {
        rejected.push({
          index,
          eventId: event.eventId,
          reason: `DeviceKey not permitted for junction '${event.junctionId}'`,
        });
        continue;
      }

      const bufferRes = ingestionBuffer.enqueue(event);
      if (!bufferRes.accepted) {
        if (bufferRes.classification === 'duplicate') {
          duplicateCount++;
        } else {
          rejected.push({
            index,
            eventId: event.eventId,
            reason: bufferRes.reason,
          });
        }
        continue;
      }

      acceptedCount++;
      if (bufferRes.late) {
        lateCount++;
      } else {
        const alert = anomalyEngine.evaluate(event);
        if (alert) anomaliesCount++;
        socketService.broadcastTelemetry(event);
      }
      if (bufferRes.classification === 'gap') {
        gapCount++;
      }
    }

    const latency = Date.now() - startT;
    if (acceptedCount > 0) {
      metricsService.recordIngest(acceptedCount, latency);
    }

    res.status(202).json({
      success: acceptedCount > 0 || duplicateCount > 0,
      totalReceived: validItems.length + (req.rejectedBatchItems?.length || 0),
      count: acceptedCount,
      acceptedCount,
      duplicateCount,
      lateCount,
      gapCount,
      rejectedCount: rejected.length,
      anomaliesCount,
      rejected: rejected.slice(0, MAX_REJECTION_DETAILS),
      batchProcessingLatencyMs: latency,
    });
  }
);

// 3. Per-junction sequence & ingestion integrity report
router.get('/integrity', publicReadOrAuth, (req, res) => {
  res.json({
    success: true,
    integrity: ingestionBuffer.getIntegrityReport(),
  });
});

// 4. Historical Telemetry Retrieval
router.get('/history', publicReadOrAuth, async (req, res) => {
  try {
    const { junctionId, deviceId, zoneId, category, from, to, limit = 100 } = req.query;
    const query = {};

    const targetId = junctionId || deviceId;
    if (targetId) {
      query.$or = [{ junctionId: targetId }, { deviceId: targetId }];
    }

    const targetZone = zoneId || category;
    if (targetZone && targetZone !== 'all') {
      query.category = targetZone;
    }

    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }

    const maxLimit = Math.min(parseInt(limit, 10) || 100, 1000);

    const records = await Telemetry.find(query)
      .sort({ timestamp: -1 })
      .limit(maxLimit)
      .lean();

    res.json({
      success: true,
      count: records.length,
      records: records.reverse(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Aggregated Time-Series Data
router.get('/aggregate', publicReadOrAuth, async (req, res) => {
  try {
    const { junctionId, deviceId, minutes = 15, bucketSeconds = 10 } = req.query;
    const targetId = junctionId || deviceId;
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'junctionId/deviceId is required for aggregation' });
    }

    const sinceDate = new Date(Date.now() - parseInt(minutes, 10) * 60 * 1000);
    const intervalMs = parseInt(bucketSeconds, 10) * 1000;

    const records = await Telemetry.find({
      $or: [{ junctionId: targetId }, { deviceId: targetId }],
      timestamp: { $gte: sinceDate },
    })
      .sort({ timestamp: 1 })
      .lean();

    const buckets = new Map();
    for (const rec of records) {
      const bucketTime = Math.floor(new Date(rec.timestamp).getTime() / intervalMs) * intervalMs;
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, []);
      }
      buckets.get(bucketTime).push(rec.metrics || {});
    }

    const aggregated = [];
    for (const [bucketTime, metricList] of buckets.entries()) {
      const avgMetrics = {};
      if (metricList.length > 0) {
        const keys = Object.keys(metricList[0]);
        for (const k of keys) {
          const vals = metricList.map((m) => m[k]).filter((v) => typeof v === 'number');
          if (vals.length > 0) {
            avgMetrics[k] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
          }
        }
      }
      aggregated.push({
        timestamp: new Date(bucketTime).toISOString(),
        count: metricList.length,
        metrics: avgMetrics,
      });
    }

    res.json({
      success: true,
      junctionId: targetId,
      deviceId: targetId,
      bucketSeconds: parseInt(bucketSeconds, 10),
      buckets: aggregated,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. System Performance, Integrity & Throughput Metrics
router.get('/stats', publicReadOrAuth, (req, res) => {
  res.json({
    success: true,
    stats: metricsService.getSnapshot(),
  });
});

export default router;
