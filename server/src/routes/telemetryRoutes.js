import express from 'express';
import { Telemetry } from '../models/Telemetry.js';
import { ingestionBuffer } from '../services/ingestionBuffer.js';
import { anomalyEngine } from '../services/anomalyEngine.js';
import { socketService } from '../services/socketService.js';
import { metricsService } from '../services/metricsService.js';
import { authenticateIngest, publicReadOrAuth } from '../middleware/auth.js';
import { tokenBucketRateLimiter } from '../middleware/rateLimiter.js';
import { validateTelemetryEvent, validateTelemetryBatch } from '../middleware/validator.js';
import {
  getTracer,
  recordAccepted,
  recordDuplicates,
  recordRejected,
  stampEventTelemetry,
  withSyncSpan,
} from '../telemetry/instruments.js';
import { isOtelEnabled } from '../telemetry/otel.js';

const router = express.Router();
const MAX_REJECTION_DETAILS = 20;

function startIngestTraceMiddleware(source) {
  return (req, res, next) => {
    req._ingestTimeNs = process.hrtime.bigint();
    if (!isOtelEnabled()) return next();

    const body = req.body;
    const rawEvents = Array.isArray(body)
      ? body
      : Array.isArray(body?.events)
        ? body.events
        : null;
    const batchSize = rawEvents ? rawEvents.length : 1;
    const sampleEvt = rawEvents ? rawEvents[0] : body;
    const junctionId = sampleEvt?.junctionId || sampleEvt?.deviceId || (rawEvents ? 'batch' : 'unknown');
    const zoneId = sampleEvt?.zoneId || sampleEvt?.category || (rawEvents ? 'mixed' : 'unknown');

    return getTracer().startActiveSpan(
      'telemetry.ingest',
      {
        attributes: {
          junctionId: String(junctionId),
          zoneId: String(zoneId),
          'batch.size': batchSize,
          source,
        },
      },
      (span) => {
        let ended = false;
        const finishSpan = () => {
          if (ended) return;
          ended = true;
          span.setAttribute('http.status_code', res.statusCode);
          span.end();
        };
        res.once('finish', finishSpan);
        res.once('close', finishSpan);
        return next();
      }
    );
  };
}

function checkBufferBackpressure(req, res, next) {
  if (ingestionBuffer.isBackpressured(0.8)) {
    const incomingCount = Array.isArray(req.body)
      ? req.body.length
      : Array.isArray(req.body?.events)
        ? req.body.events.length
        : 1;
    const rejectedCount = Math.max(1, incomingCount);
    metricsService.recordLoadShed(rejectedCount);
    recordRejected('backpressure', rejectedCount);
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
  startIngestTraceMiddleware('http-ingest'),
  validateTelemetryEvent,
  async (req, res) => {
    const startT = Date.now();
    const ingestNs = req._ingestTimeNs || process.hrtime.bigint();
    const event = req.validatedEvent;
    stampEventTelemetry(event, ingestNs);

    if (
      req.deviceKey?.allowedJunctionIds?.length > 0 &&
      !req.deviceKey.allowedJunctionIds.includes(event.junctionId)
    ) {
      recordRejected('unauthorized_junction', 1);
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
  startIngestTraceMiddleware('http-batch'),
  validateTelemetryBatch,
  async (req, res) => {
    const startT = Date.now();
    const ingestNs = req._ingestTimeNs || process.hrtime.bigint();
    const validItems = req.validatedBatchItems || [];
    const rejected = [...(req.rejectedBatchItems || [])];

    let acceptedCount = 0;
    let duplicateCount = 0;
    let queueFullCount = 0;
    let unauthCount = 0;
    let lateCount = 0;
    let gapCount = 0;
    let anomaliesCount = 0;

    withSyncSpan('buffer.enqueue', { attributes: { 'batch.size': validItems.length } }, () => {
      for (const { index, event } of validItems) {
        stampEventTelemetry(event, ingestNs);
        if (
          req.deviceKey?.allowedJunctionIds?.length > 0 &&
          !req.deviceKey.allowedJunctionIds.includes(event.junctionId)
        ) {
          unauthCount++;
          rejected.push({
            index,
            eventId: event.eventId,
            reason: `DeviceKey not permitted for junction '${event.junctionId}'`,
          });
          continue;
        }

        const bufferRes = ingestionBuffer.enqueue(event, { skipSpan: true, deferMetrics: true });
        if (!bufferRes.accepted) {
          if (bufferRes.classification === 'duplicate') {
            duplicateCount++;
          } else {
            queueFullCount++;
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
      if (acceptedCount > 0) recordAccepted(acceptedCount);
      if (duplicateCount > 0) recordDuplicates(duplicateCount);
      if (queueFullCount > 0) recordRejected('queue_full', queueFullCount);
      if (unauthCount > 0) recordRejected('unauthorized_junction', unauthCount);
    });

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

    const maxLimit = Math.min(parseInt(limit, 10) || 100, 2000);

    const records = await Telemetry.find(query)
      .sort({ timestamp: -1 })
      .limit(maxLimit)
      .lean();

    const ordered = records.reverse();
    const cursor = {};
    for (const rec of ordered) {
      const jId = rec.junctionId || rec.deviceId;
      const seq = Number(rec.sequence) || 0;
      if (jId && seq > (cursor[jId] || 0)) {
        cursor[jId] = seq;
      }
    }

    res.json({
      success: true,
      count: ordered.length,
      cursor,
      maxSequence: targetId ? cursor[targetId] || 0 : Math.max(0, ...Object.values(cursor)),
      records: ordered,
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
