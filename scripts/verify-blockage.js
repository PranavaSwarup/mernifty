#!/usr/bin/env node

import http from 'http';
import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';

const BASE_URL = 'http://localhost:5000';

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `${BASE_URL}${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (d) => (resBody += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode, body: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE_URL}${path}`,
      {
        method: 'GET',
        headers,
      },
      (res) => {
        let resBody = '';
        res.on('data', (d) => (resBody += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode, body: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runBlockageVerification() {
  console.log('================================================================');
  console.log('🚦 MetroPulse BLR: Hebbal Sudden Blockage & Spread Verification');
  console.log('================================================================\n');

  // Login as admin
  const adminLogin = await post('/api/auth/demo-login', { roleKey: 'admin' });
  const adminToken = adminLogin.body.token;

  // Connect socket to monitor alerts
  const socket = io(BASE_URL, { auth: { token: adminToken } });
  socket.emit('subscribe:city');
  socket.emit('subscribe:zone', 'all');

  const alertsReceived = [];
  socket.on('alert:new', (alert) => {
    alertsReceived.push(alert);
    console.log(`[Alert Emitted] [${alert.severity.toUpperCase()}] ${alert.metric} at ${alert.junctionId} (${alert.affectedRoad || 'whole junction'}) - "${alert.title}"`);
  });

  await new Promise((r) => setTimeout(r, 600));

  // Trigger Sudden Blockage on Hebbal
  const hebbalId = 'JNC-BLR-008';
  const targetRoad = 'Bellary Rd (from north)';
  console.log(`[Action] Triggering Sudden Blockage at Hebbal (${hebbalId}) on "${targetRoad}"...`);

  const blockRes = await post(
    '/api/simulator/scenario/blockage',
    { junctionId: hebbalId, road: targetRoad, durationSec: 35 },
    { Authorization: `Bearer ${adminToken}` }
  );
  console.log(`[Action Response] HTTP ${blockRes.status}:`, blockRes.body);

  // Monitor over the next 15 seconds as simulator generates ticks and evaluates anomalies
  console.log('\n[Monitoring] Observing incident detection and neighbour spreading over 15 seconds...');
  for (let s = 1; s <= 15; s++) {
    await new Promise((r) => setTimeout(r, 1000));
    process.stdout.write(`\rT+${s}s elapsed | Total Alerts: ${alertsReceived.length}`);
  }
  console.log('\n');

  // Analysis of alerts
  const criticalAlerts = alertsReceived.filter((a) => a.severity === 'critical');
  const hebbalBlockage = alertsReceived.find((a) => a.junctionId === hebbalId && a.metric === 'sudden_blockage');
  const hebbalJams = alertsReceived.filter((a) => a.junctionId === hebbalId && a.metric === 'jam');
  const neighbourCriticalJams = alertsReceived.filter((a) => a.junctionId !== hebbalId && a.severity === 'critical');
  const neighbourSpillovers = alertsReceived.filter((a) => a.junctionId !== hebbalId && a.metric === 'congestion_spillover');

  console.log('--- Verification Results ---');
  console.log(`1. Critical Alert Count:           ${criticalAlerts.length} (Expected: 1)`);
  console.log(`2. Hebbal Sudden Blockage Raised:   ${!!hebbalBlockage}`);
  if (hebbalBlockage) {
    console.log(`   • Metric:                       ${hebbalBlockage.metric}`);
    console.log(`   • Affected Road:                ${hebbalBlockage.affectedRoad}`);
    console.log(`   • Severity:                     ${hebbalBlockage.severity}`);
    console.log(`   • Suggested Action:             ${hebbalBlockage.suggestedAction?.action}`);
    console.log(`   • Action Description:           "${hebbalBlockage.suggestedAction?.description}"`);
  }
  console.log(`3. Hebbal Jam Alert Suppressed:     ${hebbalJams.length === 0} (${hebbalJams.length} raised)`);
  console.log(`4. Neighbour Critical Jam Alerts:   ${neighbourCriticalJams.length} (Expected: 0)`);
  console.log(`5. Neighbour Spillover Notices:     ${neighbourSpillovers.length} (Informational only)`);

  const passed =
    criticalAlerts.length === 1 &&
    hebbalBlockage &&
    hebbalBlockage.affectedRoad === targetRoad &&
    hebbalBlockage.suggestedAction?.action === 'divert' &&
    hebbalBlockage.suggestedAction?.description?.includes(targetRoad) &&
    hebbalJams.length === 0 &&
    neighbourCriticalJams.length === 0;

  console.log(`\n================================================================`);
  console.log(`Blockage Precedence & Spread Suppression: ${passed ? 'VERIFIED PASSED ✅' : 'FAILED ❌'}`);
  console.log(`================================================================\n`);

  socket.disconnect();
  // Clear scenario
  await post('/api/simulator/scenario/clear', {}, { Authorization: `Bearer ${adminToken}` });
  process.exit(passed ? 0 : 1);
}

runBlockageVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
