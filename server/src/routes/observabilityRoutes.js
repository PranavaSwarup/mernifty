import express from 'express';
import { publicReadOrAuth } from '../middleware/auth.js';
import { metricsService } from '../services/metricsService.js';
import {
  HISTOGRAM_BOUNDARIES,
  SERVICE_NAME,
  SERVICE_VERSION,
  getOtelState,
  getRecentTraces,
  isOtelEnabled,
} from '../telemetry/otel.js';

const router = express.Router();

// GET /api/observability/traces?limit=50&span=...&priority=informative|chronological
router.get('/traces', publicReadOrAuth, (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
  const spanFilter = typeof req.query.span === 'string' ? req.query.span : '';
  const priority = req.query.priority === 'chronological' ? 'chronological' : 'informative';
  const otelState = getOtelState();
  const grouped = getRecentTraces(limit, { spanFilter, priority });

  res.json({
    success: true,
    enabled: isOtelEnabled(),
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    sampleRatio: otelState.sampleRatio,
    otlpEndpointConfigured: Boolean(otelState.otlpEndpoint),
    spanFilter,
    priority,
    ...grouped,
  });
});

// GET /api/observability/metrics
router.get('/metrics', publicReadOrAuth, async (req, res) => {
  const snapshot = await metricsService.getSnapshotAsync();
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  res.json({
    success: true,
    metrics: snapshot,
    percentiles: snapshot.otel?.histograms || {},
    counters: snapshot.otel?.counters || {},
    gauges: snapshot.otel?.gauges || {},
    bucketBoundaries: HISTOGRAM_BOUNDARIES,
    process: {
      pid: process.pid,
      uptimeSec: Number(process.uptime().toFixed(2)),
      memoryUsage: {
        rssBytes: mem.rss,
        rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
        heapUsedBytes: mem.heapUsed,
        heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
        heapTotalBytes: mem.heapTotal,
        externalBytes: mem.external,
      },
      cpuUsageMicros: cpu,
      eventLoopLagMs: snapshot.eventLoopLagMs || 0,
      eventLoopLagP99Ms: snapshot.eventLoopLagP99Ms || 0,
    },
  });
});

export default router;
