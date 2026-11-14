import fs from 'fs';
import { performance, monitorEventLoopDelay } from 'perf_hooks';
import { trace, metrics, context, TraceFlags } from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  SamplingDecision,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace';
import {
  AggregationType,
  DataPointType,
  MetricReader,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';

const pkgJson = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
export const SERVICE_VERSION = pkgJson.version || '1.0.0';
export const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'metropulse-ingest';

export const HISTOGRAM_BOUNDARIES = {
  MS_LATENCY: [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2500, 5000],
  BATCH_SIZE: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  FRAME_BYTES: [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
};

const ALWAYS_SAMPLED_SPANS = new Set([
  'copilot.whatif',
  'operator.action',
  'sim.controller',
  'sim.scenario',
  'alert.resolve',
]);

const OPERATOR_ROUTE_PREFIXES = [
  '/api/sim/controller',
  '/api/sim/scenario',
  '/api/sim/emergency',
  '/api/sim/weather',
  '/api/copilot',
  '/api/simulator',
  '/api/actions',
];

function hrTimeToMs(hrTime) {
  if (!Array.isArray(hrTime) || hrTime.length < 2) return 0;
  return hrTime[0] * 1000 + hrTime[1] / 1e6;
}

function isOperatorControlledRequest(spanName, attributes = {}) {
  if (ALWAYS_SAMPLED_SPANS.has(spanName) || attributes['operator.action'] === true) {
    return true;
  }
  const route =
    attributes['http.route'] ||
    attributes['url.path'] ||
    attributes['http.target'] ||
    '';
  if (typeof route !== 'string' || !route) return false;
  if (OPERATOR_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix))) {
    return true;
  }
  if (route.startsWith('/api/alerts/') && route.includes('/resolve')) {
    return true;
  }
  return false;
}

export class OperatorAwareSampler {
  constructor(sampleRatio = 0.05) {
    this.setSampleRatio(sampleRatio);
  }

  setSampleRatio(sampleRatio) {
    const ratio = Number.isFinite(sampleRatio) ? Math.min(1, Math.max(0, sampleRatio)) : 0.05;
    this.sampleRatio = ratio;
    this._delegate = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(ratio),
    });
  }

  shouldSample(ctx, traceId, spanName, spanKind, attributes, links) {
    if (isOperatorControlledRequest(spanName, attributes)) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }
    const safeCtx = ctx ?? context.active();
    return this._delegate.shouldSample(safeCtx, traceId, spanName, spanKind, attributes, links);
  }

  toString() {
    return `OperatorAwareSampler(ratio=${this.sampleRatio})`;
  }
}

export class RingBufferSpanExporter {
  constructor(capacity = 500) {
    this.capacity = capacity;
    this.spans = [];
    this._stopped = false;
  }

