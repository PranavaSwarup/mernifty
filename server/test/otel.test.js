import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as ioClient } from '../../client/node_modules/socket.io-client/build/esm/index.js';

import { ROOT_CONTEXT } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace';
import {
  OperatorAwareSampler,
  getOtelState,
  interpolateHistogramPercentile,
  setOtelSampleRatio,
  shutdownOtel,
} from '../src/telemetry/otel.js';
import { app, server } from '../src/index.js';
import { DeviceKey, hashDeviceKey } from '../src/models/DeviceKey.js';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { metricsService } from '../src/services/metricsService.js';
import { simulatorService } from '../src/services/simulatorService.js';
import { socketService } from '../src/services/socketService.js';
import { resetRateLimitBuckets } from '../src/middleware/rateLimiter.js';

let mongod;
let baseUrl;
let deviceApiKey;

function makeValidEvent(seq = 1) {
  return {
    eventId: `EVT-OTEL-${Date.now()}-${seq}-${crypto.randomBytes(3).toString('hex')}`,
    junctionId: 'JNC-BLR-001',
    zoneId: 'south-bangalore',
    timestamp: new Date().toISOString(),
    sequence: seq,
    source: 'otel-test',
    data: {
      approaches: [
        {
          road: 'Hosur Rd (from south)',
          vehiclesPerMin: 40,
          queueLengthM: 75,
          avgSpeedKmph: 18,
          signal: 'green',
        },
        {
          road: 'ORR (from east)',
          vehiclesPerMin: 35,
          queueLengthM: 90,
          avgSpeedKmph: 14,
          signal: 'red',
        },
      ],
      vehicleMix: { twoWheeler: 0.55, car: 0.3, bus: 0.05, truck: 0.1 },
    },
  };
}

test.before(async () => {
  setOtelSampleRatio(1);

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await DeviceKey.deleteMany({});

  deviceApiKey = `mp_live_${crypto.randomBytes(16).toString('hex')}`;
  await DeviceKey.create({
    keyHash: hashDeviceKey(deviceApiKey),
    prefix: deviceApiKey.slice(0, 14),
    label: 'OTel Integration Key',
    allowedJunctionIds: [],
    revoked: false,
  });

  if (!socketService.io) {
    socketService.init(server);
  }
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  simulatorService.stop();
  ingestionBuffer.shutdown();
  metricsService.shutdown();
  socketService.shutdown();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  await shutdownOtel();
});

