import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as ioClient } from '../../client/node_modules/socket.io-client/build/esm/index.js';

import { app, server } from '../src/index.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Device } from '../src/models/Device.js';
import { User } from '../src/models/User.js';
import { DeviceKey, hashDeviceKey } from '../src/models/DeviceKey.js';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { metricsService } from '../src/services/metricsService.js';
import { simulatorService } from '../src/services/simulatorService.js';
import { socketService, SocketService } from '../src/services/socketService.js';
import { resetRateLimitBuckets } from '../src/middleware/rateLimiter.js';
import { INITIAL_DEVICES } from '../src/sim/junctions.data.js';
import {
  DEFAULT_WIRE_SCHEMA,
  encodeZoneBatch,
  decodeZoneBatch,
  encodeJunctionBatch,
  decodeJunctionBatch,
  measureWireSavings,
} from '../../client/src/shared/wire.js';
import {
  createHistoryLiveState,
  mergeLiveFrame,
  formatChartPoint,
} from '../../client/src/utils/historyMerge.js';

let mongod;
let baseUrl;
let deviceApiKey;

function makeFullEvent(junctionId, seq, overrides = {}) {
  const meta = INITIAL_DEVICES.find((d) => d.junctionId === junctionId) || INITIAL_DEVICES[0];
  const ts = new Date(Date.now() + seq * 100).toISOString();
  const approaches = meta.baseApproaches.map((a, idx) => ({
    road: a.road,
    dir: a.dir,
    lanes: a.lanes || 3,
    vehiclesPerMin: 40 + idx * 5 + (seq % 15),
    queueLengthM: 60 + idx * 12 + (seq % 20),
    avgSpeedKmph: 18.5 + idx,
    signal: idx % 2 === 0 ? 'green' : 'red',
    greenRemainingSec: idx % 2 === 0 ? 18 : 0,
    queueVeh: 8.5 + idx,
  }));

  const maxQ = Math.max(...approaches.map((a) => a.queueLengthM));
  const totalFlow = approaches.reduce((s, a) => s + a.vehiclesPerMin, 0);
  const avgSpd = Number(
    (approaches.reduce((s, a) => s + a.avgSpeedKmph, 0) / approaches.length).toFixed(1)
  );

  return {
    eventId: `EVT-RT-${junctionId}-${seq}-${crypto.randomBytes(2).toString('hex')}`,
    junctionId: meta.junctionId,
    deviceId: meta.junctionId,
    junctionName: meta.name,
    zoneId: meta.zoneId,
    category: meta.zoneId,
    timestamp: ts,
    sequence: seq,
    status: maxQ > 120 ? 'congested' : 'healthy',
    location: meta.location,
    metrics: {
      totalFlowVehiclesPerMin: totalFlow,
      maxQueueLengthM: maxQ,
      avgSpeedKmph: avgSpd,
      congestionScore: 42,
      stalledVehicleDetected: Boolean(overrides.stalled),
      ambulanceDetected: Boolean(overrides.ambulance),
    },
    data: {
      approaches,
      vehicleMix: { twoWheeler: 0.54, car: 0.31, bus: 0.06, truck: 0.09 },
      stalledVehicleDetected: Boolean(overrides.stalled),
      ambulanceDetected: Boolean(overrides.ambulance),
      totalFlowVehiclesPerMin: totalFlow,
      maxQueueLengthM: maxQ,
      avgSpeedKmph: avgSpd,
      congestionScore: 42,
      kpi: { delayVehSec: 210, throughputVehPerHour: 2400, degreeOfSaturation: 0.72 },
      control: {
        activeController: 'max-pressure',
        controller: 'max-pressure',
        currentPhaseIdx: 1,
        phaseRemainingSec: 14,
        cycleSec: 90,
      },
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
  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, body: json };
}

test.before(async () => {
  process.env.DEMO_PERSONAS = 'true';
  process.env.PUBLIC_READONLY = 'true';
  process.env.RATE_LIMIT_AUTH_CAPACITY = '5000';
  process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC = '500';

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await Promise.all([Telemetry.init(), DeviceKey.init(), User.init(), Device.init()]);
  await Device.insertMany(
    INITIAL_DEVICES.map((d) => ({
      junctionId: d.junctionId,
      deviceId: d.junctionId,
      name: d.name,
      zoneId: d.zoneId,
      zoneName: d.zoneName,
      category: d.zoneId,
      region: d.region,
      location: d.location,
      approaches: d.baseApproaches,
      status: 'healthy',
    }))
  );

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
      name: 'Public Audit Viewer',
      email: 'viewer@metropulse.io',
      password: 'test-viewer-password-123!',
      role: 'viewer',
      zones: [],
    },
  ]);

  deviceApiKey = `mpk_rt_${crypto.randomBytes(16).toString('hex')}`;
  await DeviceKey.create({
    keyHash: hashDeviceKey(deviceApiKey),
    prefix: deviceApiKey.slice(0, 12),
    label: 'Realtime Test Camera Key',
    scopes: ['ingest', 'read'],
    allowedJunctionIds: [],
    active: true,
  });

  socketService.init(server);
  if (!server.listening) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  }
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.beforeEach(() => {
  resetRateLimitBuckets();
  ingestionBuffer.reset();
  metricsService.reset();
});

