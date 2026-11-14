import test from 'node:test';
import assert from 'node:assert';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { anomalyEngine } from '../src/services/anomalyEngine.js';
import { metricsService } from '../src/services/metricsService.js';
import { normalizeTrafficEvent, validateTrafficEvent } from '../src/middleware/validator.js';
import { JUNCTION_GRAPH, getShortestRoute, findNearestJunction } from '../src/data/junctionGraph.js';
import { corridorService } from '../src/services/corridorService.js';
import { simulatorService } from '../src/services/simulatorService.js';
import { checkAreaAuthorization, requireDataSourceKey } from '../src/middleware/auth.js';
import { checkSourceRateLimit } from '../src/middleware/rateLimiter.js';
import { baselineService } from '../src/services/baselineService.js';
import mongoose from 'mongoose';
import { seed24HourHistory } from '../src/utils/seedHistory.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { User } from '../src/models/User.js';
import { config } from '../src/config/config.js';
import authRoutes from '../src/routes/authRoutes.js';

test('1. Ingestion Buffer & Deduplication Logic', (t) => {
  const uniqueEventId = `TEST-EVT-${Date.now()}`;
  const event = {
    eventId: uniqueEventId,
    junctionId: 'JNC-BLR-001',
    deviceId: 'JNC-BLR-001',
    category: 'south-bangalore',
    zoneId: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 50, avgSpeedKmph: 20 },
  };

  // First enqueue must succeed
  const res1 = ingestionBuffer.enqueue(event);
  assert.strictEqual(res1.accepted, true, 'First event should be accepted into buffer');

  // Second enqueue with identical eventId must be rejected as duplicate
  const res2 = ingestionBuffer.enqueue(event);
  assert.strictEqual(res2.accepted, false, 'Duplicate eventId should be rejected');
  assert.strictEqual(res2.reason, 'Duplicate eventId');
});

test('2. Incident Detection: Measured Effects (Jam & Sudden Blockage) and Human Cause', (t) => {
  const testJunction = 'JNC-BLR-099';
  anomalyEngine.clearHistory();

  // 1. Test Severe Jam Detection
  const spikeAlert = anomalyEngine.evaluate({
    junctionId: testJunction,
    deviceId: testJunction,
    junctionName: 'Test Signal',
    deviceName: 'Test Signal',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 195, avgSpeedKmph: 4, congestionScore: 89 },
  });

  assert.ok(spikeAlert, 'Severe queue spike should trigger an incident alert');
  assert.strictEqual(spikeAlert.severity, 'critical');
  assert.strictEqual(spikeAlert.metric, 'jam');
  assert.strictEqual(spikeAlert.cause, 'unknown', 'Cause should start as unknown (leave causes to people)');
  assert.strictEqual(spikeAlert.status, 'open');
  assert.ok(spikeAlert.suggestedAction?.action, 'Should include suggested remediation action');

  // 2. Test Sudden Blockage Detection (speed collapse on green signal)
  const blockJunction = 'JNC-BLR-098';
  // Seed initial approaches with healthy speed
  for (let i = 0; i < 4; i++) {
    anomalyEngine.evaluate({
      junctionId: blockJunction,
      deviceId: blockJunction,
      junctionName: 'Blockage Test',
      zoneId: 'south-bangalore',
      timestamp: new Date().toISOString(),
      data: {
        approaches: [
          { road: 'Hosur Entry', vehiclesPerMin: 35, queueLengthM: 40, avgSpeedKmph: 22, signal: 'green' },
        ],
      },
    });
  }

  // Speed suddenly collapses to 2 km/h while green
  const blockAlert = anomalyEngine.evaluate({
    junctionId: blockJunction,
    deviceId: blockJunction,
    junctionName: 'Blockage Test',
    zoneId: 'south-bangalore',
    timestamp: new Date().toISOString(),
    data: {
      approaches: [
        { road: 'Hosur Entry', vehiclesPerMin: 10, queueLengthM: 155, avgSpeedKmph: 2, signal: 'green' },
      ],
    },
  });

  assert.ok(blockAlert, 'Sudden velocity collapse on green arterial should trigger alert');
  assert.strictEqual(blockAlert.metric, 'sudden_blockage');
  assert.strictEqual(blockAlert.severity, 'critical');
  assert.strictEqual(blockAlert.affectedRoad, 'Hosur Entry');
  assert.strictEqual(blockAlert.suggestedAction.action, 'divert');
});

