import test from 'node:test';
import assert from 'node:assert';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { anomalyEngine } from '../src/services/anomalyEngine.js';
import { metricsService } from '../src/services/metricsService.js';
import { normalizeTrafficEvent, validateTrafficEvent } from '../src/middleware/validator.js';
import { JUNCTION_GRAPH, getShortestRoute } from '../src/data/junctionGraph.js';
import { corridorService } from '../src/services/corridorService.js';
import { checkAreaAuthorization } from '../src/middleware/auth.js';

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

test('2. Anomaly Engine Gridlock & Stalled Vehicle Detection', (t) => {
  const testJunction = 'JNC-BLR-099';

  // Seed baseline values
  for (let i = 0; i < 12; i++) {
    anomalyEngine.evaluate({
      junctionId: testJunction,
      deviceId: testJunction,
      junctionName: 'Test Signal',
      deviceName: 'Test Signal',
      category: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 40 + Math.random() * 5, avgSpeedKmph: 22 },
    });
  }

  // Trigger severe queue beyond critical threshold (>165m)
  const spikeAlert = anomalyEngine.evaluate({
    junctionId: testJunction,
    deviceId: testJunction,
    junctionName: 'Test Signal',
    deviceName: 'Test Signal',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 195, avgSpeedKmph: 4 },
  });

  assert.ok(spikeAlert, 'Severe queue spike should trigger an anomaly alert');
  assert.strictEqual(spikeAlert.severity, 'critical');
  assert.ok(
    spikeAlert.metric === 'maxQueueLengthM' || spikeAlert.metric === 'avgSpeedKmph',
    'Alert should be triggered for maxQueueLengthM or avgSpeedKmph'
  );
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

test.after(() => {
  setImmediate(() => process.exit(0));
});
