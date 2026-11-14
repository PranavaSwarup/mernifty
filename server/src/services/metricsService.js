import {
  getCachedOtelMetricsSnapshot,
  getEventLoopLagStats,
  isOtelEnabled,
  refreshOtelMetricsSnapshot,
} from '../telemetry/otel.js';

class MetricsService {
  constructor() {
    this.totalIngested = 0;
    this.totalBroadcasted = 0;
    this.totalPersisted = 0;
    this.totalDropped = 0;
    this.totalDuplicates = 0;
    this.totalLoadShed = 0;
    this.totalLate = 0;
    this.totalGaps = 0;
    this.totalMissingSequences = 0;

    this.ingestRate = 0;
    this.broadcastRate = 0;
    this.persistRate = 0;
    this.peakIngestRate = 0;

    this.currentSecondIngest = 0;
    this.currentSecondBroadcast = 0;
    this.currentSecondPersist = 0;

    this.latencies = [];
    this.avgLatencyMs = 0;
    this.connectedSockets = 0;
    this.bufferSize = 0;
    this.startTime = Date.now();

    // Real-time Socket.IO byte accounting, per-room bytes/sec & backpressure stats
    this.totalSocketBytes = 0;
    this.socketBytesPerSec = 0;
    this.currentSecondSocketBytes = 0;
    this.currentSecondRoomBytes = new Map();
    this.socketBytesByRoom = {};
    this.totalSocketFramesDelivered = 0;
    this.socketCoalescedCount = 0;
    this.socketDroppedCount = 0;
    this.wireComparison = null;

    // Optional integrity provider injected by ingestionBuffer (avoids circular import)
    this._integrityProvider = null;

    this.rateInterval = setInterval(() => {
      this.ingestRate = this.currentSecondIngest;
      this.broadcastRate = this.currentSecondBroadcast;
      this.persistRate = this.currentSecondPersist;
      this.socketBytesPerSec = this.currentSecondSocketBytes;

      const byRoomSnapshot = {};
      for (const [room, b] of this.currentSecondRoomBytes.entries()) {
        byRoomSnapshot[room] = b;
      }
      this.socketBytesByRoom = byRoomSnapshot;

      if (this.ingestRate > this.peakIngestRate) {
        this.peakIngestRate = this.ingestRate;
      }

      this.currentSecondIngest = 0;
      this.currentSecondBroadcast = 0;
      this.currentSecondPersist = 0;
      this.currentSecondSocketBytes = 0;
      this.currentSecondRoomBytes.clear();

      if (this.latencies.length > 0) {
        const sum = this.latencies.reduce((a, b) => a + b, 0);
        this.avgLatencyMs = parseFloat((sum / this.latencies.length).toFixed(2));
        this.latencies = this.latencies.slice(-500);
      }

      if (isOtelEnabled()) {
        refreshOtelMetricsSnapshot();
      }
    }, 1000);
    if (this.rateInterval.unref) this.rateInterval.unref();
  }

  setIntegrityProvider(fn) {
    this._integrityProvider = fn;
  }

  recordIngest(count = 1, latencyMs = 0) {
    this.totalIngested += count;
    this.currentSecondIngest += count;
    if (latencyMs > 0) {
      this.latencies.push(latencyMs);
    }
  }

  recordBroadcast(count = 1) {
    this.totalBroadcasted += count;
    this.currentSecondBroadcast += count;
  }

  recordPersist(count = 1) {
    this.totalPersisted += count;
    this.currentSecondPersist += count;
  }

  recordDrop(count = 1) {
    this.totalDropped += count;
  }

  recordDuplicate(count = 1) {
    this.totalDuplicates += count;
  }

  recordLoadShed(count = 1) {
    this.totalLoadShed += count;
    this.totalDropped += count;
  }

  recordLate(count = 1) {
    this.totalLate += count;
  }

  recordGap(missingCount = 1) {
    this.totalGaps += 1;
    this.totalMissingSequences += missingCount;
  }

  setConnectedSockets(count) {
    this.connectedSockets = count;
  }

  setBufferSize(size) {
    this.bufferSize = size;
  }

  recordSocketBytes(roomName, totalEgressBytes, framesDelivered = 1) {
    if (totalEgressBytes > 0) {
      this.totalSocketBytes += totalEgressBytes;
      this.currentSecondSocketBytes += totalEgressBytes;
      const prev = this.currentSecondRoomBytes.get(roomName) || 0;
      this.currentSecondRoomBytes.set(roomName, prev + totalEgressBytes);
    }
    if (framesDelivered > 0) {
      this.totalSocketFramesDelivered += framesDelivered;
    }
  }

  recordSocketBackpressure({ coalesced = 0, dropped = 0 } = {}) {
    if (coalesced > 0) this.socketCoalescedCount += coalesced;
    if (dropped > 0) this.socketDroppedCount += dropped;
  }

  setWireComparison(comparison) {
    this.wireComparison = comparison;
  }