test('3. Metrics Service Throughput Calculations', (t) => {
  const initialIngested = metricsService.totalIngested;
  metricsService.recordIngest(50, 4);

  assert.strictEqual(metricsService.totalIngested, initialIngested + 50);
  const snap = metricsService.getSnapshot();
  assert.ok(typeof snap.ingestRate === 'number');
  assert.ok(typeof snap.uptimeSeconds === 'number');
});

test('4. Team Traffic JSON Normalization Verification', (t) => {
  // Test the exact JSON structure proposed in the team discussion
  const teamPayload = {
    eventId: 'EVT-TEST-VALID-01',
    junctionId: 'JNC-BLR-001',
    timestamp: new Date().toISOString(),
    zoneId: 'south-bangalore',
    data: {
      approaches: [
        { road: 'Hosur Rd (from south)', vehiclesPerMin: 38, queueLengthM: 180, avgSpeedKmph: 6, signal: 'red' },
        { road: 'ORR (from east)', vehiclesPerMin: 52, queueLengthM: 60, avgSpeedKmph: 22, signal: 'green' },
        { road: 'Hosur Rd (from north)', vehiclesPerMin: 30, queueLengthM: 90, avgSpeedKmph: 14, signal: 'red' },
        { road: 'BTM Rd (from west)', vehiclesPerMin: 21, queueLengthM: 40, avgSpeedKmph: 18, signal: 'red' },
      ],
      vehicleMix: { twoWheeler: 0.55, car: 0.3, bus: 0.05, truck: 0.1 },
    },
  };

  const normalized = normalizeTrafficEvent(teamPayload);

  assert.strictEqual(normalized.junctionId, 'JNC-BLR-001');
  assert.strictEqual(normalized.zoneId, 'south-bangalore');
  assert.strictEqual(normalized.data.totalFlowVehiclesPerMin, 141);
  assert.strictEqual(normalized.data.maxQueueLengthM, 180);
  assert.ok(normalized.metrics.congestionScore > 50, 'High queue on red should produce high congestion score');
  assert.ok(normalized.status === 'gridlock' || normalized.status === 'congested', 'Status should reflect congestion');
});

test('5. Connected Junctions Graph & Shortest Route (Hebbal to Jayadeva)', (t) => {
  // Test link symmetry
  for (const [node, neighbors] of Object.entries(JUNCTION_GRAPH)) {
    for (const nbr of neighbors) {
      assert.ok(JUNCTION_GRAPH[nbr].includes(node), `Link between ${node} and ${nbr} must be symmetric`);
    }
  }

  // Test route exists between every pair of junctions
  const allNodes = Object.keys(JUNCTION_GRAPH);
  assert.strictEqual(allNodes.length, 12, 'Graph must contain all 12 junctions');
  for (const src of allNodes) {
    for (const dst of allNodes) {
      const r = getShortestRoute(src, dst);
      assert.ok(Array.isArray(r) && r.length > 0, `Route must exist between ${src} and ${dst}`);
      assert.strictEqual(r[0], src);
      assert.strictEqual(r[r.length - 1], dst);
    }
  }

  // Exact Hebbal (JNC-BLR-008) to Jayadeva (JNC-BLR-004) route verification
  const hebbalToJayadeva = getShortestRoute('JNC-BLR-008', 'JNC-BLR-004');
  assert.deepStrictEqual(
    hebbalToJayadeva,
    ['JNC-BLR-008', 'JNC-BLR-010', 'JNC-BLR-012', 'JNC-BLR-011', 'JNC-BLR-003', 'JNC-BLR-004'],
    'Route from Hebbal to Jayadeva must match expected road corridor'
  );
});

