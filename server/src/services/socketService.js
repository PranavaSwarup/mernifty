import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { metricsService } from './metricsService.js';
import { anomalyEngine } from './anomalyEngine.js';
import { JUNCTION_CATALOGUE } from '../middleware/validator.js';

/**
 * Socket.IO Real-Time Distribution Service
 *
 * Security & Room Access Policy:
 *  - Handshake authenticates optional `socket.handshake.auth?.token` (or Authorization Bearer JWT).
 *    - Valid JWT attaches `{ id, role, zones, name, anonymous: false }`.
 *    - Invalid/expired JWT rejects the handshake with Unauthorized.
 *    - Missing token assigns `{ id: 'anonymous-viewer', role: 'viewer', zones: [], anonymous: true }`.
 *  - Public telemetry rooms (`global`, `city`, `alerts`, `zone:*`, `category:*`, `junction:*`, `device:*`):
 *    - Viewers (including anonymous viewers) and admins may subscribe read-only to any telemetry room.
 *    - Zone-scoped operators are restricted to rooms matching their assigned `user.zones`.
 *  - Viewers and anonymous clients CANNOT emit control/mutation events (`sim:*`, `control:*`, `copilot:*`);
 *    any such incoming client event is rejected with a structured `error` frame.
 */
class SocketService {
  constructor() {
    this.io = null;
    this.broadcastQueue = [];
    this.deviceBroadcastQueues = new Map();
    this.broadcastIntervalMs = 80;

    anomalyEngine.setBroadcastCallback((alert) => {
      this.broadcastAlert(alert);
    });

    this.flushTimer = setInterval(() => {
      this.flushBroadcasts();
    }, this.broadcastIntervalMs);
    if (this.flushTimer.unref) this.flushTimer.unref();

    this.metricTimer = setInterval(() => {
      if (this.io) {
        this.io.to('global').emit('metrics:snapshot', metricsService.getSnapshot());
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

    this.io.on('connection', (socket) => {
      const user = socket.data.user || { role: 'viewer', zones: [], anonymous: true };

      socket.join('global');
      socket.join('city');
      socket.join('alerts');
      metricsService.setConnectedSockets(this.io.engine.clientsCount);

      console.log(
        `[Socket] Client connected: ${socket.id} (role=${user.role}, anon=${Boolean(
          user.anonymous
        )}, Total=${this.io.engine.clientsCount})`
      );

      socket.emit('metrics:snapshot', metricsService.getSnapshot());

      // Reject any control/mutation events sent over Socket.IO by non-operator/viewer clients
      const allowedReadEvents = new Set([
        'subscribe:city',
        'unsubscribe:city',
        'subscribe:zone',
        'unsubscribe:zone',
        'subscribe:category',
        'unsubscribe:category',
        'subscribe:junction',
        'unsubscribe:junction',
        'subscribe:device',
        'unsubscribe:device',
        'telemetry:ping',
      ]);
      socket.onAny((eventName) => {
        if (!allowedReadEvents.has(eventName)) {
          if (user.role === 'viewer' || user.anonymous) {
            socket.emit('error', {
              code: 'FORBIDDEN_CONTROL',
              message: `Viewers cannot emit control event '${eventName}'`,
            });
          }
        }
      });

      socket.on('subscribe:city', () => {
        socket.join('city');
        socket.emit('subscribed', { room: 'city' });
      });

      socket.on('unsubscribe:city', () => {
        socket.leave('city');
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
        const room = `category:${category}`;
        socket.join(room);
        socket.join(`zone:${category}`);
        socket.emit('subscribed', { room });
      });

      socket.on('unsubscribe:category', (category) => {
        if (category) {
          socket.leave(`category:${category}`);
          socket.leave(`zone:${category}`);
        }
      });

      socket.on('subscribe:junction', (junctionId) => {
        if (!junctionId) return;
        const jZone = JUNCTION_CATALOGUE.get(junctionId);
        if (jZone && !this._canAccessZone(user, jZone)) {
          return socket.emit('error', {
            code: 'FORBIDDEN_ZONE',
            message: `Operator role cannot subscribe to out-of-scope junction '${junctionId}' (${jZone})`,
          });
        }
        socket.join(`junction:${junctionId}`);
        socket.join(`device:${junctionId}`);
        socket.emit('subscribed', { room: `junction:${junctionId}` });
      });

      socket.on('unsubscribe:junction', (junctionId) => {
        if (junctionId) {
          socket.leave(`junction:${junctionId}`);
          socket.leave(`device:${junctionId}`);
        }
      });

      socket.on('subscribe:device', (deviceId) => {
        if (!deviceId) return;
        const jZone = JUNCTION_CATALOGUE.get(deviceId);
        if (jZone && !this._canAccessZone(user, jZone)) {
          return socket.emit('error', {
            code: 'FORBIDDEN_ZONE',
            message: `Operator role cannot subscribe to out-of-scope junction '${deviceId}' (${jZone})`,
          });
        }
        const room = `device:${deviceId}`;
        socket.join(room);
        socket.join(`junction:${deviceId}`);
        socket.emit('subscribed', { room });
      });

      socket.on('unsubscribe:device', (deviceId) => {
        if (deviceId) {
          socket.leave(`device:${deviceId}`);
          socket.leave(`junction:${deviceId}`);
        }
      });

      socket.on('telemetry:ping', (clientTimestamp) => {
        socket.emit('telemetry:pong', {
          clientTimestamp,
          serverTimestamp: Date.now(),
        });
      });

      socket.on('disconnect', () => {
        metricsService.setConnectedSockets(this.io ? this.io.engine.clientsCount : 0);
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });
    });
  }

  broadcastTelemetry(event) {
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

    const batch = this.broadcastQueue.splice(0, this.broadcastQueue.length);
    this.io.to('global').emit('telemetry:batch', batch);

    const zoneGroups = new Map();
    for (const evt of batch) {
      const zId = evt.zoneId || evt.category;
      if (!zoneGroups.has(zId)) zoneGroups.set(zId, []);
      zoneGroups.get(zId).push(evt);
    }

    for (const [zId, evts] of zoneGroups.entries()) {
      this.io.to(`category:${zId}`).emit('telemetry:batch', evts);
      this.io.to(`zone:${zId}`).emit('telemetry:batch', evts);
    }

    for (const [juncId, evts] of this.deviceBroadcastQueues.entries()) {
      if (evts.length > 0) {
        this.io.to(`device:${juncId}`).emit('telemetry:device', evts);
        this.io.to(`junction:${juncId}`).emit('telemetry:device', evts);
        this.deviceBroadcastQueues.set(juncId, []);
      }
    }

    metricsService.recordBroadcast(batch.length);
  }

  broadcastAlert(alert) {
    if (!this.io) return;
    this.io.to('alerts').emit('alert:new', alert);
  }

  broadcastDeviceStatus(device) {
    if (!this.io) return;
    this.io.to('global').emit('device:status', device);
  }

  broadcastCounterfactual(comparison) {
    if (!this.io) return;
    this.io.to('city').emit('cf:update', comparison);
  }
}

export const socketService = new SocketService();
