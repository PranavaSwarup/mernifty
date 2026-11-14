import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/config.js';
import { metricsService } from './metricsService.js';
import { anomalyEngine } from './anomalyEngine.js';
import { JUNCTION_CATALOGUE } from '../middleware/validator.js';
import { Telemetry } from '../models/Telemetry.js';
import {
  DEFAULT_WIRE_SCHEMA,
  encodeZoneBatch,
  encodeJunctionBatch,
  measureWireSavings,
  utf8ByteLength,
} from '../../../client/src/shared/wire.js';
import {
  INGESTED_AT_SYM,
  recordClientE2e,
  recordIngestToEmit,
  recordSocketFrameBytes,
  setGaugeProviders,
  withSyncSpan,
} from '../telemetry/instruments.js';
import { getRecentTraces } from '../telemetry/otel.js';

const ALL_ZONES = [
  'south-bangalore',
  'east-bangalore',
  'north-bangalore',
  'central-bangalore',
];

const RING_CAPACITY = 600;
const MAX_REPLAY_PER_JUNCTION = 1200;
const DEFAULT_BACKPRESSURE_BYTES = 65536; // 64 KB
const DEFAULT_WRITE_BUFFER_PACKETS = 32;

/**
 * Socket.IO Real-Time Selective Delivery Service (Wire Protocol v1)
 *
 * Rooms (NO global raw firehose):
 *  - `city`           : 1 Hz aggregated network KPIs (`metrics:snapshot`) & counterfactual (`cf:update`)
 *  - `zone:<zoneId>`  : Compact Wire v1 per-junction summary tuples (`telemetry:zone`)
 *  - `junction:<id>`  : Full Wire v1 per-approach frame tuples + signal state (`telemetry:junction`)
 *  - `alerts:<zoneId>` / `alerts:all` : Real-time alerts partitioned by zone
 *  - `engineering`    : Wire/backpressure observability snapshots (`metrics:snapshot`)
 *
 * Security, Backpressure & Gap-Free Resume:
 *  - Handshake authenticates optional JWT (`viewer` anonymous fallback when absent, 401/error when invalid).
 *  - Operators (`role === 'operator'`) restricted to `user.zones` on all rooms, alerts, and resume targets.
 *  - Viewers/anonymous clients cannot emit control/mutation events (`FORBIDDEN_CONTROL`).
 *  - Per-socket backpressure checks transport `bufferedAmount` / `writeBuffer` before emitting,
 *    coalescing per-junction latest state and emitting volatile frames when congested.
 *  - `resume { subscriptions, cursors }` eliminates replay-vs-live race via `pendingLive` queue,
 *    600-frame in-memory ring buffer + MongoDB fallback (`seq > cursor`).
 */
class SocketService {
  constructor() {
    this.io = null;
    this.wireSchema = DEFAULT_WIRE_SCHEMA;

    this.broadcastQueue = [];
    this.deviceBroadcastQueues = new Map();
    this.broadcastIntervalMs = 80;

    // In-memory circular ring per junction (last 600 frames ascending by sequence)
    this.junctionRings = new Map();
    // Sockets currently executing async `resume` (collecting pendingLive frames)
    this.resumingSockets = new Set();

    // Configurable thresholds & injectable Telemetry model (supports unit tests without live server)
    this.backpressureBytesThreshold = DEFAULT_BACKPRESSURE_BYTES;
    this.writeBufferThreshold = DEFAULT_WRITE_BUFFER_PACKETS;
    this._telemetryModel = Telemetry;
    this._loggedWireSample = false;

    anomalyEngine.setBroadcastCallback((alert) => {
      this.broadcastAlert(alert);
    });

    this.flushTimer = setInterval(() => {
      this.flushBroadcasts();
    }, this.broadcastIntervalMs);
    if (this.flushTimer.unref) this.flushTimer.unref();

    this._emittingMetrics = false;
    this.metricTimer = setInterval(async () => {
      if (!this.io || this._emittingMetrics) return;
      this._emittingMetrics = true;
      try {
        const engIds = new Set(this._getRoomSocketIds('engineering'));
        if (engIds.size > 0) {
          const fullSnapshot = await metricsService.getSnapshotAsync();
          this._emitToRoomRaw('engineering', 'metrics:snapshot', fullSnapshot);
          this._emitToRoomRaw('engineering', 'obs:update', {
            metrics: fullSnapshot,
            recentTraces: getRecentTraces(15).traces,
            timestamp: fullSnapshot.timestamp,
          });
        }
        this._emitToRoomExcluding('city', engIds, 'metrics:snapshot', metricsService.getCitySnapshot());
      } finally {
        this._emittingMetrics = false;
      }
    }, 1000);
    if (this.metricTimer.unref) this.metricTimer.unref();
  }

