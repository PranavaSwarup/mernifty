import crypto from 'crypto';
import { ingestionBuffer } from './ingestionBuffer.js';
import { anomalyEngine } from './anomalyEngine.js';
import { socketService } from './socketService.js';
import { metricsService } from './metricsService.js';

// Predefined Bengaluru Smart City Traffic Junctions
export const INITIAL_DEVICES = [
  // 1. South Bengaluru Zone
  {
    junctionId: 'JNC-BLR-001',
    deviceId: 'JNC-BLR-001',
    name: 'Silk Board Junction (Hosur Rd & ORR)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (BTM / HSR / Electronic City)',
    location: { latitude: 12.9172, longitude: 77.6228, label: 'Central Silk Board Interchange' },
    baseApproaches: [
      { road: 'Hosur Rd (from south)', baseVehiclesPerMin: 42, baseQueueM: 160, baseSpeed: 7, greenSplitSec: 45 },
      { road: 'ORR (from east)', baseVehiclesPerMin: 55, baseQueueM: 70, baseSpeed: 21, greenSplitSec: 50 },
      { road: 'Hosur Rd (from north)', baseVehiclesPerMin: 32, baseQueueM: 95, baseSpeed: 14, greenSplitSec: 35 },
      { road: 'BTM Rd (from west)', baseVehiclesPerMin: 24, baseQueueM: 50, baseSpeed: 18, greenSplitSec: 30 },
    ],
    vehicleMix: { twoWheeler: 0.55, car: 0.30, bus: 0.05, truck: 0.10 },
  },
  {
    junctionId: 'JNC-BLR-002',
    deviceId: 'JNC-BLR-002',
    name: 'Sony World Signal (Koramangala 80ft & 100ft)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (Koramangala Tech Corridor)',
    location: { latitude: 12.9345, longitude: 77.6265, label: 'Sony World Signal, 4th Block' },
    baseApproaches: [
      { road: '80ft Rd (from north)', baseVehiclesPerMin: 28, baseQueueM: 65, baseSpeed: 19, greenSplitSec: 30 },
      { road: '100ft Rd (from east)', baseVehiclesPerMin: 36, baseQueueM: 80, baseSpeed: 15, greenSplitSec: 35 },
      { road: '80ft Rd (from south)', baseVehiclesPerMin: 22, baseQueueM: 45, baseSpeed: 22, greenSplitSec: 25 },
      { road: 'Sony World Jn (from west)', baseVehiclesPerMin: 20, baseQueueM: 40, baseSpeed: 24, greenSplitSec: 25 },
    ],
    vehicleMix: { twoWheeler: 0.58, car: 0.32, bus: 0.04, truck: 0.06 },
  },
  {
    junctionId: 'JNC-BLR-003',
    deviceId: 'JNC-BLR-003',
    name: 'Dairy Circle (Bannerghatta & Hosur Rd)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (Adugodi / Wilson Garden)',
    location: { latitude: 12.9372, longitude: 77.5985, label: 'Dairy Circle Flyover' },
    baseApproaches: [
      { road: 'Bannerghatta Rd (from south)', baseVehiclesPerMin: 35, baseQueueM: 110, baseSpeed: 12, greenSplitSec: 35 },
      { road: 'Hosur Rd (from east)', baseVehiclesPerMin: 30, baseQueueM: 85, baseSpeed: 16, greenSplitSec: 30 },
      { road: 'Dr. Marigowda Rd (from north)', baseVehiclesPerMin: 26, baseQueueM: 70, baseSpeed: 18, greenSplitSec: 30 },
      { road: 'Wilson Garden (from west)', baseVehiclesPerMin: 18, baseQueueM: 35, baseSpeed: 25, greenSplitSec: 20 },
    ],
    vehicleMix: { twoWheeler: 0.52, car: 0.33, bus: 0.08, truck: 0.07 },
  },
  {
    junctionId: 'JNC-BLR-004',
    deviceId: 'JNC-BLR-004',
    name: 'Jayadeva Underpass (Bannerghatta & ORR)',
    zoneId: 'south-bangalore',
    zoneName: 'South Bengaluru Zone',
    category: 'south-bangalore',
    region: 'Bengaluru South (Jayanagar / BTM)',
    location: { latitude: 12.9180, longitude: 77.5970, label: 'Jayadeva Multi-Tier Interchange' },
    baseApproaches: [
      { road: 'Bannerghatta Rd (from south)', baseVehiclesPerMin: 38, baseQueueM: 120, baseSpeed: 10, greenSplitSec: 40 },
      { road: 'ORR (from east)', baseVehiclesPerMin: 44, baseQueueM: 90, baseSpeed: 16, greenSplitSec: 40 },
      { road: 'Bannerghatta Rd (from north)', baseVehiclesPerMin: 28, baseQueueM: 65, baseSpeed: 20, greenSplitSec: 30 },
      { road: 'ORR (from west)', baseVehiclesPerMin: 32, baseQueueM: 80, baseSpeed: 17, greenSplitSec: 30 },
    ],
    vehicleMix: { twoWheeler: 0.50, car: 0.35, bus: 0.07, truck: 0.08 },
  },

  // 2. East Bengaluru Zone
  {
    junctionId: 'JNC-BLR-005',
    deviceId: 'JNC-BLR-005',
    name: 'Bellandur EcoSpace Junction (Outer Ring Rd)',
    zoneId: 'east-bangalore',
    zoneName: 'East Bengaluru Zone',
    category: 'east-bangalore',
    region: 'Bengaluru East (ORR IT Corridor / Sarjapur)',
    location: { latitude: 12.9260, longitude: 77.6762, label: 'EcoSpace Business Park Service Road' },
    baseApproaches: [
      { road: 'ORR (from south)', baseVehiclesPerMin: 48, baseQueueM: 145, baseSpeed: 9, greenSplitSec: 45 },
      { road: 'EcoSpace Campus (from east)', baseVehiclesPerMin: 24, baseQueueM: 55, baseSpeed: 15, greenSplitSec: 25 },
      { road: 'ORR (from north)', baseVehiclesPerMin: 46, baseQueueM: 130, baseSpeed: 11, greenSplitSec: 40 },
      { road: 'Green Glen Rd (from west)', baseVehiclesPerMin: 16, baseQueueM: 35, baseSpeed: 22, greenSplitSec: 20 },
    ],
    vehicleMix: { twoWheeler: 0.48, car: 0.40, bus: 0.07, truck: 0.05 },
  },
  {
    junctionId: 'JNC-BLR-006',
    deviceId: 'JNC-BLR-006',
    name: 'Tin Factory / KR Puram Hanging Bridge',
    zoneId: 'east-bangalore',
    zoneName: 'East Bengaluru Zone',
    category: 'east-bangalore',
    region: 'Bengaluru East (Old Madras Rd / KR Puram)',
    location: { latitude: 12.9982, longitude: 77.6695, label: 'KR Puram Cable Stayed Bridge' },
    baseApproaches: [
      { road: 'Old Madras Rd (from east)', baseVehiclesPerMin: 52, baseQueueM: 175, baseSpeed: 7, greenSplitSec: 50 },
      { road: 'Whitefield Rd (from south)', baseVehiclesPerMin: 38, baseQueueM: 115, baseSpeed: 12, greenSplitSec: 35 },
      { road: 'ORR (from north)', baseVehiclesPerMin: 40, baseQueueM: 100, baseSpeed: 14, greenSplitSec: 35 },
      { road: 'Swami Vivekananda Rd (from west)', baseVehiclesPerMin: 34, baseQueueM: 85, baseSpeed: 16, greenSplitSec: 30 },
    ],
    vehicleMix: { twoWheeler: 0.54, car: 0.28, bus: 0.08, truck: 0.10 },
  },
  {
    junctionId: 'JNC-BLR-007',
    deviceId: 'JNC-BLR-007',
    name: 'Marathahalli Bridge Junction (ORR & Airport Rd)',
    zoneId: 'east-bangalore',
    zoneName: 'East Bengaluru Zone',
    category: 'east-bangalore',
    region: 'Bengaluru East (Marathahalli / HAL Airport Rd)',
    location: { latitude: 12.9562, longitude: 77.7011, label: 'Marathahalli Multiplex Junction' },
    baseApproaches: [
      { road: 'Varthur Rd (from east)', baseVehiclesPerMin: 36, baseQueueM: 95, baseSpeed: 14, greenSplitSec: 35 },
      { road: 'ORR (from south)', baseVehiclesPerMin: 42, baseQueueM: 110, baseSpeed: 12, greenSplitSec: 40 },
      { road: 'HAL Airport Rd (from west)', baseVehiclesPerMin: 38, baseQueueM: 90, baseSpeed: 15, greenSplitSec: 35 },
      { road: 'ORR (from north)', baseVehiclesPerMin: 44, baseQueueM: 115, baseSpeed: 13, greenSplitSec: 40 },
    ],
    vehicleMix: { twoWheeler: 0.52, car: 0.34, bus: 0.06, truck: 0.08 },
  },

  // 3. North Bengaluru Zone
  {
    junctionId: 'JNC-BLR-008',
    deviceId: 'JNC-BLR-008',
    name: 'Hebbal Flyover Junction (Bellary Rd & ORR)',
    zoneId: 'north-bangalore',
    zoneName: 'North Bengaluru Zone',
    category: 'north-bangalore',
    region: 'Bengaluru North (Airport Corridor & Manyata)',
    location: { latitude: 13.0358, longitude: 77.5970, label: 'Hebbal Lake Rotary' },
    baseApproaches: [
      { road: 'Bellary Rd (from north)', baseVehiclesPerMin: 50, baseQueueM: 140, baseSpeed: 18, greenSplitSec: 50 },
      { road: 'ORR (from east)', baseVehiclesPerMin: 45, baseQueueM: 120, baseSpeed: 15, greenSplitSec: 40 },
      { road: 'Bellary Rd (from south)', baseVehiclesPerMin: 48, baseQueueM: 130, baseSpeed: 14, greenSplitSec: 45 },
      { road: 'ORR (from west)', baseVehiclesPerMin: 30, baseQueueM: 75, baseSpeed: 20, greenSplitSec: 30 },
    ],
    vehicleMix: { twoWheeler: 0.45, car: 0.42, bus: 0.06, truck: 0.07 },
  },
  {
    junctionId: 'JNC-BLR-009',
    deviceId: 'JNC-BLR-009',
    name: 'Goraguntepalya Junction (Tumkur Rd & Ring Rd)',
    zoneId: 'north-bangalore',
    zoneName: 'North Bengaluru Zone',
    category: 'north-bangalore',
    region: 'Bengaluru North (Peenya Industrial / Yeshwanthpur)',
    location: { latitude: 13.0285, longitude: 77.5408, label: 'Goraguntepalya Metro Interchange' },
    baseApproaches: [
      { road: 'Tumkur Rd NH48 (from north)', baseVehiclesPerMin: 46, baseQueueM: 150, baseSpeed: 11, greenSplitSec: 45 },
      { road: 'Ring Rd (from east)', baseVehiclesPerMin: 32, baseQueueM: 85, baseSpeed: 16, greenSplitSec: 35 },
      { road: 'Peenya Industrial (from west)', baseVehiclesPerMin: 28, baseQueueM: 75, baseSpeed: 17, greenSplitSec: 30 },
      { road: 'Subrahmanyanagar (from south)', baseVehiclesPerMin: 22, baseQueueM: 50, baseSpeed: 21, greenSplitSec: 25 },
    ],
    vehicleMix: { twoWheeler: 0.50, car: 0.22, bus: 0.08, truck: 0.20 },
  },
  {
    junctionId: 'JNC-BLR-010',
    deviceId: 'JNC-BLR-010',
    name: 'Mekhri Circle Underpass (Bellary Rd & CV Raman)',
    zoneId: 'north-bangalore',
    zoneName: 'North Bengaluru Zone',
    category: 'north-bangalore',
    region: 'Bengaluru North (Sadashivanagar / Palace Grounds)',
    location: { latitude: 13.0076, longitude: 77.5835, label: 'Mekhri Circle Grade Separator' },
    baseApproaches: [
      { road: 'Bellary Rd (from north)', baseVehiclesPerMin: 40, baseQueueM: 90, baseSpeed: 22, greenSplitSec: 40 },
      { road: 'Jayamahal Rd (from east)', baseVehiclesPerMin: 24, baseQueueM: 50, baseSpeed: 24, greenSplitSec: 25 },
      { road: 'Sadashivanagar (from south)', baseVehiclesPerMin: 36, baseQueueM: 80, baseSpeed: 20, greenSplitSec: 35 },
      { road: 'CV Raman Rd (from west)', baseVehiclesPerMin: 30, baseQueueM: 65, baseSpeed: 23, greenSplitSec: 30 },
    ],
    vehicleMix: { twoWheeler: 0.52, car: 0.38, bus: 0.05, truck: 0.05 },
  },

  // 4. Central & West Bengaluru Zones
  {
    junctionId: 'JNC-BLR-011',
    deviceId: 'JNC-BLR-011',
    name: 'Richmond Circle Flyover (Hosur & Residency Rd)',
    zoneId: 'central-bangalore',
    zoneName: 'Central Bengaluru Zone',
    category: 'central-bangalore',
    region: 'Bengaluru Central (MG Road / Brigade / Shanthala Nagar)',
    location: { latitude: 12.9667, longitude: 77.6006, label: 'Richmond Circle Flyover Complex' },
    baseApproaches: [
      { road: 'Residency Rd (from north)', baseVehiclesPerMin: 36, baseQueueM: 85, baseSpeed: 16, greenSplitSec: 35 },
      { road: 'Richmond Rd (from east)', baseVehiclesPerMin: 30, baseQueueM: 70, baseSpeed: 18, greenSplitSec: 30 },
      { road: 'Hosur Rd (from south)', baseVehiclesPerMin: 34, baseQueueM: 80, baseSpeed: 17, greenSplitSec: 30 },
      { road: 'Mission Rd (from west)', baseVehiclesPerMin: 22, baseQueueM: 50, baseSpeed: 20, greenSplitSec: 25 },
    ],
    vehicleMix: { twoWheeler: 0.56, car: 0.34, bus: 0.06, truck: 0.04 },
  },
  {
    junctionId: 'JNC-BLR-012',
    deviceId: 'JNC-BLR-012',
    name: 'Town Hall / Corporation Circle (KG & JC Rd)',
    zoneId: 'central-bangalore',
    zoneName: 'Central Bengaluru Zone',
    category: 'central-bangalore',
    region: 'Bengaluru Central (Majestic / Kalasipalya / KR Market)',
    location: { latitude: 12.9634, longitude: 77.5855, label: 'Town Hall Traffic Island' },
    baseApproaches: [
      { road: 'KG Road (from north)', baseVehiclesPerMin: 38, baseQueueM: 95, baseSpeed: 14, greenSplitSec: 35 },
      { road: 'Kasturba Rd (from east)', baseVehiclesPerMin: 30, baseQueueM: 70, baseSpeed: 17, greenSplitSec: 30 },
      { road: 'JC Road (from south)', baseVehiclesPerMin: 40, baseQueueM: 105, baseSpeed: 13, greenSplitSec: 35 },
      { road: 'NR Road (from west)', baseVehiclesPerMin: 28, baseQueueM: 65, baseSpeed: 18, greenSplitSec: 25 },
    ],
    vehicleMix: { twoWheeler: 0.60, car: 0.25, bus: 0.09, truck: 0.06 },
  },
];

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