  export(spans, resultCallback) {
    if (this._stopped) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }
    for (const span of spans) {
      const ctx = span.spanContext();
      const startMs = hrTimeToMs(span.startTime);
      const endMs = hrTimeToMs(span.endTime);
      const record = {
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: span.parentSpanContext?.spanId || null,
        name: span.name,
        kind: span.kind,
        startTimeMs: Number(startMs.toFixed(3)),
        endTimeMs: Number(endMs.toFixed(3)),
        durationMs: Number(Math.max(0, endMs - startMs).toFixed(3)),
        status: {
          code: span.status?.code ?? 0,
          message: span.status?.message || '',
        },
        attributes: { ...(span.attributes || {}) },
        links: Array.isArray(span.links)
          ? span.links.map((l) => ({
              traceId: l.context?.traceId,
              spanId: l.context?.spanId,
              attributes: { ...(l.attributes || {}) },
            }))
          : [],
      };
      this.spans.push(record);
      if (this.spans.length > this.capacity) {
        this.spans.shift();
      }
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  getFinishedSpans() {
    return this.spans.slice();
  }

  getGroupedTraces(limit = 50, { spanFilter = '', priority = 'informative' } = {}) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const groups = new Map();

    // Group all buffered spans first so low-volume informative traces (copilot/operator/links)
    // aren't starved out by rapid 1-span buffer.enqueue ticks.
    for (let i = this.spans.length - 1; i >= 0; i--) {
      const span = this.spans[i];
      let g = groups.get(span.traceId);
      if (!g) {
        g = {
          traceId: span.traceId,
          rootName: span.name,
          startTimeMs: span.startTimeMs,
          endTimeMs: span.endTimeMs,
          durationMs: span.durationMs,
          spanCount: 0,
          hasLinks: false,
          linkCount: 0,
          spans: [],
        };
        groups.set(span.traceId, g);
      }
      g.spans.push(span);
      g.spanCount += 1;
      const lLen = Array.isArray(span.links) ? span.links.length : 0;
      if (lLen > 0) {
        g.hasLinks = true;
        g.linkCount += lLen;
      }
      if (!span.parentSpanId) g.rootName = span.name;
      if (span.startTimeMs < g.startTimeMs) g.startTimeMs = span.startTimeMs;
      if (span.endTimeMs > g.endTimeMs) g.endTimeMs = span.endTimeMs;
      g.durationMs = Number(Math.max(0, g.endTimeMs - g.startTimeMs).toFixed(3));
    }

    const filterLower = String(spanFilter || '').trim().toLowerCase();
    const classifyTier = (g) => {
      const names = g.spans.map((s) => s.name);
      const isOperatorOrCopilot = names.some(
        (n) =>
          ALWAYS_SAMPLED_SPANS.has(n) ||
          n.startsWith('copilot.') ||
          n.startsWith('sim.') ||
          n.startsWith('operator.') ||
          n.startsWith('alert.')
      );
      if (isOperatorOrCopilot) return 3;
      const hasNonEnqueue = names.some((n) => n !== 'buffer.enqueue');
      if (
        g.hasLinks ||
        names.includes('buffer.flush') ||
        names.includes('telemetry.ingest') ||
        (g.spanCount >= 2 && hasNonEnqueue)
      ) {
        return 2;
      }
      if (names.every((n) => n === 'buffer.enqueue')) return 0;
      return 1;
    };

    let traces = Array.from(groups.values()).map((t) => {
      t.spans.sort((a, b) => a.startTimeMs - b.startTimeMs);
      t.spanNames = Array.from(new Set(t.spans.map((s) => s.name)));
      t.priorityTier = classifyTier(t);
      return t;
    });

    const availableSpanNames = Array.from(
      new Set(this.spans.map((s) => s.name))
    ).sort();

    if (filterLower) {
      traces = traces.filter(
        (t) =>
          String(t.rootName || '').toLowerCase().includes(filterLower) ||
          t.spans.some((s) => String(s.name || '').toLowerCase().includes(filterLower))
      );
    }

    if (priority === 'chronological') {
      traces.sort((a, b) => b.endTimeMs - a.endTimeMs);
    } else {
      // Informative traces (operator/copilot >= linked buffer.flush/ingest >= multi-ms > 1-span enqueue)
      traces.sort((a, b) => {
        if (b.priorityTier !== a.priorityTier) return b.priorityTier - a.priorityTier;
        return b.endTimeMs - a.endTimeMs;
      });
    }

    return {
      traces: traces.slice(0, safeLimit),
      totalTracesBuffered: groups.size,
      totalSpansBuffered: this.spans.length,
      availableSpanNames,
      capacity: this.capacity,
    };
  }

  clear() {
    this.spans = [];
  }

  async forceFlush() {}

  async shutdown() {
    this._stopped = true;
  }
}

export class InProcessMetricReader extends MetricReader {
  async onForceFlush() {}
  async onShutdown() {}
}

/**
 * Estimate percentile p in [0, 1] from explicit OTel histogram buckets via linear interpolation.
 * Note: Exact values inside a bucket are unknown; linear interpolation assumes uniform density
 * across [lower, upper], bounded cleanly by [max(0, min), max] on outer buckets.
 */