test.after(async () => {
  try {
    simulatorService.shutdown();
  } catch {}
  try {
    ingestionBuffer.reset();
    ingestionBuffer.shutdown();
  } catch {}
  try {
    metricsService.shutdown();
  } catch {}
  try {
    socketService.shutdown();
  } catch {}
  try {
    if (server.listening) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  } catch {}
  try {
    await mongoose.disconnect();
  } catch {}
  try {
    if (mongod) await mongod.stop();
  } catch {}
});

test('1. Wire v1 codec round-trip preserves zone & junction fidelity and slashes payload bytes', () => {
  const sampleEvents = [
    makeFullEvent('JNC-BLR-001', 101, { stalled: true }),
    makeFullEvent('JNC-BLR-002', 102, { ambulance: true }),
    makeFullEvent('JNC-BLR-003', 103),
    makeFullEvent('JNC-BLR-004', 104),
  ];

  // Zone tuple round-trip
  const zonePkt = encodeZoneBatch(sampleEvents, DEFAULT_WIRE_SCHEMA, 'south-bangalore');
  assert.equal(zonePkt.v, 1);
  assert.equal(zonePkt.zone, 'south-bangalore');
  assert.equal(zonePkt.rows.length, 4);

  const decodedZone = decodeZoneBatch(zonePkt, DEFAULT_WIRE_SCHEMA);
  assert.equal(decodedZone.length, 4);
  assert.equal(decodedZone[0].junctionId, 'JNC-BLR-001');
  assert.equal(decodedZone[0].sequence, 101);
  assert.equal(decodedZone[0].metrics.stalledVehicleDetected, true);
  assert.equal(decodedZone[0].metrics.ambulanceDetected, false);
  assert.equal(decodedZone[0].metrics.maxQueueLengthM, sampleEvents[0].metrics.maxQueueLengthM);
  assert.equal(decodedZone[0].controller, 'max-pressure');
  assert.equal(decodedZone[1].metrics.ambulanceDetected, true);
  assert.ok(Array.isArray(decodedZone[0]._wire?.tuple), 'decoded frame retains raw tuple for UI inspector');

  // Junction detail tuple round-trip
  const juncPkt = encodeJunctionBatch([sampleEvents[0]], DEFAULT_WIRE_SCHEMA, 'JNC-BLR-001');
  const decodedJunc = decodeJunctionBatch(juncPkt, DEFAULT_WIRE_SCHEMA);
  assert.equal(decodedJunc.length, 1);
  assert.equal(decodedJunc[0].junctionId, 'JNC-BLR-001');
  assert.equal(decodedJunc[0].data.approaches.length, sampleEvents[0].data.approaches.length);
  assert.equal(
    decodedJunc[0].data.approaches[0].queueLengthM,
    sampleEvents[0].data.approaches[0].queueLengthM
  );
  assert.equal(decodedJunc[0].data.approaches[1].signal, 'red');
  assert.equal(decodedJunc[0].data.kpi.degreeOfSaturation, 0.72);
  assert.equal(decodedJunc[0].data.control.cycleSec, 90);

  // Bandwidth reduction check
  const savings = measureWireSavings(sampleEvents, DEFAULT_WIRE_SCHEMA);
  assert.ok(savings.zoneSavingsPct >= 85, `Expected >=85% zone savings, got ${savings.zoneSavingsPct}%`);
  assert.ok(
    savings.junctionSavingsPct >= 65,
    `Expected >=65% junction savings, got ${savings.junctionSavingsPct}%`
  );
});

