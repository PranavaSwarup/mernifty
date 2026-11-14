import crypto from 'crypto';
import { ingestionBuffer } from './ingestionBuffer.js';
import { anomalyEngine } from './anomalyEngine.js';
import { socketService } from './socketService.js';
import { metricsService } from './metricsService.js';
import { INITIAL_DEVICES } from '../sim/junctions.data.js';

export { INITIAL_DEVICES };

class SimulatorService {
  constructor() {
    this.junctions = JSON.parse(JSON.stringify(INITIAL_DEVICES));
    this.devices = this.junctions; // compatibility alias
    this.isRunning = false;
    this.intervalId = null;
    this.targetRate = 12; // events per second
    this.sequenceMap = new Map();
    this.chaosSpikes = new Map(); // junctionId -> { metric, multiplier, expiresAt, stalled, ambulance }
    this.signalPhases = new Map(); // junctionId -> { activeApproachIndex, phaseTimeRemaining }

    // Initialize signal phase timers
    for (const junc of this.junctions) {
      this.signalPhases.set(junc.junctionId, {
        activeApproachIndex: 0,
        phaseTimeRemaining: junc.baseApproaches[0].greenSplitSec || 35,
      });
    }
  }

  start(rate = 12) {
    if (this.isRunning) {
      this.stop();
    }
    this.targetRate = Math.max(1, Math.min(2000, rate));
    this.isRunning = true;

    const tickMs = 100;
    const eventsPerTick = Math.max(1, Math.round((this.targetRate * tickMs) / 1000));

    this.intervalId = setInterval(() => {
      this.generateTick(eventsPerTick);
    }, tickMs);

    console.log(
      `[TrafficSimulator] Active. Target: ${this.targetRate} events/sec (${eventsPerTick} events every ${tickMs}ms across 12 BLR junctions).`
    );
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[TrafficSimulator] Stopped.');
  }

  setRate(rate) {
    this.start(rate);
  }

  injectChaos(junctionId, metric, multiplier = 2.5, durationSec = 20, flags = {}) {
    this.chaosSpikes.set(junctionId, {
      metric,
      multiplier,
      expiresAt: Date.now() + durationSec * 1000,
      stalled: Boolean(flags.stalled),
      ambulance: Boolean(flags.ambulance),
    });
    console.log(`[TrafficSimulator] Injected traffic chaos on ${junctionId}: ${metric} x${multiplier} for ${durationSec}s`);
    return {
      success: true,
      message: `Chaos active: ${metric} spike on ${junctionId} for ${durationSec}s`,
    };
  }

  clearChaos(junctionId) {
    this.chaosSpikes.delete(junctionId);
  }

