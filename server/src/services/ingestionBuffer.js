import { Telemetry } from '../models/Telemetry.js';
import { Device } from '../models/Device.js';
import { metricsService } from './metricsService.js';
import { config } from '../config/config.js';

// Bounded FIFO Set that forgets oldest entries first (Section 5.5)
class BoundedEventIdSet {
  constructor(maxSize = 50000) {
    this.maxSize = maxSize;
    this.set = new Set();
  }

  has(id) {
    return this.set.has(id);
  }

  add(id) {
    if (this.set.size >= this.maxSize) {
      // In JS, Set keys iterate in insertion order; delete the oldest
      const oldest = this.set.values().next().value;
      this.set.delete(oldest);
    }
    this.set.add(id);
  }

  clear() {
    this.set.clear();
  }

  get size() {
    return this.set.size;
  }
}

class IngestionBuffer {
  constructor() {
    this.queue = [];
    this.recentEventIds = new BoundedEventIdSet(50000);
    this.latestSequenceMap = new Map(); // junctionId -> latestSequence
    this.maxQueueSize = 10000;
    this.batchSize = config.batchSize || 200;
    this.flushIntervalMs = config.batchIntervalMs || 500;
    this.isFlushing = false;

    // Periodic flush timer
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  enqueue(event) {
    // 1. Deduplication check (Drop seen eventIds)
    if (event.eventId && this.recentEventIds.has(event.eventId)) {
      metricsService.recordDuplicate(1);
      return { accepted: false, reason: 'Duplicate eventId' };
    }

    // 2. Backpressure check
    if (this.queue.length >= this.maxQueueSize) {
      metricsService.recordBackpressure(1);
      return { accepted: false, reason: 'Backpressure: Ingestion queue full' };
    }

    if (event.eventId) {
      this.recentEventIds.add(event.eventId);
    }

    // 3. Sequence tracking for out-of-order handling
    const juncId = event.junctionId || event.deviceId;
    const currentLatestSeq = this.latestSequenceMap.get(juncId) || 0;
    const isOutOfOrder = typeof event.sequence === 'number' && event.sequence < currentLatestSeq;

    if (!isOutOfOrder && typeof event.sequence === 'number') {
      this.latestSequenceMap.set(juncId, event.sequence);
    }
    event.isOutOfOrder = isOutOfOrder;

    this.queue.push(event);
    metricsService.setBufferSize(this.queue.length);

    // If batch size reached, trigger immediate flush
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }

    return { accepted: true, isOutOfOrder };
  }

  enqueueBatch(events) {
    let acceptedCount = 0;
    let duplicateCount = 0;
    let backpressureCount = 0;

    for (const evt of events) {
      const res = this.enqueue(evt);
      if (res.accepted) {
        acceptedCount++;
      } else if (res.reason === 'Duplicate eventId') {
        duplicateCount++;
      } else {
        backpressureCount++;
      }
    }

    return {
      acceptedCount,
      rejectedCount: duplicateCount + backpressureCount,
      duplicateCount,
      backpressureCount,
    };
  }

  async flush() {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    const batch = this.queue.splice(0, this.batchSize);
    metricsService.setBufferSize(this.queue.length);

    try {
      const telemetryDocs = batch.map((evt) => ({
        eventId: evt.eventId,
        junctionId: evt.junctionId || evt.deviceId,
        deviceId: evt.deviceId || evt.junctionId,
        zoneId: evt.zoneId || evt.category,
        category: evt.category || evt.zoneId,
        timestamp: new Date(evt.timestamp || Date.now()),
        sequence: evt.sequence || 0,
        data: evt.data || {},
        metrics: evt.metrics || {},
        status: evt.status || 'healthy',
        location: evt.location || null,
        receivedAt: evt.receivedAt ? new Date(evt.receivedAt) : new Date(),
      }));

      // High-performance bulk insert with ordered: false
      await Telemetry.bulkWrite(
        telemetryDocs.map((doc) => ({
          insertOne: { document: doc },
        })),
        { ordered: false }
      );

      // Update Device state for events that are NOT out-of-order
      const latestPerDevice = new Map();
      for (const evt of batch) {
        if (!evt.isOutOfOrder) {
          latestPerDevice.set(evt.junctionId || evt.deviceId, evt);
        }
      }

      if (latestPerDevice.size > 0) {
        const deviceOps = Array.from(latestPerDevice.values()).map((evt) => {
          const m = evt.metrics || evt.data || {};
          const juncId = evt.junctionId || evt.deviceId;
          return {
            updateOne: {
              filter: { deviceId: juncId },
              update: {
                $set: {
                  lastSeen: new Date(evt.timestamp || Date.now()),
                  status: evt.status || 'healthy',
                  lastLocation: evt.location || undefined,
                  lastMetrics: m,
                  lastData: evt.data || {},
                },
              },
              upsert: true,
            },
          };
        });

        await Device.bulkWrite(deviceOps, { ordered: false });
      }

      metricsService.recordPersist(batch.length);
    } catch (err) {
      if (err.name === 'MongoBulkWriteError' && err.writeErrors) {
        const actualInserted = batch.length - err.writeErrors.length;
        metricsService.recordPersist(actualInserted);
      } else {
        console.warn('[IngestBuffer] Bulk write notice:', err.message);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}

export const ingestionBuffer = new IngestionBuffer();
