#!/usr/bin/env node

/**
 * HyperPulse Standalone External Telemetry Producer
 * Demonstrates streaming telemetry ingestion from an independent agent/process.
 * 
 * Usage:
 *   node scripts/standalone-producer.js [--rate 20] [--device edge-node-99] [--category server]
 */

import http from 'http';
import crypto from 'crypto';

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const rate = parseInt(getArg('--rate', '15'), 10);
const deviceId = getArg('--device', 'external-collector-01');
const category = getArg('--category', 'server');
const serverUrl = getArg('--url', 'http://localhost:5000/api/telemetry/ingest');

console.log('====================================================');
console.log('📡 HyperPulse Standalone Telemetry Producer');
console.log(`Target: ${serverUrl}`);
console.log(`Device ID: ${deviceId} | Category: ${category}`);
console.log(`Emission Rate: ${rate} events/second`);
console.log('====================================================');

let sequence = 0;
let totalSent = 0;
let totalAcks = 0;
let totalErrors = 0;

function sendEvent() {
  sequence++;
  totalSent++;

  const payload = {
    eventId: `EXT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    deviceId,
    deviceName: `External Agent ${deviceId}`,
    category,
    timestamp: new Date().toISOString(),
    sequence,
    metrics: category === 'server'
      ? {
          cpuPercent: parseFloat((35 + Math.random() * 45).toFixed(2)),
          memoryPercent: parseFloat((55 + Math.random() * 30).toFixed(2)),
          latencyMs: Math.round(15 + Math.random() * 35),
          networkRxMbps: Math.round(200 + Math.random() * 300),
          networkTxMbps: Math.round(300 + Math.random() * 400),
        }
      : {
          speedKmh: Math.round(70 + Math.random() * 40),
          batteryLevel: parseFloat((80 - (sequence * 0.05)).toFixed(1)),
          motorTempC: Math.round(65 + Math.random() * 20),
        },
    status: 'healthy',
  };

  const data = JSON.stringify(payload);
  const parsedUrl = new URL(serverUrl);

  const req = http.request(
    {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 5000,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-API-Key': 'hp_key_demo_public_operator',
      },
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          totalAcks++;
        } else {
          totalErrors++;
          console.warn(`[Producer] HTTP ${res.statusCode}: ${body}`);
        }
      });
    }
  );

  req.on('error', (err) => {
    totalErrors++;
    console.error(`[Producer] Connection error: ${err.message}`);
  });

  req.write(data);
  req.end();
}

const intervalMs = Math.round(1000 / rate);
const timer = setInterval(sendEvent, intervalMs);

// Log summary every 5 seconds
setInterval(() => {
  console.log(
    `[Stats] Sent: ${totalSent} | Acknowledged: ${totalAcks} | Errors: ${totalErrors} | Active Rate: ~${rate} e/s`
  );
}, 5000);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\n[Producer] Stopped.');
  console.log(`Final summary: ${totalSent} sent, ${totalAcks} acks, ${totalErrors} errors.`);
  process.exit(0);
});