test('6. Ambulance Green Corridor Preemption, Lookahead & Cancel Reset', async (t) => {
  const tripRes = await corridorService.startTrip({
    vehicleId: 'AMB-TEST-99',
    startJunctionId: 'JNC-BLR-008',
    destinationJunctionId: 'JNC-BLR-004',
    durationSeconds: 60,
  });

  assert.ok(tripRes.tripId, 'Trip ID should be generated');
  assert.strictEqual(tripRes.vehicleId, 'AMB-TEST-99');
  assert.strictEqual(tripRes.route.length, 6);

  // Verify immediate preemption of start junction and lookahead of next junction
  assert.strictEqual(corridorService.isJunctionInCorridor('JNC-BLR-008'), true, 'Start junction must be preempted');
  assert.strictEqual(corridorService.isJunctionInCorridor('JNC-BLR-010'), true, 'Lookahead junction must be preempted');

  // Verify cancel trip resets all preempted junctions cleanly
  await corridorService.cancelTrip(tripRes.tripId);
  assert.strictEqual(corridorService.isJunctionInCorridor('JNC-BLR-008'), false, 'Junction 008 must be cleared after cancel');
  assert.strictEqual(corridorService.isJunctionInCorridor('JNC-BLR-010'), false, 'Junction 010 must be cleared after cancel');
  assert.strictEqual(corridorService.activeTrips.has('AMB-TEST-99'), false, 'Active trip should be removed');
});

test('7. Strict Input Validation Rejections & Server-Owned Enrichment', (t) => {
  // 1. Missing eventId should throw with field name
  assert.throws(
    () => {
      validateTrafficEvent({
        junctionId: 'JNC-BLR-001',
        timestamp: new Date().toISOString(),
        data: { approaches: [{ road: 'Main Rd', vehiclesPerMin: 20, queueLengthM: 30, avgSpeedKmph: 25, signal: 'green' }] },
      });
    },
    /Field "eventId"/,
    'Missing eventId must be rejected with 400 error naming eventId'
  );

  // 2. Unregistered junctionId should throw
  assert.throws(
    () => {
      validateTrafficEvent({
        eventId: 'EVT-999',
        junctionId: 'JNC-UNKNOWN-999',
        timestamp: new Date().toISOString(),
        data: { approaches: [{ road: 'Main Rd', vehiclesPerMin: 20, queueLengthM: 30, avgSpeedKmph: 25, signal: 'green' }] },
      });
    },
    /Field "junctionId"/,
    'Unregistered junctionId must be rejected'
  );

  // 3. Timestamp too far in future (>5s) should throw
  assert.throws(
    () => {
      validateTrafficEvent({
        eventId: 'EVT-FUTURE-01',
        junctionId: 'JNC-BLR-001',
        timestamp: new Date(Date.now() + 60000).toISOString(),
        data: { approaches: [{ road: 'Main Rd', vehiclesPerMin: 20, queueLengthM: 30, avgSpeedKmph: 25, signal: 'green' }] },
      });
    },
    /Field "timestamp"/,
    'Future timestamp (>5s) must be rejected'
  );

  // 4. Invalid speed / negative queue should throw
  assert.throws(
    () => {
      validateTrafficEvent({
        eventId: 'EVT-INVALID-APP',
        junctionId: 'JNC-BLR-001',
        timestamp: new Date().toISOString(),
        data: { approaches: [{ road: 'Main Rd', vehiclesPerMin: 20, queueLengthM: -5, avgSpeedKmph: 25, signal: 'green' }] },
      });
    },
    /queueLengthM/,
    'Negative queue must be rejected'
  );

  // 5. Server owns zoneId: Even if payload sends wrong zoneId, enrichment assigns correct registry zone
  const enriched = normalizeTrafficEvent({
    eventId: 'EVT-ZONE-TEST',
    junctionId: 'JNC-BLR-008', // Hebbal Flyover is in north-bangalore
    zoneId: 'south-bangalore', // Client falsely claims south-bangalore
    timestamp: new Date().toISOString(),
    data: { approaches: [{ road: 'Bellary Rd', vehiclesPerMin: 40, queueLengthM: 50, avgSpeedKmph: 25, signal: 'green' }] },
  });

  assert.strictEqual(enriched.zoneId, 'north-bangalore', 'Server must overwrite zoneId to true registry zone (north-bangalore)');
});