test('2. historyMerge reconciles 1200-pt history with live frames without overlap or duplicates', () => {
  const historical = [];
  for (let seq = 1; seq <= 50; seq++) {
    historical.push(makeFullEvent('JNC-BLR-001', seq));
  }

  let state = createHistoryLiveState(historical, 50, 1200);
  assert.equal(state.historicalCount, 50);
  assert.equal(state.liveCount, 0);
  assert.equal(state.duplicateSuppressed, 0);
  assert.equal(state.cursor, 50);
  assert.equal(state.seamLabel, null);

  // Overlapping frames with seq <= cursor must be suppressed
  state = mergeLiveFrame(state, makeFullEvent('JNC-BLR-001', 48));
  state = mergeLiveFrame(state, makeFullEvent('JNC-BLR-001', 50));
  assert.equal(state.points.length, 50);
  assert.equal(state.liveCount, 0);
  assert.equal(state.duplicateSuppressed, 2);
  assert.equal(state.seamLabel, null);

  // First fresh frame (seq > cursor) creates the "live since hh:mm:ss" seam
  const live51 = makeFullEvent('JNC-BLR-001', 51);
  state = mergeLiveFrame(state, live51);
  assert.equal(state.points.length, 51);
  assert.equal(state.liveCount, 1);
  assert.equal(state.cursor, 51);
  assert.equal(state.seamLabel, formatChartPoint(live51).formattedTime);
  assert.ok(state.liveSinceTime);

  // Second live frame + re-delivery duplicate
  state = mergeLiveFrame(state, makeFullEvent('JNC-BLR-001', 52));
  state = mergeLiveFrame(state, live51);
  assert.equal(state.points.length, 52);
  assert.equal(state.liveCount, 2);
  assert.equal(state.duplicateSuppressed, 3);
  assert.deepEqual(
    state.points.slice(-3).map((p) => p.sequence),
    [50, 51, 52]
  );
});