export function interpolateHistogramPercentile(buckets, q, minVal = 0, maxVal = null) {
  if (!buckets || !Array.isArray(buckets.counts) || !Array.isArray(buckets.boundaries)) {
    return 0;
  }
  const counts = buckets.counts;
  const boundaries = buckets.boundaries;
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    total += counts[i];
  }
  if (total === 0) return 0;

  const target = Math.max(0, Math.min(1, q)) * total;
  let cumulative = 0;

  for (let i = 0; i < counts.length; i++) {
    const bucketCount = counts[i];
    const prevCumulative = cumulative;
    cumulative += bucketCount;
    if (bucketCount > 0 && cumulative >= target) {
      const lower =
        i === 0 ? Math.max(0, Number.isFinite(minVal) ? minVal : 0) : boundaries[i - 1];
      const lastBoundary = boundaries[boundaries.length - 1] ?? lower;
      const rawUpper =
        i < boundaries.length
          ? boundaries[i]
          : Math.max(lastBoundary, Number.isFinite(maxVal) ? maxVal : lastBoundary);
      const upper = Number.isFinite(maxVal) ? Math.max(lower, Math.min(rawUpper, maxVal)) : rawUpper;
      const fraction = Math.max(0, Math.min(1, (target - prevCumulative) / bucketCount));
      const rawEst = lower + fraction * Math.max(0, upper - lower);
      const est = Number.isFinite(maxVal) ? Math.min(maxVal, rawEst) : rawEst;
      return Number(est.toFixed(2));
    }
  }
  return Number((maxVal ?? boundaries[boundaries.length - 1] ?? 0).toFixed(2));
}

function summarizeHistogramMetric(metricRecord) {
  const dps = metricRecord.dataPoints || [];
  if (dps.length === 0) {
    return {
      count: 0,
      sum: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      boundaries: [],
      counts: [],
      byAttribute: {},
    };
  }

  let mergedBoundaries = dps[0].value?.buckets?.boundaries || [];
  let mergedCounts = new Array(dps[0].value?.buckets?.counts?.length || 0).fill(0);
  let totalCount = 0;
  let totalSum = 0;
  let globalMin = Infinity;
  let globalMax = -Infinity;
  const byAttribute = {};

  for (const dp of dps) {
    const v = dp.value || {};
    const b = v.buckets || { boundaries: [], counts: [] };
    if (b.boundaries.length > mergedBoundaries.length) {
      mergedBoundaries = b.boundaries;
    }
    if (b.counts.length > mergedCounts.length) {
      mergedCounts = b.counts.slice();
    } else {
      for (let i = 0; i < b.counts.length; i++) {
        mergedCounts[i] += b.counts[i];
      }
    }
    const c = v.count || 0;
    totalCount += c;
    totalSum += v.sum || 0;
    if (c > 0) {
      if (Number.isFinite(v.min) && v.min < globalMin) globalMin = v.min;
      if (Number.isFinite(v.max) && v.max > globalMax) globalMax = v.max;
    }

    const attrKeys = Object.keys(dp.attributes || {});
    if (attrKeys.length > 0 && c > 0) {
      const label = attrKeys.map((k) => `${k}=${dp.attributes[k]}`).join(',');
      byAttribute[label] = {
        count: c,
        sum: Number((v.sum || 0).toFixed(2)),
        min: Number((v.min || 0).toFixed(2)),
        max: Number((v.max || 0).toFixed(2)),
        p50: interpolateHistogramPercentile(b, 0.5, v.min, v.max),
        p95: interpolateHistogramPercentile(b, 0.95, v.min, v.max),
        p99: interpolateHistogramPercentile(b, 0.99, v.min, v.max),
      };
    }
  }

  const minOut = globalMin === Infinity ? 0 : Number(globalMin.toFixed(2));
  const maxOut = globalMax === -Infinity ? 0 : Number(globalMax.toFixed(2));
  const mergedBuckets = { boundaries: mergedBoundaries, counts: mergedCounts };

  return {
    count: totalCount,
    sum: Number(totalSum.toFixed(2)),
    min: minOut,
    max: maxOut,
    p50: interpolateHistogramPercentile(mergedBuckets, 0.5, minOut, maxOut),
    p95: interpolateHistogramPercentile(mergedBuckets, 0.95, minOut, maxOut),
    p99: interpolateHistogramPercentile(mergedBuckets, 0.99, minOut, maxOut),
    boundaries: mergedBoundaries,
    counts: mergedCounts,
    byAttribute,
  };
}

