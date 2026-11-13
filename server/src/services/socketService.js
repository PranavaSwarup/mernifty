import { Server } from 'socket.io';
import { metricsService } from './metricsService.js';
import { anomalyEngine } from './anomalyEngine.js';

class SocketService {
  constructor() {
    this.io = null;
    this.broadcastQueue = [];
    this.deviceBroadcastQueues = new Map(); // deviceId -> [events]
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

      // Room subscription handlers
      socket.on('subscribe:category', (category) => {
        if (category) {
          const room = `category:${category}`;
          socket.join(room);
          socket.emit('subscribed', { room });
        }
      });

      socket.on('unsubscribe:category', (category) => {
        if (category) {
          const room = `category:${category}`;
          socket.leave(room);
        }
      });

      socket.on('subscribe:device', (deviceId) => {
        if (deviceId) {
          const room = `device:${deviceId}`;
          socket.join(room);
          socket.emit('subscribed', { room });
        }
      });

      socket.on('unsubscribe:device', (deviceId) => {
        if (deviceId) {
          const room = `device:${deviceId}`;
          socket.leave(room);
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

    // Queue for micro-batching
    this.broadcastQueue.push(event);

    // Queue for specific device room
    if (!this.deviceBroadcastQueues.has(event.deviceId)) {
      this.deviceBroadcastQueues.set(event.deviceId, []);
    }
    this.deviceBroadcastQueues.get(event.deviceId).push(event);
  }

  broadcastAlert(alert) {
    if (!this.io) return;
    this.io.to('alerts').emit('alert:new', alert);
    this.io.to(`device:${alert.deviceId}`).emit('alert:new', alert);
    metricsService.recordBroadcast(1);
  }

  broadcastDeviceStatus(device) {
    if (!this.io) return;
    this.io.to('global').emit('device:status_change', device);
  }

  flushBroadcasts() {
    if (!this.io || (this.broadcastQueue.length === 0 && this.deviceBroadcastQueues.size === 0)) {
      return;
    }

    // 1. Emit category micro-batches
    if (this.broadcastQueue.length > 0) {
      const batch = this.broadcastQueue.splice(0, this.broadcastQueue.length);

      // Group by category for selective broadcasting
      const byCategory = {};
      for (const item of batch) {
        if (!byCategory[item.category]) byCategory[item.category] = [];
        byCategory[item.category].push(item);
      }

      // Broadcast to global & category rooms
      this.io.to('global').emit('telemetry:batch', batch);
      for (const [category, items] of Object.entries(byCategory)) {
        this.io.to(`category:${category}`).emit('telemetry:batch', items);
      }

      metricsService.recordBroadcast(batch.length);
    }

    // 2. Emit per-device micro-batches
    for (const [deviceId, devEvents] of this.deviceBroadcastQueues.entries()) {
      if (devEvents.length > 0) {
        const events = devEvents.splice(0, devEvents.length);
        this.io.to(`device:${deviceId}`).emit('telemetry:device_feed', events);
      }
    }
  }
}

export const socketService = new SocketService();
