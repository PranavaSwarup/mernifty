import { Server } from 'socket.io';
import { metricsService } from './metricsService.js';
import { anomalyEngine } from './anomalyEngine.js';
import { INITIAL_DEVICES } from '../data/junctionDevices.js';

class SocketService {
  constructor() {
    this.io = null;
    this.zoneBroadcastQueues = new Map(); // zoneId -> [events]
    this.junctionBroadcastQueues = new Map(); // junctionId -> [events]
    this.latestJunctionSummaries = new Map(); // junctionId -> slim summary
    this.broadcastIntervalMs = 80; // ~12 fps micro-batching

    // Initialize junction summary cache
    for (const d of INITIAL_DEVICES) {
      this.latestJunctionSummaries.set(d.junctionId, {
        junctionId: d.junctionId,
        name: d.name,
        zoneId: d.zoneId,
        status: 'healthy',
        congestionScore: 25,
        avgSpeedKmph: 22,
        longestQueueM: 45,
        signalMode: 'dynamic-ai',
      });
    }

    // Wire up anomalyEngine alert broadcast
    anomalyEngine.setBroadcastCallback((alert) => {
      this.broadcastAlert(alert);
    });

    // 1. Micro-batch flush timer for zones and junctions (80ms)
    this.flushTimer = setInterval(() => {
      this.flushBroadcasts();
    }, this.broadcastIntervalMs);
    if (this.flushTimer.unref) this.flushTimer.unref();

    // 2. City-wide slim summary broadcast timer (1s) - only sent to 'city' room
    this.cityTimer = setInterval(() => {
      this.broadcastCitySummary();
    }, 1000);
    if (this.cityTimer.unref) this.cityTimer.unref();

    // 3. System health metrics broadcast timer (1s) - only sent to 'system' room
    this.systemTimer = setInterval(() => {
      if (this.io) {
        this.io.to('system').emit('metrics:snapshot', metricsService.getSnapshot());
      }
    }, 1000);
    if (this.systemTimer.unref) this.systemTimer.unref();
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

    this.io.on('connection', (socket) => {
      // NOTE (Section 5.3): Sockets DO NOT auto-join global or all-inclusive rooms.
      // Sockets only join the specific streams they subscribe to.
      metricsService.setConnectedSockets(this.io.engine.clientsCount);

      // Extract user info if authenticated token passed in handshake auth
      const auth = socket.handshake.auth || {};
      socket.user = auth.user || null;

      // 1. Whole City Slim Summary Subscription (Map view)
      socket.on('subscribe:city', () => {
        socket.join('city');
        socket.emit('subscribed', { room: 'city' });
        // Immediately deliver current city snapshot
        socket.emit('telemetry:city_summary', Array.from(this.latestJunctionSummaries.values()));
      });

      socket.on('unsubscribe:city', () => {
        socket.leave('city');
        socket.emit('unsubscribed', { room: 'city' });
      });

      // 2. Zonal Room Subscription (Officers & Zone views)
      socket.on('subscribe:zone', (zoneId) => {
        if (zoneId && zoneId !== 'all') {
          const room = `zone:${zoneId}`;
          socket.join(room);
          socket.emit('subscribed', { room });
        }
      });

      socket.on('unsubscribe:zone', (zoneId) => {
        if (zoneId) {
          const room = `zone:${zoneId}`;
          socket.leave(room);
          socket.emit('unsubscribed', { room });
        }
      });

      // 3. Junction Room Subscription (Junction detail view)
      socket.on('subscribe:junction', (junctionId) => {
        if (junctionId) {
          const room = `junction:${junctionId}`;
          socket.join(room);
          socket.emit('subscribed', { room });
        }
      });

      socket.on('unsubscribe:junction', (junctionId) => {
        if (junctionId) {
          const room = `junction:${junctionId}`;
          socket.leave(room);
          socket.emit('unsubscribed', { room });
        }
      });

      // 4. Corridor Room Subscription (Ambulance live position updates)
      socket.on('subscribe:corridor', () => {
        socket.join('corridor');
        socket.emit('subscribed', { room: 'corridor' });
      });

      socket.on('unsubscribe:corridor', () => {
        socket.leave('corridor');
        socket.emit('unsubscribed', { room: 'corridor' });
      });

      // 5. System Health Room Subscription (Health / Benchmark panel)
      socket.on('subscribe:system', () => {
        socket.join('system');
        socket.emit('subscribed', { room: 'system' });
        socket.emit('metrics:snapshot', metricsService.getSnapshot());
      });

      socket.on('unsubscribe:system', () => {
        socket.leave('system');
        socket.emit('unsubscribed', { room: 'system' });
      });

      // Backward compatibility aliases
      socket.on('subscribe:category', (cat) => {
        if (cat && cat !== 'all') {
          socket.join(`zone:${cat}`);
        } else if (cat === 'all') {
          socket.join('city');
        }
      });

      socket.on('unsubscribe:category', (cat) => {
        if (cat) socket.leave(`zone:${cat}`);
      });

      socket.on('subscribe:device', (devId) => {
        if (devId) socket.join(`junction:${devId}`);
      });

      socket.on('unsubscribe:device', (devId) => {
        if (devId) socket.leave(`junction:${devId}`);
      });

      // Ping-pong latency measurement
      socket.on('telemetry:ping', (clientTimestamp) => {
        socket.emit('telemetry:pong', {
          clientTimestamp,
          serverTimestamp: Date.now(),
        });
      });

      socket.on('disconnect', () => {
        metricsService.setConnectedSockets(this.io ? this.io.engine.clientsCount : 0);
      });
    });
  }

