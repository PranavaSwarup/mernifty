import test from 'node:test';
import assert from 'node:assert';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { anomalyEngine } from '../src/services/anomalyEngine.js';
import { metricsService } from '../src/services/metricsService.js';
import { normalizeTrafficEvent } from '../src/middleware/validator.js';

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
    junctionId: 'JNC-BLR-001',
    zoneId: 'south-bangalore',
    data: {
      approaches: [
        { road: 'Hosur Rd (from south)', vehiclesPerMin: 38, queueLengthM: 180, avgSpeedKmph: 6, signal: 'red' },
        { road: 'ORR (from east)', vehiclesPerMin: 52, queueLengthM: 60, avgSpeedKmph: 22, signal: 'green' },
        { road: 'Hosur Rd (from north)', vehiclesPerMin: 30, queueLengthM: 90, avgSpeedKmph: 14, signal: 'red' },
        { road: 'BTM Rd (from west)', vehiclesPerMin: 21, queueLengthM: 40, avgSpeedKmph: 18, signal: 'red' },
      ],
      vehicleMix: { twoWheeler: 0.55, car: 0.3, bus: 0.05, truck: 0.1 },
      stalledVehicleDetected: false,
    },
  };

  const normalized = normalizeTrafficEvent(teamPayload);

  assert.strictEqual(normalized.junctionId, 'JNC-BLR-001');
  assert.strictEqual(normalized.zoneId, 'south-bangalore');
  assert.strictEqual(normalized.data.totalFlowVehiclesPerMin, 141);
  assert.strictEqual(normalized.data.maxQueueLengthM, 180);
  assert.strictEqual(normalized.data.stalledVehicleDetected, false);
  assert.ok(normalized.metrics.congestionScore > 50, 'High queue on red should produce high congestion score');
  assert.ok(normalized.status === 'gridlock' || normalized.status === 'congested', 'Status should reflect congestion');
});