let state = {
  epoch: 0,
  initialized: false,
  disabled: false,
  sdk: null,
  sampler: null,
  spanExporter: null,
  metricReader: null,
  eventLoopMonitor: null,
  sampleRatio: 0.05,
  otlpEndpoint: null,
  cachedMetricsSnapshot: {
    counters: {},
    histograms: {},
    gauges: {},
    collectedAt: null,
  },
};

function parseSampleRatio(overrideRatio) {
  if (typeof overrideRatio === 'number' && Number.isFinite(overrideRatio)) {
    return Math.min(1, Math.max(0, overrideRatio));
  }
  const raw = process.env.OTEL_SAMPLE_RATIO;
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.min(1, Math.max(0, parsed));
    }
  }
  return 0.05;
}

export function initOtel({ sampleRatio, forceReinit = false } = {}) {
  if (state.initialized && !forceReinit) {
    return state;
  }

  const disabled = process.env.OTEL_SDK_DISABLED === 'true' || process.env.OTEL_SDK_DISABLED === '1';
  if (disabled) {
    state = {
      ...state,
      epoch: state.epoch + 1,
      initialized: true,
      disabled: true,
      sdk: null,
      spanExporter: null,
      metricReader: null,
      sampleRatio: 0,
    };
    return state;
  }

  const ratio = parseSampleRatio(sampleRatio);
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || null;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
  });

  const spanExporter = new RingBufferSpanExporter(500);
  const spanProcessors = [new SimpleSpanProcessor({ exporter: spanExporter })];

  const metricReader = new InProcessMetricReader();
  const metricReaders = [metricReader];

  if (otlpEndpoint) {
    const base = otlpEndpoint.replace(/\/+$/, '');
    const traceExporter = new OTLPTraceExporter({
      url: base.endsWith('/v1/traces') ? base : `${base}/v1/traces`,
    });
    spanProcessors.push(new BatchSpanProcessor({ exporter: traceExporter }));

    const otlpMetricExporter = new OTLPMetricExporter({
      url: base.endsWith('/v1/metrics') ? base : `${base}/v1/metrics`,
    });
    const periodicReader = new PeriodicExportingMetricReader({
      exporter: otlpMetricExporter,
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS) || 5000,
    });
    metricReaders.push(periodicReader);
  }

  const views = [
    ...['ingest_to_persist_ms', 'ingest_to_emit_ms', 'flush_duration_ms', 'sim_step_ms', 'client_e2e_ms'].map(
      (instrumentName) => ({
        instrumentName,
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: HISTOGRAM_BOUNDARIES.MS_LATENCY },
        },
      })
    ),
    {
      instrumentName: 'flush_batch_size',
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: HISTOGRAM_BOUNDARIES.BATCH_SIZE },
      },
    },
    {
      instrumentName: 'socket_frame_bytes',
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: HISTOGRAM_BOUNDARIES.FRAME_BYTES },
      },
    },
  ];

  const sampler = new OperatorAwareSampler(ratio);

  const sdk = new NodeSDK({
    resource,
    sampler,
    spanProcessors,
    metricReaders,
    views,
    logRecordProcessors: [],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => req.url === '/api/health',
      }),
      new ExpressInstrumentation({
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE, ExpressLayerType.ROUTER],
      }),
      new MongooseInstrumentation(),
      new MongoDBInstrumentation(),
      new SocketIoInstrumentation(),
    ],
  });

  sdk.start();

  const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
  eventLoopMonitor.enable();

  state = {
    epoch: state.epoch + 1,
    initialized: true,
    disabled: false,
    sdk,
    sampler,
    spanExporter,
    metricReader,
    eventLoopMonitor,
    sampleRatio: ratio,
    otlpEndpoint,
    cachedMetricsSnapshot: {
      counters: {},
      histograms: {},
      gauges: {},
      collectedAt: null,
    },
  };

  return state;
}

