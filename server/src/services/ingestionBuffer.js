import mongoose from 'mongoose';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';
import { Telemetry } from '../models/Telemetry.js';
import { Device } from '../models/Device.js';
import { metricsService } from './metricsService.js';
import { config } from '../config/config.js';
import {
  INGESTED_AT_SYM,
  INGEST_SPAN_CTX_SYM,
  collectUniqueSpanLinks,
  recordAccepted,
  recordDuplicates,
  recordFlushBatchSize,
  recordFlushDuration,
  recordIngestToPersist,
  recordPersisted,
  recordRejected,
  setGaugeProviders,
  stampEventTelemetry,
  withAsyncSpan,
  withSyncSpan,
} from '../telemetry/instruments.js';

/**
 * Fixed-capacity O(1) ring/FIFO cache for recent eventIds.
 * Prevents unbounded memory growth without abrupt cache wipes.
 */
class FixedIdRingCache {
  constructor(capacity = 100000) {
    this.capacity = Math.max(100, capacity);
    this.ring = new Array(this.capacity);
    this.cursor = 0;
    this.count = 0;
    this.set = new Set();
  }

  has(id) {
    return this.set.has(id);
  }

  add(id) {
    if (this.set.has(id)) return false;
    if (this.count >= this.capacity) {
      const evicted = this.ring[this.cursor];
      if (evicted !== undefined) {
        this.set.delete(evicted);
      }
    } else {
      this.count += 1;
    }
    this.ring[this.cursor] = id;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.set.add(id);
    return true;
  }

  clear() {
    this.ring = new Array(this.capacity);
    this.cursor = 0;
    this.count = 0;
    this.set.clear();
  }

  get size() {
    return this.set.size;
  }
}

