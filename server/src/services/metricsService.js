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

    // Optional integrity provider injected by ingestionBuffer (avoids circular import)
    this._integrityProvider = null;

    this.rateInterval = setInterval(() => {
      this.ingestRate = this.currentSecondIngest;
      this.broadcastRate = this.currentSecondBroadcast;
      this.persistRate = this.currentSecondPersist;

      if (this.ingestRate > this.peakIngestRate) {
        this.peakIngestRate = this.ingestRate;
      }

      this.currentSecondIngest = 0;
      this.currentSecondBroadcast = 0;
      this.currentSecondPersist = 0;

      if (this.latencies.length > 0) {
        const sum = this.latencies.reduce((a, b) => a + b, 0);
        this.avgLatencyMs = parseFloat((sum / this.latencies.length).toFixed(2));
        this.latencies = this.latencies.slice(-500);
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

  getSnapshot() {
    const integrity = this._integrityProvider ? this._integrityProvider() : null;
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
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      integrity,
      timestamp: new Date().toISOString(),
    };
  }
}

export const metricsService = new MetricsService();
