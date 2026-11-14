import express from 'express';
import { Telemetry } from '../models/Telemetry.js';
import { ingestionBuffer } from '../services/ingestionBuffer.js';
import { anomalyEngine } from '../services/anomalyEngine.js';
import { socketService } from '../services/socketService.js';
import { metricsService } from '../services/metricsService.js';
import { rateLimiter, sourceRateLimiter, checkSourceRateLimit } from '../middleware/rateLimiter.js';
import { validateTelemetryEvent, validateTelemetryBatch } from '../middleware/validator.js';
import { requireDataSourceKey } from '../middleware/auth.js';

const router = express.Router();

// 1. Single Traffic Junction Ingestion Endpoint
router.post('/ingest', requireDataSourceKey, rateLimiter(), sourceRateLimiter(), validateTelemetryEvent, async (req, res) => {
  const startT = Date.now();
  const event = req.validatedEvent;

  // Enqueue to write-behind buffer
  const bufferRes = ingestionBuffer.enqueue(event);
  if (!bufferRes.accepted) {
    if (bufferRes.reason && bufferRes.reason.includes('Duplicate')) {
      return res.status(409).json({ success: false, error: bufferRes.reason });
    }
    return res.status(429).json({ success: false, error: bufferRes.reason });
  }

  // Anomaly & gridlock detection
  const alert = anomalyEngine.evaluate(event);

  // Real-time broadcast
  socketService.broadcastTelemetry(event);

  const latency = Date.now() - startT;
  metricsService.recordIngest(1, latency);

  res.status(202).json({
    success: true,
    eventId: event.eventId,
    junctionId: event.junctionId,
    zoneId: event.zoneId,
    anomalyDetected: !!alert,
    alertTitle: alert ? alert.title : null,
    processingLatencyMs: latency,
  });
});

// 2. Batch High-Throughput Traffic Ingestion Endpoint
router.post('/batch', requireDataSourceKey, rateLimiter({ max: 5000 }), validateTelemetryBatch, async (req, res) => {
  const startT = Date.now();
  const events = req.validatedEvents || [];
  const apiKey = req.headers['x-api-key'] || req.query?.apiKey;

  let acceptedCount = 0;
  let duplicateCount = 0;
  let rateLimitedCount = 0;
  let backpressureCount = 0;
  let anomaliesCount = 0;

  for (const event of events) {
    const juncId = event.junctionId || event.deviceId;

    // Apply per-source rate limit to batches (Section 5.5)
    const rateCheck = checkSourceRateLimit(juncId, apiKey);
    if (!rateCheck.allowed) {
      rateLimitedCount++;
      continue;
    }

    // Attempt enqueue to write-behind buffer
    const bufferRes = ingestionBuffer.enqueue(event);
    if (!bufferRes.accepted) {
      if (bufferRes.reason && bufferRes.reason.includes('Duplicate')) {
        duplicateCount++;
      } else {
        backpressureCount++;
      }
      continue;
    }

    // Event is accepted: evaluate anomaly and broadcast
    acceptedCount++;
    const alert = anomalyEngine.evaluate(event);
    if (alert) anomaliesCount++;
    socketService.broadcastTelemetry(event);
  }

  const latency = Date.now() - startT;
  if (acceptedCount > 0) {
    metricsService.recordIngest(acceptedCount, latency);
  }

  res.status(202).json({
    success: true,
    count: events.length,
    accepted: acceptedCount,
    duplicate: duplicateCount,
    rateLimited: rateLimitedCount,
    invalid: req.invalidCount || 0,
    backpressure: backpressureCount,
    anomaliesCount,
    batchProcessingLatencyMs: latency,
  });
});

// 3. Historical Telemetry Retrieval
// Supports: junctionId / deviceId, zoneId / category, from, to, limit
router.get('/history', async (req, res) => {
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

    // Section 5.9: Deduplicate by eventId
    const seenEventIds = new Set();
    const uniqueRecords = [];
    for (const rec of records) {
      if (rec.eventId && !seenEventIds.has(rec.eventId)) {
        seenEventIds.add(rec.eventId);
        uniqueRecords.push(rec);
      } else if (!rec.eventId) {
        uniqueRecords.push(rec);
      }
    }

    res.json({
      success: true,
      count: uniqueRecords.length,
      records: uniqueRecords.reverse(), // chronologically ascending for charts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Aggregated Time-Series Data (for fast long-span charts)
router.get('/aggregate', async (req, res) => {
  try {
    const { junctionId, deviceId, minutes = 15, bucketSeconds = 10 } = req.query;
    const targetId = junctionId || deviceId;
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'junctionId/deviceId is required for aggregation' });
    }

    const sinceDate = new Date(Date.now() - parseInt(minutes, 10) * 60 * 1000);
    const intervalMs = parseInt(bucketSeconds, 10) * 1000;

    // Fetch raw records within window
    const records = await Telemetry.find({
      $or: [{ junctionId: targetId }, { deviceId: targetId }],
      timestamp: { $gte: sinceDate },
    })
      .sort({ timestamp: 1 })
      .lean();

    // Group into buckets in-memory
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

// 5. System Performance & Throughput Metrics
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    stats: metricsService.getSnapshot(),
  });
});

export default router;
