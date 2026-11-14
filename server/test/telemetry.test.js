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

  // Single transient frame must NOT trigger (persistence >= 3 required)
  const transientOne = anomalyEngine.evaluate({
    junctionId: testJunction,
    deviceId: testJunction,
    junctionName: 'Test Signal',
    deviceName: 'Test Signal',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 195, avgSpeedKmph: 4 },
  });
  assert.strictEqual(transientOne, null, '1-frame transient spike must not trigger alert');

  const transientTwo = anomalyEngine.evaluate({
    junctionId: testJunction,
    deviceId: testJunction,
    junctionName: 'Test Signal',
    deviceName: 'Test Signal',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 195, avgSpeedKmph: 4 },
  });
  assert.strictEqual(transientTwo, null, '2-frame transient spike must not trigger alert');

  // 3rd consecutive severe frame triggers critical alert with non-zero threshold
  const spikeAlert = anomalyEngine.evaluate({
    junctionId: testJunction,
    deviceId: testJunction,
    junctionName: 'Test Signal',
    deviceName: 'Test Signal',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 195, avgSpeedKmph: 4 },
  });

  assert.ok(spikeAlert, 'Sustained 3-frame queue spike should trigger an anomaly alert');
  assert.strictEqual(spikeAlert.severity, 'critical');
  assert.ok(
    spikeAlert.metric === 'maxQueueLengthM' || spikeAlert.metric === 'avgSpeedKmph',
    'Alert should be triggered for maxQueueLengthM or avgSpeedKmph'
  );
  assert.ok(spikeAlert.thresholdValue > 0, 'Threshold must never be 0');
  assert.ok(!spikeAlert.message.includes('Threshold: 0'), 'Alert message must never include Threshold: 0');
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

test('5. Anomaly Engine uses null zScore for discrete event alerts while preserving numeric zScore for queue spikes', () => {
  const jId = 'JNC-BLR-098';
  for (let i = 0; i < 12; i++) {
    anomalyEngine.evaluate({
      junctionId: jId,
      deviceId: jId,
      junctionName: 'Event Test Junction',
      deviceName: 'Event Test Junction',
      category: 'east-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 42 + (i % 3), avgSpeedKmph: 24 },
    });
  }

  const stallAlert = anomalyEngine.evaluate({
    junctionId: 'JNC-BLR-097',
    deviceId: 'JNC-BLR-097',
    junctionName: 'Stall Junction',
    deviceName: 'Stall Junction',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { stalledVehicleDetected: true, maxQueueLengthM: 50, avgSpeedKmph: 20 },
  });
  assert.ok(stallAlert);
  assert.strictEqual(stallAlert.metric, 'stalledVehicle');
  assert.strictEqual(stallAlert.zScore, null, 'Discrete stalledVehicle event must NOT fabricate a numeric zScore');
  assert.strictEqual(stallAlert.severity, 'critical');

  const ambAlert = anomalyEngine.evaluate({
    junctionId: 'JNC-BLR-096',
    deviceId: 'JNC-BLR-096',
    junctionName: 'Ambulance Junction',
    deviceName: 'Ambulance Junction',
    category: 'north-bangalore',
    timestamp: new Date().toISOString(),
    data: { emergencySeverity: 'high' },
    metrics: { ambulanceDetected: true, maxQueueLengthM: 45, avgSpeedKmph: 22 },
  });
  assert.ok(ambAlert);
  assert.strictEqual(ambAlert.metric, 'ambulancePreemption');
  assert.strictEqual(ambAlert.zScore, null, 'Discrete ambulance event must NOT fabricate a numeric zScore');
  assert.strictEqual(ambAlert.severity, 'high', 'Event severity should be derived from event payload');

  let statisticalSpike = null;
  for (let frame = 0; frame < 3; frame++) {
    statisticalSpike = anomalyEngine.evaluate({
      junctionId: jId,
      deviceId: jId,
      junctionName: 'Silk Board Junction (Hosur Rd & ORR)',
      deviceName: 'Silk Board Junction (Hosur Rd & ORR)',
      category: 'east-bangalore',
      timestamp: new Date().toISOString(),
      data: {
        approaches: [
          { road: 'Hosur Rd (from south)', queueLengthM: 185, avgSpeedKmph: 24, vehiclesPerMin: 55 },
          { road: 'ORR (from east)', queueLengthM: 52, avgSpeedKmph: 24, vehiclesPerMin: 35 },
        ],
      },
      metrics: { maxQueueLengthM: 185, avgSpeedKmph: 24 },
    });
  }
  assert.ok(statisticalSpike);
  assert.strictEqual(typeof statisticalSpike.zScore, 'number');
  assert.ok(statisticalSpike.zScore > 3, `Expected statistical queue spike zScore > 3, got ${statisticalSpike.zScore}`);
  assert.ok(
    statisticalSpike.title.includes('Hosur Rd (from south)'),
    `Expected approach road in alert title, got: ${statisticalSpike.title}`
  );
  assert.ok(!statisticalSpike.message.includes('Threshold: 0'));
});