class IngestionBuffer {
  constructor() {
    this.queue = [];
    this.recentEventIds = new FixedIdRingCache(100000);
    this.maxQueueSize = 10000;
    this.batchSize = Math.min(500, config.batchSize || 500);
    this.flushIntervalMs = config.batchIntervalMs || 1000;
    this.isFlushing = false;

    // Per-junction sequence & integrity counters
    // Map<junctionId, { lastSequence, inOrder, duplicate, late, gapEvents, missingSequences }>
    this.sequenceTrackers = new Map();

    metricsService.setIntegrityProvider(() => this.getIntegrityReport());
    setGaugeProviders({ getBufferDepth: () => this.queue.length });

    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  _getTracker(junctionId) {
    if (!this.sequenceTrackers.has(junctionId)) {
      this.sequenceTrackers.set(junctionId, {
        lastSequence: null,
        inOrder: 0,
        duplicate: 0,
        late: 0,
        gapEvents: 0,
        missingSequences: 0,
      });
    }
    return this.sequenceTrackers.get(junctionId);
  }

  reset({ clearIds = true, clearTrackers = true, clearQueue = true } = {}) {
    if (clearQueue) {
      this.queue = [];
      metricsService.setBufferSize(0);
    }
    if (clearIds) this.recentEventIds.clear();
    if (clearTrackers) this.sequenceTrackers.clear();
  }

  isBackpressured(thresholdFraction = 0.8) {
    return this.queue.length > this.maxQueueSize * thresholdFraction;
  }

  enqueue(event, { skipSpan = false, deferMetrics = false } = {}) {
    const jId = event.junctionId ?? event.deviceId ?? 'unknown';
    let triggerFlush = false;

    const runEnqueue = (span) => {
      stampEventTelemetry(event);
      const tracker = this._getTracker(jId);
      const seq =
        typeof event.sequence === 'number' && Number.isFinite(event.sequence) ? event.sequence : 0;

      // 1. O(1) Deduplication check (DB unique index remains authoritative source of truth)
      if (event.eventId && this.recentEventIds.has(event.eventId)) {
        tracker.duplicate += 1;
        metricsService.recordDuplicate(1);
        metricsService.recordDrop(1);
        if (!deferMetrics) recordDuplicates(1);
        span?.setAttribute('enqueue.result', 'duplicate');
        return { accepted: false, classification: 'duplicate', reason: 'Duplicate eventId' };
      }

      // 2. Hard queue ceiling guard
      if (this.queue.length >= this.maxQueueSize) {
        metricsService.recordDrop(1);
        if (!deferMetrics) recordRejected('queue_full', 1);
        span?.setAttribute('enqueue.result', 'queue_full');
        return { accepted: false, classification: 'dropped', reason: 'Backpressure: Ingestion queue full' };
      }

      // 3. Per-junction sequence ordering classification
      let classification = 'in-order';
      let isLate = false;
      let gapMissing = 0;

      if (tracker.lastSequence === null) {
        tracker.lastSequence = seq;
        tracker.inOrder += 1;
        classification = 'in-order';
      } else if (seq < tracker.lastSequence) {
        // Out-of-order / late packet with fresh eventId -> accept, persist with late:true, never move live state backwards
        tracker.late += 1;
        metricsService.recordLate(1);
        isLate = true;
        classification = 'late';
      } else if (seq > tracker.lastSequence + 1) {
        gapMissing = seq - (tracker.lastSequence + 1);
        tracker.gapEvents += 1;
        tracker.missingSequences += gapMissing;
        tracker.lastSequence = seq;
        metricsService.recordGap(gapMissing);
        classification = 'gap';
      } else {
        // seq === lastSequence + 1 (normal) or seq === lastSequence (e.g. unsequenced 0)
        tracker.lastSequence = seq;
        tracker.inOrder += 1;
        classification = 'in-order';
      }

      if (event.eventId) {
        this.recentEventIds.add(event.eventId);
      }

      let queuedEvent = event;
      if (isLate) {
        queuedEvent = { ...event, late: true };
        queuedEvent[INGESTED_AT_SYM] = event[INGESTED_AT_SYM];
        queuedEvent[INGEST_SPAN_CTX_SYM] = event[INGEST_SPAN_CTX_SYM];
      }
      this.queue.push(queuedEvent);
      metricsService.setBufferSize(this.queue.length);
      if (!deferMetrics) recordAccepted(1);
      span?.setAttribute('enqueue.classification', classification);

      if (this.queue.length >= this.batchSize) {
        triggerFlush = true;
      }

      return {
        accepted: true,
        classification,
        late: isLate,
        gapMissing,
      };
    };

    const result = skipSpan
      ? runEnqueue(null)
      : withSyncSpan('buffer.enqueue', { attributes: { junctionId: String(jId) } }, runEnqueue);

    if (triggerFlush) {
      this.flush();
    }

    return result;
  }

  enqueueBatch(events) {
    let acceptedCount = 0;
    let duplicateCount = 0;
    let queueFullCount = 0;
    let lateCount = 0;
    let gapCount = 0;

    withSyncSpan('buffer.enqueue', { attributes: { 'batch.size': events.length } }, () => {
      for (const evt of events) {
        const res = this.enqueue(evt, { skipSpan: true, deferMetrics: true });
        if (res.accepted) {
          acceptedCount++;
          if (res.late) lateCount++;
          if (res.classification === 'gap') gapCount++;
        } else if (res.classification === 'duplicate') {
          duplicateCount++;
        } else {
          queueFullCount++;
        }
      }
      if (acceptedCount > 0) recordAccepted(acceptedCount);
      if (duplicateCount > 0) recordDuplicates(duplicateCount);
      if (queueFullCount > 0) recordRejected('queue_full', queueFullCount);
    });
    return { acceptedCount, duplicateCount, lateCount, gapCount, totalReceived: events.length };
  }

  async flush() {
    if (this.isFlushing || this.queue.length === 0) return { insertedCount: 0, duplicateCount: 0 };
    if (mongoose.connection?.readyState !== 1) return { insertedCount: 0, duplicateCount: 0 };

    this.isFlushing = true;
    const flushStartNs = process.hrtime.bigint();
    const batch = this.queue.splice(0, this.batchSize);
    metricsService.setBufferSize(this.queue.length);

    const links = collectUniqueSpanLinks(batch, 64);

    return context.with(ROOT_CONTEXT, () =>
      withAsyncSpan(
        'buffer.flush',
        {
          links,
          attributes: {
            'db.batch.size': batch.length,
            'db.links.count': links.length,
          },
        },
        async (span) => {
          let insertedCount = 0;
          let duplicateCount = 0;

          try {
            const telemetryDocs = batch.map((item) => ({
              eventId: item.eventId,
              junctionId: item.junctionId ?? item.deviceId,
              deviceId: item.deviceId ?? item.junctionId,
              junctionName: item.junctionName ?? item.deviceName,
              zoneId: item.zoneId ?? item.category,
              category: item.category ?? item.zoneId,
              timestamp: new Date(item.timestamp),
              sequence: item.sequence ?? 0,
              late: Boolean(item.late),
              source: item.source ?? 'external',
              metrics: item.metrics ?? {},
              data: item.data ?? {},
              status: item.status ?? 'healthy',
              location: item.location ?? null,
            }));

            // Only non-late events advance live junction state in Devices collection
            const deviceMap = new Map();
            for (const item of batch) {
              if (item.late) continue;
              const juncId = item.junctionId ?? item.deviceId;
              deviceMap.set(juncId, {
                junctionId: juncId,
                deviceId: juncId,
                name: item.junctionName ?? item.deviceName ?? juncId,
                zoneId: item.zoneId ?? item.category,
                category: item.category ?? item.zoneId,
                status: item.status ?? 'online',
                lastSeen: new Date(item.timestamp),
                lastMetrics: item.metrics,
                lastData: item.data,
                lastLocation: item.location,
                approaches: item.data?.approaches ?? [],
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

            // 1. Insert telemetry with unordered resilience; E11000 counted as duplicate metric, NOT error
            try {
              const inserted = await Telemetry.insertMany(telemetryDocs, { ordered: false });
              insertedCount = inserted.length;
            } catch (err) {
              const rawWriteErrors = err?.writeErrors ?? err?.result?.writeErrors ?? [];
              const writeErrors = Array.isArray(rawWriteErrors)
                ? rawWriteErrors
                : rawWriteErrors
                  ? [rawWriteErrors]
                  : [];
              const dupErrors = writeErrors.filter(
                (we) => we?.code === 11000 || we?.err?.code === 11000
              );
              const nonDupErrors = writeErrors.filter(
                (we) => we?.code !== 11000 && we?.err?.code !== 11000
              );
              const topLevelDup =
                dupErrors.length === 0 && (err?.code === 11000 || err?.cause?.code === 11000);

              insertedCount =
                typeof err?.insertedDocs?.length === 'number'
                  ? err.insertedDocs.length
                  : topLevelDup
                    ? Math.max(0, telemetryDocs.length - 1)
                    : Math.max(0, telemetryDocs.length - writeErrors.length);

              duplicateCount = topLevelDup
                ? Math.max(1, telemetryDocs.length - insertedCount)
                : dupErrors.length;

              if (duplicateCount > 0) {
                metricsService.recordDuplicate(duplicateCount);
                recordDuplicates(duplicateCount);
              }
              if (nonDupErrors.length > 0) {
                console.warn('[IngestBuffer] Telemetry write notice:', nonDupErrors[0]?.errmsg || err.message);
              } else if (writeErrors.length === 0 && !topLevelDup) {
                console.warn('[IngestBuffer] Telemetry insert notice:', err.message);
              }
            }

            if (insertedCount > 0) {
              metricsService.recordPersist(insertedCount);
              recordPersisted(insertedCount);
            }

            // 2. Bulk upsert device live state for non-late events
            if (deviceOps.length > 0) {
              try {
                await Device.bulkWrite(deviceOps, { ordered: false });
              } catch (err) {
                console.warn('[IngestBuffer] Device bulkWrite notice:', err.message);
              }
            }

            const flushEndNs = process.hrtime.bigint();
            const flushDurationMs = Number(flushEndNs - flushStartNs) / 1e6;
            recordFlushDuration(flushDurationMs);
            recordFlushBatchSize(batch.length);
            span?.setAttribute('db.duplicates', duplicateCount);
            span?.setAttribute('db.persisted', insertedCount);

            for (const item of batch) {
              const startedNs = item[INGESTED_AT_SYM];
              if (startedNs) {
                recordIngestToPersist(Number(flushEndNs - startedNs) / 1e6);
              }
            }
          } finally {
            this.isFlushing = false;
            if (this.queue.length >= this.batchSize) {
              setImmediate(() => this.flush());
            }
          }

          return { insertedCount, duplicateCount };
        }
      )
    );
  }

  getQueueLength() {
    return this.queue.length;
  }

  getIntegrityReport() {
    const byJunction = {};
    const totals = {
      inOrder: 0,
      duplicate: 0,
      late: 0,
      gapEvents: 0,
      missingSequences: 0,
    };

    for (const [jId, t] of this.sequenceTrackers.entries()) {
      byJunction[jId] = { ...t };
      totals.inOrder += t.inOrder;
      totals.duplicate += t.duplicate;
      totals.late += t.late;
      totals.gapEvents += t.gapEvents;
      totals.missingSequences += t.missingSequences;
    }

    return {
      dedupCacheSize: this.recentEventIds.size,
      dedupCacheCapacity: this.recentEventIds.capacity,
      bufferDepth: this.queue.length,
      bufferCapacity: this.maxQueueSize,
      bufferUtilizationPct: Number(((this.queue.length / this.maxQueueSize) * 100).toFixed(2)),
      totals,
      byJunction,
    };
  }

  shutdown() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isFlushing = false;
  }
}

export const ingestionBuffer = new IngestionBuffer();
