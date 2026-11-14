import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as ioClient } from '../../client/node_modules/socket.io-client/build/esm/index.js';

import { app, server } from '../src/index.js';
import { User } from '../src/models/User.js';
import { ingestionBuffer } from '../src/services/ingestionBuffer.js';
import { metricsService } from '../src/services/metricsService.js';
import { simulatorService } from '../src/services/simulatorService.js';
import { socketService } from '../src/services/socketService.js';
import { resetRateLimitBuckets } from '../src/middleware/rateLimiter.js';
import { shutdownOtel } from '../src/telemetry/otel.js';

let mongod;
let baseUrl;
let adminToken;
let viewerToken;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.deleteMany({});

  await User.create({
    name: 'Bench Admin',
    email: 'bench-admin@hyperpulse.test',
    password: crypto.randomBytes(12).toString('hex'),
    role: 'admin',
    zones: ['south-bangalore', 'east-bangalore', 'north-bangalore', 'central-bangalore'],
  });

  const viewerPw = crypto.randomBytes(12).toString('hex');
  await User.create({
    name: 'Bench Viewer',
    email: 'bench-viewer@hyperpulse.test',
    password: viewerPw,
    role: 'viewer',
    zones: [],
  });

  if (!socketService.io) {
    socketService.init(server);
  }
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Generate JWT tokens via /api/auth/register + direct admin sign or login
  const regRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bench-viewer@hyperpulse.test', password: viewerPw }),
  });
  const regJson = await regRes.json();
  viewerToken = regJson.token;

  const adminUser = await User.findOne({ email: 'bench-admin@hyperpulse.test' });
  const adminPw = 'BenchAdminPass!123';
  adminUser.password = adminPw;
  await adminUser.save();

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bench-admin@hyperpulse.test', password: adminPw }),
  });
  const loginJson = await loginRes.json();
  adminToken = loginJson.token;
});

test.after(async () => {
  simulatorService.stop();
  ingestionBuffer.shutdown();
  metricsService.shutdown();
  socketService.shutdown();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  await shutdownOtel();
});

test('1. /api/observability/metrics exposes process memoryUsage and cpuUsageMicros', async () => {
  const res = await fetch(`${baseUrl}/api/observability/metrics`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.process?.memoryUsage?.rssMb > 0, 'Expected rssMb > 0');
  assert.equal(typeof body.process?.cpuUsageMicros?.user, 'number');
  assert.equal(typeof body.process?.eventLoopLagMs, 'number');
});

test('2. GET /api/benchmarks lists result files cleanly', async () => {
  const res = await fetch(`${baseUrl}/api/benchmarks`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.runs));
  assert.equal(body.activeLiveProbe, false);
});

test('3. POST /api/benchmarks/live enforces admin RBAC, rejects concurrency, and streams to engineering room only', async () => {
  resetRateLimitBuckets();
  const unauth = await fetch(`${baseUrl}/api/benchmarks/live`, { method: 'POST' });
  assert.equal(unauth.status, 401);

  const nonAdmin = await fetch(`${baseUrl}/api/benchmarks/live`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert.equal(nonAdmin.status, 403);

  const engSock = ioClient(baseUrl, { transports: ['websocket'] });
  const citySock = ioClient(baseUrl, { transports: ['websocket'] });
  await Promise.all([
    new Promise((r) => engSock.on('connect', r)),
    new Promise((r) => citySock.on('connect', r)),
  ]);

  engSock.emit('subscribe', { city: false, engineering: true, zones: [], junctions: [], alerts: [] });
  citySock.emit('subscribe', { city: true, engineering: false, zones: [], junctions: [], alerts: [] });

  const engEvents = [];
  const cityEvents = [];
  engSock.on('bench:progress', (p) => engEvents.push(p));
  citySock.on('bench:progress', (p) => cityEvents.push(p));

  await new Promise((r) => setTimeout(r, 150));

  const firstProbePromise = fetch(`${baseUrl}/api/benchmarks/live`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ durationSec: 2, clients: 6 }),
  });

  // Wait slightly so firstProbe acquires activeLiveProbe lock
  await new Promise((r) => setTimeout(r, 250));
  const concurrentRes = await fetch(`${baseUrl}/api/benchmarks/live`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ durationSec: 2, clients: 6 }),
  });
  assert.equal(concurrentRes.status, 409);

  const firstRes = await firstProbePromise;
  assert.equal(firstRes.status, 200);
  const firstJson = await firstRes.json();
  assert.equal(firstJson.success, true);
  assert.equal(firstJson.result.status, 'completed');
  assert.ok(firstJson.result.acceptedEvents > 0, 'Expected acceptedEvents > 0');

  assert.ok(engEvents.length >= 2, 'Expected engineering room to receive bench:progress updates');
  assert.equal(engEvents[engEvents.length - 1].status, 'completed');
  assert.equal(cityEvents.length, 0, 'City room must NOT receive engineering bench:progress events');

  engSock.disconnect();
  citySock.disconnect();
});
