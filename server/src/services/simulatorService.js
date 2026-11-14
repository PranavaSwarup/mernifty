import crypto from 'crypto';
import { ingestionBuffer } from './ingestionBuffer.js';
import { anomalyEngine } from './anomalyEngine.js';
import { socketService } from './socketService.js';
import { metricsService } from './metricsService.js';
import { INITIAL_DEVICES } from '../sim/junctions.data.js';
import { DEFAULT_NETWORK } from '../sim/network.js';
import { CounterfactualPair } from '../sim/twin.js';
import { getTodPeriod } from '../sim/demand.js';
import { loadStudyPolicy } from '../sim/studyPolicy.js';
import { OperatorAction } from '../models/OperatorAction.js';
import { recordSimStep } from '../telemetry/instruments.js';

export { INITIAL_DEVICES };

const VALID_CONTROLLERS = new Set([
  'auto',
  'fixed-tod',
  'fixed-naive',
  'fixed-time',
  'webster',
  'max-pressure',
  'max-pressure-ca',
]);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

class SimulatorService {
  constructor() {
    this.network = DEFAULT_NETWORK;
    this.junctions = this.network.junctions;
    this.devices = this.junctions; // compatibility alias
    this.studyPolicy = loadStudyPolicy();

    this.simSpeed = Math.max(0.25, Math.min(20, parseFloat(process.env.SIM_SPEED) || 1));
    const defaultEmitHz = Math.max(0.2, Math.min(100, parseFloat(process.env.SIM_EMIT_HZ) || 2));
    this.emitHz = defaultEmitHz;
    this.targetRate = Math.round(this.emitHz * this.junctions.length);

    this.isRunning = false;
    this._physicsTimer = null;
    this._emitTimer = null;
    this._cfTimer = null;
    this._nextPhysicsAt = 0;
    this._nextEmitAt = 0;
    this._lastCfBroadcastElapsed = -1;

    this.sequenceMap = new Map();
    this.queueHistory = new Map(); // junctionId -> [{ elapsedSec, totalQueueVeh, maxQueueLengthM, avgSpeedKmph, maxVOverC }]
    this.emergencyModeJunctions = new Set();
    this.scheduledTasks = []; // { targetElapsedSec, fn }
    this.recentActions = []; // Mirror recent OperatorAction records for fast/test access

    this._initPair();
  }

  _initPair(startTime = new Date()) {
    const seed = process.env.SIM_SEED ? Number(process.env.SIM_SEED) || process.env.SIM_SEED : 20261114;
    this.pair = new CounterfactualPair({
      seed,
      network: this.network,
      startTime,
      dtSec: 1,
      liveControllerFactory: 'auto',
      prewarmLinks: true,
    });
    this.queueHistory.clear();
    for (const j of this.junctions) {
      this.queueHistory.set(j.junctionId, []);
    }
    this._recordQueueHistoryPoint();
  }

  /**
   * Reset simulation twins (used in tests or restarts).
   */
  reset({ startTime = new Date(), liveControllerFactory = 'auto' } = {}) {
    const wasRunning = this.isRunning;
    if (wasRunning) this.stop();
    this.sequenceMap.clear();
    this.emergencyModeJunctions.clear();
    this.scheduledTasks = [];
    this.recentActions = [];
    this._lastCfBroadcastElapsed = -1;

    const seed = process.env.SIM_SEED ? Number(process.env.SIM_SEED) || process.env.SIM_SEED : 20261114;
    this.pair = new CounterfactualPair({
      seed,
      network: this.network,
      startTime,
      dtSec: 1,
      liveControllerFactory,
      prewarmLinks: true,
    });
    this.queueHistory.clear();
    for (const j of this.junctions) {
      this.queueHistory.set(j.junctionId, []);
    }
    this._recordQueueHistoryPoint();
    if (wasRunning) this.start(this.targetRate);
  }