  _canAccessZone(user, zoneId) {
    if (!zoneId) return true;
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'viewer') return true;
    if (user.role === 'operator') {
      return Array.isArray(user.zones) && user.zones.includes(zoneId);
    }
    return false;
  }

  _canAccessAllAlerts(user) {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'viewer';
  }

  _resolveZoneForJunction(junctionId) {
    return JUNCTION_CATALOGUE.get(junctionId) || this.wireSchema.zoneByJunction?.[junctionId] || null;
  }

  _getSocketById(socketId) {
    return this.io?.sockets?.sockets?.get?.(socketId) || null;
  }

  _getRoomSocketIds(roomName) {
    const adapter = this.io?.sockets?.adapter;
    if (!adapter?.rooms) return [];
    const set = adapter.rooms.get(roomName);
    return set ? Array.from(set) : [];
  }

  _getSocketBufferedBytes(socket) {
    if (typeof socket._simulatedBufferedBytes === 'number') {
      return socket._simulatedBufferedBytes;
    }
    const transport = socket.conn?.transport;
    const rawWs = transport?.socket || transport?.websocket;
    const wsBuffered = rawWs?.bufferedAmount ?? rawWs?._socket?.bufferedAmount ?? 0;
    const netWritableLen = rawWs?._socket?.writableLength ?? 0;
    const writeBuf = socket.conn?.writeBuffer;
    const writeBufCount = Array.isArray(writeBuf) ? writeBuf.length : 0;
    const writeBufBytes = Array.isArray(writeBuf)
      ? writeBuf.reduce((sum, pkt) => sum + (pkt?.data?.length || 128), 0)
      : 0;
    const transportWritable = transport && transport.writable === false ? 1 : 0;
    return {
      bytes: Math.max(wsBuffered, netWritableLen, writeBufBytes),
      writeBufCount,
      unwritable: Boolean(transportWritable),
    };
  }

  _isSocketCongested(socket) {
    const info = this._getSocketBufferedBytes(socket);
    if (typeof info === 'number') {
      return info > this.backpressureBytesThreshold;
    }
    return (
      info.unwritable ||
      info.bytes > this.backpressureBytesThreshold ||
      info.writeBufCount > this.writeBufferThreshold
    );
  }

  _emitWithByteAccounting(socket, roomName, eventName, payload, frameCount = 1, serializedBytes = null) {
    const bytes =
      serializedBytes !== null
        ? serializedBytes
        : utf8ByteLength(JSON.stringify([eventName, payload]));
    socket.emit(eventName, payload);
    metricsService.recordSocketBytes(roomName, bytes, frameCount);
  }

  _emitToRoomRaw(roomName, eventName, payload, frameCount = 0) {
    return this._emitToRoomExcluding(roomName, null, eventName, payload, frameCount);
  }

  _emitToRoomExcluding(roomName, excludedSocketIds, eventName, payload, frameCount = 0) {
    if (!this.io) return 0;
    const socketIds = this._getRoomSocketIds(roomName);
    if (socketIds.length === 0) return 0;
    const bytes = utf8ByteLength(JSON.stringify([eventName, payload]));

    let delivered = 0;
    for (const sid of socketIds) {
      if (excludedSocketIds && excludedSocketIds.has(sid)) continue;
      const sock = this._getSocketById(sid);
      if (!sock || sock.data?.resuming) continue;
      if (this._isSocketCongested(sock)) {
        if (sock.volatile) {
          sock.volatile.emit(eventName, payload);
        }
        metricsService.recordSocketBackpressure({ dropped: 1 });
        continue;
      }
      sock.emit(eventName, payload);
      delivered += 1;
    }

    if (delivered > 0) {
      metricsService.recordSocketBytes(roomName, bytes * delivered, delivered * frameCount);
      recordSocketFrameBytes(roomName, bytes);
    }
    return delivered;
  }

  _emitToRoomsUnique(roomNames, eventName, payload, frameCount = 0) {
    if (!this.io) return 0;
    const bytes = utf8ByteLength(JSON.stringify([eventName, payload]));
    const deliveredSids = new Set();
    let totalDelivered = 0;

    for (const roomName of roomNames) {
      const socketIds = this._getRoomSocketIds(roomName);
      if (socketIds.length === 0) continue;

      let roomDelivered = 0;
      for (const sid of socketIds) {
        if (deliveredSids.has(sid)) continue;
        const sock = this._getSocketById(sid);
        if (!sock || sock.data?.resuming) continue;
        deliveredSids.add(sid);
        if (this._isSocketCongested(sock)) {
          if (sock.volatile) {
            sock.volatile.emit(eventName, payload);
          }
          metricsService.recordSocketBackpressure({ dropped: 1 });
          continue;
        }
        sock.emit(eventName, payload);
        roomDelivered += 1;
        totalDelivered += 1;
      }

      if (roomDelivered > 0) {
        metricsService.recordSocketBytes(
          roomName,
          bytes * roomDelivered,
          roomDelivered * frameCount
        );
      }
    }
    return totalDelivered;
  }

  _queueCoalescedForSocket(socket, kind, events, zoneOrJunction) {
    if (!socket.data.coalescedFrames) {
      socket.data.coalescedFrames = { zone: new Map(), junction: new Map() };
      socket.data.coalescedStats = { coalesced: 0, dropped: 0 };
    }
    const targetMap = socket.data.coalescedFrames[kind];
    let coalescedHere = 0;
    for (const evt of events) {
      const jId = evt.junctionId || evt.deviceId;
      if (targetMap.has(jId)) {
        coalescedHere += 1;
      }
      targetMap.set(jId, { evt, key: zoneOrJunction });
    }
    if (coalescedHere > 0) {
      socket.data.coalescedStats.coalesced += coalescedHere;
      metricsService.recordSocketBackpressure({ coalesced: coalescedHere });
    }

    // Only attempt volatile emit if transport isn't already backing up writeBuffer
    const writeBufCount = Array.isArray(socket.conn?.writeBuffer)
      ? socket.conn.writeBuffer.length
      : 0;
    if (socket.volatile && writeBufCount === 0 && socket.conn?.transport?.writable !== false) {
      const latestList = events.length > 0 ? [events[events.length - 1]] : [];
      if (latestList.length > 0) {
        if (kind === 'zone') {
          const pkt = encodeZoneBatch(latestList, this.wireSchema, zoneOrJunction);
          socket.volatile.emit('telemetry:zone', pkt);
        } else {
          const pkt = encodeJunctionBatch(latestList, this.wireSchema, zoneOrJunction);
          socket.volatile.emit('telemetry:junction', pkt);
        }
      }
    } else {
      socket.data.coalescedStats.dropped += events.length;
      metricsService.recordSocketBackpressure({ dropped: events.length });
    }
  }

  _flushSocketCoalesced(socket) {
    const cf = socket.data?.coalescedFrames;
    if (!cf) return;

    if (cf.zone.size > 0) {
      const byZone = new Map();
      for (const { evt, key } of cf.zone.values()) {
        if (!byZone.has(key)) byZone.set(key, []);
        byZone.get(key).push(evt);
      }
      cf.zone.clear();
      for (const [zId, evts] of byZone.entries()) {
        const pkt = encodeZoneBatch(evts, this.wireSchema, zId);
        this._emitWithByteAccounting(socket, `zone:${zId}`, 'telemetry:zone', pkt, evts.length);
      }
    }

    if (cf.junction.size > 0) {
      const items = Array.from(cf.junction.values());
      cf.junction.clear();
      for (const { evt, key } of items) {
        const pkt = encodeJunctionBatch([evt], this.wireSchema, key);
        this._emitWithByteAccounting(socket, `junction:${key}`, 'telemetry:junction', pkt, 1);
      }
    }
  }

  _emitWireRoom(roomName, eventName, packet, sourceEvents, kind, zoneOrJunction) {
    if (!this.io) return { deliveredSockets: 0, totalBytes: 0, framesDelivered: 0 };
    const socketIds = this._getRoomSocketIds(roomName);
    if (socketIds.length === 0) return { deliveredSockets: 0, totalBytes: 0, framesDelivered: 0 };

    const wirePacket = packet && typeof packet === 'object' ? { ...packet, et: Date.now() } : packet;
    const frameBytes = utf8ByteLength(JSON.stringify([eventName, wirePacket]));
    let deliveredSockets = 0;

    for (const sid of socketIds) {
      const sock = this._getSocketById(sid);
      if (!sock || sock.data?.resuming) continue;

      if (this._isSocketCongested(sock)) {
        this._queueCoalescedForSocket(sock, kind, sourceEvents, zoneOrJunction);
        continue;
      }

      if (
        sock.data?.coalescedFrames &&
        (sock.data.coalescedFrames.zone.size > 0 || sock.data.coalescedFrames.junction.size > 0)
      ) {
        this._flushSocketCoalesced(sock);
      }

      sock.emit(eventName, wirePacket);
      deliveredSockets += 1;
    }

    if (deliveredSockets > 0) {
      const totalBytes = frameBytes * deliveredSockets;
      const framesDelivered = deliveredSockets * sourceEvents.length;
      metricsService.recordSocketBytes(roomName, totalBytes, framesDelivered);
      recordSocketFrameBytes(roomName, frameBytes);
      return { deliveredSockets, totalBytes, framesDelivered };
    }
    return { deliveredSockets: 0, totalBytes: 0, framesDelivered: 0 };
  }

  init(httpServer, clientUrl) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingInterval: 10000,
      pingTimeout: 5000,
    });
    setGaugeProviders({ getSocketsConnected: () => this.io?.engine?.clientsCount || 0 });

    // Authenticate Socket.IO handshake via JWT (anonymous defaults cleanly to viewer)
    this.io.use((socket, next) => {
      try {
        const authToken =
          socket.handshake.auth?.token ||
          (typeof socket.handshake.headers?.authorization === 'string' &&
          socket.handshake.headers.authorization.startsWith('Bearer ')
            ? socket.handshake.headers.authorization.slice(7).trim()
            : null);

        if (!authToken) {
          socket.data.user = {
            id: 'anonymous-viewer',
            role: 'viewer',
            zones: [],
            anonymous: true,
          };
          return next();
        }

        const decoded = jwt.verify(authToken, config.jwtSecret);
        socket.data.user = {
          id: String(decoded.id || 'user'),
          role: decoded.role || 'viewer',
          zones: Array.isArray(decoded.zones) ? decoded.zones : [],
          name: decoded.name || 'Authenticated User',
          anonymous: false,
        };
        return next();
      } catch {
        return next(new Error('Unauthorized: invalid or expired Socket.IO JWT token'));
      }
    });

    this.io.on('connection', (socket) => this.attachSocketHandlers(socket));
  }

  attachSocketHandlers(socket) {
    const user = socket.data.user || { role: 'viewer', zones: [], anonymous: true };
    socket.data.resuming = false;
    socket.data.pendingLive = null;
    socket.data.targetSubscriptions = { city: false, zones: [], junctions: [], alerts: [], engineering: false };

    if (this.io?.engine) {
      metricsService.setConnectedSockets(this.io.engine.clientsCount);
    }

    // Send canonical Wire v1 dictionary once on connect (no raw firehose joined by default)
    this._emitWithByteAccounting(socket, 'handshake', 'wire:schema', this.wireSchema, 0);

    // Reject control/mutation events sent over Socket.IO by non-operator/viewer clients
    const allowedClientEvents = new Set([
      'subscribe',
      'unsubscribe',
      'resume',
      'subscribe:city',
      'unsubscribe:city',
      'subscribe:engineering',
      'unsubscribe:engineering',
      'subscribe:zone',
      'unsubscribe:zone',
      'subscribe:category',
      'unsubscribe:category',
      'subscribe:junction',
      'unsubscribe:junction',
      'subscribe:device',
      'unsubscribe:device',
      'subscribe:alerts',
      'telemetry:ping',
      'client:latency',
    ]);
    socket.onAny?.((eventName) => {
      if (!allowedClientEvents.has(eventName) && (user.role === 'viewer' || user.anonymous)) {
        socket.emit('error', {
          code: 'FORBIDDEN_CONTROL',
          message: `Viewers cannot emit control event '${eventName}'`,
        });
      }
    });

    socket.on('subscribe', (req = {}) => {
      this._applySubscriptions(socket, req);
    });

    socket.on('unsubscribe', (req = {}) => {
      const { zones = [], junctions = [], city = false, engineering = false, alerts = [] } = req || {};
      if (city) socket.leave('city');
      if (engineering) socket.leave('engineering');
      for (const z of zones) socket.leave(`zone:${z}`);
      for (const j of junctions) socket.leave(`junction:${j}`);
      for (const a of alerts) socket.leave(a === 'all' ? 'alerts:all' : `alerts:${a}`);
    });

    socket.on('resume', (req = {}) => {
      this.handleResume(socket, req).catch((err) => {
        socket.data.resuming = false;
        socket.data.pendingLive = null;
        this.resumingSockets.delete(socket);
        socket.emit('error', { code: 'RESUME_FAILED', message: err.message });
      });
    });

    // Legacy single-room events retained for compatibility and server-side zone auth
    socket.on('subscribe:city', () => {
      socket.join('city');
      socket.emit('subscribed', { room: 'city' });
    });

    socket.on('unsubscribe:city', () => {
      socket.leave('city');
    });

    socket.on('subscribe:engineering', () => {
      socket.join('engineering');
      socket.emit('subscribed', { room: 'engineering' });
    });

    socket.on('unsubscribe:engineering', () => {
      socket.leave('engineering');
    });

    socket.on('subscribe:zone', (zoneId) => {
      if (!zoneId) return;
      if (!this._canAccessZone(user, zoneId)) {
        return socket.emit('error', {
          code: 'FORBIDDEN_ZONE',
          message: `Operator role cannot subscribe to out-of-scope zone '${zoneId}'`,
        });
      }
      socket.join(`zone:${zoneId}`);
      socket.join(`alerts:${zoneId}`);
      socket.emit('subscribed', { room: `zone:${zoneId}` });
    });

    socket.on('unsubscribe:zone', (zoneId) => {
      if (zoneId) socket.leave(`zone:${zoneId}`);
    });

    socket.on('subscribe:category', (category) => {
      if (!category) return;
      if (!this._canAccessZone(user, category)) {
        return socket.emit('error', {
          code: 'FORBIDDEN_ZONE',
          message: `Operator role cannot subscribe to out-of-scope zone '${category}'`,
        });
      }
      socket.join(`zone:${category}`);
      socket.emit('subscribed', { room: `zone:${category}` });
    });

    socket.on('unsubscribe:category', (category) => {
      if (category) socket.leave(`zone:${category}`);
    });

    socket.on('subscribe:junction', (junctionId) => {
      if (!junctionId) return;
      const jZone = this._resolveZoneForJunction(junctionId);
      if (jZone && !this._canAccessZone(user, jZone)) {
        return socket.emit('error', {
          code: 'FORBIDDEN_ZONE',
          message: `Operator role cannot subscribe to out-of-scope junction '${junctionId}' (${jZone})`,
        });
      }
      socket.join(`junction:${junctionId}`);
      socket.emit('subscribed', { room: `junction:${junctionId}` });
    });

    socket.on('unsubscribe:junction', (junctionId) => {
      if (junctionId) socket.leave(`junction:${junctionId}`);
    });

    socket.on('subscribe:device', (deviceId) => {
      if (!deviceId) return;
      const jZone = this._resolveZoneForJunction(deviceId);
      if (jZone && !this._canAccessZone(user, jZone)) {
        return socket.emit('error', {
          code: 'FORBIDDEN_ZONE',
          message: `Operator role cannot subscribe to out-of-scope junction '${deviceId}' (${jZone})`,
        });
      }
      socket.join(`junction:${deviceId}`);
      socket.emit('subscribed', { room: `junction:${deviceId}` });
    });

    socket.on('unsubscribe:device', (deviceId) => {
      if (deviceId) socket.leave(`junction:${deviceId}`);
    });

    socket.on('subscribe:alerts', (target) => {
      if (target === 'all' || !target) {
        if (!this._canAccessAllAlerts(user)) {
          return socket.emit('error', {
            code: 'FORBIDDEN_ZONE',
            message: 'Operator cannot subscribe to alerts:all across unassigned zones',
          });
        }
        socket.join('alerts:all');
        return socket.emit('subscribed', { room: 'alerts:all' });
      }
      if (!this._canAccessZone(user, target)) {
        return socket.emit('error', {
          code: 'FORBIDDEN_ZONE',
          message: `Operator role cannot subscribe to alerts for '${target}'`,
        });
      }
      socket.join(`alerts:${target}`);
      socket.emit('subscribed', { room: `alerts:${target}` });
    });

    socket.on('telemetry:ping', (clientTimestamp) => {
      const serverRecvTimestamp = Date.now();
      socket.emit('telemetry:pong', {
        clientTimestamp,
        serverTimestamp: serverRecvTimestamp,
        serverRecvTimestamp,
        serverSendTimestamp: Date.now(),
      });
    });

    socket.on('client:latency', (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const room = typeof payload.room === 'string' && payload.room ? payload.room : 'city';
      const samples = Array.isArray(payload.samplesMs) ? payload.samplesMs : [];
      for (const ms of samples.slice(0, 50)) {
        if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms < 60000) {
          recordClientE2e(room, ms);
        }
      }
      if (samples.length === 0 && typeof payload.p50 === 'number' && Number.isFinite(payload.p50) && payload.p50 >= 0) {
        recordClientE2e(room, payload.p50);
      }
    });

    socket.on('disconnect', () => {
      this.resumingSockets.delete(socket);
      socket.data.resuming = false;
      socket.data.pendingLive = null;
      if (this.io?.engine) {
        metricsService.setConnectedSockets(this.io.engine.clientsCount);
      }
    });
  }

  _filterAuthorizedSubscriptions(socket, req = {}) {
    const user = socket.data?.user || { role: 'viewer', zones: [], anonymous: true };
    const allowedZones = [];
    const allowedJunctions = [];
    const allowedAlerts = [];
    const denied = [];

    const requestedZones = Array.isArray(req.zones) ? req.zones : [];
    for (const z of requestedZones) {
      if (z === 'all') {
        if (this._canAccessAllAlerts(user)) {
          for (const az of ALL_ZONES) allowedZones.push(az);
        } else {
          for (const az of user.zones || []) allowedZones.push(az);
        }
        continue;
      }
      if (this._canAccessZone(user, z)) {
        allowedZones.push(z);
      } else {
        denied.push(z);
      }
    }

    const requestedJunctions = Array.isArray(req.junctions) ? req.junctions : [];
    for (const jId of requestedJunctions) {
      const z = this._resolveZoneForJunction(jId);
      if (z && !this._canAccessZone(user, z)) {
        denied.push(jId);
      } else {
        allowedJunctions.push(jId);
      }
    }

    const requestedAlerts = Array.isArray(req.alerts) ? req.alerts : [];
    for (const a of requestedAlerts) {
      if (a === 'all') {
        if (this._canAccessAllAlerts(user)) {
          allowedAlerts.push('alerts:all');
        } else {
          for (const uz of user.zones || []) allowedAlerts.push(`alerts:${uz}`);
        }
      } else if (this._canAccessZone(user, a)) {
        allowedAlerts.push(`alerts:${a}`);
      } else {
        denied.push(`alerts:${a}`);
      }
    }

    return {
      city: Boolean(req.city),
      engineering: Boolean(req.engineering),
      zones: [...new Set(allowedZones)],
      junctions: [...new Set(allowedJunctions)],
      alerts: [...new Set(allowedAlerts)],
      denied,
    };
  }

  _joinAuthorizedRooms(socket, subs, { replace = true } = {}) {
    if (replace) {
      for (const room of Array.from(socket.rooms || [])) {
        if (
          room === 'city' ||
          room === 'engineering' ||
          room === 'alerts:all' ||
          room.startsWith('zone:') ||
          room.startsWith('junction:') ||
          room.startsWith('alerts:')
        ) {
          socket.leave(room);
        }
      }
    }

    const joined = [];
    if (subs.city) {
      socket.join('city');
      joined.push('city');
    }
    if (subs.engineering) {
      socket.join('engineering');
      joined.push('engineering');
    }
    for (const z of subs.zones) {
      socket.join(`zone:${z}`);
      joined.push(`zone:${z}`);
    }
    for (const j of subs.junctions) {
      socket.join(`junction:${j}`);
      joined.push(`junction:${j}`);
    }
    for (const aRoom of subs.alerts) {
      socket.join(aRoom);
      joined.push(aRoom);
    }

    // Flush immediate snapshot when joining city or engineering so view populates without 1s delay
    if (subs.engineering) {
      socket.emit('metrics:snapshot', metricsService.getSnapshot());
    } else if (subs.city) {
      socket.emit('metrics:snapshot', metricsService.getCitySnapshot());
    }

    return joined;
  }

  _applySubscriptions(socket, req = {}) {
    const authSubs = this._filterAuthorizedSubscriptions(socket, req);
    if (authSubs.denied.length > 0) {
      socket.emit('error', {
        code: 'FORBIDDEN_ZONE',
        message: `Operator cannot subscribe to out-of-scope targets: ${authSubs.denied.join(', ')}`,
      });
    }

    socket.data.targetSubscriptions = authSubs;
    const joined = this._joinAuthorizedRooms(socket, authSubs, { replace: req.replace !== false });
    socket.emit('subscribed', { rooms: joined, subscriptions: authSubs });
    return joined;
  }

  _socketMatchesEvent(subs, event) {
    if (!subs) return false;
    const jId = event.junctionId || event.deviceId;
    const zId = event.zoneId || event.category;
    return Boolean(subs.junctions?.includes(jId) || subs.zones?.includes(zId));
  }

  _pushToRing(event) {
    const jId = event.junctionId || event.deviceId;
    if (!jId) return;
    let ring = this.junctionRings.get(jId);
    if (!ring) {
      ring = [];
      this.junctionRings.set(jId, ring);
    }
    ring.push(event);
    if (ring.length > RING_CAPACITY) {
      ring.shift();
    }
  }

  _normalizeReplayEvent(doc) {
    const jId = doc.junctionId || doc.deviceId;
    return {
      eventId: doc.eventId || `${jId}:${doc.sequence ?? 0}`,
      junctionId: jId,
      deviceId: jId,
      junctionName: doc.junctionName || doc.deviceName || jId,
      zoneId: doc.zoneId || doc.category || this.wireSchema.zoneByJunction?.[jId] || '',
      category: doc.category || doc.zoneId || this.wireSchema.zoneByJunction?.[jId] || '',
      timestamp:
        doc.timestamp instanceof Date ? doc.timestamp.toISOString() : String(doc.timestamp || ''),
      sequence: Number(doc.sequence) || 0,
      status: doc.status || 'healthy',
      metrics: doc.metrics || {},
      data: doc.data || {},
      location: doc.location || this.wireSchema.locationByJunction?.[jId] || null,
    };
  }

  async handleResume(socket, req = {}) {
    const { subscriptions = {}, cursors = {} } = req || {};
    const authSubs = this._filterAuthorizedSubscriptions(socket, subscriptions);

    if (authSubs.denied.length > 0) {
      socket.emit('error', {
        code: 'FORBIDDEN_ZONE',
        message: `Operator cannot resume out-of-scope targets: ${authSubs.denied.join(', ')}`,
      });
    }

    // Enter RESUMING mode BEFORE leaving rooms/querying DB so concurrent live frames buffer safely
    socket.data.resuming = true;
    socket.data.pendingLive = [];
    socket.data.targetSubscriptions = authSubs;
    this.resumingSockets.add(socket);

    // Ensure socket is not in live rooms while replaying (prevents live arriving ahead of replay)
    this._joinAuthorizedRooms(socket, { city: false, zones: [], junctions: [], alerts: [], engineering: false }, { replace: true });

    const targetJunctionSet = new Set(authSubs.junctions);
    for (const z of authSubs.zones) {
      for (const jId of this.wireSchema.junctionIds) {
        if (this.wireSchema.zoneByJunction[jId] === z) {
          targetJunctionSet.add(jId);
        }
      }
    }

    const candidatesByKey = new Map();
    let clipped = false;

    for (const jId of targetJunctionSet) {
      const clientSeq = Number(cursors?.[jId]) || 0;
      const ring = this.junctionRings.get(jId) || [];
      const ringMinSeq = ring.length > 0 ? Number(ring[0].sequence) || 0 : Infinity;

      const needsDbFallback =
        ring.length === 0 || (clientSeq >= 0 && ringMinSeq > clientSeq + 1);

      if (
        needsDbFallback &&
        this._telemetryModel &&
        (mongoose.connection?.readyState === 1 || typeof this._telemetryModel.find === 'function')
      ) {
        try {
          if (mongoose.connection?.readyState === 1 || this._telemetryModel !== Telemetry) {
            const seqFilter = { $gt: clientSeq };
            if (Number.isFinite(ringMinSeq)) {
              seqFilter.$lt = ringMinSeq;
            }
            const dbDocs = await this._telemetryModel
              .find({ junctionId: jId, sequence: seqFilter })
              .sort({ sequence: 1 })
              .limit(MAX_REPLAY_PER_JUNCTION + 1)
              .lean();

            if (Array.isArray(dbDocs)) {
              if (dbDocs.length > MAX_REPLAY_PER_JUNCTION) {
                clipped = true;
              }
              for (const doc of dbDocs.slice(0, MAX_REPLAY_PER_JUNCTION)) {
                const norm = this._normalizeReplayEvent(doc);
                if (norm.sequence > clientSeq) {
                  const key = `${norm.junctionId || jId}:${norm.sequence}`;
                  if (!candidatesByKey.has(key)) {
                    candidatesByKey.set(key, { source: 'db', event: norm });
                  }
                }
              }
            }
          }
        } catch (dbErr) {
          console.warn('[SocketResume] Mongo fallback notice:', dbErr.message);
        }
      }

      for (const memEvt of ring) {
        const seq = Number(memEvt.sequence) || 0;
        if (seq > clientSeq) {
          const key = `${jId}:${seq}`;
          if (!candidatesByKey.has(key)) {
            candidatesByKey.set(key, { source: 'memory', event: this._normalizeReplayEvent(memEvt) });
          }
        }
      }
    }

    // Drain all live frames that arrived during async DB/ring replay window
    const pending = Array.isArray(socket.data.pendingLive) ? socket.data.pendingLive : [];
    for (const liveEvt of pending) {
      const jId = liveEvt.junctionId || liveEvt.deviceId;
      if (!targetJunctionSet.has(jId)) continue;
      const clientSeq = Number(cursors?.[jId]) || 0;
      const seq = Number(liveEvt.sequence) || 0;
      if (seq > clientSeq) {
        const key = `${jId}:${seq}`;
        if (!candidatesByKey.has(key)) {
          candidatesByKey.set(key, { source: 'memory', event: this._normalizeReplayEvent(liveEvt) });
        }
      }
    }

    const sortedEntries = Array.from(candidatesByKey.values()).sort((a, b) => {
      if (a.event.sequence !== b.event.sequence) return a.event.sequence - b.event.sequence;
      return String(a.event.junctionId).localeCompare(String(b.event.junctionId));
    });

    const cappedEntries =
      sortedEntries.length > MAX_REPLAY_PER_JUNCTION
        ? ((clipped = true), sortedEntries.slice(-MAX_REPLAY_PER_JUNCTION))
        : sortedEntries;

    let fromMemory = 0;
    let fromDb = 0;
    const events = [];
    for (const entry of cappedEntries) {
      if (entry.source === 'db') fromDb += 1;
      else fromMemory += 1;
      events.push(entry.event);
    }

    const replayPayload = {
      events,
      replayed: events.length,
      fromMemory,
      fromDb,
      clipped,
    };

    this._emitWithByteAccounting(socket, 'resume', 'replay', replayPayload, events.length);

    // Clear RESUMING state and atomically join authorized live rooms
    this.resumingSockets.delete(socket);
    socket.data.resuming = false;
    socket.data.pendingLive = null;

    const joined = this._joinAuthorizedRooms(socket, authSubs, { replace: true });
    socket.emit('subscribed', { rooms: joined, subscriptions: authSubs, resumed: true });

    return replayPayload;
  }

  broadcastTelemetry(event) {
    if (!event) return;
    this._pushToRing(event);

    // Capture concurrent live frames for any socket currently running async `resume`
    if (this.resumingSockets.size > 0) {
      for (const sock of this.resumingSockets) {
        if (sock.data?.resuming && Array.isArray(sock.data.pendingLive)) {
          if (this._socketMatchesEvent(sock.data.targetSubscriptions, event)) {
            sock.data.pendingLive.push(event);
          }
        }
      }
    }

    if (!this.io) return;

    const juncId = event.junctionId || event.deviceId;
    this.broadcastQueue.push(event);

    if (!this.deviceBroadcastQueues.has(juncId)) {
      this.deviceBroadcastQueues.set(juncId, []);
    }
    this.deviceBroadcastQueues.get(juncId).push(event);
  }

  flushBroadcasts() {
    if (!this.io || this.broadcastQueue.length === 0) return;

    withSyncSpan('socket.flush', {}, (span) => {
      const batch = this.broadcastQueue.splice(0, this.broadcastQueue.length);

      // Track JSON-full vs Wire-v1 byte efficiency metrics & log sample once
      const wireStats = measureWireSavings(batch, this.wireSchema);
      metricsService.setWireComparison(wireStats);
      if (!this._loggedWireSample && wireStats.count >= 4) {
        this._loggedWireSample = true;
        console.log(
          `[Wire v1] Avg bytes/event: fullJSON=${wireStats.fullBytesPerEvent}B vs compactZone=${wireStats.zoneWireBytesPerEvent}B (${wireStats.zoneSavingsPct}% smaller) | compactJunction=${wireStats.junctionWireBytesPerEvent}B (${wireStats.junctionSavingsPct}% smaller)`
        );
      }

      // Group into per-zone Wire v1 compact tuples -> `zone:<zoneId>`
      const zoneGroups = new Map();
      for (const evt of batch) {
        const zId = evt.zoneId || evt.category;
        if (!zId) continue;
        if (!zoneGroups.has(zId)) zoneGroups.set(zId, []);
        zoneGroups.get(zId).push(evt);
      }

      let roomsCount = 0;
      let totalFrames = 0;
      let totalBytes = 0;

      for (const [zId, evts] of zoneGroups.entries()) {
        const wirePkt = encodeZoneBatch(evts, this.wireSchema, zId);
        const res = this._emitWireRoom(`zone:${zId}`, 'telemetry:zone', wirePkt, evts, 'zone', zId);
        if (res.deliveredSockets > 0) {
          roomsCount += 1;
          totalFrames += res.framesDelivered;
          totalBytes += res.totalBytes;
        }
      }

      // Emit full per-approach Wire v1 frames ONLY to subscribers of `junction:<id>`
      for (const [juncId, evts] of this.deviceBroadcastQueues.entries()) {
        if (evts.length > 0) {
          const wireJuncPkt = encodeJunctionBatch(evts, this.wireSchema, juncId);
          const res = this._emitWireRoom(
            `junction:${juncId}`,
            'telemetry:junction',
            wireJuncPkt,
            evts,
            'junction',
            juncId
          );
          if (res.deliveredSockets > 0) {
            roomsCount += 1;
            totalFrames += res.framesDelivered;
            totalBytes += res.totalBytes;
          }
          this.deviceBroadcastQueues.set(juncId, []);
        }
      }

      const emitEndNs = process.hrtime.bigint();
      for (const evt of batch) {
        const startedNs = evt[INGESTED_AT_SYM];
        if (startedNs) {
          recordIngestToEmit(Number(emitEndNs - startedNs) / 1e6);
        }
      }

      span?.setAttribute('socket.room.count', roomsCount);
      span?.setAttribute('socket.frames', totalFrames);
      span?.setAttribute('socket.bytes', totalBytes);
      metricsService.recordBroadcast(batch.length);
    });
  }

  broadcastAlert(alert) {
    if (!this.io || !alert) return;
    const zId = alert.zoneId || alert.category;
    if (zId) {
      this._emitToRoomRaw(`alerts:${zId}`, 'alert:new', alert, 1);
    }
    this._emitToRoomRaw('alerts:all', 'alert:new', alert, 1);
  }

  broadcastDeviceStatus(device) {
    if (!this.io || !device) return;
    const zId = device.zoneId || device.category;
    if (zId) {
      this._emitToRoomRaw(`zone:${zId}`, 'device:status', device, 1);
    }
    this._emitToRoomRaw('city', 'device:status', device, 1);
  }

  broadcastCounterfactual(comparison) {
    if (!this.io) return;
    this._emitToRoomRaw('city', 'cf:update', comparison, 1);
  }

  broadcastEngineeringEvent(eventName, payload) {
    if (!this.io) return 0;
    return this._emitToRoomRaw('engineering', eventName, payload, 1);
  }

  shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.metricTimer) {
      clearInterval(this.metricTimer);
      this.metricTimer = null;
    }
    this.resumingSockets.clear();
    this.broadcastQueue = [];
    this.deviceBroadcastQueues.clear();
    if (this.io) {
      try {
        this.io.disconnectSockets?.(true);
        this.io.close();
      } catch {
        // Ignore already closed socket server
      }
      this.io = null;
    }
  }
}

export { SocketService };
export const socketService = new SocketService();
