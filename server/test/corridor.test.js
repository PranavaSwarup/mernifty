import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  JUNCTION_COORDINATES,
  getShortestRoute,
  getCongestionAwareRoute,
  getIncomingApproachRoad,
} from '../src/data/junctionGraph.js';
import { CorridorTrip } from '../src/models/CorridorTrip.js';
import { corridorService } from '../src/services/corridorService.js';
import { simulatorService } from '../src/services/simulatorService.js';
import { socketService } from '../src/services/socketService.js';

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

test.after(async () => {
  await corridorService.resetAllCorridors();
  await mongoose.disconnect();
  await mongod.stop();
});

test('1. Graph routing: Hebbal to Jayadeva defaults to 6 connected junctions', () => {
  const route = getShortestRoute('JNC-BLR-008', 'JNC-BLR-004');
  assert.ok(Array.isArray(route));
  assert.equal(route.length, 6);
  assert.deepEqual(route, [
    'JNC-BLR-008',
    'JNC-BLR-010',
    'JNC-BLR-012',
    'JNC-BLR-011',
    'JNC-BLR-003',
    'JNC-BLR-004',
  ]);

  const approach = getIncomingApproachRoad('JNC-BLR-008', 'JNC-BLR-010');
  assert.equal(approach, 'Bellary Rd (from north)');
});

test('2. Dynamic bypass: reroutes around jammed Mekhri Circle via Outer Ring Road East', () => {
  const defaultRoute = getShortestRoute('JNC-BLR-008', 'JNC-BLR-004');
  const bypassRoute = getCongestionAwareRoute('JNC-BLR-008', 'JNC-BLR-004', {
    avoidJams: true,
    jammedJunctionIds: ['JNC-BLR-010'],
  });

  assert.ok(Array.isArray(bypassRoute));
  assert.ok(!bypassRoute.includes('JNC-BLR-010'), 'Bypass route must not traverse jammed Mekhri Circle');
  assert.notDeepEqual(bypassRoute, defaultRoute);
  assert.deepEqual(bypassRoute, [
    'JNC-BLR-008',
    'JNC-BLR-006',
    'JNC-BLR-007',
    'JNC-BLR-005',
    'JNC-BLR-001',
    'JNC-BLR-004',
  ]);
});

test('3. CorridorTrip persistence: schema records timestamps, incoming approach roads, and junction clearance', async () => {
  const tripId = `TRIP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = new Date();
  const cleared = new Date(now.getTime() + 15000);

  const doc = await CorridorTrip.create({
    tripId,
    vehicleId: 'AMB-TEST-01',
    startJunctionId: 'JNC-BLR-008',
    destinationJunctionId: 'JNC-BLR-004',
    routeJunctionIds: ['JNC-BLR-008', 'JNC-BLR-010', 'JNC-BLR-004'],
    status: 'completed',
    startTime: now,
    endTime: cleared,
    durationSeconds: 15,
    junctionEvents: [
      {
        junctionId: 'JNC-BLR-008',
        incomingRoad: 'Bellary Rd (from north)',
        preemptedAt: now,
        clearedAt: cleared,
      },
    ],
  });

  assert.ok(doc._id);
  assert.equal(doc.tripId, tripId);
  assert.equal(doc.status, 'completed');
  assert.equal(doc.junctionEvents.length, 1);
  assert.equal(doc.junctionEvents[0].incomingRoad, 'Bellary Rd (from north)');
  assert.ok(doc.junctionEvents[0].clearedAt instanceof Date);

  const fetched = await CorridorTrip.findOne({ tripId }).lean();
  assert.equal(fetched.tripId, tripId);
  assert.equal(fetched.vehicleId, 'AMB-TEST-01');
});

test('4. CorridorService: starts trip, locks preemption wave, and cancels cleanly', async () => {
  const result = await corridorService.startTrip({
    vehicleId: 'AMB-RUN-99',
    startJunctionId: 'JNC-BLR-008',
    destinationJunctionId: 'JNC-BLR-004',
    durationSeconds: 60,
    avoidJams: false,
  });

  assert.ok(result.success);
  assert.equal(result.vehicleId, 'AMB-RUN-99');
  assert.equal(result.startJunctionId, 'JNC-BLR-008');
  assert.equal(result.destinationJunctionId, 'JNC-BLR-004');

  // Verify junction preemption is marked
  assert.ok(corridorService.isJunctionInCorridor('JNC-BLR-008'));

  // Cancel trip
  const cancelled = await corridorService.cancelTrip(result.tripId);
  assert.ok(cancelled);
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(!corridorService.isJunctionInCorridor('JNC-BLR-008'));
});

test('5. Paired Simulator Twin: ambulance corridor scenario sets preemption on live twin without affecting baseline', () => {
  const applyRes = simulatorService.applyScenario('ambulance-corridor', { actor: 'Tester' });
  assert.ok(applyRes.state, 'Scenario must return simulator state');
  assert.equal(applyRes.preset.id, 'ambulance-corridor');

  const state = applyRes.state || simulatorService.getState();
  assert.ok(state.activeEmergencies.length >= 1, 'Live twin must have an active emergency responder');

  const em = state.activeEmergencies[0];
  assert.equal(em.preempt, true, 'Emergency preemption must be active on live twin');
  assert.ok(em.latitude > 12.0 && em.latitude < 14.0, 'Must have valid interpolated latitude');
  assert.ok(em.longitude > 77.0 && em.longitude < 78.0, 'Must have valid interpolated longitude');
  assert.ok(typeof em.speedKmph === 'number');
  assert.ok(typeof em.progressPct === 'number');
});

// A minimal stand-in for a Socket.IO socket: it only records room membership and emits.
function makeFakeSocket() {
  const rooms = new Set();
  return {
    rooms,
    emitted: [],
    join(room) {
      rooms.add(room);
    },
    leave(room) {
      rooms.delete(room);
    },
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
  };
}

test('City viewers join the corridor room, so trip start and end reach the map', () => {
  const socket = makeFakeSocket();
  const joined = socketService._joinAuthorizedRooms(
    socket,
    { city: true, engineering: false, zones: ['south-bangalore'], junctions: [], alerts: [] },
    { replace: true }
  );
  assert.ok(socket.rooms.has('city'));
  assert.ok(socket.rooms.has('corridor'), "a city viewer must be in the 'corridor' room");
  assert.ok(joined.includes('corridor'));
});

test('A socket with no city subscription is not in the corridor room, and leaving city leaves it', () => {
  const socket = makeFakeSocket();
  socketService._joinAuthorizedRooms(
    socket,
    { city: false, engineering: false, zones: [], junctions: ['JNC-BLR-005'], alerts: [] },
    { replace: true }
  );
  assert.equal(socket.rooms.has('corridor'), false);

  socketService._joinAuthorizedRooms(
    socket,
    { city: true, engineering: false, zones: [], junctions: [], alerts: [] },
    { replace: true }
  );
  assert.ok(socket.rooms.has('corridor'));

  socketService._joinAuthorizedRooms(
    socket,
    { city: false, engineering: false, zones: [], junctions: [], alerts: [] },
    { replace: true }
  );
  assert.equal(socket.rooms.has('corridor'), false, 'replacing subscriptions without city must leave corridor');
});