  /**
   * Start both the drift-compensated physics loop (1 sim-sec/step * SIM_SPEED)
   * and decoupled telemetry emission loop (`rate` events/sec = emitHz * 12 junctions).
   */
  start(rate = null) {
    if (this.isRunning) {
      this.stop();
    }

    if (rate !== null && rate !== undefined && Number.isFinite(Number(rate))) {
      const safeRate = Math.max(1, Math.min(2000, Number(rate)));
      this.targetRate = safeRate;
      this.emitHz = Math.max(0.1, safeRate / this.junctions.length);
    } else {
      const envHz = parseFloat(process.env.SIM_EMIT_HZ) || 2;
      this.emitHz = Math.max(0.1, Math.min(100, envHz));
      this.targetRate = Math.round(this.emitHz * this.junctions.length);
    }

    this.isRunning = true;
    const now = performance.now();
    this._nextPhysicsAt = now;
    this._nextEmitAt = now;

    this._schedulePhysicsTick();
    this._scheduleEmitTick();

    this._cfTimer = setInterval(() => {
      if (!this.isRunning) return;
      if (this.pair.live.elapsedSec !== this._lastCfBroadcastElapsed) {
        this._lastCfBroadcastElapsed = this.pair.live.elapsedSec;
        socketService.broadcastCounterfactual(this.getCityCounterfactual());
      }
    }, 1000);
    if (this._cfTimer.unref) this._cfTimer.unref();

    console.log(
      `[TrafficSimulator] Physics-driven simulator active. Speed=${this.simSpeed}x (dt=1s), Emit=${this.emitHz.toFixed(2)} Hz (${this.targetRate} events/sec across ${this.junctions.length} BLR junctions).`
    );
  }

  stop() {
    this.isRunning = false;
    if (this._physicsTimer) {
      clearTimeout(this._physicsTimer);
      this._physicsTimer = null;
    }
    if (this._emitTimer) {
      clearTimeout(this._emitTimer);
      this._emitTimer = null;
    }
    if (this._cfTimer) {
      clearInterval(this._cfTimer);
      this._cfTimer = null;
    }
    console.log('[TrafficSimulator] Stopped.');
  }

  shutdown() {
    this.stop();
  }

  setRate(rate) {
    this.start(rate);
  }

  setSimSpeed(speed) {
    this.simSpeed = clamp(Number(speed) || 1, 0.25, 20);
    if (this.isRunning) {
      this._nextPhysicsAt = performance.now();
    }
    return this.simSpeed;
  }

  _schedulePhysicsTick() {
    if (!this.isRunning) return;
    const physicsIntervalMs = Math.max(25, 1000 / this.simSpeed);
    this._nextPhysicsAt += physicsIntervalMs;

    const now = performance.now();
    // Bound drift recovery so a paused thread does not burst dozens of steps at once
    if (now - this._nextPhysicsAt > physicsIntervalMs * 4) {
      this._nextPhysicsAt = now + physicsIntervalMs;
    }
    const delayMs = Math.max(1, Math.round(this._nextPhysicsAt - now));

    this._physicsTimer = setTimeout(() => {
      if (!this.isRunning) return;
      this.stepPhysics();
      this._schedulePhysicsTick();
    }, delayMs);
    if (this._physicsTimer.unref) this._physicsTimer.unref();
  }

  /**
   * Advance counterfactual physics by 1 discrete sim-second and evaluate delayed tasks/rollouts.
   */
  stepPhysics() {
    const startNs = process.hrtime.bigint();
    this.pair.step();
    this._recordQueueHistoryPoint();
    this._processScheduledTasks();
    recordSimStep(Number(process.hrtime.bigint() - startNs) / 1e6);
  }

