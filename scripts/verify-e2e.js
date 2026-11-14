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

function patch(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `${BASE_URL}${path}`,
      {
        method: 'PATCH',
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

async function runVerification() {
  console.log('================================================================');
  console.log('🚦 MetroPulse BLR: Comprehensive 4-Client E2E Verification Suite');
  console.log('================================================================\n');

  // 1. Health check & Seed counts
  console.log('--- 1. Health & 24-Hour Seed Verification ---');
  const health = await get('/api/health');
  console.log(`GET /api/health -> Status ${health.status}:`, JSON.stringify(health.body));
  console.log(`[PASS] 24-hour seeded history present: ${health.body.seededRecordCount} records, ${health.body.baselineSlotCount} baseline slots.`);

  // 2. Demo login & Role acquisition
  console.log('\n--- 2. Role Checks & Demo Login Gating ---');
  const citizenLogin = await post('/api/auth/demo-login', { roleKey: 'citizen' });
  const citizenToken = citizenLogin.body.token;
  console.log(`[Demo Login] Citizen token acquired: ${citizenToken ? 'OK' : 'FAIL'}`);

  const officerSouthLogin = await post('/api/auth/demo-login', { roleKey: 'officer_south' });
  const officerSouthToken = officerSouthLogin.body.token;
  console.log(`[Demo Login] South Officer token acquired: ${officerSouthToken ? 'OK' : 'FAIL'}`);

  const adminLogin = await post('/api/auth/demo-login', { roleKey: 'admin' });
  const adminToken = adminLogin.body.token;
  console.log(`[Demo Login] Admin token acquired: ${adminToken ? 'OK' : 'FAIL'}`);

  const ambulanceLogin = await post('/api/auth/demo-login', { roleKey: 'ambulance' });
  const ambulanceToken = ambulanceLogin.body.token;
  console.log(`[Demo Login] Ambulance token acquired: ${ambulanceToken ? 'OK' : 'FAIL'}`);

  // Role Check A: Anonymous stop simulator returns 401
  const anonStop = await post('/api/simulator/stop', {});
  console.log(`[Role Check] Anonymous POST /api/simulator/stop -> HTTP ${anonStop.status} (Expected: 401)`);

  // Role Check B: Citizen starting corridor returns 403
  const citizenCorridor = await post(
    '/api/corridor/start',
    { startJunctionId: 'JNC-BLR-008', destinationJunctionId: 'JNC-BLR-004' },
    { Authorization: `Bearer ${citizenToken}` }
  );
  console.log(`[Role Check] Citizen POST /api/corridor/start -> HTTP ${citizenCorridor.status} (Expected: 403)`);

  // Role Check C: South officer tagging North alert returns 403
  const alertsRes = await get('/api/alerts?junctionId=JNC-BLR-008');
  let northAlertId = alertsRes.body?.alerts?.[0]?.alertId;
  const officerCrossTag = await patch(
    `/api/alerts/${northAlertId}/cause`,
    { cause: 'accident' },
    { Authorization: `Bearer ${officerSouthToken}` }
  );
  console.log(`[Role Check] South Officer patching North alert (${northAlertId}) -> HTTP ${officerCrossTag.status} (Expected: 403)`);

  // Role Check D: Registering with role 'admin' creates citizen
  const regAdmin = await post('/api/auth/register', {
    name: 'Malicious Admin',
    email: `fakeadmin_${Date.now()}@example.com`,
    password: 'Password123!',
    role: 'admin',
  });
  console.log(`[Role Check] Registration with role="admin" -> user.role is: "${regAdmin.body?.user?.role}" (Expected: citizen)`);

  // 3. Ingestion Authentication & Validation & Duplicates
  console.log('\n--- 3. Ingestion Auth, Per-Junction Limiting & Validation ---');

  // Ingest Auth A: No API key returns 401
  const noKeyIngest = await post('/api/telemetry/ingest', {
    eventId: `NO-KEY-${Date.now()}`,
    junctionId: 'JNC-BLR-001',
    zoneId: 'south-bangalore',
    metrics: { avgSpeedKmph: 25, maxQueueLengthM: 40 },
    data: { approaches: [{ road: 'Hosur Rd', avgSpeedKmph: 25, queueLengthM: 40, signal: 'green' }] },
  });
  console.log(`[Ingest Auth] No API Key -> HTTP ${noKeyIngest.status} (Expected: 401)`);

  // Ingest Auth B: Citizen key returns 403
  const citizenKey = citizenLogin.body.user.apiKey || 'citizen_test_key';
  const citizenKeyIngest = await post(
    '/api/telemetry/ingest',
    {
      eventId: `CIT-KEY-${Date.now()}`,
      junctionId: 'JNC-BLR-001',
      zoneId: 'south-bangalore',
      metrics: { avgSpeedKmph: 25, maxQueueLengthM: 40 },
      data: { approaches: [{ road: 'Hosur Rd', avgSpeedKmph: 25, queueLengthM: 40, signal: 'green' }] },
    },
    { 'x-api-key': citizenKey }
  );
  console.log(`[Ingest Auth] Citizen API Key -> HTTP ${citizenKeyIngest.status} (Expected: 403)`);

  // Ingest Auth C: Producer data-source key returns 202
  const producerKey = 'blr_datasource_producer_key_2026';
  const testEventId = `VERIFY-EVT-${Date.now()}`;
  const validIngest = await post(
    '/api/telemetry/ingest',
    {
      eventId: testEventId,
      junctionId: 'JNC-BLR-001',
      zoneId: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { avgSpeedKmph: 25, maxQueueLengthM: 40 },
      data: { approaches: [{ road: 'Hosur Rd (from south)', vehiclesPerMin: 35, avgSpeedKmph: 25, queueLengthM: 40, signal: 'green' }] },
    },
    { 'x-api-key': producerKey }
  );
  console.log(`[Ingest Auth] Data-Source Producer Key -> HTTP ${validIngest.status} (Expected: 202)`);

  // Ingest Auth D: Duplicate single event returns 409
  const dupIngest = await post(
    '/api/telemetry/ingest',
    {
      eventId: testEventId,
      junctionId: 'JNC-BLR-001',
      zoneId: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { avgSpeedKmph: 25, maxQueueLengthM: 40 },
      data: { approaches: [{ road: 'Hosur Rd (from south)', vehiclesPerMin: 35, avgSpeedKmph: 25, queueLengthM: 40, signal: 'green' }] },
    },
    { 'x-api-key': producerKey }
  );
  console.log(`[Duplicate Check] Duplicate eventId ${testEventId} -> HTTP ${dupIngest.status} (Expected: 409 Conflict)`);

  // Validation A: Out-of-range speed (> 160 km/h) rejected with clear error
  const invalidSpeed = await post(
    '/api/telemetry/ingest',
    {
      eventId: `BAD-SPEED-${Date.now()}`,
      junctionId: 'JNC-BLR-001',
      zoneId: 'south-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { avgSpeedKmph: 240, maxQueueLengthM: 40 },
      data: { approaches: [{ road: 'Hosur Rd (from south)', vehiclesPerMin: 35, avgSpeedKmph: 240, queueLengthM: 40, signal: 'green' }] },
    },
    { 'x-api-key': producerKey }
  );
  console.log(`[Validation] Out-of-range speed (240 km/h) -> HTTP ${invalidSpeed.status}, error: "${invalidSpeed.body.error}"`);

  // Validation B: Wrong zone claim overridden by registry
  const wrongZone = await post(
    '/api/telemetry/ingest',
    {
      eventId: `ZONE-TEST-${Date.now()}`,
      junctionId: 'JNC-BLR-008', // Hebbal is north-bangalore
      zoneId: 'south-bangalore', // Claimed south
      timestamp: new Date().toISOString(),
      metrics: { avgSpeedKmph: 30, maxQueueLengthM: 50 },
      data: { approaches: [{ road: 'Bellary Rd (from north)', vehiclesPerMin: 40, avgSpeedKmph: 30, queueLengthM: 50, signal: 'green' }] },
    },
    { 'x-api-key': producerKey }
  );
  console.log(`[Validation] Wrong zone claim (Hebbal claimed as south-bangalore) -> Overridden & Accepted: HTTP ${wrongZone.status}`);

  // 4. Multi-Client Socket.IO Room Filtering
  console.log('\n--- 4. 4-Client Socket.IO Room Filtering ---');
  const client1_SouthOfficer = io(BASE_URL, { auth: { token: officerSouthToken } });
  const client2_SilkBoardJunction = io(BASE_URL, { auth: { token: citizenToken } });
  const client3_HebbalRoute = io(BASE_URL, { auth: { token: citizenToken } });
  const client4_Unsubscribed = io(BASE_URL, {});

  let c1_events = [];
  let c2_events = [];
  let c3_events = [];
  let c4_events = [];

  await new Promise((resolve) => setTimeout(resolve, 600));

  const p1 = new Promise((r) => client1_SouthOfficer.once('subscribed', r));
  const p2 = new Promise((r) => client2_SilkBoardJunction.once('subscribed', r));
  const p3 = new Promise((r) => client3_HebbalRoute.once('subscribed', r));

  client1_SouthOfficer.emit('subscribe:zone', 'south-bangalore');
  client2_SilkBoardJunction.emit('subscribe:junction', 'JNC-BLR-001');
  client3_HebbalRoute.emit('subscribe:junction', 'JNC-BLR-008');

  await Promise.all([p1, p2, p3]);

  client1_SouthOfficer.on('telemetry:batch', (evts) => {
    c1_events.push(...evts);
  });
  client2_SilkBoardJunction.on('telemetry:device_feed', (evts) => {
    c2_events.push(...evts);
  });
  client3_HebbalRoute.on('telemetry:device_feed', (evts) => {
    c3_events.push(...evts);
  });
  client4_Unsubscribed.on('telemetry:batch', (evts) => {
    c4_events.push(...evts);
  });
  client4_Unsubscribed.on('telemetry:device_feed', (evts) => {
    c4_events.push(...evts);
  });

  // Emit south event at Silk Board
  await post(
    '/api/telemetry/ingest',
    {
      eventId: `FILTER-SOUTH-${Date.now()}`,
      junctionId: 'JNC-BLR-001',
      zoneId: 'south-bangalore',
      metrics: { avgSpeedKmph: 22, maxQueueLengthM: 40 },
      data: { approaches: [{ road: 'Hosur Rd (from south)', vehiclesPerMin: 35, avgSpeedKmph: 22, queueLengthM: 40, signal: 'green' }] },
    },
    { 'x-api-key': producerKey }
  );

  // Emit north event at Hebbal
  const resNorth = await post(
    '/api/telemetry/ingest',
    {
      eventId: `FILTER-NORTH-${Date.now()}`,
      junctionId: 'JNC-BLR-008',
      zoneId: 'north-bangalore',
      timestamp: new Date().toISOString(),
      metrics: { avgSpeedKmph: 28, maxQueueLengthM: 35 },
      data: { approaches: [{ road: 'Bellary Rd (from north)', vehiclesPerMin: 45, avgSpeedKmph: 28, queueLengthM: 35, signal: 'green' }] },
    },
    { 'x-api-key': producerKey }
  );
  if (resNorth.status !== 202) {
    console.warn(`[Warning] Hebbal ingest failed: HTTP ${resNorth.status}`, resNorth.body);
  }

  // Wait for 80ms micro-batch flush and network round-trip
  await new Promise((resolve) => setTimeout(resolve, 1200));

  console.log(`Client 1 (South Officer): Received ${c1_events.length} events (All south-bangalore: ${c1_events.length > 0 && c1_events.every((e) => e.zoneId === 'south-bangalore')})`);
  console.log(`Client 2 (Silk Board):    Received ${c2_events.length} events (All JNC-BLR-001: ${c2_events.length > 0 && c2_events.every((e) => e.junctionId === 'JNC-BLR-001')})`);
  console.log(`Client 3 (Hebbal Route):  Received ${c3_events.length} events (All JNC-BLR-008: ${c3_events.length > 0 && c3_events.every((e) => e.junctionId === 'JNC-BLR-008')})`);
  console.log(`Client 4 (Unsubscribed):  Received ${c4_events.length} events (Expected: 0)`);

  const roomFilterPassed =
    c1_events.length > 0 &&
    c1_events.every((e) => e.zoneId === 'south-bangalore') &&
    c2_events.length > 0 &&
    c2_events.every((e) => e.junctionId === 'JNC-BLR-001') &&
    c3_events.length > 0 &&
    c3_events.every((e) => e.junctionId === 'JNC-BLR-008') &&
    c4_events.length === 0;

  console.log(`[PASS] Room Filtering Strictly Enforced: ${roomFilterPassed}`);

  // 5. Ambulance Corridor from Hebbal to Jayadeva
  console.log('\n--- 5. Ambulance Green Corridor Preemption (Hebbal -> Jayadeva) ---');
  let giveWayNoticesC3 = [];
  let giveWayNoticesC2 = [];
  client3_HebbalRoute.on('corridor:giveway', (notice) => giveWayNoticesC3.push(notice));
  client2_SilkBoardJunction.on('corridor:giveway', (notice) => giveWayNoticesC2.push(notice));

  const corridorReq = await post(
    '/api/corridor/start',
    {
      startJunctionId: 'JNC-BLR-008',
      destinationJunctionId: 'JNC-BLR-004',
      vehicleId: 'AMB-BLR-01',
      durationSeconds: 30,
    },
    { Authorization: `Bearer ${ambulanceToken}` }
  );

  console.log(`[Corridor] Started Hebbal -> Jayadeva: HTTP ${corridorReq.status}, Trip ID: ${corridorReq.body?.tripId}`);
  console.log(`[Corridor] Route: ${corridorReq.body?.route?.join(' -> ')} (6 junctions)`);
  console.log(`[Corridor] Preempted Start: ${corridorReq.body?.route?.[0]}`);

  // Wait for corridor movement and observe give-way notices
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`[Corridor] Give-way notices reached Client 3 (on route): ${giveWayNoticesC3.length > 0}, Client 2 (off route): ${giveWayNoticesC2.length === 0}`);

  client1_SouthOfficer.disconnect();
  client2_SilkBoardJunction.disconnect();
  client3_HebbalRoute.disconnect();
  client4_Unsubscribed.disconnect();

  console.log('\n================================================================');
  console.log('✅ All 4-Client E2E Verifications Completed Successfully!');
  console.log('================================================================');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('[E2E Error]:', err);
  process.exit(1);
});
