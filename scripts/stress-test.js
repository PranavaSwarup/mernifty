#!/usr/bin/env node

/**
 * MetroPulse High-Throughput Traffic Telemetry Stress & Benchmark Harness
 * 
 * Tests the system under heavy smart city camera stream loads:
 * - Fires dense batches of junction telemetry records
 * - Measures throughput (events/second), processing latency, and server response time
 * 
 * Usage:
 *   node scripts/stress-test.js [--count 3000] [--batchSize 200]
 */

import http from 'http';
import crypto from 'crypto';

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const totalEvents = parseInt(getArg('--count', '3000'), 10);
const batchSize = parseInt(getArg('--batchSize', '200'), 10);
const targetUrl = new URL(getArg('--url', 'http://localhost:5000/api/telemetry/batch'));
const apiKey = process.env.METROPULSE_API_KEY;

if (!apiKey) {
  console.error(
    '[Stress Test] Error: METROPULSE_API_KEY environment variable is required.\n' +
      'Set it from your provisioned DeviceKey (e.g. stored in server/.env.local-keys):\n' +
      '  PowerShell: $env:METROPULSE_API_KEY="mpk_..." ; node scripts/stress-test.js\n' +
      '  Or:         node --env-file=server/.env.local-keys scripts/stress-test.js'
  );
  process.exit(1);
}

console.log('====================================================');
console.log('🚦 MetroPulse BLR: Smart City Traffic Stress Test Harness');
console.log(`Target: ${targetUrl.href}`);
console.log(`Total Events to Ingest: ${totalEvents}`);
console.log(`Batch Size: ${batchSize} events/request`);
console.log('====================================================');

const junctions = [
  { junctionId: 'JNC-BLR-001', zoneId: 'south-bangalore', road: 'Hosur Rd (Silk Board)' },
  { junctionId: 'JNC-BLR-002', zoneId: 'south-bangalore', road: '100ft Rd (Sony World)' },
  { junctionId: 'JNC-BLR-005', zoneId: 'east-bangalore', road: 'ORR (Bellandur EcoSpace)' },
  { junctionId: 'JNC-BLR-006', zoneId: 'east-bangalore', road: 'Old Madras Rd (Tin Factory)' },
  { junctionId: 'JNC-BLR-008', zoneId: 'north-bangalore', road: 'Bellary Rd (Hebbal Flyover)' },
  { junctionId: 'JNC-BLR-011', zoneId: 'central-bangalore', road: 'Residency Rd (Richmond Circle)' },
];

function createBatch(size, batchIndex) {
  const events = [];
  const now = Date.now();
  for (let i = 0; i < size; i++) {
    const junc = junctions[i % junctions.length];
    events.push({
      eventId: `BENCH-${now}-${batchIndex}-${i}`,
      junctionId: junc.junctionId,
      zoneId: junc.zoneId,
      timestamp: new Date().toISOString(),
      sequence: batchIndex * size + i,
      data: {
        approaches: [
          { road: junc.road, vehiclesPerMin: Math.round(30 + Math.random() * 20), queueLengthM: Math.round(50 + Math.random() * 60), avgSpeedKmph: Math.round(12 + Math.random() * 15), signal: i % 2 === 0 ? 'green' : 'red' },
          { road: 'Feeder Arterial', vehiclesPerMin: Math.round(20 + Math.random() * 15), queueLengthM: Math.round(30 + Math.random() * 40), avgSpeedKmph: Math.round(15 + Math.random() * 10), signal: i % 2 === 0 ? 'red' : 'green' },
        ],
        vehicleMix: { twoWheeler: 0.55, car: 0.30, bus: 0.05, truck: 0.10 },
        stalledVehicleDetected: false,
      },
    });
  }
  return events;
}

async function sendBatch(batch, batchIndex) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(batch);
    const startReq = performance.now();

    const req = http.request(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 5000,
        path: targetUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-API-Key': apiKey,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          const durationMs = performance.now() - startReq;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              batchIndex,
              count: batch.length,
              durationMs,
              statusCode: res.statusCode,
            });
          } else {
            resolve({
              success: false,
              batchIndex,
              error: `HTTP ${res.statusCode}: ${body}`,
              durationMs,
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        success: false,
        batchIndex,
        error: err.message,
        durationMs: performance.now() - startReq,
      });
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  const numBatches = Math.ceil(totalEvents / batchSize);
  console.log(`Firing ${numBatches} batches (${batchSize} events each)...`);

  const startTime = performance.now();
  let totalSuccessful = 0;
  let latencies = [];

  for (let b = 0; b < numBatches; b++) {
    const batch = createBatch(batchSize, b);
    const result = await sendBatch(batch, b);

    if (result.success) {
      totalSuccessful += result.count;
      latencies.push(result.durationMs);
      process.stdout.write(`\r[Progress] Ingested ${totalSuccessful}/${totalEvents} events | Last Batch RTT: ${result.durationMs.toFixed(1)}ms`);
    } else {
      console.warn(`\n[Warning] Batch ${b} error: ${result.error}`);
    }
  }

  const totalTimeSec = (performance.now() - startTime) / 1000;
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const throughput = Math.round(totalSuccessful / totalTimeSec);

  console.log('\n\n================ Benchmark Summary ================');
  console.log(`Total Events Sent:       ${totalSuccessful.toLocaleString()}`);
  console.log(`Total Wall-Clock Time:   ${totalTimeSec.toFixed(2)} seconds`);
  console.log(`Sustained Throughput:    ${throughput.toLocaleString()} events/second`);
  console.log(`Mean Batch Ingestion RTT:${avgLatency.toFixed(2)} ms`);
  console.log('====================================================\n');
}

run();