  _recordQueueHistoryPoint() {
    const world = this.pair.live;
    const elapsedSec = world.elapsedSec;
    const snap = world.snapshot();

    for (let j = 0; j < world.numJunctions; j++) {
      const junc = world.junctions[j];
      const jId = junc.junctionId;
      const offset = world.junctionApproachOffsets[j];
      const count = world.junctionApproachCounts[j];

      let totalQueueVeh = 0;
      for (let a = 0; a < count; a++) {
        totalQueueVeh += world.queueVeh[offset + a];
      }
      const jSnap = snap.junctions[jId];
      const hist = this.queueHistory.get(jId);
      hist.push({
        elapsedSec,
        totalQueueVeh,
        maxQueueLengthM: jSnap.maxQueueLengthM,
        avgSpeedKmph: jSnap.avgSpeedKmph,
        vOverC: jSnap.kpi.degreeOfSaturation,
      });
      if (hist.length > 180) {
        hist.shift();
      }
    }
  }

  getQueueHistory(junctionId, windowSec = 120) {
    const hist = this.queueHistory.get(junctionId) || [];
    if (hist.length === 0) return [];
    const latestElapsed = hist[hist.length - 1].elapsedSec;
    const cutoff = latestElapsed - windowSec;
    return hist.filter((pt) => pt.elapsedSec >= cutoff);
  }

  _scheduleEmitTick() {
    if (!this.isRunning) return;
    // Cap timer frequency at 50 Hz; emit multiple batches per tick when targetRate > 600 e/s
    const batchesPerCycle = this.emitHz > 50 ? Math.max(1, Math.round(this.emitHz / 50)) : 1;
    const effectiveHz = this.emitHz / batchesPerCycle;
    const emitIntervalMs = Math.max(10, 1000 / effectiveHz);
    this._nextEmitAt += emitIntervalMs;

    const now = performance.now();
    if (now - this._nextEmitAt > emitIntervalMs * 4) {
      this._nextEmitAt = now + emitIntervalMs;
    }
    const delayMs = Math.max(1, Math.round(this._nextEmitAt - now));

    this._emitTimer = setTimeout(() => {
      if (!this.isRunning) return;
      for (let b = 0; b < batchesPerCycle; b++) {
        this.emitNetworkTelemetry();
      }
      this._scheduleEmitTick();
    }, delayMs);
    if (this._emitTimer.unref) this._emitTimer.unref();
  }

  /**
   * Emit one schema-compatible telemetry event per junction from the current `live` snapshot.
   */
  emitNetworkTelemetry() {
    const world = this.pair.live;
    const snap = world.snapshot();

    for (const junc of this.junctions) {
      const jId = junc.junctionId;
      const jSnap = snap.junctions[jId];
      const seq = (this.sequenceMap.get(jId) || 0) + 1;
      this.sequenceMap.set(jId, seq);

      const status = this.determineStatus(jSnap);
      const event = {
        eventId: `EVT-${Date.now()}-${seq}-${crypto.randomBytes(2).toString('hex')}`,
        junctionId: jId,
        deviceId: jId,
        deviceName: junc.name,
        junctionName: junc.name,
        zoneId: junc.zoneId,
        zoneName: junc.zoneName,
        category: junc.zoneId,
        timestamp: snap.simTime,
        sequence: seq,
        source: 'simulated-physics',
        data: {
          approaches: jSnap.approaches,
          vehicleMix: jSnap.vehicleMix,
          stalledVehicleDetected: jSnap.stalledVehicleDetected,
          ambulanceDetected: jSnap.ambulanceDetected,
          totalFlowVehiclesPerMin: jSnap.totalFlowVehiclesPerMin,
          maxQueueLengthM: jSnap.maxQueueLengthM,
          avgSpeedKmph: jSnap.avgSpeedKmph,
          congestionScore: jSnap.congestionScore,
          control: jSnap.control,
          kpi: jSnap.kpi,
        },
        metrics: {
          totalFlowVehiclesPerMin: jSnap.totalFlowVehiclesPerMin,
          maxQueueLengthM: jSnap.maxQueueLengthM,
          avgSpeedKmph: jSnap.avgSpeedKmph,
          congestionScore: jSnap.congestionScore,
          stalledVehicleDetected: jSnap.stalledVehicleDetected,
          ambulanceDetected: jSnap.ambulanceDetected,
        },
        status,
        location: junc.location,
      };

      const startT = performance.now();
      ingestionBuffer.enqueue(event);
      anomalyEngine.evaluate(event);
      socketService.broadcastTelemetry(event);
      const latency = Math.max(0, performance.now() - startT);
      metricsService.recordIngest(1, latency);
    }
  }

