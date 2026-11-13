import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { anomalyEngine } from '../src/services/anomalyEngine.js';
import { metricsService } from '../src/services/metricsService.js';

test('1. Ingestion Buffer & Deduplication Logic', (t) => {
  const uniqueEventId = `TEST-EVT-${Date.now()}`;
  const event = {
    eventId: uniqueEventId,
    deviceId: 'test-node-01',
    category: 'server',
    timestamp: new Date().toISOString(),
    metrics: { cpuPercent: 50 },
  };

  // First enqueue must succeed
  const res1 = ingestionBuffer.enqueue(event);
  assert.strictEqual(res1.accepted, true, 'First event should be accepted into buffer');

  // Second enqueue with identical eventId must be rejected as duplicate
  const res2 = ingestionBuffer.enqueue(event);
  assert.strictEqual(res2.accepted, false, 'Duplicate eventId should be rejected');
  assert.strictEqual(res2.reason, 'Duplicate eventId');
});

test('2. Anomaly Engine Z-Score Detection', (t) => {
  const testDevice = 'test-turbine-99';

  // Seed baseline values
  for (let i = 0; i < 15; i++) {
    anomalyEngine.evaluate({
      deviceId: testDevice,
      deviceName: 'Test Turbine',
      category: 'turbine',
      timestamp: new Date().toISOString(),
      metrics: { vibrationMmS: 2.0 + Math.random() * 0.2 },
    });
  }

  // Trigger high spike beyond critical threshold (>7.5 mm/s)
  const spikeAlert = anomalyEngine.evaluate({
    deviceId: testDevice,
    deviceName: 'Test Turbine',
    category: 'turbine',
    timestamp: new Date().toISOString(),
    metrics: { vibrationMmS: 8.9 },
  });

  assert.ok(spikeAlert, 'Severe vibration spike should trigger an anomaly alert');
  assert.strictEqual(spikeAlert.severity, 'critical');
  assert.strictEqual(spikeAlert.metric, 'vibrationMmS');
  assert.strictEqual(spikeAlert.triggerValue, 8.9);
});

test('3. Metrics Service Throughput Calculations', (t) => {
  const initialIngested = metricsService.totalIngested;
  metricsService.recordIngest(50, 4);

  assert.strictEqual(metricsService.totalIngested, initialIngested + 50);
  const snap = metricsService.getSnapshot();
  assert.ok(typeof snap.ingestRate === 'number');
  assert.ok(typeof snap.uptimeSeconds === 'number');
});

test('4. Live HTTP API Endpoint Verification', async (t) => {
  // Test health check endpoint on running server
  await new Promise((resolve, reject) => {
    http.get('http://localhost:5000/api/health', (res) => {
      assert.strictEqual(res.statusCode, 200, 'Health check should return HTTP 200');
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const json = JSON.parse(body);
        assert.strictEqual(json.status, 'ok');
        resolve();
      });
    }).on('error', reject);
  });
});
