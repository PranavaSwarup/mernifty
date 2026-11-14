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
    if (this.timer.unref) this.timer.unref();

    // Periodic cleanup of deduplication set
    this.cleanupTimer = setInterval(() => {
      if (this.recentEventIds.size > 50000) {
        this.recentEventIds.clear();
      }
    }, 60000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
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
            junctionId: item.junctionId || item.deviceId,
            deviceId: item.deviceId || item.junctionId,
            junctionName: item.junctionName || item.deviceName,
            zoneId: item.zoneId || item.category,
            category: item.category || item.zoneId,
            timestamp: new Date(item.timestamp),
            sequence: item.sequence || 0,
            source: item.source || 'external',
            metrics: item.metrics || {},
            data: item.data || {},
            status: item.status || 'healthy',
            location: item.location || null,
          },
        },
      }));

      // Prepare bulk operations for Junction status updates
      const deviceMap = new Map();
      for (const item of batch) {
        const juncId = item.junctionId || item.deviceId;
        deviceMap.set(juncId, {
          junctionId: juncId,
          deviceId: juncId,
          name: item.junctionName || item.deviceName || juncId,
          zoneId: item.zoneId || item.category,
          category: item.category || item.zoneId,
          status: item.status || 'online',
          lastSeen: new Date(item.timestamp),
          lastMetrics: item.metrics,
          lastData: item.data,
          lastLocation: item.location,
          approaches: item.data?.approaches || [],
          vehicleMix: item.data?.vehicleMix,
          stalledVehicleDetected: Boolean(item.data?.stalledVehicleDetected),
          ambulanceDetected: Boolean(item.data?.ambulanceDetected),
        });
      }

      const deviceOps = Array.from(deviceMap.values()).map((dev) => ({
        updateOne: {
          filter: { deviceId: dev.deviceId },
          update: {
            $set: {
              junctionId: dev.junctionId,
              name: dev.name,
              zoneId: dev.zoneId,
              category: dev.category,
              status: dev.status,
              lastSeen: dev.lastSeen,
              lastMetrics: dev.lastMetrics,
              lastData: dev.lastData,
              approaches: dev.approaches,
              vehicleMix: dev.vehicleMix,
              stalledVehicleDetected: dev.stalledVehicleDetected,
              ambulanceDetected: dev.ambulanceDetected,
              ...(dev.lastLocation ? { lastLocation: dev.lastLocation } : {}),
            },
            $setOnInsert: {
              healthScore: 100,
              tags: [dev.zoneId, 'bengaluru-traffic'],
            },
          },
          upsert: true,
        },
      }));

      // Execute in parallel with resilient error handling
      const results = await Promise.allSettled([
        Telemetry.bulkWrite(telemetryOps, { ordered: false }),
        Device.bulkWrite(deviceOps, { ordered: false }),
      ]);

      let writeSuccess = false;
      for (const res of results) {
        if (res.status === 'fulfilled') {
          writeSuccess = true;
        } else if (res.reason && res.reason.code !== 11000) {
          console.warn('[IngestBuffer] Bulk write notice:', res.reason.message || res.reason);
        }
      }

      if (writeSuccess) {
        metricsService.recordPersist(batch.length);
      }
    } catch (err) {
      console.warn('[IngestBuffer] Batch persistence notice:', err.message);
    } finally {
      this.isFlushing = false;
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
