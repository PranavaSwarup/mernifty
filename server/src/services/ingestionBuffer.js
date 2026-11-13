import { Telemetry } from '../models/Telemetry.js';
import { Device } from '../models/Device.js';
import { metricsService } from './metricsService.js';
import { config } from '../config/config.js';

class IngestionBuffer {
  constructor() {
    this.queue = [];
    this.recentEventIds = new Set();
    this.maxQueueSize = 10000;
    this.batchSize = config.batchSize || 200;
    this.flushIntervalMs = config.batchIntervalMs || 500;
    this.isFlushing = false;

    // Periodic flush timer
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);

    // Periodic cleanup of deduplication set
    setInterval(() => {
      if (this.recentEventIds.size > 50000) {
        this.recentEventIds.clear();
      }
    }, 60000);
  }

  enqueue(event) {
    // 1. Deduplication check
    if (event.eventId && this.recentEventIds.has(event.eventId)) {
      metricsService.recordDrop(1);
      return { accepted: false, reason: 'Duplicate eventId' };
    }

    // 2. Backpressure check
    if (this.queue.length >= this.maxQueueSize) {
      metricsService.recordDrop(1);
      return { accepted: false, reason: 'Backpressure: Ingestion queue full' };
    }

    if (event.eventId) {
      this.recentEventIds.add(event.eventId);
    }

    this.queue.push(event);
    metricsService.setBufferSize(this.queue.length);

    // If batch size reached, trigger immediate flush
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }

    return { accepted: true };
  }

  enqueueBatch(events) {
    let acceptedCount = 0;
    for (const evt of events) {
      const res = this.enqueue(evt);
      if (res.accepted) acceptedCount++;
    }
    return { acceptedCount, totalReceived: events.length };
  }

  async flush() {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    // Drain up to batchSize items from the queue
    const batch = this.queue.splice(0, this.batchSize);
    metricsService.setBufferSize(this.queue.length);

    try {
      // Prepare bulk operations for Telemetry
      const telemetryOps = batch.map((item) => ({
        insertOne: {
          document: {
            eventId: item.eventId,
            deviceId: item.deviceId,
            category: item.category,
            timestamp: new Date(item.timestamp),
            sequence: item.sequence || 0,
            metrics: item.metrics,
            status: item.status || 'healthy',
            location: item.location || null,
          },
        },
      }));

      // Prepare bulk operations for Device status updates
      const deviceMap = new Map();
      for (const item of batch) {
        deviceMap.set(item.deviceId, {
          deviceId: item.deviceId,
          name: item.deviceName || item.deviceId,
          category: item.category,
          status: item.status || 'online',
          lastSeen: new Date(item.timestamp),
          lastMetrics: item.metrics,
          lastLocation: item.location,
        });
      }

      const deviceOps = Array.from(deviceMap.values()).map((dev) => ({
        updateOne: {
          filter: { deviceId: dev.deviceId },
          update: {
            $set: {
              name: dev.name,
              category: dev.category,
              status: dev.status,
              lastSeen: dev.lastSeen,
              lastMetrics: dev.lastMetrics,
              ...(dev.lastLocation ? { lastLocation: dev.lastLocation } : {}),
            },
            $setOnInsert: {
              healthScore: 100,
              tags: [dev.category],
            },
          },
          upsert: true,
        },
      }));

      // Execute in parallel
      await Promise.all([
        Telemetry.bulkWrite(telemetryOps, { ordered: false }).catch((err) => {
          // Ignore duplicate key errors in bulk write
          if (err.code !== 11000) {
            console.error('[IngestBuffer] Bulk write error for Telemetry:', err.message);
          }
        }),
        Device.bulkWrite(deviceOps, { ordered: false }).catch((err) => {
          console.error('[IngestBuffer] Bulk write error for Device:', err.message);
        }),
      ]);

      metricsService.recordPersist(batch.length);
    } catch (err) {
      console.error('[IngestBuffer] Flush fatal error:', err);
    } finally {
      this.isFlushing = false;
      // If items accumulated while flushing, trigger another flush
      if (this.queue.length >= this.batchSize) {
        setImmediate(() => this.flush());
      }
    }
  }

  getQueueLength() {
    return this.queue.length;
  }
}

export const ingestionBuffer = new IngestionBuffer();
