import { Server } from 'socket.io';
import { metricsService } from './metricsService.js';
import { anomalyEngine } from './anomalyEngine.js';

class SocketService {
  constructor() {
    this.io = null;
    this.broadcastQueue = [];
    this.deviceBroadcastQueues = new Map(); // junctionId -> [events]
    this.broadcastIntervalMs = 80; // ~12 fps micro-batching for high throughput

    // Wire up anomalyEngine alert broadcast
    anomalyEngine.setBroadcastCallback((alert) => {
      this.broadcastAlert(alert);
    });

    // Micro-batch flush timer
    setInterval(() => {
      this.flushBroadcasts();
    }, this.broadcastIntervalMs);

    // Metric broadcast timer (1s)
    setInterval(() => {
      if (this.io) {
        this.io.to('global').emit('metrics:snapshot', metricsService.getSnapshot());
      }
    }, 1000);
  }

  init(httpServer, clientUrl) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*', // Allow client connections
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingInterval: 10000,
      pingTimeout: 5000,
    });

    this.io.on('connection', (socket) => {
      // By default, join global room
      socket.join('global');
      socket.join('alerts');
      metricsService.setConnectedSockets(this.io.engine.clientsCount);

      console.log(`[Socket] Client connected: ${socket.id} (Total: ${this.io.engine.clientsCount})`);

      // Send initial metrics snapshot
      socket.emit('metrics:snapshot', metricsService.getSnapshot());

      // Room subscription handlers for Zones / Categories
      socket.on('subscribe:zone', (zoneId) => {
        if (zoneId) {
          socket.join(`zone:${zoneId}`);
          socket.emit('subscribed', { room: `zone:${zoneId}` });
        }
      });

      socket.on('unsubscribe:zone', (zoneId) => {
        if (zoneId) {
          socket.leave(`zone:${zoneId}`);
        }
      });

      socket.on('subscribe:category', (category) => {
        if (category) {
          const room = `category:${category}`;
          socket.join(room);
          socket.join(`zone:${category}`); // also join matching zone room
          socket.emit('subscribed', { room });
        }
      });

      socket.on('unsubscribe:category', (category) => {
        if (category) {
          socket.leave(`category:${category}`);
          socket.leave(`zone:${category}`);
        }
      });

      // Room subscription handlers for Junctions / Devices
      socket.on('subscribe:junction', (junctionId) => {
        if (junctionId) {
          socket.join(`junction:${junctionId}`);
          socket.join(`device:${junctionId}`);
          socket.emit('subscribed', { room: `junction:${junctionId}` });
        }
      });

      socket.on('unsubscribe:junction', (junctionId) => {
        if (junctionId) {
          socket.leave(`junction:${junctionId}`);
          socket.leave(`device:${junctionId}`);
        }
      });

      socket.on('subscribe:device', (deviceId) => {
        if (deviceId) {
          const room = `device:${deviceId}`;
          socket.join(room);
          socket.join(`junction:${deviceId}`);
          socket.emit('subscribed', { room });
        }
      });

      socket.on('unsubscribe:device', (deviceId) => {
        if (deviceId) {
          socket.leave(`device:${deviceId}`);
          socket.leave(`junction:${deviceId}`);
        }
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
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });
    });
  }

  broadcastTelemetry(event) {
    if (!this.io) return;

    const juncId = event.junctionId || event.deviceId;

    // Queue for micro-batching
    this.broadcastQueue.push(event);

    // Queue for specific junction room
    if (!this.deviceBroadcastQueues.has(juncId)) {
      this.deviceBroadcastQueues.set(juncId, []);
    }
    this.deviceBroadcastQueues.get(juncId).push(event);
  }

  broadcastAlert(alert) {
    if (!this.io) return;
    const juncId = alert.junctionId || alert.deviceId;
    const zId = alert.zoneId || alert.category;

    this.io.to('alerts').emit('alert:new', alert);
    this.io.to('global').emit('alert:new', alert);
    if (juncId) {
      this.io.to(`device:${juncId}`).emit('alert:new', alert);
      this.io.to(`junction:${juncId}`).emit('alert:new', alert);
    }
    if (zId) {
      this.io.to(`zone:${zId}`).emit('alert:new', alert);
      this.io.to(`category:${zId}`).emit('alert:new', alert);
    }
    metricsService.recordBroadcast(1);
  }

  broadcastDeviceStatus(device) {
    if (!this.io) return;
    this.io.to('global').emit('device:status_change', device);
    const juncId = device.junctionId || device.deviceId;
    if (juncId) {
      this.io.to(`device:${juncId}`).emit('device:status_change', device);
      this.io.to(`junction:${juncId}`).emit('device:status_change', device);
    }
  }

  flushBroadcasts() {
    if (!this.io || (this.broadcastQueue.length === 0 && this.deviceBroadcastQueues.size === 0)) {
      return;
    }

    // 1. Emit zone / category micro-batches
    if (this.broadcastQueue.length > 0) {
      const batch = this.broadcastQueue.splice(0, this.broadcastQueue.length);

      // Group by zone / category
      const byZone = {};
      for (const item of batch) {
        const zId = item.zoneId || item.category || 'all';
        if (!byZone[zId]) byZone[zId] = [];
        byZone[zId].push(item);
      }

      // Broadcast to global & zone rooms
      this.io.to('global').emit('telemetry:batch', batch);
      for (const [zone, items] of Object.entries(byZone)) {
        this.io.to(`zone:${zone}`).emit('telemetry:batch', items);
        this.io.to(`category:${zone}`).emit('telemetry:batch', items);
      }

      metricsService.recordBroadcast(batch.length);
    }

    // 2. Emit per-junction micro-batches
    for (const [juncId, juncEvents] of this.deviceBroadcastQueues.entries()) {
      if (juncEvents.length > 0) {
        const events = juncEvents.splice(0, juncEvents.length);
        this.io.to(`device:${juncId}`).emit('telemetry:device_feed', events);
        this.io.to(`junction:${juncId}`).emit('telemetry:device_feed', events);
      }
    }
  }
}

export const socketService = new SocketService();