test('1. OTEL_SAMPLE_RATIO=1 captures telemetry.ingest, telemetry.validate, buffer.enqueue, and linked buffer.flush spans', async () => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();
  getOtelState().spanExporter.clear();

  const evt = makeValidEvent(101);
  const res = await fetch(`${baseUrl}/api/telemetry/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': deviceApiKey,
    },
    body: JSON.stringify(evt),
  });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.accepted, true);

  // Trigger DB flush synchronously so buffer.flush executes and exports spans
  const flushRes = await ingestionBuffer.flush();
  assert.equal(flushRes.insertedCount, 1);

  const spans = getOtelState().spanExporter.getFinishedSpans();
  const ingestSpan = spans.find((s) => s.name === 'telemetry.ingest');
  const validateSpan = spans.find((s) => s.name === 'telemetry.validate');
  const enqueueSpan = spans.find((s) => s.name === 'buffer.enqueue');
  const flushSpan = spans.find((s) => s.name === 'buffer.flush');

  assert.ok(ingestSpan, 'Expected telemetry.ingest span to be exported');
  assert.equal(ingestSpan.attributes.junctionId, 'JNC-BLR-001');
  assert.equal(ingestSpan.attributes.zoneId, 'south-bangalore');
  assert.equal(ingestSpan.attributes['batch.size'], 1);
  assert.equal(ingestSpan.attributes.source, 'http-ingest');

  assert.ok(validateSpan, 'Expected telemetry.validate span to be exported');
  assert.equal(validateSpan.traceId, ingestSpan.traceId);

  assert.ok(enqueueSpan, 'Expected buffer.enqueue span to be exported');
  assert.equal(enqueueSpan.traceId, ingestSpan.traceId);

  assert.ok(flushSpan, 'Expected buffer.flush span to be exported');
  assert.notEqual(flushSpan.traceId, ingestSpan.traceId, 'buffer.flush should start a fresh root trace');
  assert.equal(flushSpan.attributes['db.batch.size'], 1);
  assert.equal(flushSpan.attributes['db.duplicates'], 0);
  assert.ok(Array.isArray(flushSpan.links) && flushSpan.links.length >= 1, 'Expected span link(s) on buffer.flush');
  assert.ok(
    flushSpan.links.some((l) => l.traceId === ingestSpan.traceId),
    'Expected buffer.flush span link to reference telemetry.ingest traceId'
  );
});

test('2. Observability endpoints return grouped traces (with links) and bucket-interpolated histogram percentiles', async () => {
  const traceRes = await fetch(`${baseUrl}/api/observability/traces?limit=50`);
  assert.equal(traceRes.status, 200);
  const traceJson = await traceRes.json();
  assert.equal(traceJson.success, true);
  assert.equal(traceJson.enabled, true);
  assert.ok(Array.isArray(traceJson.traces) && traceJson.traces.length >= 2);
  assert.ok(traceJson.traces.some((t) => t.hasLinks === true));

  simulatorService.stepPhysics();
  const metricRes = await fetch(`${baseUrl}/api/observability/metrics`);
  assert.equal(metricRes.status, 200);
  const metricJson = await metricRes.json();
  assert.equal(metricJson.success, true);

  const hist = metricJson.percentiles;
  assert.ok(hist.ingestToPersistMs.count >= 1, 'Expected ingestToPersistMs samples');
  assert.ok(hist.flushDurationMs.count >= 1, 'Expected flushDurationMs samples');
  assert.ok(hist.simStepMs.count >= 1, 'Expected simStepMs samples');
  assert.ok(hist.ingestToPersistMs.p50 >= 0);
  assert.ok(hist.ingestToPersistMs.p95 >= hist.ingestToPersistMs.p50);
  assert.ok(hist.ingestToPersistMs.p99 >= hist.ingestToPersistMs.p95);

  assert.ok(metricJson.counters['events.accepted'] >= 1);
  assert.ok(metricJson.counters['events.persisted'] >= 1);
});

test('3. Histogram bucket linear interpolation yields bounded p50/p95/p99 and OperatorAwareSampler always samples control spans', () => {
  const buckets = {
    boundaries: [10, 50, 100],
    counts: [50, 45, 5, 0],
  };
  const p50 = interpolateHistogramPercentile(buckets, 0.5, 1, 80);
  const p95 = interpolateHistogramPercentile(buckets, 0.95, 1, 80);
  const p99 = interpolateHistogramPercentile(buckets, 0.99, 1, 80);
  assert.ok(p50 >= 1 && p50 <= 10, `p50=${p50} expected in [1, 10]`);
  assert.ok(p95 >= 10 && p95 <= 50, `p95=${p95} expected in [10, 50]`);
  assert.ok(p99 >= 50 && p99 <= 100, `p99=${p99} expected in [50, 100]`);

  const sampler = new OperatorAwareSampler(0);
  const copilotDecision = sampler.shouldSample(ROOT_CONTEXT, '0123456789abcdef0123456789abcdef', 'copilot.whatif', 0, {}, []);
  assert.equal(copilotDecision.decision, SamplingDecision.RECORD_AND_SAMPLED);
  const normalDecision = sampler.shouldSample(ROOT_CONTEXT, '0123456789abcdef0123456789abcdef', 'telemetry.ingest', 0, {}, []);
  assert.equal(normalDecision.decision, SamplingDecision.NOT_RECORD);
});

test('4. City payloads omit heavy per-junction maps and ping/pong + client:latency populates client_e2e_ms', async () => {
  const fullCf = simulatorService.getCounterfactual();
  const cityCf = simulatorService.getCityCounterfactual();
  assert.ok(fullCf.byJunction && Object.keys(fullCf.byJunction).length > 0);
  assert.equal(cityCf.byJunction, undefined);
  assert.equal(cityCf.emergency?.trips, undefined);

  const citySnap = metricsService.getCitySnapshot();
  assert.equal(citySnap.socketBytesByRoom, undefined);
  assert.equal(citySnap.integrity?.byJunction, undefined);

  const sock = ioClient(baseUrl, { transports: ['websocket'] });
  await new Promise((resolve) => sock.on('connect', resolve));

  const pongPromise = new Promise((resolve) => sock.once('telemetry:pong', resolve));
  const t0 = Date.now();
  sock.emit('telemetry:ping', t0);
  const pong = await pongPromise;
  assert.equal(pong.clientTimestamp, t0);
  assert.equal(typeof pong.serverRecvTimestamp, 'number');
  assert.equal(typeof pong.serverSendTimestamp, 'number');

  sock.emit('client:latency', {
    room: 'city',
    p50: 12.5,
    p95: 22.0,
    p99: 28.0,
    samplesMs: [11.2, 12.5, 24.0],
  });
  await new Promise((r) => setTimeout(r, 80));

  const mRes = await fetch(`${baseUrl}/api/observability/metrics`);
  const mJson = await mRes.json();
  assert.ok(mJson.percentiles.clientE2eMs.count >= 3, 'Expected client_e2e_ms histogram samples');
  assert.ok(mJson.percentiles.clientE2eMs.p50 > 0);

  sock.disconnect();
});