test('3. Resume race test (fake io): zero lost or duplicate frames while Mongo fallback resolves slowly', async () => {
  const svc = new SocketService();
  try {
    let resolveDb;
    const dbGate = new Promise((r) => {
      resolveDb = r;
    });

    const dbRecords = [
      makeFullEvent('JNC-BLR-001', 101),
      makeFullEvent('JNC-BLR-001', 102),
      makeFullEvent('JNC-BLR-001', 103),
    ];

    svc._telemetryModel = {
      find(query = {}) {
        return {
          sort() {
            return this;
          },
          limit() {
            return this;
          },
          async lean() {
            await dbGate;
            return dbRecords.filter((doc) => {
              if (query.junctionId && doc.junctionId !== query.junctionId) return false;
              const gt = query.sequence?.$gt;
              const lt = query.sequence?.$lt;
              if (gt !== undefined && !(doc.sequence > gt)) return false;
              if (lt !== undefined && !(doc.sequence < lt)) return false;
              return true;
            });
          },
        };
      },
    };

    const roomsBySocket = new Set();
    const emitted = [];
    const fakeSocket = {
      id: 'fake-sock-1',
      data: { user: { id: 'u1', role: 'admin', zones: [] } },
      emit(event, payload) {
        emitted.push({ event, payload });
      },
      join(room) {
        roomsBySocket.add(room);
      },
      leave(room) {
        roomsBySocket.delete(room);
      },
      conn: { writeBuffer: [] },
    };

    svc.io = {
      sockets: {
        sockets: new Map([[fakeSocket.id, fakeSocket]]),
        adapter: { rooms: new Map() },
      },
    };

    // Ring initially has 103 and 104 (101..102 exist only in DB)
    svc.broadcastTelemetry(makeFullEvent('JNC-BLR-001', 103));
    svc.broadcastTelemetry(makeFullEvent('JNC-BLR-001', 104));

    const resumePromise = svc.handleResume(fakeSocket, {
      subscriptions: {
        city: true,
        zones: ['south-bangalore'],
        junctions: ['JNC-BLR-001'],
        alerts: ['all'],
      },
      cursors: { 'JNC-BLR-001': 100 },
    });

    assert.equal(fakeSocket.data.resuming, true);
    assert.equal(roomsBySocket.has('zone:south-bangalore'), false);

    // Live frames arrive DURING the async DB query window
    svc.broadcastTelemetry(makeFullEvent('JNC-BLR-001', 105));
    svc.broadcastTelemetry(makeFullEvent('JNC-BLR-001', 106));
    svc.broadcastTelemetry(makeFullEvent('JNC-BLR-001', 107));
    assert.equal(fakeSocket.data.pendingLive.length, 3);

    resolveDb();
    const replay = await resumePromise;

    const seqs = replay.events.map((e) => e.sequence);
    assert.deepEqual(seqs, [101, 102, 103, 104, 105, 106, 107]);
    assert.equal(replay.replayed, 7);
    assert.equal(replay.fromDb, 2);
    assert.equal(replay.fromMemory, 5);
    assert.equal(replay.clipped, false);

    assert.equal(fakeSocket.data.resuming, false);
    assert.equal(fakeSocket.data.pendingLive, null);
    assert.ok(roomsBySocket.has('city'));
    assert.ok(roomsBySocket.has('zone:south-bangalore'));
    assert.ok(roomsBySocket.has('junction:JNC-BLR-001'));
    assert.ok(emitted.some((e) => e.event === 'replay'));
  } finally {
    svc.io = null;
    svc.shutdown();
  }
});