  // Queue incoming telemetry event for selective broadcasting
  broadcastTelemetry(event) {
    if (!this.io) return;

    const juncId = event.junctionId || event.deviceId;
    const zId = event.zoneId || event.category || 'south-bangalore';

    // 1. Update slim city summary cache
    const m = event.metrics || event.data || {};
    this.latestJunctionSummaries.set(juncId, {
      junctionId: juncId,
      name: event.junctionName || event.deviceName || juncId,
      zoneId: zId,
      status: event.status || 'healthy',
      congestionScore: m.congestionScore || 25,
      avgSpeedKmph: m.avgSpeedKmph || 20,
      longestQueueM: m.maxQueueLengthM || 40,
      signalMode: m.adaptiveSignalMode || 'dynamic-ai',
      lastSeen: event.timestamp || new Date().toISOString(),
    });

    // 2. Queue for selective zone broadcast
    if (!this.zoneBroadcastQueues.has(zId)) {
      this.zoneBroadcastQueues.set(zId, []);
    }
    this.zoneBroadcastQueues.get(zId).push(event);

    // 3. Queue for specific junction broadcast
    if (!this.junctionBroadcastQueues.has(juncId)) {
      this.junctionBroadcastQueues.set(juncId, []);
    }
    this.junctionBroadcastQueues.get(juncId).push(event);
  }

  // Single chained emit: delivers alert exactly ONCE per socket even if in multiple rooms
  broadcastAlert(alert) {
    if (!this.io) return;
    const juncId = alert.junctionId || alert.deviceId;
    const zId = alert.zoneId || alert.category;

    let target = this.io.to('alerts');
    if (zId) target = target.to(`zone:${zId}`);
    if (juncId) target = target.to(`junction:${juncId}`);

    // Chained emit guarantees no duplicate delivery to clients subscribed to both zone and junction
    target.emit('alert:new', alert);

    // Slim alert notice to city map viewers
    this.io.to('city').emit('alert:city_marker', {
      alertId: alert.alertId,
      junctionId: juncId,
      zoneId: zId,
      severity: alert.severity,
      title: alert.title,
      timestamp: alert.timestamp,
    });

    metricsService.recordBroadcast(1);
  }

  // Section 5.10: Broadcast alert updates (acknowledged, action_applied, overridden, cause tagged)
  broadcastAlertUpdate(update) {
    if (!this.io) return;
    const juncId = update.junctionId || update.deviceId;
    const zId = update.zoneId;

    let target = this.io.to('alerts');
    if (zId) target = target.to(`zone:${zId}`);
    if (juncId) target = target.to(`junction:${juncId}`);

    target.emit('alert:updated', update);
  }

  // Broadcast 1-second slim city summary to 'city' room viewers only
  broadcastCitySummary() {
    if (!this.io) return;
    const summaries = Array.from(this.latestJunctionSummaries.values());
    this.io.to('city').emit('telemetry:city_summary', summaries);
  }

  // Flush selective micro-batches
  flushBroadcasts() {
    if (!this.io) return;

    let totalBroadcastCount = 0;

    // 1. Deliver zone-specific batches ONLY to their zone room
    for (const [zoneId, zoneEvents] of this.zoneBroadcastQueues.entries()) {
      if (zoneEvents.length > 0) {
        const batch = zoneEvents.splice(0, zoneEvents.length);
        this.io.to(`zone:${zoneId}`).emit('telemetry:batch', batch);
        totalBroadcastCount += batch.length;
      }
    }

    // 2. Deliver junction-specific feeds ONLY to their junction room
    for (const [juncId, juncEvents] of this.junctionBroadcastQueues.entries()) {
      if (juncEvents.length > 0) {
        const events = juncEvents.splice(0, juncEvents.length);
        this.io.to(`junction:${juncId}`).emit('telemetry:device_feed', events);
      }
    }

    if (totalBroadcastCount > 0) {
      metricsService.recordBroadcast(totalBroadcastCount);
    }
  }
}

export const socketService = new SocketService();