export async function shutdownOtel() {
  if (state.eventLoopMonitor) {
    try {
      state.eventLoopMonitor.disable();
    } catch {
      // ignore
    }
    state.eventLoopMonitor = null;
  }
  if (state.sdk) {
    try {
      await state.sdk.shutdown();
    } catch {
      // ignore
    }
    state.sdk = null;
  }
  trace.disable();
  metrics.disable();
  state.initialized = false;
}

export async function reinitOtelForTest(options = {}) {
  await shutdownOtel();
  return initOtel({ ...options, forceReinit: true });
}

export function setOtelSampleRatio(ratio) {
  if (state.sampler) {
    state.sampler.setSampleRatio(ratio);
  }
  state.sampleRatio = state.sampler ? state.sampler.sampleRatio : ratio;
}

export function getOtelState() {
  return state;
}

export function getRecentTraces(limit = 50, opts = {}) {
  if (!state.spanExporter) {
    return { traces: [], totalTracesBuffered: 0, totalSpansBuffered: 0, availableSpanNames: [], capacity: 500 };
  }
  return state.spanExporter.getGroupedTraces(limit, opts);
}

export function getEventLoopLagStats() {
  if (!state.eventLoopMonitor) {
    return { meanMs: 0, p99Ms: 0 };
  }
  const meanMs = Number((state.eventLoopMonitor.mean / 1e6).toFixed(2));
  const p99Ms = Number((state.eventLoopMonitor.percentile(99) / 1e6).toFixed(2));
  return {
    meanMs: Number.isFinite(meanMs) ? meanMs : 0,
    p99Ms: Number.isFinite(p99Ms) ? p99Ms : 0,
  };
}

export async function refreshOtelMetricsSnapshot() {
  if (state.disabled || !state.metricReader) {
    return state.cachedMetricsSnapshot;
  }
  try {
    const result = await state.metricReader.collect();
    const counters = {};
    const histograms = {};
    const gauges = {};

    const scopeMetrics = result?.resourceMetrics?.scopeMetrics || [];
    for (const scope of scopeMetrics) {
      for (const m of scope.metrics || []) {
        const name = m.descriptor?.name;
        if (!name) continue;
        if (m.dataPointType === DataPointType.HISTOGRAM) {
          histograms[name] = summarizeHistogramMetric(m);
        } else if (m.dataPointType === DataPointType.SUM) {
          let sum = 0;
          const byReason = {};
          for (const dp of m.dataPoints || []) {
            sum += dp.value || 0;
            if (dp.attributes?.reason) {
              byReason[dp.attributes.reason] =
                (byReason[dp.attributes.reason] || 0) + (dp.value || 0);
            }
          }
          counters[name] = Object.keys(byReason).length > 0 ? { total: sum, byReason } : sum;
        } else if (m.dataPointType === DataPointType.GAUGE) {
          const lastDp = m.dataPoints?.[m.dataPoints.length - 1];
          gauges[name] = lastDp ? Number(Number(lastDp.value || 0).toFixed(2)) : 0;
        }
      }
    }

    state.cachedMetricsSnapshot = {
      counters,
      histograms,
      gauges,
      collectedAt: new Date().toISOString(),
    };
  } catch {
    // Keep prior cached snapshot on transient collection error
  }
  return state.cachedMetricsSnapshot;
}

export function getCachedOtelMetricsSnapshot() {
  return state.cachedMetricsSnapshot;
}

export function getOtelEpoch() {
  return state.epoch;
}

export function isOtelEnabled() {
  return state.initialized && !state.disabled;
}

// Auto-initialize when preloaded via `node --import ./src/telemetry/otel.js` or imported first
initOtel();
