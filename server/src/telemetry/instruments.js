import { metrics, SpanStatusCode, trace, TraceFlags } from '@opentelemetry/api';
import { getEventLoopLagStats, getOtelEpoch, isOtelEnabled } from './otel.js';

export const INGESTED_AT_SYM = Symbol('ingestedAt');
export const INGEST_SPAN_CTX_SYM = Symbol('ingestSpanContext');

const gaugeProviders = {
  getBufferDepth: () => 0,
  getSocketsConnected: () => 0,
};

let boundEpoch = -1;
let cachedTracer = null;
let cachedInst = null;

function ensureBound() {
  const epoch = getOtelEpoch();
  if (cachedInst && boundEpoch === epoch) {
    return cachedInst;
  }

  boundEpoch = epoch;
  cachedTracer = trace.getTracer('metropulse-ingest');
  const meter = metrics.getMeter('metropulse-ingest');

  const eventsAccepted = meter.createCounter('events.accepted', {
    description: 'Total telemetry events accepted into ingestion buffer',
  });
  const eventsRejected = meter.createCounter('events.rejected', {
    description: 'Total telemetry events rejected by validation/auth/capacity',
  });
  const eventsDuplicates = meter.createCounter('events.duplicates', {
    description: 'Total duplicate telemetry events dropped',
  });
  const eventsPersisted = meter.createCounter('events.persisted', {
    description: 'Total telemetry events persisted to MongoDB',
  });

  const ingestToPersistMs = meter.createHistogram('ingest_to_persist_ms', {
    unit: 'ms',
    description: 'End-to-end latency from ingest entry to MongoDB flush completion',
  });
  const ingestToEmitMs = meter.createHistogram('ingest_to_emit_ms', {
    unit: 'ms',
    description: 'End-to-end latency from ingest entry to Socket.IO Wire frame emit',
  });
  const flushDurationMs = meter.createHistogram('flush_duration_ms', {
    unit: 'ms',
    description: 'Duration of a single MongoDB ingestion buffer flush',
  });
  const flushBatchSize = meter.createHistogram('flush_batch_size', {
    unit: '{events}',
    description: 'Number of events written per MongoDB flush',
  });
  const simStepMs = meter.createHistogram('sim_step_ms', {
    unit: 'ms',
    description: 'Execution time of a single counterfactual physics simulation step',
  });
  const socketFrameBytes = meter.createHistogram('socket_frame_bytes', {
    unit: 'By',
    description: 'Serialized Socket.IO frame byte size per room emit',
  });
  const clientE2eMs = meter.createHistogram('client_e2e_ms', {
    unit: 'ms',
    description: 'Clock-offset-corrected server-emit to client-render latency',
  });

  const bufferDepthGauge = meter.createObservableGauge('buffer.depth', {
    description: 'Current number of events queued in ingestion buffer',
  });
  bufferDepthGauge.addCallback((res) => {
    res.observe(Number(gaugeProviders.getBufferDepth() || 0));
  });

  const socketsConnectedGauge = meter.createObservableGauge('sockets.connected', {
    description: 'Currently connected Socket.IO clients',
  });
  socketsConnectedGauge.addCallback((res) => {
    res.observe(Number(gaugeProviders.getSocketsConnected() || 0));
  });

  const eventLoopLagGauge = meter.createObservableGauge('event_loop.lag', {
    unit: 'ms',
    description: 'Mean Node.js event loop delay sampled via perf_hooks',
  });
  eventLoopLagGauge.addCallback((res) => {
    res.observe(getEventLoopLagStats().meanMs);
  });

  cachedInst = {
    tracer: cachedTracer,
    eventsAccepted,
    eventsRejected,
    eventsDuplicates,
    eventsPersisted,
    ingestToPersistMs,
    ingestToEmitMs,
    flushDurationMs,
    flushBatchSize,
    simStepMs,
    socketFrameBytes,
    clientE2eMs,
  };

  return cachedInst;
}