  _buildOtelSnapshot() {
    const cached = getCachedOtelMetricsSnapshot();
    const h = cached.histograms || {};
    const emptyHist = { count: 0, sum: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, byAttribute: {} };
    const loopLag = getEventLoopLagStats();
    return {
      enabled: isOtelEnabled(),
      collectedAt: cached.collectedAt,
      eventLoopLagMs: cached.gauges?.['event_loop.lag'] ?? loopLag.meanMs,
      eventLoopLagP99Ms: loopLag.p99Ms,
      counters: cached.counters || {},
      gauges: cached.gauges || {},
      histograms: {
        ingestToPersistMs: h.ingest_to_persist_ms || emptyHist,
        ingestToEmitMs: h.ingest_to_emit_ms || emptyHist,
        flushDurationMs: h.flush_duration_ms || emptyHist,
        flushBatchSize: h.flush_batch_size || emptyHist,
        simStepMs: h.sim_step_ms || emptyHist,
        socketFrameBytes: h.socket_frame_bytes || emptyHist,
        clientE2eMs: h.client_e2e_ms || emptyHist,
      },
    };
  }

  async getSnapshotAsync() {
    await refreshOtelMetricsSnapshot();
    return this.getSnapshot();
  }

  getSnapshot() {
    const integrity = this._integrityProvider ? this._integrityProvider() : null;
    const otel = this._buildOtelSnapshot();
    return {
      totalIngested: this.totalIngested,
      totalBroadcasted: this.totalBroadcasted,
      totalPersisted: this.totalPersisted,
      totalDropped: this.totalDropped,
      totalDuplicates: this.totalDuplicates,
      totalLoadShed: this.totalLoadShed,
      totalLate: this.totalLate,
      totalGaps: this.totalGaps,
      totalMissingSequences: this.totalMissingSequences,
      ingestRate: this.ingestRate,
      broadcastRate: this.broadcastRate,
      persistRate: this.persistRate,
      peakIngestRate: this.peakIngestRate,
      avgLatencyMs: this.avgLatencyMs,
      connectedSockets: this.connectedSockets,
      bufferSize: this.bufferSize,
      totalSocketBytes: this.totalSocketBytes,
      socketBytesPerSec: this.socketBytesPerSec,
      socketBytesByRoom: this.socketBytesByRoom,
      totalSocketFramesDelivered: this.totalSocketFramesDelivered,
      socketCoalescedCount: this.socketCoalescedCount,
      socketDroppedCount: this.socketDroppedCount,
      wireComparison: this.wireComparison,
      eventLoopLagMs: otel.eventLoopLagMs,
      eventLoopLagP99Ms: otel.eventLoopLagP99Ms,
      otel,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      integrity,
      timestamp: new Date().toISOString(),
    };
  }

  getCitySnapshot() {
    const full = this.getSnapshot();
    const { socketBytesByRoom, integrity, otel, ...rest } = full;
    // Keep slim scalar percentiles on city snapshot without full per-bucket/per-room breakdowns
    if (otel?.histograms) {
      rest.latencyPercentiles = {
        ingestToEmitP50Ms: otel.histograms.ingestToEmitMs?.p50 || 0,
        ingestToEmitP95Ms: otel.histograms.ingestToEmitMs?.p95 || 0,
        clientE2eP50Ms: otel.histograms.clientE2eMs?.p50 || 0,
        clientE2eP95Ms: otel.histograms.clientE2eMs?.p95 || 0,
      };
    }
    if (integrity && typeof integrity === 'object') {
      const { byJunction, ...integritySummary } = integrity;
      rest.integrity = integritySummary;
    } else {
      rest.integrity = integrity;
    }
    return rest;
  }

  reset() {
    this.totalIngested = 0;
    this.totalBroadcasted = 0;
    this.totalPersisted = 0;
    this.totalDropped = 0;
    this.totalDuplicates = 0;
    this.totalLoadShed = 0;
    this.totalLate = 0;
    this.totalGaps = 0;
    this.totalMissingSequences = 0;
    this.ingestRate = 0;
    this.broadcastRate = 0;
    this.persistRate = 0;
    this.peakIngestRate = 0;
    this.currentSecondIngest = 0;
    this.currentSecondBroadcast = 0;
    this.currentSecondPersist = 0;
    this.latencies = [];
    this.avgLatencyMs = 0;
    this.bufferSize = 0;
    this.totalSocketBytes = 0;
    this.socketBytesPerSec = 0;
    this.currentSecondSocketBytes = 0;
    this.currentSecondRoomBytes.clear();
    this.socketBytesByRoom = {};
    this.totalSocketFramesDelivered = 0;
    this.socketCoalescedCount = 0;
    this.socketDroppedCount = 0;
    this.wireComparison = null;
  }

  shutdown() {
    if (this.rateInterval) {
      clearInterval(this.rateInterval);
      this.rateInterval = null;
    }
  }
}

export const metricsService = new MetricsService();