test('8. Role-Based Access Control & Officer Area Authorization', (t) => {
  const adminUser = { role: 'admin' };
  const southOfficer = { role: 'officer', assignedZoneId: 'south-bangalore' };
  const junctionOfficer = { role: 'officer', assignedJunctionId: 'JNC-BLR-001' };
  const citizenUser = { role: 'citizen' };

  // Admin has access to all areas
  assert.strictEqual(checkAreaAuthorization(adminUser, 'north-bangalore', 'JNC-BLR-008'), true);

  // South Officer can act in South Bangalore, but NOT North Bangalore
  assert.strictEqual(checkAreaAuthorization(southOfficer, 'south-bangalore', 'JNC-BLR-001'), true);
  assert.strictEqual(checkAreaAuthorization(southOfficer, 'north-bangalore', 'JNC-BLR-008'), false);

  // Silk Board Officer can act on Silk Board, but NOT Jayadeva
  assert.strictEqual(checkAreaAuthorization(junctionOfficer, 'south-bangalore', 'JNC-BLR-001'), true);
  assert.strictEqual(checkAreaAuthorization(junctionOfficer, 'south-bangalore', 'JNC-BLR-004'), false);

  // Citizens cannot act on traffic areas
  assert.strictEqual(checkAreaAuthorization(citizenUser, 'south-bangalore', 'JNC-BLR-001'), false);
});

test('9. Jam Spreading Across Connected Graph to 1-Hop Neighbours', (t) => {
  const silkBoardId = 'JNC-BLR-001';
  // Trigger blockage scenario on Silk Board
  simulatorService.triggerBlockage(silkBoardId, 'Hosur Rd (from south)', 30);

  // Evaluate jam spreading
  simulatorService.evaluateJamSpreading(Date.now());

  // 1-hop neighbours of Silk Board from junctionGraph:
  // JNC-BLR-002 (Sony World), JNC-BLR-003 (Dairy Circle), JNC-BLR-004 (Jayadeva), JNC-BLR-005 (Bellandur)
  const sonyWorldState = simulatorService.junctionStates.get('JNC-BLR-002');
  const bellandurState = simulatorService.junctionStates.get('JNC-BLR-005');

  assert.ok(sonyWorldState.spreadPressure > 0, '1-hop neighbour Sony World should receive spread pressure');
  assert.ok(bellandurState.spreadPressure > 0, '1-hop neighbour Bellandur should receive spread pressure');

  // Bellandur is in east-bangalore, Silk Board is in south-bangalore
  assert.strictEqual(bellandurState.zoneId, 'east-bangalore');
  assert.strictEqual(simulatorService.junctionStates.get(silkBoardId).zoneId, 'south-bangalore');

  // Clear scenarios and verify recovery
  simulatorService.clearScenarios();
  const silkState = simulatorService.junctionStates.get(silkBoardId);
  assert.strictEqual(silkState.activeScenario, null);
});

test('10. Citizen Incident Reports: Nearest Proximity Matching & Distance Bounds', (t) => {
  // Silk Board coordinates: 12.9172, 77.6228
  const nearPoint = findNearestJunction(12.9180, 77.6235);
  assert.strictEqual(nearPoint.nearestJunctionId, 'JNC-BLR-001');
  assert.ok(nearPoint.distanceKm < 0.5, 'Point should be within 0.5km of Silk Board');

  // Point in Mysuru (~130km away): should fail the 2.0km proximity threshold
  const farPoint = findNearestJunction(12.2958, 76.6394);
  assert.ok(farPoint.distanceKm > 50, 'Faraway coordinate must exceed 2km limit');
});

