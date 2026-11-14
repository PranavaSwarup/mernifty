class MetricsService {
  constructor() {
    this.totalIngested = 0;
    this.totalBroadcasted = 0;
    this.totalPersisted = 0;
    this.totalDropped = 0;

    // Three separate counters required by Section 5.5 & 5.8:
    this.totalRejected = 0; // Invalid payload schema / range check failures
    this.totalDuplicates = 0; // Seen eventId duplicates dropped
    this.totalBackpressureRefused = 0; // Refused when buffer >= 10,000

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

    // Calculate rates every 1 second
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
        this.latencies = this.latencies.slice(-500); // keep recent sample
      }
    }, 1000);
    if (this.rateInterval.unref) this.rateInterval.unref();
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

  recordRejected(count = 1) {
    this.totalRejected += count;
    this.totalDropped += count;
  }

  recordDuplicate(count = 1) {
    this.totalDuplicates += count;
    this.totalDropped += count;
  }

  recordBackpressure(count = 1) {
    this.totalBackpressureRefused += count;
    this.totalDropped += count;
  }

  setConnectedSockets(count) {
    this.connectedSockets = count;
  }

  setBufferSize(size) {
    this.bufferSize = size;
  }

  getSnapshot() {
    return {
      totalIngested: this.totalIngested,
      totalBroadcasted: this.totalBroadcasted,
      totalPersisted: this.totalPersisted,
      totalDropped: this.totalDropped,
      totalRejected: this.totalRejected,
      totalDuplicates: this.totalDuplicates,
      totalBackpressureRefused: this.totalBackpressureRefused,
      ingestRate: this.ingestRate,
      broadcastRate: this.broadcastRate,
      persistRate: this.persistRate,
      peakIngestRate: this.peakIngestRate,
      avgLatencyMs: this.avgLatencyMs,
      connectedSockets: this.connectedSockets,
      bufferSize: this.bufferSize,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}

export const metricsService = new MetricsService();
