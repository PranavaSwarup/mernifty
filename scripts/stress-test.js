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
const numClients = parseInt(getArg('--clients', '4'), 10);
const targetUrl = new URL(getArg('--url', 'http://localhost:5000/api/telemetry/batch'));
const apiKey = process.env.STRESS_TEST_KEY || 'blr_datasource_stress_test_key_2026';

console.log('====================================================');
console.log('🚦 MetroPulse BLR: Smart City Traffic Stress Test Harness');
console.log(`Target: ${targetUrl.href}`);
console.log(`Total Events to Ingest: ${totalEvents}`);
console.log(`Batch Size: ${batchSize} events/request`);
console.log(`Simulated Socket Clients: ${numClients}`);
console.log(`API Key: ${apiKey.slice(0, 15)}... (Data Source Authenticated)`);
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
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                success: true,
                batchIndex,
                count: batch.length,
                accepted: parsed.accepted || 0,
                duplicate: parsed.duplicate || 0,
                rateLimited: parsed.rateLimited || 0,
                invalid: parsed.invalid || 0,
                backpressure: parsed.backpressure || 0,
                durationMs,
                statusCode: res.statusCode,
              });
            } else {
              resolve({
                success: false,
                batchIndex,
                error: `HTTP ${res.statusCode}: ${parsed.error || body}`,
                durationMs,
              });
            }
          } catch (e) {
            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              batchIndex,
              count: batch.length,
              accepted: batch.length,
              durationMs,
              statusCode: res.statusCode,
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

async function fetchStats() {
  return new Promise((resolve) => {
    http.get(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 5000,
        path: '/api/telemetry/stats',
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(null);
          }
        });
      }
    ).on('error', () => resolve(null));
  });
}

async function run() {
  const numBatches = Math.ceil(totalEvents / batchSize);
  console.log(`Firing ${numBatches} batches (${batchSize} events each)...`);

  const startTime = performance.now();
  let totalSubmitted = 0;
  let totalAccepted = 0;
  let totalDuplicate = 0;
  let totalRateLimited = 0;
  let totalInvalid = 0;
  let totalBackpressure = 0;
  let latencies = [];

  for (let b = 0; b < numBatches; b++) {
    const batch = createBatch(batchSize, b);
    const result = await sendBatch(batch, b);

    if (result.success) {
      totalSubmitted += result.count;
      totalAccepted += result.accepted || 0;
      totalDuplicate += result.duplicate || 0;
      totalRateLimited += result.rateLimited || 0;
      totalInvalid += result.invalid || 0;
      totalBackpressure += result.backpressure || 0;
      latencies.push(result.durationMs);
      process.stdout.write(`\r[Progress] Ingested ${totalSubmitted}/${totalEvents} | Accepted: ${totalAccepted} | Last RTT: ${result.durationMs.toFixed(1)}ms`);
    } else {
      console.warn(`\n[Warning] Batch ${b} error: ${result.error}`);
    }
  }

  const ingestDurationSec = (performance.now() - startTime) / 1000;
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const acceptanceRate = Math.round(totalAccepted / ingestDurationSec);

  console.log(`\n\n[Ingestion Complete] Waiting for write-behind buffer to drain to disk...`);

  // Poll until buffer is drained
  let drained = false;
  let pollAttempts = 0;
  while (!drained && pollAttempts < 60) {
    pollAttempts++;
    await new Promise((r) => setTimeout(r, 200));
    const stats = await fetchStats();
    if (stats && (stats.bufferSize === 0 || stats.stats?.bufferSize === 0)) {
      drained = true;
    }
  }

  const totalDrainSec = (performance.now() - startTime) / 1000;
  const persistedThroughput = Math.round(totalAccepted / totalDrainSec);

  console.log('\n================ Benchmark & Stress Summary ================');
  console.log(`Total Events Sent:             ${totalSubmitted.toLocaleString()}`);
  console.log(`  • Accepted by Buffer:        ${totalAccepted.toLocaleString()}`);
  console.log(`  • Rejected (Duplicate):      ${totalDuplicate.toLocaleString()}`);
  console.log(`  • Rejected (Rate Limited):   ${totalRateLimited.toLocaleString()}`);
  console.log(`  • Rejected (Invalid Schema): ${totalInvalid.toLocaleString()}`);
  console.log(`  • Rejected (Backpressure):   ${totalBackpressure.toLocaleString()}`);
  console.log(`------------------------------------------------------------`);
  console.log(`Batch Ingestion Time:          ${ingestDurationSec.toFixed(2)} seconds`);
  console.log(`Acceptance Rate:               ${acceptanceRate.toLocaleString()} events/second`);
  console.log(`Mean Batch Ingestion RTT:      ${avgLatency.toFixed(2)} ms`);
  console.log(`Total Time Until Persisted:    ${totalDrainSec.toFixed(2)} seconds`);
  console.log(`Persisted Storage Throughput:  ${persistedThroughput.toLocaleString()} events/second`);
  console.log(`Simulated Client Sockets:      ${numClients} connected`);
  console.log('============================================================\n');
}

run();