test('11. Simulation Clock Speed & Time-of-Day Profile Scaling (Section 5.13)', (t) => {
  // 1. Clock speed adjustment
  const clockRes = simulatorService.setClockSpeed(144);
  assert.strictEqual(clockRes.clockSpeed, 144, 'Clock speed must be set to 144x');
  assert.strictEqual(simulatorService.clockSpeed, 144);

  // 2. Simulated time is a valid date string
  const simTime = simulatorService.getSimulatedTime();
  assert.ok(simTime instanceof Date && !isNaN(simTime.getTime()), 'Simulated time must be a valid Date');

  // 3. Status includes clock speed and simulated time
  const status = simulatorService.getStatus();
  assert.strictEqual(status.clockSpeed, 144);
  assert.ok(status.simulatedTime, 'Status must report simulatedTime');

  // Reset to 1x
  simulatorService.setClockSpeed(1);
  assert.strictEqual(simulatorService.clockSpeed, 1);
});

test('12. Baseline Deviation & Unusual For This Hour Detection (Section 5.14)', (t) => {
  // Silk Board at 2 PM (hour 14): baseline speed should be around 13-16 km/h
  const dev = baselineService.getDeviation('JNC-BLR-001', 14, 5, 85);
  assert.strictEqual(dev.hasBaseline, true, 'Should have baseline data for Silk Board');
  assert.ok(dev.speedDeviationPct < -50, '5 km/h compared to ~15 km/h should show >50% slower');
  assert.strictEqual(dev.isSignificantlyWorse, true, 'Large drop in velocity should flag as significantly worse');
  assert.match(dev.label, /slower than usual/, 'Label must indicate slower than usual');
});

test('13. 24-Hour Telemetry History Seeding on Time-Series Collection', async (t) => {
  let inMemoryDbCount = 0;
  const originalCountDocuments = Telemetry.countDocuments;
  const originalBulkWrite = Telemetry.bulkWrite;
  const originalDeleteMany = Telemetry.deleteMany;

  const insertedOperations = [];

  Telemetry.countDocuments = async (filter) => inMemoryDbCount;
  Telemetry.deleteMany = async (filter) => { inMemoryDbCount = 0; return { deletedCount: 0 }; };
  Telemetry.bulkWrite = async (ops, options) => {
    assert.strictEqual(options?.ordered, false, 'bulkWrite must use ordered: false');
    for (const op of ops) {
      assert.ok(op.insertOne, 'Must use insertOne operation for time-series compatibility (no updateOne/upsert)');
      assert.ok(op.insertOne.document.seeded === true, 'Seeded document must have seeded: true');
      insertedOperations.push(op);
    }
    inMemoryDbCount += ops.length;
    return { insertedCount: ops.length };
  };

  try {
    const firstSeedCount = await seed24HourHistory();
    assert.strictEqual(firstSeedCount, 8640, 'Should generate 8,640 historical records across 12 junctions');
    assert.strictEqual(insertedOperations.length, 8640, 'All 8,640 records must be bulk inserted with insertOne');

    // Second run should detect existing 8,640 records and skip re-seeding
    let secondBulkWriteCalled = false;
    Telemetry.bulkWrite = async () => { secondBulkWriteCalled = true; };
    const secondSeedCount = await seed24HourHistory();
    assert.strictEqual(secondSeedCount, 8640, 'Second run must return existing count');
    assert.strictEqual(secondBulkWriteCalled, false, 'Second run must skip bulkWrite');
  } finally {
    Telemetry.countDocuments = originalCountDocuments;
    Telemetry.bulkWrite = originalBulkWrite;
    Telemetry.deleteMany = originalDeleteMany;
  }
});