test('6. Anomaly Engine v2 suppresses false positives (39.9 km/h speed, 3.7 m queue, improvements, 2-frame flicker)', () => {
  // 6a. avgSpeedKmph: 39.9 even sustained must NEVER alert (above 15 km/h practical floor)
  for (let i = 0; i < 12; i++) {
    const r = anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-095',
      deviceId: 'JNC-BLR-095',
      junctionName: 'Free Flow Junction',
      category: 'central-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 8, avgSpeedKmph: 50 },
    });
    assert.strictEqual(r, null);
  }
  for (let i = 0; i < 5; i++) {
    const fpSpeed = anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-095',
      deviceId: 'JNC-BLR-095',
      junctionName: 'Free Flow Junction',
      category: 'central-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 8, avgSpeedKmph: 39.9 },
    });
    assert.strictEqual(fpSpeed, null, 'avgSpeedKmph: 39.9 must NEVER trigger an alert');
  }

  // 6b. maxQueueLengthM: 3.7 m even against near-zero baseline must NEVER alert (below 60 m floor)
  for (let i = 0; i < 12; i++) {
    anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-094',
      deviceId: 'JNC-BLR-094',
      junctionName: 'Night Junction',
      category: 'north-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 1.0, avgSpeedKmph: 44 },
    });
  }
  for (let i = 0; i < 5; i++) {
    const fpQueue = anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-094',
      deviceId: 'JNC-BLR-094',
      junctionName: 'Night Junction',
      category: 'north-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 3.7, avgSpeedKmph: 43 },
    });
    assert.strictEqual(fpQueue, null, 'maxQueueLengthM: 3.7 must NEVER trigger an alert');
  }

  // 6c. One-sided direction test: improving queue (80 -> 10) or improving speed (10 -> 39.9) never alerts
  for (let i = 0; i < 12; i++) {
    anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-093',
      deviceId: 'JNC-BLR-093',
      junctionName: 'Clearing Junction',
      category: 'east-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 85, avgSpeedKmph: 10 + (i % 2) },
    });
  }
  for (let i = 0; i < 5; i++) {
    const improved = anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-093',
      deviceId: 'JNC-BLR-093',
      junctionName: 'Clearing Junction',
      category: 'east-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 10, avgSpeedKmph: 39.9 },
    });
    assert.strictEqual(improved, null, 'Traffic improvement must NEVER trigger negative-z anomaly');
  }

  // 6d. 2-frame transient surge resets when normal resumes
  for (let i = 0; i < 10; i++) {
    anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-092',
      deviceId: 'JNC-BLR-092',
      junctionName: 'Transient Test',
      category: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 40, avgSpeedKmph: 25 },
    });
  }
  assert.strictEqual(
    anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-092',
      deviceId: 'JNC-BLR-092',
      junctionName: 'Transient Test',
      category: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 150, avgSpeedKmph: 25 },
    }),
    null
  );
  assert.strictEqual(
    anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-092',
      deviceId: 'JNC-BLR-092',
      junctionName: 'Transient Test',
      category: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 150, avgSpeedKmph: 25 },
    }),
    null
  );
  // Return to baseline resets streak; next 1 spike won't alert either
  anomalyEngine.evaluate({
    junctionId: 'JNC-BLR-092',
    deviceId: 'JNC-BLR-092',
    junctionName: 'Transient Test',
    category: 'south-bangalore',
    timestamp: new Date().toISOString(),
    metrics: { maxQueueLengthM: 42, avgSpeedKmph: 25 },
  });
  assert.strictEqual(
    anomalyEngine.evaluate({
      junctionId: 'JNC-BLR-092',
      deviceId: 'JNC-BLR-092',
      junctionName: 'Transient Test',
      category: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { maxQueueLengthM: 155, avgSpeedKmph: 25 },
    }),
    null
  );
});

test.after(() => {
  setImmediate(() => process.exit(0));
});