  generateTick(count = 1) {
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      // Pick junction round-robin or randomly
      const juncIndex = Math.floor(Math.random() * this.junctions.length);
      const junc = this.junctions[juncIndex];

      const seq = (this.sequenceMap.get(junc.junctionId) || 0) + 1;
      this.sequenceMap.set(junc.junctionId, seq);

      // Compute dynamic traffic data
      const trafficData = this.computeTrafficData(junc, now);

      const status = this.determineStatus(trafficData);

      const event = {
        eventId: `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        junctionId: junc.junctionId,
        deviceId: junc.junctionId,
        deviceName: junc.name,
        junctionName: junc.name,
        zoneId: junc.zoneId,
        zoneName: junc.zoneName,
        category: junc.zoneId,
        timestamp: new Date().toISOString(),
        sequence: seq,
        data: trafficData,
        metrics: {
          totalFlowVehiclesPerMin: trafficData.totalFlowVehiclesPerMin,
          maxQueueLengthM: trafficData.maxQueueLengthM,
          avgSpeedKmph: trafficData.avgSpeedKmph,
          congestionScore: trafficData.congestionScore,
          stalledVehicleDetected: trafficData.stalledVehicleDetected,
          ambulanceDetected: trafficData.ambulanceDetected,
        },
        status,
        location: junc.location,
      };

      const startT = Date.now();

      // 1. Write-behind ingestion queue
      ingestionBuffer.enqueue(event);

      // 2. Real-time traffic anomaly & gridlock detector
      anomalyEngine.evaluate(event);

      // 3. Low-latency Socket.IO broadcast
      socketService.broadcastTelemetry(event);

      const latency = Date.now() - startT;
      metricsService.recordIngest(1, latency);
    }
  }

  computeTrafficData(junc, now) {
    const chaos = this.chaosSpikes.get(junc.junctionId);
    const hasActiveChaos = chaos && chaos.expiresAt > now;

    // Advance signal cycle for this junction
    let phase = this.signalPhases.get(junc.junctionId);
    if (!phase) {
      phase = { activeApproachIndex: 0, phaseTimeRemaining: 35 };
      this.signalPhases.set(junc.junctionId, phase);
    }

    // Step cycle down
    phase.phaseTimeRemaining -= 0.5;
    if (phase.phaseTimeRemaining <= 0) {
      phase.activeApproachIndex = (phase.activeApproachIndex + 1) % junc.baseApproaches.length;
      const nextApproach = junc.baseApproaches[phase.activeApproachIndex];
      phase.phaseTimeRemaining = nextApproach.greenSplitSec || 35;
    }

    // Generate approaches
    let totalFlow = 0;
    let maxQueue = 0;
    let sumSpeed = 0;

    const approaches = junc.baseApproaches.map((app, idx) => {
      const isGreen = idx === phase.activeApproachIndex;
      const signalState = isGreen ? 'green' : 'red';

      // Vehicles per minute fluctuates naturally +/- 15%
      const jitterFactor = 1 + (Math.random() - 0.5) * 0.2;
      let vehiclesPerMin = Math.round(app.baseVehiclesPerMin * jitterFactor);

      // Queue length: shrinks on green, accumulates on red
      let queueLengthM = isGreen
        ? Math.max(15, Math.round(app.baseQueueM * 0.45 * jitterFactor))
        : Math.min(320, Math.round(app.baseQueueM * 1.15 * jitterFactor));

      // Speed: higher on green, slower on red
      let avgSpeedKmph = isGreen
        ? Math.max(16, Math.round(app.baseSpeed * 1.6 * jitterFactor))
        : Math.max(3, Math.round(app.baseSpeed * 0.75 * jitterFactor));

      // Apply chaos spike if active
      if (hasActiveChaos) {
        if (chaos.metric === 'queueLengthM' || chaos.metric === 'congestion') {
          queueLengthM = Math.min(350, Math.round(queueLengthM * chaos.multiplier));
          avgSpeedKmph = Math.max(2, Math.round(avgSpeedKmph / chaos.multiplier));
          vehiclesPerMin = Math.round(vehiclesPerMin * 1.4);
        } else if (chaos.metric === 'vehiclesPerMin') {
          vehiclesPerMin = Math.round(vehiclesPerMin * chaos.multiplier);
        }
      }

      totalFlow += vehiclesPerMin;
      if (queueLengthM > maxQueue) maxQueue = queueLengthM;
      sumSpeed += avgSpeedKmph;

      return {
        road: app.road,
        vehiclesPerMin,
        queueLengthM,
        avgSpeedKmph,
        signal: signalState,
        greenTimeSec: app.greenSplitSec,
      };
    });

    const avgSpeed = parseFloat((sumSpeed / approaches.length).toFixed(1));

    // Calculate composite Congestion Score (0 to 100)
    // Weighted by maxQueueLength and low speed
    const queueFactor = Math.min(100, (maxQueue / 220) * 60);
    const speedFactor = Math.max(0, (1 - avgSpeed / 30) * 40);
    let congestionScore = Math.min(100, Math.round(queueFactor + speedFactor));

    let stalledVehicle = hasActiveChaos && chaos.stalled ? true : false;
    let ambulance = hasActiveChaos && chaos.ambulance ? true : false;

    // Natural random rare occurrence if no chaos (0.2% chance)
    if (!hasActiveChaos) {
      if (Math.random() < 0.001) stalledVehicle = true;
      if (Math.random() < 0.001) ambulance = true;
    }

    // Vehicle mix with subtle fluctuations
    const vm = junc.vehicleMix;

    return {
      approaches,
      vehicleMix: {
        twoWheeler: parseFloat((vm.twoWheeler + (Math.random() - 0.5) * 0.02).toFixed(2)),
        car: parseFloat((vm.car + (Math.random() - 0.5) * 0.02).toFixed(2)),
        bus: parseFloat((vm.bus + (Math.random() - 0.5) * 0.01).toFixed(2)),
        truck: parseFloat((vm.truck + (Math.random() - 0.5) * 0.01).toFixed(2)),
      },
      stalledVehicleDetected: stalledVehicle,
      ambulanceDetected: ambulance,
      totalFlowVehiclesPerMin: totalFlow,
      maxQueueLengthM: maxQueue,
      avgSpeedKmph: avgSpeed,
      congestionScore,
      cameraProcessingLatencyMs: Math.round(10 + Math.random() * 8), // 10-18ms GPU Central DC latency
    };
  }

  determineStatus(trafficData) {
    if (trafficData.stalledVehicleDetected || trafficData.ambulanceDetected) {
      return 'critical';
    }
    if (trafficData.maxQueueLengthM > 180 || trafficData.avgSpeedKmph < 7) {
      return 'gridlock';
    }
    if (trafficData.maxQueueLengthM > 120 || trafficData.avgSpeedKmph < 12) {
      return 'congested';
    }
    if (trafficData.maxQueueLengthM > 85) {
      return 'warning';
    }
    return 'healthy';
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      targetRate: this.targetRate,
      deviceCount: this.junctions.length,
      junctionCount: this.junctions.length,
      activeChaosCount: Array.from(this.chaosSpikes.values()).filter((c) => c.expiresAt > Date.now()).length,
    };
  }
}

export const simulatorService = new SimulatorService();