  /**
   * Build a connected corridor path of 3-4 junctions passing through `junctionId`
   * using real directed links in DEFAULT_NETWORK.
   */
  findCorridorPathThrough(junctionId, targetLength = 4) {
    const links = this.network.links;
    const outgoing = new Map();
    const incoming = new Map();
    for (const l of links) {
      if (!outgoing.has(l.fromJunction)) outgoing.set(l.fromJunction, []);
      if (!incoming.has(l.toJunction)) incoming.set(l.toJunction, []);
      outgoing.get(l.fromJunction).push(l.toJunction);
      incoming.get(l.toJunction).push(l.fromJunction);
    }

    const path = [junctionId];
    const visited = new Set(path);

    // Prepend one upstream neighbor if available so emergency approaches *into* `junctionId`
    const ups = (incoming.get(junctionId) || []).filter((id) => !visited.has(id));
    if (ups.length > 0) {
      path.unshift(ups[0]);
      visited.add(ups[0]);
    }

    // Extend downstream up to `targetLength`
    while (path.length < targetLength) {
      const tail = path[path.length - 1];
      const nexts = (outgoing.get(tail) || []).filter((id) => !visited.has(id));
      if (nexts.length === 0) break;
      path.push(nexts[0]);
      visited.add(nexts[0]);
    }

    return path;
  }

  isCorridorInEmergencyMode(path) {
    return path.some((jId) => this.emergencyModeJunctions.has(jId));
  }

  enableEmergencyModeForPath(path) {
    for (const jId of path) {
      this.emergencyModeJunctions.add(jId);
    }
    // Enable preemption on any matching en-route ambulances in the LIVE world only (never baseline)
    for (const em of this.pair.live.emergencies) {
      if (em.status === 'en-route' && em.path.some((id) => this.emergencyModeJunctions.has(id))) {
        em.preempt = true;
      }
    }
  }

