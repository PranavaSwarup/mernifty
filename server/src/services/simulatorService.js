import crypto from 'crypto';
import mongoose from 'mongoose';
import { ingestionBuffer } from './ingestionBuffer.js';
import { anomalyEngine } from './anomalyEngine.js';
import { socketService } from './socketService.js';
import { metricsService } from './metricsService.js';
import { corridorService } from './corridorService.js';
import { JUNCTION_GRAPH, JUNCTION_COORDINATES } from '../data/junctionGraph.js';
import { Alert } from '../models/Alert.js';
import { getHourVolumeMultiplier } from '../utils/seedHistory.js';
import { INITIAL_DEVICES } from '../data/junctionDevices.js';
export { INITIAL_DEVICES } from '../data/junctionDevices.js';

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

    // Section 5.13: Simulation Clock & Time-of-Day Profile
    this.clockSpeed = 1; // 1x, 60x, 144x
    this.realEpoch = Date.now();
    this.simulatedEpoch = Date.now();
  }

  getSimulatedTime(realNow = Date.now()) {
    const elapsedRealMs = realNow - this.realEpoch;
    const simulatedMs = this.simulatedEpoch + elapsedRealMs * this.clockSpeed;
    return new Date(simulatedMs);
  }

  setClockSpeed(speed = 1) {
    const now = Date.now();
    this.simulatedEpoch = this.getSimulatedTime(now).getTime();
    this.realEpoch = now;
    this.clockSpeed = Math.max(1, Math.min(144, parseInt(speed, 10) || 1));
    const simTimeIso = this.getSimulatedTime(now).toISOString();

    console.log(`[TrafficSimulator] Simulation clock set to ${this.clockSpeed}x (Simulated: ${simTimeIso})`);

    if (socketService?.io) {
      socketService.io.emit('sim:clock_update', {
        clockSpeed: this.clockSpeed,
        simulatedTime: simTimeIso,
      });
    }

    return {
      success: true,
      clockSpeed: this.clockSpeed,
      simulatedTime: simTimeIso,
      message: `Simulation clock speed set to ${this.clockSpeed}x`,
    };
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

  // Section 5.7: Jam spreading to 1-hop neighbours (Slow, gradual ramp over 20-30s)
  evaluateJamSpreading(now) {
    // Reset spread pressure base
    const spreadPressures = new Map(); // nbrId -> { intensity, sourceJunctionId }

    for (const [juncId, state] of this.junctionStates.entries()) {
      const isBlockage = state.activeScenario?.type === 'blockage' && state.activeScenario.expiresAt > now;
      const isSevereCongestion = state.congestionScore > 75;

      if (isBlockage || isSevereCongestion) {
        state.highCongestionTicks += 1;
      } else {
        state.highCongestionTicks = Math.max(0, state.highCongestionTicks - 1);
      }

      // Require 15s of blockage or 20s of severe congestion before spreading begins (slow and realistic)
      const isSustained = this.isRunning
        ? (isBlockage ? state.highCongestionTicks >= 15 : state.highCongestionTicks >= 20)
        : (isBlockage || state.highCongestionTicks >= 1 || isSevereCongestion);

      if (isSustained) {
        const neighbours = JUNCTION_GRAPH[juncId] || [];
        const intensity = isBlockage ? 0.20 : Math.min(0.20, ((state.congestionScore - 70) / 30) * 0.20);

        for (const nbrId of neighbours) {
          // Do not spread back to the junction that caused our congestion
          if (state.spreadSourceJunctionId === nbrId) continue;

          const existing = spreadPressures.get(nbrId);
          if (!existing || intensity > existing.intensity) {
            spreadPressures.set(nbrId, { intensity, sourceJunctionId: juncId });
          }

          // Cross-zone alert check: only if neighbour is in a different zone AND neighbour is not our spread source
          const nbrState = this.junctionStates.get(nbrId);
          if (nbrState && nbrState.zoneId !== state.zoneId && state.spreadSourceJunctionId !== nbrId) {
            if (now - nbrState.crossZoneAlertSentAt > 45000) {
              nbrState.crossZoneAlertSentAt = now;
              this.emitCrossZoneAlert(state, nbrState);
            }
          }
        }
      }
    }

    // Apply calculated spread pressure to all junction states (gradual ramp over 20-30s)
    for (const [juncId, state] of this.junctionStates.entries()) {
      const spreadInfo = spreadPressures.get(juncId);
      const targetPressure = spreadInfo ? spreadInfo.intensity : 0;
      state.spreadPressure = parseFloat((state.spreadPressure * 0.85 + targetPressure * 0.15).toFixed(2));
      state.spreadSourceJunctionId = targetPressure > 0 ? spreadInfo.sourceJunctionId : null;
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
      title: 'Congestion Spreading from ' + sourceState.name,
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
      suggestedAction: null, // Spread notices carry no automatic action
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

    const simDate = this.getSimulatedTime(now);
    const simHour = simDate.getHours();
    const timeOfDayMultiplier = getHourVolumeMultiplier(simHour);

    const approaches = junc.baseApproaches.map((app, idx) => {
      let isGreen = idx === phase.activeApproachIndex;
      if (inCorridor) {
        isGreen = idx === 0;
      }
      const signalState = isGreen ? 'green' : 'red';

      // Vehicles per minute fluctuates naturally +/- 12%, scaled by time-of-day profile
      const jitterFactor = 1 + (Math.random() - 0.5) * 0.15;
      let vehiclesPerMin = Math.round(app.baseVehiclesPerMin * timeOfDayMultiplier * jitterFactor);

      // Queue and speed dynamics
      let queueLengthM = app.baseQueueM;
      let avgSpeedKmph = app.baseSpeed;

      // Time-of-day profile adjustment
      if (timeOfDayMultiplier >= 1.5) {
        queueLengthM = Math.round(queueLengthM * (1 + (timeOfDayMultiplier - 1) * 0.35));
        avgSpeedKmph = Math.max(4, Math.round(avgSpeedKmph / (1 + (timeOfDayMultiplier - 1) * 0.25)));
      } else if (timeOfDayMultiplier < 0.6) {
        queueLengthM = Math.round(queueLengthM * 0.65);
        avgSpeedKmph = Math.min(55, Math.round(avgSpeedKmph * 1.25));
      }

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
          // Only block the targeted road
          const isTargetRoad = !scenario.road || app.road.toLowerCase().includes(scenario.road.toLowerCase()) || (scenario.road === app.road);
          if (isTargetRoad) {
            avgSpeedKmph = 2; // velocity collapse
            queueLengthM = Math.min(350, Math.round(app.baseQueueM * 2.1));
            vehiclesPerMin = Math.round(vehiclesPerMin * 0.3); // choked inflow
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
      simulatedTime: simDate.toISOString(),
      simulatedClockSpeed: this.clockSpeed,
      timeOfDayMultiplier,
      spreadSourceJunctionId: state?.spreadSourceJunctionId || null,
      spreadPressure: state?.spreadPressure || 0,
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
      clockSpeed: this.clockSpeed,
      simulatedTime: this.getSimulatedTime().toISOString(),
    };
  }
}

export const simulatorService = new SimulatorService();