test('4. Slow client paused TCP/socket backpressure keeps buffers bounded and increments coalesced metrics', async () => {
  const localSvc = new SocketService();
  localSvc.backpressureBytesThreshold = 2048;
  localSvc.writeBufferThreshold = 64;

  const localHttp = http.createServer();
  localSvc.init(localHttp, '*');
  await new Promise((resolve) => localHttp.listen(0, '127.0.0.1', resolve));
  const port = localHttp.address().port;

  let slowClient;
  let fastClient;
  try {
    let fastReceived = 0;
    let slowReceived = 0;

    fastClient = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    });
    slowClient = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      new Promise((resolve) => fastClient.once('wire:schema', resolve)),
      new Promise((resolve) => slowClient.once('wire:schema', resolve)),
    ]);

    fastClient.on('telemetry:zone', (pkt) => {
      fastReceived += decodeZoneBatch(pkt, DEFAULT_WIRE_SCHEMA).length;
    });
    slowClient.on('telemetry:zone', (pkt) => {
      slowReceived += decodeZoneBatch(pkt, DEFAULT_WIRE_SCHEMA).length;
    });

    fastClient.emit('subscribe', { zones: ['south-bangalore'], junctions: ['JNC-BLR-001'] });
    slowClient.emit('subscribe', { zones: ['south-bangalore'], junctions: ['JNC-BLR-001'] });

    await new Promise((resolve) => setTimeout(resolve, 60));

    // Identify slow server socket and simulate slow client TCP pause + backpressure watermark
    const slowTcp = slowClient.io?.engine?.transport?.ws?._socket;
    if (slowTcp && typeof slowTcp.pause === 'function') {
      slowTcp.pause();
    }

    const serverSockets = Array.from(localSvc.io.sockets.sockets.values());
    assert.equal(serverSockets.length, 2);
    const serverSlowSock = localSvc.io.sockets.sockets.get(slowClient.id);
    assert.ok(serverSlowSock);

    // Blast high-rate batches across 4 south junctions with congested slow socket transport
    const junctions = ['JNC-BLR-001', 'JNC-BLR-002', 'JNC-BLR-003', 'JNC-BLR-004'];
    serverSlowSock._simulatedBufferedBytes = 100000;
    let seq = 1;
    for (let burst = 0; burst < 40; burst++) {
      for (const jId of junctions) {
        localSvc.broadcastTelemetry(makeFullEvent(jId, seq++));
      }
      localSvc.flushBroadcasts();
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Memory coalesced map must remain strictly bounded <= junctions.length
    assert.ok(serverSlowSock.data.coalescedFrames, 'Congested socket should hold coalesced latest state');
    assert.ok(
      serverSlowSock.data.coalescedFrames.zone.size <= junctions.length,
      `zone coalesce map must remain bounded <= ${junctions.length}`
    );
    assert.ok(
      serverSlowSock.data.coalescedFrames.junction.size <= 1,
      'junction coalesce map must remain bounded <= 1'
    );

    // Clear congestion & resume socket: latest state flushes cleanly
    delete serverSlowSock._simulatedBufferedBytes;
    if (slowTcp && typeof slowTcp.resume === 'function') {
      slowTcp.resume();
    }
    localSvc.broadcastTelemetry(makeFullEvent('JNC-BLR-001', seq++));
    localSvc.flushBroadcasts();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const snap = metricsService.getSnapshot();
    assert.ok(fastReceived >= 100, `Fast client should receive streaming frames (${fastReceived})`);
    assert.ok(snap.socketCoalescedCount > 0, `Coalesced counter must increment (${snap.socketCoalescedCount})`);
    assert.ok(snap.totalSocketBytes > 0, 'Total outbound socket bytes must be tracked');
    assert.ok(
      Object.keys(snap.socketBytesByRoom).length > 0 || snap.totalSocketBytes > 0,
      'Byte accounting recorded egress'
    );
    assert.ok(
      slowReceived <= fastReceived,
      `Slow congested client coalesces excess frames (slow=${slowReceived}, fast=${fastReceived})`
    );
  } finally {
    fastClient?.disconnect();
    slowClient?.disconnect();
    localHttp.closeAllConnections?.();
    localSvc.shutdown();
    await new Promise((resolve) => localHttp.close(resolve));
  }
});

