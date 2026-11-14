import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { app, server } from '../src/index.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Device } from '../src/models/Device.js';
import { User } from '../src/models/User.js';
import { DeviceKey, hashDeviceKey } from '../src/models/DeviceKey.js';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { metricsService } from '../src/services/metricsService.js';
import { socketService } from '../src/services/socketService.js';
import { resetRateLimitBuckets } from '../src/middleware/rateLimiter.js';

let mongod;
let baseUrl;
let deviceApiKey;
let viewerToken;
let southToken;
let adminToken;

function makeValidEvent(overrides = {}) {
  const nowIso = new Date().toISOString();
  return {
    eventId: `EVT-INT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    junctionId: 'JNC-BLR-001',
    zoneId: 'south-bangalore',
    timestamp: nowIso,
    sequence: 1,
    data: {
      approaches: [
        {
          road: 'Hosur Rd (Silk Board)',
          vehiclesPerMin: 42,
          queueLengthM: 85,
          avgSpeedKmph: 16,
          signal: 'green',
        },
        {
          road: 'ORR (Silk Board)',
          vehiclesPerMin: 38,
          queueLengthM: 110,
          avgSpeedKmph: 12,
          signal: 'red',
        },
      ],
      vehicleMix: { twoWheeler: 0.55, car: 0.30, bus: 0.05, truck: 0.10 },
      stalledVehicleDetected: false,
    },
    ...overrides,
  };
}

async function apiJson(path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, body: json };
}

test.before(async () => {
  process.env.DEMO_PERSONAS = 'true';
  process.env.PUBLIC_READONLY = 'true';
  process.env.RATE_LIMIT_AUTH_CAPACITY = '2000';
  process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC = '200';

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await Telemetry.init();
  await DeviceKey.init();
  await User.init();
  await Device.init();

  await Device.create([
    {
      junctionId: 'JNC-BLR-001',
      deviceId: 'JNC-BLR-001',
      name: 'Silk Board Junction',
      zoneId: 'south-bangalore',
      category: 'south-bangalore',
      status: 'online',
      lastMetrics: { vehiclesPerMin: 20, maxQueueLengthM: 30, avgSpeedKmph: 25 },
    },
    {
      junctionId: 'JNC-BLR-005',
      deviceId: 'JNC-BLR-005',
      name: 'Bellandur EcoSpace',
      zoneId: 'east-bangalore',
      category: 'east-bangalore',
      status: 'online',
      lastMetrics: { vehiclesPerMin: 25, maxQueueLengthM: 40, avgSpeedKmph: 22 },
    },
  ]);

  await User.create([
    {
      name: 'Chief Command Admin',
      email: 'admin@metropulse.io',
      password: 'test-admin-password-123!',
      role: 'admin',
      zones: ['south-bangalore', 'east-bangalore', 'north-bangalore', 'central-bangalore'],
    },
    {
      name: 'South Zone Operator',
      email: 'south.operator@metropulse.io',
      password: 'test-south-password-123!',
      role: 'operator',
      zones: ['south-bangalore'],
    },
    {
      name: 'East Zone Operator',
      email: 'east.operator@metropulse.io',
      password: 'test-east-password-123!',
      role: 'operator',
      zones: ['east-bangalore'],
    },
    {
      name: 'Public Audit Viewer',
      email: 'viewer@metropulse.io',
      password: 'test-viewer-password-123!',
      role: 'viewer',
      zones: [],
    },
  ]);

  deviceApiKey = `mpk_test_${crypto.randomBytes(16).toString('hex')}`;
  await DeviceKey.create({
    keyHash: hashDeviceKey(deviceApiKey),
    prefix: deviceApiKey.slice(0, 12),
    label: 'Integration Test Camera Key',
    scopes: ['ingest', 'read'],
    allowedJunctionIds: [],
    active: true,
  });

  socketService.init(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  const [adminLogin, southLogin, viewerLogin] = await Promise.all([
    apiJson('/api/auth/demo-login', { method: 'POST', body: { persona: 'admin' } }),
    apiJson('/api/auth/demo-login', { method: 'POST', body: { persona: 'south-operator' } }),
    apiJson('/api/auth/demo-login', { method: 'POST', body: { persona: 'viewer' } }),
  ]);
  adminToken = adminLogin.body.token;
  southToken = southLogin.body.token;
  viewerToken = viewerLogin.body.token;
});

test.after(async () => {
  process.env.PUBLIC_READONLY = 'true';
  process.env.DEMO_PERSONAS = 'false';
  clearInterval(ingestionBuffer.timer);
  ingestionBuffer.reset();
  resetRateLimitBuckets();
  if (socketService.io) {
    socketService.io.close();
  }
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  setImmediate(() => process.exit(0));
});

test('1. Regular Telemetry collection + unique eventId + TTL indexes (no timeseries)', async () => {
  const cols = await mongoose.connection.db.listCollections({ name: 'telemetries' }).toArray();
  assert.strictEqual(cols.length, 1);
  assert.strictEqual(cols[0].options?.timeseries, undefined, 'Telemetry collection must NOT be timeseries');

  const indexes = await Telemetry.collection.indexes();
  const eventIdIdx = indexes.find((idx) => idx.key?.eventId === 1);
  const ttlIdx = indexes.find((idx) => idx.key?.timestamp === 1 && typeof idx.expireAfterSeconds === 'number');
  const seqIdx = indexes.find((idx) => idx.key?.junctionId === 1 && idx.key?.sequence === -1);

  assert.ok(eventIdIdx && eventIdIdx.unique === true, 'Expected unique index on { eventId: 1 }');
  assert.ok(ttlIdx && ttlIdx.expireAfterSeconds > 0, 'Expected TTL index on { timestamp: 1 }');
  assert.ok(seqIdx, 'Expected compound index { junctionId: 1, sequence: -1 }');
});

test('2. Ingest authentication rejects unauthenticated/bad API keys/viewer JWT and accepts DeviceKey', async () => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();
  const payload = makeValidEvent({ sequence: 10 });

  const unauth = await apiJson('/api/telemetry/ingest', { method: 'POST', body: payload });
  assert.strictEqual(unauth.status, 401);

  const badKey = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': 'blr_traffic_key_live_command_center_2026' },
    body: payload,
  });
  assert.strictEqual(badKey.status, 401);

  const viewerAttempt = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: payload,
  });
  assert.strictEqual(viewerAttempt.status, 403);

  const ok = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: payload,
  });
  assert.strictEqual(ok.status, 202);
  assert.strictEqual(ok.body.accepted, true);
  assert.strictEqual(ok.body.classification, 'in-order');

  await ingestionBuffer.flush();
  const persisted = await Telemetry.findOne({ eventId: payload.eventId }).lean();
  assert.ok(persisted, 'Expected valid event persisted to Telemetry collection');
  assert.strictEqual(persisted.junctionId, 'JNC-BLR-001');
});

test('3. Idempotent deduplication: in-memory cache + MongoDB E11000 counted as duplicates without errors', async () => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();
  const payload = makeValidEvent({ sequence: 1 });

  const first = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: payload,
  });
  assert.strictEqual(first.status, 202);
  assert.strictEqual(first.body.accepted, true);

  // Second submission hits 100k fixed-capacity ring cache
  const cacheDup = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: payload,
  });
  assert.strictEqual(cacheDup.status, 202);
  assert.strictEqual(cacheDup.body.duplicate, true);
  assert.strictEqual(cacheDup.body.classification, 'duplicate');

  await ingestionBuffer.flush();

  // Clear in-memory cache and re-ingest exact same eventId to trigger DB E11000 duplicate
  const beforeSnap = metricsService.getSnapshot();
  const beforeErr = beforeSnap.totalErrors;
  const beforeDup = beforeSnap.totalDuplicates;

  ingestionBuffer.reset();
  const reingest = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: payload,
  });
  assert.strictEqual(reingest.status, 202);
  await ingestionBuffer.flush();

  const afterSnap = metricsService.getSnapshot();
  assert.ok(afterSnap.totalDuplicates >= beforeDup + 1, 'Expected DB E11000 counted under totalDuplicates');
  assert.strictEqual(afterSnap.totalErrors, beforeErr, 'DB E11000 must NOT increment totalErrors');
});

test('4. Strict validation rejects invalid bounds/zone/timestamps and preserves exact zero metrics', async () => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();

  // Invalid flow > 400
  const badFlow = makeValidEvent({ sequence: 1 });
  badFlow.data.approaches[0].vehiclesPerMin = 500;
  const r1 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: badFlow,
  });
  assert.strictEqual(r1.status, 400);

  // Invalid vehicleMix sum != 1
  const badMix = makeValidEvent({ sequence: 2 });
  badMix.data.vehicleMix = { twoWheeler: 0.2, car: 0.2, bus: 0.05, truck: 0.05 };
  const r2 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: badMix,
  });
  assert.strictEqual(r2.status, 400);

  // Unknown junctionId
  const badJnc = makeValidEvent({ junctionId: 'JNC-BLR-999' });
  const r3 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: badJnc,
  });
  assert.strictEqual(r3.status, 400);

  // Mismatched zoneId for JNC-BLR-001 (belongs to south-bangalore)
  const badZone = makeValidEvent({ junctionId: 'JNC-BLR-001', zoneId: 'east-bangalore' });
  const r4 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: badZone,
  });
  assert.strictEqual(r4.status, 400);

  // Timestamp > 30s in the future
  const futureEvt = makeValidEvent({
    timestamp: new Date(Date.now() + 90_000).toISOString(),
  });
  const r5 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: futureEvt,
  });
  assert.strictEqual(r5.status, 400);

  // Exact zero speed & zero queue must NOT be replaced by defaults (nullish coalescing ??)
  const zeroEvent = makeValidEvent({
    sequence: 1,
    data: {
      approaches: [
        {
          road: 'Hosur Rd (Silk Board)',
          vehiclesPerMin: 0,
          queueLengthM: 0,
          avgSpeedKmph: 0,
          signal: 'red',
        },
      ],
      vehicleMix: { twoWheeler: 0.5, car: 0.3, bus: 0.1, truck: 0.1 },
    },
  });
  const okZero = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: zeroEvent,
  });
  assert.strictEqual(okZero.status, 202);
  await ingestionBuffer.flush();

  const savedZero = await Telemetry.findOne({ eventId: zeroEvent.eventId }).lean();
  assert.strictEqual(savedZero.metrics.totalFlowVehiclesPerMin, 0);
  assert.strictEqual(savedZero.metrics.maxQueueLengthM, 0);
  assert.strictEqual(savedZero.metrics.avgSpeedKmph, 0);
});

test('5. Batch partial acceptance accepts valid events, reports per-index rejections (cap 20), enforces 1mb body limit', async () => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();

  const batch = [];
  for (let i = 0; i < 25; i++) {
    const bad = makeValidEvent({ sequence: i + 1 });
    bad.data.approaches[0].vehiclesPerMin = 999; // invalid
    batch.push(bad);
  }
  const good1 = makeValidEvent({ sequence: 100 });
  const good2 = makeValidEvent({ sequence: 101 });
  batch.push(good1, good2);

  const res = await apiJson('/api/telemetry/batch', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: batch,
  });
  assert.strictEqual(res.status, 202);
  assert.strictEqual(res.body.acceptedCount, 2);
  assert.strictEqual(res.body.rejectedCount, 25);
  assert.strictEqual(res.body.rejected.length, 20, 'Rejection details must be capped at 20');

  // >1mb payload rejected with 413
  const oversized = JSON.stringify({ junk: 'x'.repeat(1_200_000) });
  const tooBig = await apiJson('/api/telemetry/batch', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: oversized,
  });
  assert.strictEqual(tooBig.status, 413);
});

test('6. Sequence gap and late arrival tracking + Device live state does not move backwards', async () => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();

  await Device.updateOne(
    { deviceId: 'JNC-BLR-001' },
    { $set: { lastMetrics: { vehiclesPerMin: 20, maxQueueLengthM: 30, avgSpeedKmph: 25 } } }
  );

  const tBase = Date.now() - 10_000;
  const seq1 = makeValidEvent({ sequence: 1, timestamp: new Date(tBase).toISOString() });
  const seq5 = makeValidEvent({ sequence: 5, timestamp: new Date(tBase + 4000).toISOString() });
  const seq3Late = makeValidEvent({
    sequence: 3,
    timestamp: new Date(tBase + 2000).toISOString(),
    data: {
      approaches: [
        { road: 'Hosur Rd', vehiclesPerMin: 99, queueLengthM: 199, avgSpeedKmph: 4, signal: 'red' },
      ],
      vehicleMix: { twoWheeler: 0.5, car: 0.3, bus: 0.1, truck: 0.1 },
    },
  });

  const r1 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: seq1,
  });
  assert.strictEqual(r1.body.classification, 'in-order');

  const r5 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: seq5,
  });
  assert.strictEqual(r5.body.classification, 'gap');
  assert.strictEqual(r5.body.gapMissing, 3); // missing sequences 2, 3, 4

  const r3 = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: seq3Late,
  });
  assert.strictEqual(r3.status, 202);
  assert.strictEqual(r3.body.classification, 'late');
  assert.strictEqual(r3.body.late, true);

  await ingestionBuffer.flush();

  const savedLate = await Telemetry.findOne({ eventId: seq3Late.eventId }).lean();
  assert.strictEqual(savedLate.late, true, 'Late event must still persist to MongoDB with late=true');

  const jncDoc = await Device.findOne({ deviceId: 'JNC-BLR-001' }).lean();
  assert.notStrictEqual(
    jncDoc.lastMetrics.maxQueueLengthM,
    199,
    'Late event must NOT overwrite live Device.lastMetrics backwards'
  );

  const intRes = await apiJson('/api/telemetry/integrity');
  assert.strictEqual(intRes.status, 200);
  assert.ok(intRes.body.integrity.totals.gapEvents >= 1);
  assert.ok(intRes.body.integrity.totals.missingSequences >= 3);
  assert.ok(intRes.body.integrity.totals.late >= 1);
});

test('7. Token-bucket rate limiter (429 + Retry-After) & >80% buffer load shedding (503 + Retry-After)', async () => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();

  const prevCap = process.env.RATE_LIMIT_AUTH_CAPACITY;
  const prevRefill = process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC;
  process.env.RATE_LIMIT_AUTH_CAPACITY = '5';
  process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC = '0.1';

  try {
    // 1 batch of 4 passes (leaves 1 token)
    const b1 = await apiJson('/api/telemetry/batch', {
      method: 'POST',
      headers: { 'x-api-key': deviceApiKey },
      body: [makeValidEvent({ sequence: 1 }), makeValidEvent({ sequence: 2 }), makeValidEvent({ sequence: 3 }), makeValidEvent({ sequence: 4 })],
    });
    assert.strictEqual(b1.status, 202);

    // 1 batch of 4 fails with 429 + Retry-After
    const b2 = await apiJson('/api/telemetry/batch', {
      method: 'POST',
      headers: { 'x-api-key': deviceApiKey },
      body: [makeValidEvent({ sequence: 5 }), makeValidEvent({ sequence: 6 }), makeValidEvent({ sequence: 7 }), makeValidEvent({ sequence: 8 })],
    });
    assert.strictEqual(b2.status, 429);
    assert.ok(Number(b2.headers.get('retry-after')) >= 1);
  } finally {
    process.env.RATE_LIMIT_AUTH_CAPACITY = prevCap;
    process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC = prevRefill;
    resetRateLimitBuckets();
  }

  // Test >80% buffer backpressure (fill > 80% of maxQueueSize)
  ingestionBuffer.reset();
  const fillCount = Math.floor(ingestionBuffer.maxQueueSize * 0.8) + 5;
  for (let i = 0; i < fillCount; i++) {
    ingestionBuffer.queue.push(makeValidEvent({ eventId: `FILL-${i}`, sequence: i + 1 }));
  }
  const beforeShed = metricsService.getSnapshot().totalLoadShed;
  const shedRes = await apiJson('/api/telemetry/ingest', {
    method: 'POST',
    headers: { 'x-api-key': deviceApiKey },
    body: makeValidEvent({ sequence: 99 }),
  });
  assert.strictEqual(shedRes.status, 503);
  assert.ok(Number(shedRes.headers.get('retry-after')) >= 1);
  assert.ok(metricsService.getSnapshot().totalLoadShed >= beforeShed + 1);
  ingestionBuffer.reset();
});

test('8. Zone-scoped RBAC, viewer-only /register, DEMO_PERSONAS toggle, PUBLIC_READONLY toggle', async () => {
  // Public self-register ignores elevated role requests
  const regRes = await apiJson('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Self Reg User',
      email: `viewer.${Date.now()}@example.com`,
      password: 'password123!',
      role: 'admin',
      zones: ['south-bangalore'],
    },
  });
  assert.strictEqual(regRes.status, 201);
  assert.strictEqual(regRes.body.user.role, 'viewer');

  // Anonymous GET /api/auth/me returns explicit viewer (never operator)
  const meAnon = await apiJson('/api/auth/me');
  assert.strictEqual(meAnon.status, 200);
  assert.strictEqual(meAnon.body.user.role, 'viewer');
  assert.strictEqual(meAnon.body.user.anonymous, true);

  // PUBLIC_READONLY=false blocks unauthenticated GETs with 401
  process.env.PUBLIC_READONLY = 'false';
  const blockedGet = await apiJson('/api/devices');
  assert.strictEqual(blockedGet.status, 401);
  process.env.PUBLIC_READONLY = 'true';

  // DEMO_PERSONAS=false disables /api/auth/demo-login with 403
  process.env.DEMO_PERSONAS = 'false';
  const disabledDemo = await apiJson('/api/auth/demo-login', {
    method: 'POST',
    body: { persona: 'admin' },
  });
  assert.strictEqual(disabledDemo.status, 403);
  process.env.DEMO_PERSONAS = 'true';

  // Viewer cannot mutate simulator or copilot
  const viewerChaos = await apiJson('/api/simulator/chaos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: { junctionId: 'JNC-BLR-001', metric: 'totalFlowVehiclesPerMin', multiplier: 2.0 },
  });
  assert.strictEqual(viewerChaos.status, 403);

  // South operator CAN control JNC-BLR-001 (south-bangalore)
  const southOwn = await apiJson('/api/sim/controller', {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}` },
    body: { junctionId: 'JNC-BLR-001', controller: 'webster' },
  });
  assert.strictEqual(southOwn.status, 200);

  // South operator CANNOT mutate JNC-BLR-005 (east-bangalore) or city-wide 'all'
  const southCrossSim = await apiJson('/api/sim/controller', {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}` },
    body: { junctionId: 'JNC-BLR-005', controller: 'webster' },
  });
  assert.strictEqual(southCrossSim.status, 403);

  const southCrossRemediate = await apiJson('/api/copilot/remediate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}` },
    body: { deviceId: 'JNC-BLR-005', action: 'switch_controller', params: { controller: 'webster' } },
  });
  assert.strictEqual(southCrossRemediate.status, 403);

  const southAll = await apiJson('/api/sim/controller', {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}` },
    body: { junctionId: 'all', controller: 'max-pressure' },
  });
  assert.strictEqual(southAll.status, 403);

  // Admin CAN switch city-wide controller
  const adminAll = await apiJson('/api/sim/controller', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { junctionId: 'all', controller: 'max-pressure' },
  });
  assert.strictEqual(adminAll.status, 200);
});

test('9. Socket.IO handshake JWT auth & zone-scoped room enforcement via Engine.IO HTTP transport', async () => {
  // Invalid JWT rejected during Socket.IO namespace handshake
  const badOpen = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, {
    headers: { Authorization: 'Bearer not-a-valid-jwt' },
  });
  assert.strictEqual(badOpen.status, 200);
  const badOpenJson = JSON.parse((await badOpen.text()).slice(1));
  await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${badOpenJson.sid}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer not-a-valid-jwt', 'Content-Type': 'text/plain' },
    body: '40',
  });
  const badPoll = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${badOpenJson.sid}`, {
    headers: { Authorization: 'Bearer not-a-valid-jwt' },
  });
  const badPollBody = await badPoll.text();
  assert.ok(
    badPollBody.includes('Unauthorized'),
    `Expected Unauthorized Socket.IO rejection packet, got: ${badPollBody}`
  );

  // Valid south-operator JWT completes Engine.IO + Socket.IO namespace handshake
  const openRes = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, {
    headers: { Authorization: `Bearer ${southToken}` },
  });
  assert.strictEqual(openRes.status, 200);
  const openText = await openRes.text();
  const openJson = JSON.parse(openText.slice(1));
  const sid = openJson.sid;
  assert.ok(sid);

  // Connect default namespace '/'
  const connRes = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}`, 'Content-Type': 'text/plain' },
    body: '40',
  });
  assert.strictEqual(connRes.status, 200);

  // Drain initial namespace ack & snapshot
  await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    headers: { Authorization: `Bearer ${southToken}` },
  });

  // Subscribe to out-of-scope east-bangalore -> must receive FORBIDDEN_ZONE error frame
  const subEast = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}`, 'Content-Type': 'text/plain' },
    body: '42["subscribe:zone","east-bangalore"]',
  });
  assert.strictEqual(subEast.status, 200);

  const pollErr = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
    headers: { Authorization: `Bearer ${southToken}` },
  });
  const pollBody = await pollErr.text();
  assert.ok(
    pollBody.includes('FORBIDDEN_ZONE'),
    `Expected FORBIDDEN_ZONE error on cross-zone subscription, got: ${pollBody}`
  );
});