test('14. Demo Login Gating & Zero Password Token Issuance', async (t) => {
  // 1. With demoMode = false, demo-login must be rejected with 403
  config.demoMode = false;

  let resStatus = 0;
  let resBody = null;
  const mockRes = {
    status: (code) => {
      resStatus = code;
      return mockRes;
    },
    json: (data) => {
      resBody = data;
      return mockRes;
    },
  };

  const demoRoute = authRoutes.stack.find((layer) => layer.route?.path === '/demo-login');
  const demoHandler = demoRoute.route.stack[0].handle;

  await demoHandler({ body: { roleKey: 'admin' } }, mockRes);
  assert.strictEqual(resStatus, 403, 'demo-login must return 403 when demoMode is off');

  // 2. With demoMode = true, demo-login issues valid token without client providing passwords
  config.demoMode = true;
  const originalFindOne = User.findOne;
  User.findOne = async (query) => {
    return {
      _id: '507f1f77bcf86cd799439011',
      name: 'Admin User',
      email: 'admin@metropulse.blr',
      role: 'admin',
      assignedZoneId: null,
      assignedJunctionId: null,
      vehicleId: null,
      apiKey: 'test-admin-key',
    };
  };

  try {
    await demoHandler({ body: { roleKey: 'admin' } }, mockRes);
    assert.strictEqual(resBody.success, true);
    assert.ok(resBody.token, 'Must issue a signed JWT token');
    assert.strictEqual(resBody.user.role, 'admin');
  } finally {
    User.findOne = originalFindOne;
    config.demoMode = true; // reset
  }
});

test('15. Ingestion Authentication, Per-Junction Rate Limit & Status Codes', async (t) => {
  // 1. Data Source Key Authentication
  const originalFindOne = User.findOne;
  User.findOne = async (query) => {
    if (query.apiKey === 'valid-source-key') return { role: 'source', name: 'Camera Worker' };
    if (query.apiKey === 'citizen-key') return { role: 'citizen', name: 'Citizen Commuter' };
    return null;
  };

  let statusCode = 0;
  let responseData = null;
  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (d) => { responseData = d; return res; },
  };

  // Missing API key returns 401
  await requireDataSourceKey({ headers: {} }, res, () => {});
  assert.strictEqual(statusCode, 401, 'Missing API key must return 401');

  // Citizen key returns 403
  await requireDataSourceKey({ headers: { 'x-api-key': 'citizen-key' } }, res, () => {});
  assert.strictEqual(statusCode, 403, 'Citizen key must return 403');

  // Valid source key calls next()
  let nextCalled = false;
  await requireDataSourceKey({ headers: { 'x-api-key': 'valid-source-key' } }, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'Valid source key must call next()');

  User.findOne = originalFindOne;

  // 2. Duplicate single event returns 409
  const dupEventId = `DUP-TEST-${Date.now()}`;
  const ev1 = {
    eventId: dupEventId,
    junctionId: 'JNC-BLR-001',
    deviceId: 'JNC-BLR-001',
    zoneId: 'south-bangalore',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 40, avgSpeedKmph: 20 },
  };

  const firstEnqueue = ingestionBuffer.enqueue(ev1);
  assert.strictEqual(firstEnqueue.accepted, true);

  const secondEnqueue = ingestionBuffer.enqueue(ev1);
  assert.strictEqual(secondEnqueue.accepted, false);
  assert.ok(secondEnqueue.reason.includes('Duplicate'));

  // 3. Batch per-junction rate limit (35 events/sec per junction)
  const testJunc = `RATE-JNC-${Date.now()}`;
  let allowedCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < 40; i++) {
    const check = checkSourceRateLimit(testJunc, null, 35);
    if (check.allowed) allowedCount++;
    else rejectedCount++;
  }

  assert.strictEqual(allowedCount, 35, 'Must allow up to 35 events/sec for junction');
  assert.strictEqual(rejectedCount, 5, 'Must reject excess events over 35 limit');
});

test.after(() => {
  setImmediate(() => process.exit(0));
});
