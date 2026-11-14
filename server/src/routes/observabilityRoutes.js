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

// GET /api/observability/traces?limit=50
router.get('/traces', publicReadOrAuth, (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
  const otelState = getOtelState();
  const grouped = getRecentTraces(limit);

  res.json({
    success: true,
    enabled: isOtelEnabled(),
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    sampleRatio: otelState.sampleRatio,
    otlpEndpointConfigured: Boolean(otelState.otlpEndpoint),
    ...grouped,
  });
});

// GET /api/observability/metrics
router.get('/metrics', publicReadOrAuth, async (req, res) => {
  const snapshot = await metricsService.getSnapshotAsync();
  res.json({
    success: true,
    metrics: snapshot,
    percentiles: snapshot.otel?.histograms || {},
    counters: snapshot.otel?.counters || {},
    gauges: snapshot.otel?.gauges || {},
    bucketBoundaries: HISTOGRAM_BOUNDARIES,
  });
});

export default router;
