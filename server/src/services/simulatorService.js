import crypto from 'crypto';
import mongoose from 'mongoose';
import { ingestionBuffer } from './ingestionBuffer.js';
import { anomalyEngine } from './anomalyEngine.js';
import { socketService } from './socketService.js';
import { metricsService } from './metricsService.js';
import { corridorService } from './corridorService.js';
import { JUNCTION_GRAPH, JUNCTION_COORDINATES } from '../data/junctionGraph.js';
import { Alert } from '../models/Alert.js';

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
    this.signalPhases = new Map(); // junctionId -> { activeApproachIndex, phaseTimeRemaining }

    // Section 5.7: Persistent Junction State
    this.junctionStates = new Map();
    for (const junc of this.junctions) {
      this.signalPhases.set(junc.junctionId, {
        activeApproachIndex: 0,
        phaseTimeRemaining: junc.baseApproaches[0].greenSplitSec || 35,
      });

      this.junctionStates.set(junc.junctionId, {
        junctionId: junc.junctionId,
        name: junc.name,
        zoneId: junc.zoneId,
        congestionScore: 40,
        highCongestionTicks: 0, // ticks where congestionScore > 75
        activeScenario: null, // { type: 'blockage', road, expiresAt } or { type: 'rush-hour', multiplier, expiresAt }
        spreadPressure: 0, // 0 to 0.40 added by 1-hop neighbours
        remediation: null, // { action: 'extend_green', road, expiresAt }
        signalModeOverride: null, // 'manual-override' | 'dynamic-ai'
        crossZoneAlertSentAt: 0,
      });
    }

    this.tickCount = 0;
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

  // --- Named Scenarios (Section 5.6 & 5.7) ---

  triggerBlockage(junctionId, road = null, durationSec = 35) {
    const state = this.junctionStates.get(junctionId);
    if (!state) return { success: false, error: 'Unknown junction' };

    const junc = this.junctions.find((j) => j.junctionId === junctionId);
    const targetRoad = road || junc?.baseApproaches[0]?.road || 'Arterial Entry';

    state.activeScenario = {
      type: 'blockage',
      road: targetRoad,
      expiresAt: Date.now() + durationSec * 1000,
    };

    console.log(`[TrafficSimulator] Scenario started: Sudden blockage on ${targetRoad} at ${junctionId} for ${durationSec}s`);
    return {
      success: true,
      scenario: 'sudden_blockage',
      junctionId,
      road: targetRoad,
      durationSec,
      message: `Sudden blockage injected on ${targetRoad} at ${junctionId}. Speed collapsing.`,
    };
  }

  triggerRushHour(zoneId = null, multiplier = 1.9, durationSec = 45) {
    const now = Date.now();
    let affectedCount = 0;

    for (const [juncId, state] of this.junctionStates.entries()) {
      if (!zoneId || state.zoneId === zoneId) {
        state.activeScenario = {
          type: 'rush-hour',
          multiplier: parseFloat(multiplier) || 1.9,
          expiresAt: now + durationSec * 1000,
        };
        affectedCount++;
      }
    }

    console.log(`[TrafficSimulator] Scenario started: Rush hour surge in ${zoneId || 'all zones'} (x${multiplier}) for ${durationSec}s`);
    return {
      success: true,
      scenario: 'rush_hour',
      zoneId: zoneId || 'all',
      multiplier,
      durationSec,
      affectedJunctions: affectedCount,
      message: `Rush hour surge active across ${affectedCount} junctions in ${zoneId || 'city'}`,
    };
  }

  clearScenarios(junctionId = null) {
    if (junctionId) {
      const state = this.junctionStates.get(junctionId);
      if (state) state.activeScenario = null;
    } else {
      for (const state of this.junctionStates.values()) {
        state.activeScenario = null;
      }
    }
    return { success: true, message: 'Active scenarios cleared' };
  }

  // Backward-compatible chaos method for simulatorRoutes
  injectChaos(junctionId, metric, multiplier = 2.5, durationSec = 20) {
    if (metric === 'blockage') {
      return this.triggerBlockage(junctionId, null, durationSec);
    }
    const state = this.junctionStates.get(junctionId);
    if (state) {
      state.activeScenario = {
        type: 'chaos',
        metric,
        multiplier,
        expiresAt: Date.now() + durationSec * 1000,
      };
    }
    return { success: true, message: `Chaos active on ${junctionId}` };
  }

  clearChaos(junctionId) {
    const state = this.junctionStates.get(junctionId);
    if (state) {
      state.activeScenario = null;
      state.remediation = null;
    }
  }

  // --- Automatic Remediation & Officer Override Hooks (Section 5.10) ---

  applyRemediationAction(junctionId, action, affectedRoad = null, durationSec = 60) {
    const state = this.junctionStates.get(junctionId);
    if (!state) return false;

    state.remediation = {
      action,
      road: affectedRoad,
      expiresAt: Date.now() + durationSec * 1000,
    };
    state.signalModeOverride = null;

    console.log(`[TrafficSimulator] Remediation applied to ${junctionId}: ${action} for ${durationSec}s`);
    return true;
  }

  overrideSignalMode(junctionId, mode = 'manual-override') {
    const state = this.junctionStates.get(junctionId);
    if (!state) return false;

    state.signalModeOverride = mode;
    if (mode === 'manual-override') {
      // Officer took manual control, pause automated remediations
      state.remediation = null;
    }
    return true;
  }

  // --- Generation Tick & Jam Spreading ---

  generateTick(count = 1) {
    const now = Date.now();
    this.tickCount++;

    // Every 10 ticks (~1 second), evaluate 1-hop jam spreading across the graph (Section 5.7)
    if (this.tickCount % 10 === 0) {
      this.evaluateJamSpreading(now);
    }

    for (let i = 0; i < count; i++) {
      const juncIndex = Math.floor(Math.random() * this.junctions.length);
      const junc = this.junctions[juncIndex];

      const seq = (this.sequenceMap.get(junc.junctionId) || 0) + 1;
      this.sequenceMap.set(junc.junctionId, seq);

      // Compute dynamic traffic data incorporating scenarios, spreading, and corridor preemption
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
          adaptiveSignalMode: trafficData.adaptiveSignalMode,
        },
        status,
        location: junc.location,
      };

      const startT = Date.now();

      // 1. Write-behind ingestion queue
      ingestionBuffer.enqueue(event);

      // 2. Incident detection engine (jam, sudden_blockage, congestion_building)
      anomalyEngine.evaluate(event);

      // 3. Selective broadcast
      socketService.broadcastTelemetry(event);

      const latency = Date.now() - startT;
      metricsService.recordIngest(1, latency);
    }
  }

  // Section 5.7: Jam spreading to 1-hop neighbours
  evaluateJamSpreading(now) {
    // Reset spread pressure base
    const spreadPressures = new Map();

    for (const [juncId, state] of this.junctionStates.entries()) {
      const isBlockage = state.activeScenario?.type === 'blockage' && state.activeScenario.expiresAt > now;
      const isSevereCongestion = state.congestionScore > 75;

      if (isBlockage || isSevereCongestion) {
        state.highCongestionTicks += 10;
      } else {
        state.highCongestionTicks = Math.max(0, state.highCongestionTicks - 5);
      }

      // If jam sustained for > 10 seconds (100 ticks), spread to 1-hop neighbours
      if (state.highCongestionTicks >= 100 || isBlockage) {
        const neighbours = JUNCTION_GRAPH[juncId] || [];
        const intensity = isBlockage ? 0.35 : Math.min(0.35, ((state.congestionScore - 70) / 30) * 0.35);

        for (const nbrId of neighbours) {
          const current = spreadPressures.get(nbrId) || 0;
          spreadPressures.set(nbrId, Math.max(current, intensity));

          // Cross-zone alert check: if neighbour is in a different zone
          const nbrState = this.junctionStates.get(nbrId);
          if (nbrState && nbrState.zoneId !== state.zoneId) {
            if (now - nbrState.crossZoneAlertSentAt > 45000) {
              nbrState.crossZoneAlertSentAt = now;
              this.emitCrossZoneAlert(state, nbrState);
            }
          }
        }
      }
    }

    // Apply calculated spread pressure to all junction states
    for (const [juncId, state] of this.junctionStates.entries()) {
      const targetPressure = spreadPressures.get(juncId) || 0;
      // Smooth gradual adjustment
      state.spreadPressure = parseFloat((state.spreadPressure * 0.7 + targetPressure * 0.3).toFixed(2));
    }
  }

  async emitCrossZoneAlert(sourceState, neighbourState) {
    const alertDoc = {
      alertId: `ALT-XZ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      junctionId: neighbourState.junctionId,
      deviceId: neighbourState.junctionId,
      deviceName: neighbourState.name,
      zoneId: neighbourState.zoneId,
      category: neighbourState.zoneId,
      severity: 'info',
      title: 'Cross-Zone Congestion Spillover',
      message: `Congestion from ${sourceState.name} (${sourceState.zoneId}) is spreading into ${neighbourState.name} (${neighbourState.zoneId}). Inflow queue building.`,
      metric: 'congestion_spillover',
      triggerValue: sourceState.congestionScore,
      thresholdValue: 75,
      timestamp: new Date(),
      resolved: false,
      cause: 'congestion_spillover',
      causeSource: 'system',
      affectedRoad: null,
      status: 'open',
    };

    try {
      if (mongoose.connection?.readyState === 1) {
        await Alert.create(alertDoc);
      }
      if (socketService?.io) {
        socketService.broadcastAlert(alertDoc);
      }
      console.log(`[TrafficSimulator] Cross-zone alert emitted: ${alertDoc.message}`);
    } catch (err) {
      console.error('[TrafficSimulator] Cross-zone alert emit error:', err.message);
    }
  }

  computeTrafficData(junc, now) {
    const state = this.junctionStates.get(junc.junctionId);
    const inCorridor = corridorService.isJunctionInCorridor(junc.junctionId);

    // Active scenario check
    const scenario = state?.activeScenario;
    const hasScenario = scenario && scenario.expiresAt > now;

    // Active remediation check (Section 5.10)
    const remediation = state?.remediation;
    const hasRemediation = remediation && remediation.expiresAt > now;

    // Advance signal cycle
    let phase = this.signalPhases.get(junc.junctionId);
    if (!phase) {
      phase = { activeApproachIndex: 0, phaseTimeRemaining: 35 };
      this.signalPhases.set(junc.junctionId, phase);
    }

    if (!inCorridor) {
      phase.phaseTimeRemaining -= 0.5;
      if (phase.phaseTimeRemaining <= 0) {
        phase.activeApproachIndex = (phase.activeApproachIndex + 1) % junc.baseApproaches.length;
        const nextApproach = junc.baseApproaches[phase.activeApproachIndex];
        // If extend_green remediation is active on this approach, extend duration
        let splitSec = nextApproach.greenSplitSec || 35;
        if (hasRemediation && remediation.action === 'extend_green') {
          splitSec += 25;
        }
        phase.phaseTimeRemaining = splitSec;
      }
    } else {
      // Emergency corridor: hold arrival arterial on green
      phase.activeApproachIndex = 0;
    }

    let totalFlow = 0;
    let maxQueue = 0;
    let sumSpeed = 0;

    const approaches = junc.baseApproaches.map((app, idx) => {
      let isGreen = idx === phase.activeApproachIndex;
      if (inCorridor) {
        isGreen = idx === 0;
      }
      const signalState = isGreen ? 'green' : 'red';

      // Vehicles per minute fluctuates naturally +/- 12%
      const jitterFactor = 1 + (Math.random() - 0.5) * 0.15;
      let vehiclesPerMin = Math.round(app.baseVehiclesPerMin * jitterFactor);

      // Queue and speed dynamics
      let queueLengthM = app.baseQueueM;
      let avgSpeedKmph = app.baseSpeed;

      if (inCorridor) {
        if (isGreen) {
          queueLengthM = Math.max(10, Math.round(app.baseQueueM * 0.3 * jitterFactor));
          avgSpeedKmph = Math.max(38, Math.round(app.baseSpeed * 2.2));
        } else {
          queueLengthM = Math.min(320, Math.round(app.baseQueueM * 1.25 * jitterFactor));
          avgSpeedKmph = Math.max(4, Math.round(app.baseSpeed * 0.6));
        }
      } else if (isGreen) {
        queueLengthM = Math.max(15, Math.round(app.baseQueueM * 0.45 * jitterFactor));
        avgSpeedKmph = Math.max(16, Math.round(app.baseSpeed * 1.6 * jitterFactor));
      } else {
        queueLengthM = Math.min(320, Math.round(app.baseQueueM * 1.15 * jitterFactor));
        avgSpeedKmph = Math.max(3, Math.round(app.baseSpeed * 0.75 * jitterFactor));
      }

      // Apply 1-hop neighbour congestion spreading (Section 5.7)
      if (state && state.spreadPressure > 0) {
        queueLengthM = Math.round(queueLengthM * (1 + state.spreadPressure));
        avgSpeedKmph = Math.max(3, Math.round(avgSpeedKmph * (1 - state.spreadPressure * 0.5)));
      }

      // Apply Scenarios
      if (hasScenario) {
        if (scenario.type === 'blockage') {
          // If this is the blocked road (or default first approach if road matches or unspecified)
          if (!scenario.road || app.road.toLowerCase().includes(scenario.road.toLowerCase()) || idx === 0) {
            avgSpeedKmph = 2; // velocity collapse
            queueLengthM = Math.min(350, Math.round(app.baseQueueM * 2.1));
            vehiclesPerMin = Math.round(vehiclesPerMin * 0.4); // choked inflow
          }
        } else if (scenario.type === 'rush-hour') {
          vehiclesPerMin = Math.round(vehiclesPerMin * scenario.multiplier);
          queueLengthM = Math.min(340, Math.round(queueLengthM * 1.45));
          avgSpeedKmph = Math.max(4, Math.round(avgSpeedKmph * 0.7));
        }
      }

      // Apply Remediation Effects (Section 5.10 - actions actually change the traffic!)
      if (hasRemediation) {
        if (remediation.action === 'extend_green') {
          // Extra green time: drains queue faster, speeds up traffic
          queueLengthM = Math.max(20, Math.round(queueLengthM * 0.5));
          avgSpeedKmph = Math.min(35, Math.round(avgSpeedKmph * 1.5));
        } else if (remediation.action === 'divert') {
          // Diversion notice: reduces incoming traffic on that arterial
          vehiclesPerMin = Math.round(vehiclesPerMin * 0.55);
          queueLengthM = Math.max(25, Math.round(queueLengthM * 0.6));
        } else if (remediation.action === 'hold_upstream') {
          vehiclesPerMin = Math.round(vehiclesPerMin * 0.65);
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
    const queueFactor = Math.min(100, (maxQueue / 220) * 60);
    const speedFactor = Math.max(0, (1 - avgSpeed / 30) * 40);
    let congestionScore = Math.min(100, Math.round(queueFactor + speedFactor));

    // Update persistent state's congestion score
    if (state) {
      state.congestionScore = congestionScore;
    }

    let adaptiveSignalMode = inCorridor ? 'emergency-corridor' : 'dynamic-ai';
    if (state?.signalModeOverride) {
      adaptiveSignalMode = state.signalModeOverride;
    }

    const vm = junc.vehicleMix;

    return {
      approaches,
      adaptiveSignalMode,
      inCorridor,
      vehicleMix: {
        twoWheeler: parseFloat((vm.twoWheeler + (Math.random() - 0.5) * 0.02).toFixed(2)),
        car: parseFloat((vm.car + (Math.random() - 0.5) * 0.02).toFixed(2)),
        bus: parseFloat((vm.bus + (Math.random() - 0.5) * 0.01).toFixed(2)),
        truck: parseFloat((vm.truck + (Math.random() - 0.5) * 0.01).toFixed(2)),
      },
      totalFlowVehiclesPerMin: totalFlow,
      maxQueueLengthM: maxQueue,
      avgSpeedKmph: avgSpeed,
      congestionScore,
      cameraProcessingLatencyMs: Math.round(10 + Math.random() * 8),
    };
  }

  determineStatus(trafficData) {
    if (trafficData.congestionScore >= 88 || trafficData.maxQueueLengthM >= 210 || trafficData.avgSpeedKmph <= 4) {
      return 'gridlock';
    }
    if (trafficData.congestionScore >= 70 || trafficData.maxQueueLengthM >= 140 || trafficData.avgSpeedKmph <= 10) {
      return 'congested';
    }
    if (trafficData.congestionScore >= 50 || trafficData.maxQueueLengthM >= 90) {
      return 'warning';
    }
    return 'healthy';
  }

  getStatus() {
    const activeScenarios = Array.from(this.junctionStates.values())
      .filter((s) => s.activeScenario && s.activeScenario.expiresAt > Date.now())
      .map((s) => ({
        junctionId: s.junctionId,
        scenario: s.activeScenario.type,
        expiresAt: s.activeScenario.expiresAt,
      }));

    return {
      isRunning: this.isRunning,
      targetRate: this.targetRate,
      deviceCount: this.junctions.length,
      junctionCount: this.junctions.length,
      activeScenarios,
    };
  }
}

export const simulatorService = new SimulatorService();