export function setGaugeProviders({ getBufferDepth, getSocketsConnected } = {}) {
  if (typeof getBufferDepth === 'function') {
    gaugeProviders.getBufferDepth = getBufferDepth;
  }
  if (typeof getSocketsConnected === 'function') {
    gaugeProviders.getSocketsConnected = getSocketsConnected;
  }
}

export function getTracer() {
  return ensureBound().tracer;
}

export function stampEventTelemetry(event, ingestTimeNs = process.hrtime.bigint()) {
  if (!event || typeof event !== 'object') return;
  if (!event[INGESTED_AT_SYM]) {
    event[INGESTED_AT_SYM] = ingestTimeNs;
  }
  if (!event[INGEST_SPAN_CTX_SYM] && isOtelEnabled()) {
    const activeCtx = trace.getActiveSpan()?.spanContext();
    if (activeCtx && (activeCtx.traceFlags & TraceFlags.SAMPLED) !== 0) {
      event[INGEST_SPAN_CTX_SYM] = activeCtx;
    }
  }
}

export function collectUniqueSpanLinks(events, maxLinks = 64) {
  if (!isOtelEnabled() || !Array.isArray(events) || events.length === 0) {
    return [];
  }
  const seen = new Set();
  const links = [];
  for (let i = 0; i < events.length && links.length < maxLinks; i++) {
    const sc = events[i]?.[INGEST_SPAN_CTX_SYM];
    if (!sc || !sc.traceId || !sc.spanId) continue;
    const key = `${sc.traceId}:${sc.spanId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ context: sc });
  }
  return links;
}

export function withSyncSpan(name, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = {};
  }
  if (!isOtelEnabled()) {
    return fn(null);
  }
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options || {}, (span) => {
    try {
      return fn(span);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message || 'error' });
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function withAsyncSpan(name, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = {};
  }
  if (!isOtelEnabled()) {
    return fn(null);
  }
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options || {}, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message || 'error' });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function recordAccepted(count = 1) {
  if (!isOtelEnabled() || count <= 0) return;
  ensureBound().eventsAccepted.add(count);
}

export function recordRejected(reason = 'invalid', count = 1) {
  if (!isOtelEnabled() || count <= 0) return;
  ensureBound().eventsRejected.add(count, { reason: String(reason || 'invalid') });
}

export function recordDuplicates(count = 1) {
  if (!isOtelEnabled() || count <= 0) return;
  ensureBound().eventsDuplicates.add(count);
}

export function recordPersisted(count = 1) {
  if (!isOtelEnabled() || count <= 0) return;
  ensureBound().eventsPersisted.add(count);
}

export function recordIngestToPersist(ms) {
  if (!isOtelEnabled() || !Number.isFinite(ms) || ms < 0) return;
  ensureBound().ingestToPersistMs.record(ms);
}

export function recordIngestToEmit(ms) {
  if (!isOtelEnabled() || !Number.isFinite(ms) || ms < 0) return;
  ensureBound().ingestToEmitMs.record(ms);
}

export function recordFlushDuration(ms) {
  if (!isOtelEnabled() || !Number.isFinite(ms) || ms < 0) return;
  ensureBound().flushDurationMs.record(ms);
}

export function recordFlushBatchSize(size) {
  if (!isOtelEnabled() || !Number.isFinite(size) || size < 0) return;
  ensureBound().flushBatchSize.record(size);
}

export function recordSimStep(ms) {
  if (!isOtelEnabled() || !Number.isFinite(ms) || ms < 0) return;
  ensureBound().simStepMs.record(ms);
}

export function recordSocketFrameBytes(room, bytes) {
  if (!isOtelEnabled() || !Number.isFinite(bytes) || bytes < 0) return;
  ensureBound().socketFrameBytes.record(bytes, { room: String(room || 'unknown') });
}

export function recordClientE2e(room, ms) {
  if (!isOtelEnabled() || !Number.isFinite(ms) || ms < 0) return;
  ensureBound().clientE2eMs.record(ms, { room: String(room || 'unknown') });
}