test('5. E2E selective room delivery, /history cursor, copilot rollouts ratio & persona chaos permissions', async () => {
  const viewerLogin = await apiJson('/api/auth/demo-login', {
    method: 'POST',
    body: { persona: 'viewer' },
  });
  assert.equal(viewerLogin.status, 200);
  const viewerToken = viewerLogin.body.token;

  const southLogin = await apiJson('/api/auth/demo-login', {
    method: 'POST',
    body: { persona: 'south-operator' },
  });
  assert.equal(southLogin.status, 200);
  const southToken = southLogin.body.token;

  // Viewer denied chaos injection with explicit 403
  const viewerChaos = await apiJson('/api/simulator/chaos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: { junctionId: 'JNC-BLR-001', metric: 'queueLengthM', multiplier: 2.0, durationSec: 10 },
  });
  assert.equal(viewerChaos.status, 403);
  assert.ok(viewerChaos.body?.error);

  // South operator succeeds on JNC-BLR-001 (south) & receives 403 on JNC-BLR-005 (east)
  const southOk = await apiJson('/api/simulator/chaos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}` },
    body: { junctionId: 'JNC-BLR-001', metric: 'queueLengthM', multiplier: 2.6, durationSec: 25 },
  });
  assert.equal(southOk.status, 200);

  const southEastForbidden = await apiJson('/api/simulator/chaos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${southToken}` },
    body: { junctionId: 'JNC-BLR-005', metric: 'queueLengthM', multiplier: 2.2, durationSec: 15 },
  });
  assert.equal(southEastForbidden.status, 403);

  // Copilot diagnose includes improvedRollouts / rolloutsRatio alongside confidence
  const diagRes = await apiJson('/api/copilot/diagnose/JNC-BLR-001', {
    headers: { Authorization: `Bearer ${southToken}` },
  });
  assert.equal(diagRes.status, 200);
  if (diagRes.body?.diagnosis?.findings?.length > 0) {
    const f = diagRes.body.diagnosis.findings[0];
    assert.ok(typeof f.confidence === 'number');
    assert.ok(typeof f.improvedRollouts === 'number');
    assert.ok(typeof f.rolloutsRatio === 'string' && f.rolloutsRatio.includes('/'));
  }

  // Seed 15 persisted records and check /history?junctionId=JNC-BLR-001&limit=1200 cursor
  const persistedDocs = [];
  for (let seq = 1; seq <= 15; seq++) {
    persistedDocs.push(makeFullEvent('JNC-BLR-001', seq));
  }
  await Telemetry.insertMany(persistedDocs);

  const histRes = await apiJson('/api/telemetry/history?junctionId=JNC-BLR-001&limit=1200');
  assert.equal(histRes.status, 200);
  assert.equal(histRes.body.records.length, 15);
  assert.equal(histRes.body.maxSequence, 15);
  assert.equal(histRes.body.cursor['JNC-BLR-001'], 15);

  // Selective room isolation: client subscribed ONLY to east-bangalore receives zero south frames
  const eastOnlySocket = ioClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
  });
  const eastEvents = [];
  try {
    await new Promise((resolve) => eastOnlySocket.once('wire:schema', resolve));
    eastOnlySocket.on('telemetry:zone', (pkt) => {
      eastEvents.push(...decodeZoneBatch(pkt, DEFAULT_WIRE_SCHEMA));
    });
    eastOnlySocket.emit('subscribe', {
      city: false,
      zones: ['east-bangalore'],
      junctions: [],
      alerts: [],
    });

    await new Promise((resolve) => setTimeout(resolve, 60));

    socketService.broadcastTelemetry(makeFullEvent('JNC-BLR-001', 9001));
    socketService.broadcastTelemetry(makeFullEvent('JNC-BLR-005', 9002));
    socketService.flushBroadcasts();

    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    eastOnlySocket.disconnect();
  }

  assert.equal(eastEvents.length, 1, 'Client must only receive subscribed east-bangalore zone frame');
  assert.equal(eastEvents[0].junctionId, 'JNC-BLR-005');
  assert.equal(eastEvents[0].zoneId, 'east-bangalore');
});

// ---------------------------------------------------------------------------
// A refused subscription must not strip rooms the operator is entitled to.
// ---------------------------------------------------------------------------
test('Forbidden zone request is refused without dropping the operator\'s own zone', async () => {
  const { socketService } = await import('../src/services/socketService.js');
  const rooms = new Set(['fake-socket-id']);
  const emitted = [];
  const fakeSocket = {
    id: 'fake-socket-id',
    rooms,
    data: { user: { id: 'op-south', role: 'operator', zones: ['south-bangalore'], anonymous: false } },
    join(room) {
      rooms.add(room);
    },
    leave(room) {
      rooms.delete(room);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };

  socketService._applySubscriptions(fakeSocket, {
    city: true,
    zones: ['south-bangalore'],
    junctions: [],
    alerts: ['south-bangalore'],
  });
  assert.ok(rooms.has('zone:south-bangalore'), 'operator joins its own zone');

  emitted.length = 0;
  socketService._applySubscriptions(fakeSocket, {
    city: true,
    zones: ['central-bangalore'],
    junctions: [],
    alerts: ['south-bangalore'],
  });

  assert.ok(rooms.has('zone:south-bangalore'), 'own zone must survive a refused request');
  assert.ok(!rooms.has('zone:central-bangalore'), 'forbidden zone must not be joined');

  const err = emitted.find((e) => e.event === 'error');
  assert.ok(err && err.payload.code === 'FORBIDDEN_ZONE', 'a FORBIDDEN_ZONE error is sent');
  const ack = emitted.find((e) => e.event === 'subscribed');
  assert.ok(ack && ack.payload.rejected === true, 'the acknowledgement marks the request as rejected');
  assert.ok(ack.payload.rooms.includes('zone:south-bangalore'), 'the acknowledgement lists the rooms kept');
  assert.ok(emitted.indexOf(err) < emitted.indexOf(ack), 'the error is sent before the acknowledgement');
});
