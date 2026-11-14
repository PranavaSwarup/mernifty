#!/usr/bin/env node

/**
 * MetroPulse Smart City Traffic - Central Camera Telemetry Producer
 * Simulates high-throughput JSON telemetry emitted by Centralized Vision Processing Workers
 * for Bengaluru traffic junctions.
 * 
 * Usage:
 *   node scripts/standalone-producer.js [--rate 15] [--junction JNC-BLR-001] [--zone south-bangalore]
 */

import http from 'http';
import crypto from 'crypto';

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const rate = parseInt(getArg('--rate', '12'), 10);
const junctionId = getArg('--junction', 'JNC-BLR-001');
const zoneId = getArg('--zone', 'south-bangalore');
const serverUrl = getArg('--url', 'http://localhost:5000/api/telemetry/ingest');
const apiKey = process.env.METROPULSE_API_KEY;

if (!apiKey) {
  console.error(
    '[Producer BLR] Error: METROPULSE_API_KEY environment variable is required.\n' +
      'Set it from your provisioned DeviceKey (e.g. printed on first server seed or stored in server/.env.local-keys):\n' +
      '  PowerShell: $env:METROPULSE_API_KEY="mpk_..." ; node scripts/standalone-producer.js\n' +
      '  Or:         node --env-file=server/.env.local-keys scripts/standalone-producer.js'
  );
  process.exit(1);
}

console.log('====================================================');
console.log('🚦 MetroPulse BLR: Smart City Traffic Producer');
console.log(`Target: ${serverUrl}`);
console.log(`Junction ID: ${junctionId} | Zone: ${zoneId}`);
console.log(`Emission Rate: ${rate} events/second`);
console.log('====================================================');

let sequence = 0;
let totalSent = 0;
let totalAcks = 0;
let totalErrors = 0;

function sendEvent() {
  sequence++;
  totalSent++;

  // Alternate signal state
  const isHosurGreen = sequence % 4 < 2;

  // Exact JSON payload schema requested by the team
  const payload = {
    eventId: `EXT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    junctionId,
    zoneId,
    timestamp: new Date().toISOString(),
    sequence,
    data: {
      approaches: [
        {
          road: 'Hosur Rd (from south)',
          vehiclesPerMin: Math.round(35 + Math.random() * 15),
          queueLengthM: isHosurGreen ? Math.round(30 + Math.random() * 20) : Math.round(150 + Math.random() * 50),
          avgSpeedKmph: isHosurGreen ? Math.round(22 + Math.random() * 8) : Math.round(5 + Math.random() * 3),
          signal: isHosurGreen ? 'green' : 'red',
        },
        {
          road: 'ORR (from east)',
          vehiclesPerMin: Math.round(45 + Math.random() * 20),
          queueLengthM: isHosurGreen ? Math.round(120 + Math.random() * 40) : Math.round(40 + Math.random() * 20),
          avgSpeedKmph: isHosurGreen ? Math.round(6 + Math.random() * 4) : Math.round(24 + Math.random() * 6),
          signal: isHosurGreen ? 'red' : 'green',
        },
        {
          road: 'Hosur Rd (from north)',
          vehiclesPerMin: Math.round(25 + Math.random() * 15),
          queueLengthM: isHosurGreen ? Math.round(40 + Math.random() * 20) : Math.round(90 + Math.random() * 30),
          avgSpeedKmph: isHosurGreen ? Math.round(18 + Math.random() * 6) : Math.round(10 + Math.random() * 4),
          signal: isHosurGreen ? 'green' : 'red',
        },
        {
          road: 'BTM Rd (from west)',
          vehiclesPerMin: Math.round(18 + Math.random() * 10),
          queueLengthM: isHosurGreen ? Math.round(70 + Math.random() * 25) : Math.round(35 + Math.random() * 15),
          avgSpeedKmph: isHosurGreen ? Math.round(8 + Math.random() * 4) : Math.round(20 + Math.random() * 5),
          signal: isHosurGreen ? 'red' : 'green',
        },
      ],
      vehicleMix: {
        twoWheeler: 0.55,
        car: 0.30,
        bus: 0.05,
        truck: 0.10,
      },
      stalledVehicleDetected: false,
    },
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
        'X-API-Key': apiKey,
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
        }
      });
    }
  );

  req.on('error', (err) => {
    totalErrors++;
  });

  req.write(data);
  req.end();
}

const intervalMs = Math.max(1, Math.floor(1000 / rate));
const timer = setInterval(sendEvent, intervalMs);

setInterval(() => {
  console.log(
    `[Producer BLR] Sent: ${totalSent} | Ingest Acks: ${totalAcks} | Errors: ${totalErrors} | Target Rate: ${rate}/s`
  );
}, 2000);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nStopping producer.');
  process.exit(0);
});