  /**
   * Inject chaos/incidents from the Chaos Lab directly into the physical twins.
   * Applied to BOTH live and baseline twins identically under Common Random Numbers
   * (baseline NEVER receives emergency signal preemption).
   */
  injectChaos(junctionId, metric, multiplier = 2.5, durationSec = 20, flags = {}) {
    const world = this.pair.live;
    const safeDur = Math.max(5, Number(durationSec) || 20);
    const safeMult = Number(multiplier) || 2.5;
    const untilSec = world.elapsedSec + safeDur;

    // 1. Network-wide monsoon weather condition
    if (metric === 'monsoon' || flags.monsoon) {
      const cap = flags.capacityFactor ?? 0.7;
      const spd = flags.speedFactor ?? 0.75;
      this.pair.setGlobalWeather({
        type: 'monsoon',
        capacityFactor: cap,
        speedFactor: spd,
        until: untilSec,
      });
      console.log(
        `[TrafficSimulator] Injected network monsoon on BOTH twins (cap=${cap}, speed=${spd}) for ${safeDur}s`
      );
      return {
        success: true,
        type: 'monsoon',
        message: `Monsoon active across all junctions (cap=${cap}, speed=${spd}) for ${safeDur}s`,
      };
    }

    // 2. Stalled vehicle / broken-down bus -> lane capacity reduction incident
    if (flags.stalled || metric === 'stalledVehicle') {
      const capFactor = clamp(1 / Math.max(1.5, safeMult), 0.15, 0.55);
      const approachIdx = Number.isInteger(flags.approachIdx) ? flags.approachIdx : 0;
      this.pair.injectIncident(junctionId, approachIdx, {
        type: 'stalled',
        capacityFactor: capFactor,
        until: untilSec,
      });
      console.log(
        `[TrafficSimulator] Injected stalled-vehicle incident at ${junctionId} approach ${approachIdx} (capFactor=${capFactor.toFixed(2)}) for ${safeDur}s`
      );
      return {
        success: true,
        type: 'stalled',
        junctionId,
        approachIdx,
        capacityFactor: Number(capFactor.toFixed(2)),
        message: `Chaos active: stalled vehicle incident on ${junctionId} approach ${approachIdx} (capFactor=${capFactor.toFixed(2)}) for ${safeDur}s`,
      };
    }

    // 3. Emergency responder dispatch along a connected corridor path
    if (flags.ambulance || metric === 'ambulancePreemption') {
      const path = Array.isArray(flags.path) && flags.path.length > 0
        ? flags.path
        : this.findCorridorPathThrough(junctionId);
      const preempt =
        typeof flags.preempt === 'boolean'
          ? flags.preempt
          : this.isCorridorInEmergencyMode(path);
      const { live: emLive } = this.pair.dispatchEmergency({ path, preempt });
      console.log(
        `[TrafficSimulator] Dispatched ambulance ${emLive.id} along ${path.join(' -> ')} (live preempt=${preempt}, baseline preempt=false)`
      );
      return {
        success: true,
        type: 'ambulance',
        emergencyId: emLive.id,
        path,
        preempt,
        message: `Emergency responder ${emLive.id} dispatched along ${path.join(' -> ')} (preempt=${preempt})`,
      };
    }

    // 4. Queue / congestion / arrival demand surge on BOTH twins
    const approachIdx = Number.isInteger(flags.approachIdx) ? flags.approachIdx : 0;
    this.pair.setDemandSurge(junctionId, safeMult, untilSec, approachIdx);
    console.log(
      `[TrafficSimulator] Injected demand surge on ${junctionId} approach ${approachIdx} (x${safeMult}) for ${safeDur}s`
    );
    return {
      success: true,
      type: 'surge',
      junctionId,
      approachIdx,
      multiplier: safeMult,
      message: `Chaos active: demand surge x${safeMult} on ${junctionId} for ${safeDur}s`,
    };
  }

  clearChaos(junctionId, { liveOnly = false } = {}) {
    if (liveOnly) {
      this.pair.live.clearIncident(junctionId);
      return;
    }
    this.pair.clearIncident(junctionId, null, { liveOnly: false });
    this.pair.clearDemandSurge(junctionId);
  }

  setController(junctionId, controllerType, actor = 'Operator') {
    if (!VALID_CONTROLLERS.has(controllerType)) {
      throw new Error(
        `Unsupported controller '${controllerType}'. Allowed: ${[...VALID_CONTROLLERS].join(', ')}`
      );
    }
    const target = junctionId === 'all' || junctionId === '*' ? '*' : junctionId;
    if (target !== '*' && !this.pair.live.junctionIndexById.has(target)) {
      throw new Error(`Unknown junctionId: ${junctionId}`);
    }

    const beforeCtrls = {};
    for (let j = 0; j < this.pair.live.numJunctions; j++) {
      const id = this.pair.live.junctions[j].junctionId;
      if (target === '*' || target === id) {
        beforeCtrls[id] = this.pair.live.controllers[j].name;
      }
    }

    this.pair.setController(target, controllerType);
    console.log(
      `[TrafficSimulator] Controller switched by ${actor} for ${target} -> ${controllerType}`
    );

    return {
      target,
      controller: controllerType,
      previousControllers: beforeCtrls,
      state: this.getState(),
    };
  }

  scheduleDelayedTask(delaySimSec, fn) {
    const targetElapsedSec = this.pair.live.elapsedSec + Math.max(1, Math.round(delaySimSec));
    this.scheduledTasks.push({ targetElapsedSec, fn });
  }

