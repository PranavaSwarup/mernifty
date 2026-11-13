import express from 'express';
import { Telemetry } from '../models/Telemetry.js';
import { ingestionBuffer } from '../services/ingestionBuffer.js';
import { anomalyEngine } from '../services/anomalyEngine.js';
import { socketService } from '../services/socketService.js';
import { metricsService } from '../services/metricsService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validateTelemetryEvent, validateTelemetryBatch } from '../middleware/validator.js';

const router = express.Router();

// 1. Single Telemetry Ingestion Endpoint
router.post('/ingest', rateLimiter(), validateTelemetryEvent, async (req, res) => {
  const startT = Date.now();
  const event = req.validatedEvent;

  // Enqueue to write-behind buffer
  const bufferRes = ingestionBuffer.enqueue(event);
  if (!bufferRes.accepted) {
    return res.status(429).json({ success: false, error: bufferRes.reason });
  }

  // Anomaly detection
  const alert = anomalyEngine.evaluate(event);

  // Real-time broadcast
  socketService.broadcastTelemetry(event);

  const latency = Date.now() - startT;
  metricsService.recordIngest(1, latency);

  res.status(202).json({
    success: true,
    eventId: event.eventId,
    anomalyDetected: !!alert,
    processingLatencyMs: latency,
  });
});

// 2. Batch High-Throughput Ingestion Endpoint
router.post('/batch', rateLimiter({ max: 5000 }), validateTelemetryBatch, async (req, res) => {
  const startT = Date.now();
  const events = req.validatedEvents;

  let anomaliesCount = 0;
  for (const event of events) {
    ingestionBuffer.enqueue(event);
    const alert = anomalyEngine.evaluate(event);
    if (alert) anomaliesCount++;
    socketService.broadcastTelemetry(event);
  }

  const latency = Date.now() - startT;
  metricsService.recordIngest(events.length, latency);

  res.status(202).json({
    success: true,
    count: events.length,
    anomaliesCount,
    batchProcessingLatencyMs: latency,
  });
});

// 3. Historical Telemetry Retrieval
// Supports: deviceId, category, from, to, limit
router.get('/history', async (req, res) => {
  try {
    const { deviceId, category, from, to, limit = 100 } = req.query;
    const query = {};

    if (deviceId) query.deviceId = deviceId;
    if (category) query.category = category;

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
      records: records.reverse(), // chronologically ascending for charts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Aggregated Time-Series Data (for fast long-span charts)
router.get('/aggregate', async (req, res) => {
  try {
    const { deviceId, minutes = 15, bucketSeconds = 10 } = req.query;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required for aggregation' });
    }

    const sinceDate = new Date(Date.now() - parseInt(minutes, 10) * 60 * 1000);
    const intervalMs = parseInt(bucketSeconds, 10) * 1000;

    // Fetch raw records within window
    const records = await Telemetry.find({
      deviceId,
      timestamp: { $gte: sinceDate },
    })
      .sort({ timestamp: 1 })
      .lean();

    // Group into buckets in-memory (resilient across Mongo standalone/memory-server)
    const buckets = new Map();
    for (const rec of records) {
      const bucketTime = Math.floor(new Date(rec.timestamp).getTime() / intervalMs) * intervalMs;
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, []);
      }
      buckets.get(bucketTime).push(rec.metrics);
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
      deviceId,
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