  registerPendingAction(actionRecord) {
    this.recentActions.unshift(actionRecord);
    if (this.recentActions.length > 100) {
      this.recentActions.pop();
    }

    const horizon = actionRecord.targetMeasureElapsedSec - actionRecord.elapsedSecAtAction;
    this.scheduleDelayedTask(horizon, async () => {
      await this._finalizeActionRealisedEffect(actionRecord.actionId);
    });
  }

  async _finalizeActionRealisedEffect(actionId) {
    const rec = this.recentActions.find((a) => a.actionId === actionId);
    if (!rec || rec.status !== 'pending') return;

    const world = this.pair.live;
    const jSnap = world.snapshot(rec.junctionId);
    const netSnap = world.snapshot();
    if (!jSnap) return;

    const base = rec.baselineMetricsAtAction || {};
    const actualDelayDeltaVehSec = Number(
      (jSnap.kpi.delayVehSec - (base.junctionDelayVehSec ?? 0) - (rec.predictedEffect?.baselineFutureDelayDeltaVehSec ?? 0)).toFixed(2)
    );
    const actualMaxQueueDeltaM = Number(
      (jSnap.maxQueueLengthM - (base.maxQueueLengthM ?? jSnap.maxQueueLengthM)).toFixed(2)
    );
    const actualAvgSpeedDeltaKmph = Number(
      (jSnap.avgSpeedKmph - (base.avgSpeedKmph ?? jSnap.avgSpeedKmph)).toFixed(2)
    );

    // Compare actual vs baseline twin at same junction over the identical elapsed window
    const cf = this.pair.comparison();
    const jCf = cf.byJunction[rec.junctionId];
    const cfDelaySavedDelta = jCf
      ? Number(
          (jCf.delaySavedVehSec - (base.cfDelaySavedVehSecAtAction ?? 0)).toFixed(2)
        )
      : actualDelayDeltaVehSec;

    const predDelayDelta = rec.predictedEffect?.delayDeltaVehSec ?? 0;
    const absErr = Math.abs(cfDelaySavedDelta - -predDelayDelta);
    const denom = Math.max(10, Math.abs(predDelayDelta), Math.abs(cfDelaySavedDelta));
    const predictionAccuracyPct = Number(clamp(100 * (1 - absErr / denom), 0, 100).toFixed(1));

    const realisedEffect = {
      horizonSec: 300,
      measuredAtElapsedSec: world.elapsedSec,
      measuredSimTime: new Date(world.simTimeMs).toISOString(),
      endMaxQueueLengthM: jSnap.maxQueueLengthM,
      endAvgSpeedKmph: jSnap.avgSpeedKmph,
      endCongestionScore: jSnap.congestionScore,
      endAvgDelayPerVehSec: jSnap.kpi.avgDelayPerVehSec,
      actualMaxQueueDeltaM,
      actualAvgSpeedDeltaKmph,
      actualDelaySavedVsBaselineDeltaVehSec: cfDelaySavedDelta,
      networkAvgDelayPerVehSec: netSnap.network.avgDelayPerVehSec,
      predictionAccuracyPct,
    };

    rec.realisedEffect = realisedEffect;
    rec.status = 'measured';

    try {
      await OperatorAction.updateOne(
        { actionId },
        { $set: { realisedEffect, status: 'measured' } }
      );
    } catch {
      // Safe no-op when running unit tests without active MongoDB connection
    }
  }

  _processScheduledTasks() {
    if (this.scheduledTasks.length === 0) return;
    const elapsed = this.pair.live.elapsedSec;
    const remaining = [];
    for (const task of this.scheduledTasks) {
      if (elapsed >= task.targetElapsedSec) {
        try {
          task.fn();
        } catch (err) {
          console.warn('[TrafficSimulator] Scheduled task notice:', err.message);
        }
      } else {
        remaining.push(task);
      }
    }
    this.scheduledTasks = remaining;
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
      emitHz: Number(this.emitHz.toFixed(2)),
      simSpeed: this.simSpeed,
      simTime: new Date(this.pair.live.simTimeMs).toISOString(),
      elapsedSec: this.pair.live.elapsedSec,
      junctionsCount: this.junctions.length,
      activeEmergencies: this.pair.live.emergencies.filter((e) => e.status === 'en-route').length,
      weatherActive: this.pair.live.weather.active,
      sequences: Object.fromEntries(this.sequenceMap),
    };
  }

  getState() {
    const world = this.pair.live;
    const snap = world.snapshot();
    const todPeriod = getTodPeriod(world.simTimeMs);

    const junctions = world.junctions.map((junc, idx) => {
      const jId = junc.junctionId;
      const ctrl = world.controllers[idx];
      const jSnap = snap.junctions[jId];
      return {
        junctionId: jId,
        name: junc.name,
        zoneId: junc.zoneId,
        controller: ctrl.name,
        emergencyMode: this.emergencyModeJunctions.has(jId),
        describe: typeof ctrl.describe === 'function' ? ctrl.describe() : { name: ctrl.name },
        approaches: jSnap.approaches,
        vehicleMix: jSnap.vehicleMix,
        control: jSnap.control,
        kpi: jSnap.kpi,
        congestionScore: jSnap.congestionScore,
        maxQueueLengthM: jSnap.maxQueueLengthM,
        avgSpeedKmph: jSnap.avgSpeedKmph,
      };
    });

    return {
      isRunning: this.isRunning,
      simTime: snap.simTime,
      elapsedSec: world.elapsedSec,
      simSpeed: this.simSpeed,
      emitHz: Number(this.emitHz.toFixed(2)),
      targetRate: this.targetRate,
      todPeriod: {
        id: todPeriod.id,
        label: todPeriod.label,
      },
      weather: world.weather.active ? { ...world.weather } : { active: false },
      activeIncidentsCount: world.incidents.size,
      activeSurgesCount: world.surges.size,
      activeDiversionsCount: world.diversions.size,
      activeEmergencies: world.emergencies
        .filter((e) => e.status === 'en-route')
        .map((e) => ({
          id: e.id,
          path: e.path,
          legIndex: e.legIndex,
          remainingDistM: Math.round(e.remainingDistM),
          preempt: e.preempt,
          waitingAtRedSec: e.waitingAtRedSec,
        })),
      junctions,
      corridors: (this.network.links || []).map((l) => ({
        id: l.id,
        corridor: l.corridor,
        fromJunction: l.fromJunction,
        toJunction: l.toJunction,
        fromApproachIdx: l.fromApproachIdx,
        toApproachIdx: l.toApproachIdx,
        lengthKm: Number((l.lengthKm || 0).toFixed(2)),
      })),
      supervisoryPolicy: this.studyPolicy,
    };
  }

  getCounterfactual() {
    const comp = this.pair.comparison();
    const todPeriod = getTodPeriod(this.pair.live.simTimeMs);
    return {
      ...comp,
      simSpeed: this.simSpeed,
      emitHz: Number(this.emitHz.toFixed(2)),
      todPeriod: todPeriod.id,
      weatherActive: this.pair.live.weather.active,
    };
  }

  /**
   * Slim counterfactual summary emitted over the `city` Socket.IO room (1 Hz).
   * Excludes per-junction maps (`byJunction`) and `emergency.trips` arrays; full
   * breakdown remains available via `GET /api/sim/counterfactual`.
   */
  getCityCounterfactual() {
    const full = this.getCounterfactual();
    const { byJunction, emergency, ...rest } = full;
    if (emergency && typeof emergency === 'object') {
      const { trips, ...emergencySummary } = emergency;
      rest.emergency = emergencySummary;
    }
    return rest;
  }
}

export const simulatorService = new SimulatorService();
