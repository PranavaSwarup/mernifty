/**
 * Deterministic Microscopic/Mesoscopic Traffic Physics Engine
 *
 * Implements discrete-time store-and-forward / point-queue conservation per approach:
 *   Q_i(t + dt) = Q_i(t) + A_i(t) - D_i(t)
 *
 * Physical parameters & documented assumptions:
 * - Saturation flow: s0 = 1800 PCU/h/lane = 0.5 veh/s/lane -> S_i = 0.5 * lanes_i
 * - Effective vehicle length (BLR two-wheeler-heavy mix): L_eff = 5.5 m/veh
 *     queueLengthM = (Q_i * 5.5) / lanes_i
 * - Approach speed (modified Greenshields):
 *     v_i = v_min + (v_free - v_min) * (1 - min(1, Q_i / Q_max_i))^1.5
 *     with v_free = 40 km/h, v_min = 3 km/h.
 * - Rolling 60s flow metric (`vehiclesPerMin`):
 *     Measured approach arrivals (external + upstream link arrivals) over the last 60s
 *     (scaled smoothly during the first 60s of simulation).
 * - Congestion Score (0..100):
 *     45% weight on degree of saturation (v/c clamped at 1.2) + 55% weight on
 *     worst approach queue/storage occupancy ratio (Q_i / Q_max_i).
 */

import { createRng, deriveSeed } from './rng.js';
import { demandFactor } from './demand.js';
import {
  DEFAULT_NETWORK,
  EFFECTIVE_VEH_LENGTH_M,
  FREE_FLOW_SPEED_KMPH,
  MIN_SPEED_KMPH,
  haversineKm,
  ROAD_TORTUOSITY_FACTOR,
} from './network.js';
import {
  createController,
  PREEMPT_LEAD_WINDOW_SEC,
} from './controllers.js';

export const EMERGENCY_WEAVING_SPEED_KMPH = 12;

export class TrafficWorld {
  /**
   * @param {object} [opts]
   * @param {number|string} [opts.seed=20261114]
   * @param {Function|string} [opts.controllerFactory] (junction) => Controller | 'fixed-time'|'webster'|'max-pressure'
   * @param {object} [opts.network=DEFAULT_NETWORK]
   * @param {Date|number|string} [opts.startTime]
   * @param {number} [opts.dtSec=1]
   * @param {boolean} [opts.prewarmLinks=true] Pre-fill transit delay pipes with deterministic steady baseline flow
   */
  constructor({
    seed = 20261114,
    controllerFactory = 'fixed-time',
    network = DEFAULT_NETWORK,
    startTime = '2026-11-14T13:30:00.000Z', // 19:00 IST (evening peak) default
    dtSec = 1,
    demandScale = 1.0,
    prewarmLinks = true,
    _skipControllers = false,
  } = {}) {
    this.seed = seed;
    this.network = network;
    this.dtSec = dtSec;
    const rawScale = Number(demandScale);
    this.demandScale = Number.isFinite(rawScale) ? Math.max(0.1, Math.min(5, rawScale)) : 1.0;
    this.startTimeMs =
      startTime instanceof Date
        ? startTime.getTime()
        : typeof startTime === 'number'
          ? startTime
          : Date.parse(startTime);
    if (!Number.isFinite(this.startTimeMs)) {
      this.startTimeMs = Date.parse('2026-11-14T13:30:00.000Z');
    }

    this.simTimeMs = this.startTimeMs;
    this.elapsedSec = 0;
    this.stepIndex = 0;

    this.junctions = network.junctions;
    this.numJunctions = this.junctions.length;
    this.junctionIndexById = new Map();
    this.junctionApproachOffsets = new Int32Array(this.numJunctions);
    this.junctionApproachCounts = new Int32Array(this.numJunctions);

    let totalApproaches = 0;
    for (let j = 0; j < this.numJunctions; j++) {
      this.junctionIndexById.set(this.junctions[j].junctionId, j);
      this.junctionApproachOffsets[j] = totalApproaches;
      const count = this.junctions[j].approaches.length;
      this.junctionApproachCounts[j] = count;
      totalApproaches += count;
    }
    this.totalApproaches = totalApproaches;

    // Flat typed arrays for zero-GC, sub-millisecond stepping
    this.queueVeh = new Float64Array(totalApproaches);
    this.totalArrived = new Float64Array(totalApproaches);
    this.totalExternalArrived = new Float64Array(totalApproaches);
    this.totalDeparted = new Float64Array(totalApproaches);
    this.delayVehSec = new Float64Array(totalApproaches);
    this.maxQueueVeh = new Float64Array(totalApproaches);
    this.arrivalsThisStep = new Float64Array(totalApproaches);
    this.departuresThisStep = new Float64Array(totalApproaches);

    this.lanes = new Float64Array(totalApproaches);
    this.saturationFlowPerSec = new Float64Array(totalApproaches);
    this.storageCapVeh = new Float64Array(totalApproaches);
    this.storageCapM = new Float64Array(totalApproaches);
    this.baseDemandPerSec = new Float64Array(totalApproaches);
    this.hasUpstream = new Uint8Array(totalApproaches);
    this.capacityFactor = new Float64Array(totalApproaches);
    this.capacityFactor.fill(1.0);

    // Rolling 60s arrivals window per approach
    this.rollingSteps = Math.max(1, Math.round(60 / this.dtSec));
    this.rollingBuffer = new Float64Array(totalApproaches * this.rollingSteps);
    this.rollingSum = new Float64Array(totalApproaches);
    this.rollingCursor = 0;

    // Seeded independent RNG stream per approach (guarantees Common Random Numbers across twins)
    this.approachRngs = new Array(totalApproaches);

    for (let j = 0; j < this.numJunctions; j++) {
      const junc = this.junctions[j];
      const offset = this.junctionApproachOffsets[j];
      for (let a = 0; a < junc.approaches.length; a++) {
        const flatIdx = offset + a;
        const app = junc.approaches[a];
        this.lanes[flatIdx] = app.lanes;
        this.saturationFlowPerSec[flatIdx] = app.saturationFlowPerSec;
        this.storageCapVeh[flatIdx] = app.storageCapVeh;
        this.storageCapM[flatIdx] = app.storageCapM;
        this.baseDemandPerSec[flatIdx] = app.baseDemandPerSec;
        this.hasUpstream[flatIdx] = app.hasUpstream ? 1 : 0;
        this.approachRngs[flatIdx] = createRng(
          deriveSeed(this.seed, `${junc.junctionId}:approach:${a}`)
        );
      }
    }

    // Build link delay ring buffers & adjacency lists
    this.links = [];
    this.outgoingLinks = Array.from({ length: totalApproaches }, () => []);
    this.incomingLinks = Array.from({ length: totalApproaches }, () => []);
    this.linkLookup = new Map(); // "fromId->toId" -> link entry

    const initialDemandMult = demandFactor(this.simTimeMs) * this.demandScale;

    for (const rawLink of network.links) {
      const fromJ = this.junctionIndexById.get(rawLink.fromJunction);
      const toJ = this.junctionIndexById.get(rawLink.toJunction);
      if (fromJ === undefined || toJ === undefined) continue;

      const fromFlatIdx = this.junctionApproachOffsets[fromJ] + rawLink.fromApproachIdx;
      const toFlatIdx = this.junctionApproachOffsets[toJ] + rawLink.toApproachIdx;
      const delaySteps = Math.max(1, Math.round(rawLink.freeFlowTravelTimeSec / this.dtSec));
      const ringBuffer = new Float64Array(delaySteps);

      if (prewarmLinks) {
        // Steady-state deterministic initial transit pipe fill (consumes zero RNG)
        const nominalUpstreamRate = Math.min(
          this.baseDemandPerSec[fromFlatIdx] * initialDemandMult,
          this.saturationFlowPerSec[fromFlatIdx] * 0.25
        );
        const pipePacket = nominalUpstreamRate * rawLink.turnFraction * this.dtSec;
        ringBuffer.fill(pipePacket);
      }

      const linkEntry = {
        ...rawLink,
        fromJ,
        toJ,
        fromFlatIdx,
        toFlatIdx,
        delaySteps,
        ringBuffer,
      };
      this.links.push(linkEntry);
      this.outgoingLinks[fromFlatIdx].push(linkEntry);
      this.incomingLinks[toFlatIdx].push(linkEntry);

      const pairKey = `${rawLink.fromJunction}->${rawLink.toJunction}`;
      if (!this.linkLookup.has(pairKey)) {
        this.linkLookup.set(pairKey, linkEntry);
      }
    }

    // Controllers & pre-allocated state scratch objects per junction
    this.controllers = new Array(this.numJunctions);
    this.lastDecisions = new Array(this.numJunctions);
    this.junctionStates = new Array(this.numJunctions);

    for (let j = 0; j < this.numJunctions; j++) {
      const junc = this.junctions[j];
      const count = this.junctionApproachCounts[j];
      const offset = this.junctionApproachOffsets[j];
      const scratchApproaches = new Array(count);
      for (let a = 0; a < count; a++) {
        const flatIdx = offset + a;
        scratchApproaches[a] = {
          index: a,
          lanes: this.lanes[flatIdx],
          saturationFlowPerSec: this.saturationFlowPerSec[flatIdx],
          storageCapVeh: this.storageCapVeh[flatIdx],
          queueVeh: 0,
          arrivalsThisStep: 0,
          arrivalRateVehPerSec: 0,
          downstreamPenalty: 0,
          downstreamOccupancyPenalty: 0,
          capacityFactor: 1.0,
        };
      }
      this.junctionStates[j] = {
        junctionId: junc.junctionId,
        dtSec: this.dtSec,
        simTimeMs: this.simTimeMs,
        preemptApproachIdx: null,
        approaches: scratchApproaches,
      };

      if (!_skipControllers) {
        this.controllers[j] =
          typeof controllerFactory === 'function'
            ? controllerFactory(junc)
            : createController(controllerFactory, junc, { startTimeMs: this.startTimeMs });
        this.lastDecisions[j] = this.controllers[j].decide(this.junctionStates[j], 0);
      }
    }

    // Active incidents, surges, diversions, global weather (monsoon), and emergency vehicle agents
    this.incidents = new Map(); // flatIdx -> { type, capacityFactor, untilSec, untilMs }
    this.surges = new Map(); // junctionId -> { factor, approachIdx, untilSec, untilMs }
    this.diversions = new Map(); // flatIdx -> { junctionId, approachIdx, targetJunctionId, targetApproachIdx, targetFlatIdx, reductionFraction, untilSec, untilMs }
    this.weather = {
      active: false,
      type: null,
      capacityFactor: 1.0,
      speedFactor: 1.0,
      untilSec: Infinity,
      untilMs: Infinity,
    };
    this.totalDivertedVeh = 0;
    this.emergencies = [];
    this._nextEmergencySeq = 1;
    this.preemptRequests = new Int32Array(this.numJunctions);
    this.preemptRequests.fill(-1);
  }

  /**
   * Create an exact deep clone of the entire simulation state (PRNG states, queues,
   * link ring buffers, active incidents/surges/diversions/weather/emergencies, and controllers)
   * for zero-side-effect model-predictive lookahead rollouts.
   */
  clone() {
    const copy = new TrafficWorld({
      seed: this.seed,
      network: this.network,
      startTime: this.startTimeMs,
      dtSec: this.dtSec,
      prewarmLinks: false,
      _skipControllers: true,
    });

    copy.simTimeMs = this.simTimeMs;
    copy.elapsedSec = this.elapsedSec;
    copy.stepIndex = this.stepIndex;
    copy.rollingCursor = this.rollingCursor;
    copy._nextEmergencySeq = this._nextEmergencySeq;
    copy.totalDivertedVeh = this.totalDivertedVeh;

    copy.queueVeh.set(this.queueVeh);
    copy.totalArrived.set(this.totalArrived);
    copy.totalExternalArrived.set(this.totalExternalArrived);
    copy.totalDeparted.set(this.totalDeparted);
    copy.delayVehSec.set(this.delayVehSec);
    copy.maxQueueVeh.set(this.maxQueueVeh);
    copy.arrivalsThisStep.set(this.arrivalsThisStep);
    copy.departuresThisStep.set(this.departuresThisStep);
    copy.capacityFactor.set(this.capacityFactor);
    copy.rollingBuffer.set(this.rollingBuffer);
    copy.rollingSum.set(this.rollingSum);
    copy.preemptRequests.set(this.preemptRequests);

    for (let i = 0; i < this.totalApproaches; i++) {
      copy.approachRngs[i] = this.approachRngs[i].clone();
    }
    for (let l = 0; l < this.links.length; l++) {
      copy.links[l].ringBuffer.set(this.links[l].ringBuffer);
    }

    for (const [k, v] of this.incidents.entries()) {
      copy.incidents.set(k, { ...v });
    }
    for (const [k, v] of this.surges.entries()) {
      copy.surges.set(k, { ...v });
    }
    for (const [k, v] of this.diversions.entries()) {
      copy.diversions.set(k, { ...v });
    }
    copy.weather = { ...this.weather };
    copy.emergencies = this.emergencies.map((em) => ({
      ...em,
      path: [...em.path],
      legs: em.legs.map((leg) => ({ ...leg })),
    }));

    for (let j = 0; j < this.numJunctions; j++) {
      const ctrl = this.controllers[j];
      copy.controllers[j] = typeof ctrl.clone === 'function' ? ctrl.clone() : ctrl;
      const d = this.lastDecisions[j];
      copy.lastDecisions[j] = d
        ? {
            ...d,
            splits: Array.isArray(d.splits) ? [...d.splits] : [],
          }
        : null;
    }

    return copy;
  }

  /**
   * Swap controller implementation for a specific junction (or all junctions if junctionId === '*').
   */
  setController(junctionId, controllerOrFactory) {
    const apply = (jIdx) => {
      const junc = this.junctions[jIdx];
      const prevPhase = this.lastDecisions[jIdx]?.phaseIndex ?? 0;
      const nextCtrl =
        typeof controllerOrFactory === 'function'
          ? controllerOrFactory(junc, prevPhase)
          : typeof controllerOrFactory === 'string'
            ? createController(controllerOrFactory, junc, {
                initialPhaseIndex: prevPhase,
                startTimeMs: this.startTimeMs,
              })
            : controllerOrFactory;
      this.controllers[jIdx] = nextCtrl;
      this.junctionStates[jIdx].simTimeMs = this.simTimeMs;
      this.lastDecisions[jIdx] = nextCtrl.decide(this.junctionStates[jIdx], this.elapsedSec);
    };

    if (junctionId === '*') {
      for (let j = 0; j < this.numJunctions; j++) apply(j);
      return;
    }

    const jIdx = this.junctionIndexById.get(junctionId);
    if (jIdx !== undefined) apply(jIdx);
  }

  /**
   * Parse an `until` deadline which may be a Date, epoch ms (>= 1e11), relative/elapsed sim-seconds, or null.
   */
  _normalizeUntil(until) {
    if (until === null || until === undefined) {
      return { untilSec: Infinity, untilMs: Infinity };
    }
    if (until instanceof Date) {
      return { untilSec: Infinity, untilMs: until.getTime() };
    }
    if (typeof until === 'string') {
      const parsed = Date.parse(until);
      return { untilSec: Infinity, untilMs: Number.isFinite(parsed) ? parsed : Infinity };
    }
    if (typeof until === 'number') {
      if (until >= 1e11) {
        return { untilSec: Infinity, untilMs: until };
      }
      return { untilSec: until, untilMs: Infinity };
    }
    return { untilSec: Infinity, untilMs: Infinity };
  }

  /**
   * Inject an approach capacity incident (e.g. stalled vehicle).
   * Note: Clearing an incident NEVER resets queues; queues drain strictly via physics.
   */
  injectIncident(junctionId, approachIdx, { type = 'stalled', capacityFactor = 0.4, until = null } = {}) {
    const jIdx = this.junctionIndexById.get(junctionId);
    if (jIdx === undefined) return false;
    const count = this.junctionApproachCounts[jIdx];
    const safeAppIdx = Math.max(0, Math.min(count - 1, approachIdx || 0));
    const flatIdx = this.junctionApproachOffsets[jIdx] + safeAppIdx;

    const { untilSec, untilMs } = this._normalizeUntil(until);
    this.incidents.set(flatIdx, {
      junctionId,
      approachIdx: safeAppIdx,
      type,
      capacityFactor: Math.max(0.05, Math.min(1.0, capacityFactor)),
      untilSec,
      untilMs,
    });
    this.capacityFactor[flatIdx] = Math.max(0.05, Math.min(1.0, capacityFactor));
    return true;
  }

  /**
   * Clear an active incident without resetting existing queues.
   */
  clearIncident(junctionId, approachIdx = null) {
    const jIdx = this.junctionIndexById.get(junctionId);
    if (jIdx === undefined) return false;
    const offset = this.junctionApproachOffsets[jIdx];
    const count = this.junctionApproachCounts[jIdx];

    if (approachIdx === null || approachIdx === undefined) {
      for (let a = 0; a < count; a++) {
        this.incidents.delete(offset + a);
        this.capacityFactor[offset + a] = 1.0;
      }
      return true;
    }

    const flatIdx = offset + approachIdx;
    this.incidents.delete(flatIdx);
    this.capacityFactor[flatIdx] = 1.0;
    return true;
  }

  /**
   * Apply a demand surge multiplier to a junction (or specific approach).
   */
  setDemandSurge(junctionId, factor = 2.0, until = null, approachIdx = null) {
    if (!this.junctionIndexById.has(junctionId)) return false;
    const { untilSec, untilMs } = this._normalizeUntil(until);
    this.surges.set(junctionId, {
      factor: Math.max(0, factor),
      approachIdx,
      untilSec,
      untilMs,
    });
    return true;
  }

  clearDemandSurge(junctionId) {
    this.surges.delete(junctionId);
  }

  /**
   * Apply network-wide weather impairment (e.g., monsoon: capacityFactor=0.7, speedFactor=0.75).
   */
  setGlobalWeather({ type = 'monsoon', capacityFactor = 0.7, speedFactor = 0.75, until = null } = {}) {
    const { untilSec, untilMs } = this._normalizeUntil(until);
    this.weather = {
      active: true,
      type,
      capacityFactor: Math.max(0.2, Math.min(1.0, capacityFactor)),
      speedFactor: Math.max(0.25, Math.min(1.0, speedFactor)),
      untilSec,
      untilMs,
    };
    return this.weather;
  }

  clearGlobalWeather() {
    this.weather = {
      active: false,
      type: null,
      capacityFactor: 1.0,
      speedFactor: 1.0,
      untilSec: Infinity,
      untilMs: Infinity,
    };
  }

  /**
   * Apply conservation-honest upstream diversion: reduces demand on `(junctionId, approachIdx)`
   * by `reductionFraction` (default 20%) and shifts the diverted volume onto an alternate entry
   * `(targetJunctionId, targetApproachIdx)` so total network demand is conserved.
   */
  applyDiversion({
    junctionId,
    approachIdx = 0,
    reductionFraction = 0.2,
    targetJunctionId = null,
    targetApproachIdx = 0,
    until = null,
  } = {}) {
    const fromJ = this.junctionIndexById.get(junctionId);
    if (fromJ === undefined) return false;
    const fromCount = this.junctionApproachCounts[fromJ];
    const safeAppIdx = Math.max(0, Math.min(fromCount - 1, approachIdx || 0));
    const fromFlatIdx = this.junctionApproachOffsets[fromJ] + safeAppIdx;

    // Pick alternate boundary junction entry if no explicit target supplied
    let destJ = targetJunctionId ? this.junctionIndexById.get(targetJunctionId) : undefined;
    let destAppIdx = targetApproachIdx ?? 0;
    if (destJ === undefined) {
      // Find a distinct junction with an external boundary entry
      for (let j = 0; j < this.numJunctions; j++) {
        if (j === fromJ) continue;
        const offset = this.junctionApproachOffsets[j];
        const cnt = this.junctionApproachCounts[j];
        for (let a = 0; a < cnt; a++) {
          if (this.hasUpstream[offset + a] === 0) {
            destJ = j;
            destAppIdx = a;
            break;
          }
        }
        if (destJ !== undefined) break;
      }
      if (destJ === undefined) {
        destJ = (fromJ + 1) % this.numJunctions;
        destAppIdx = 0;
      }
    }

    const destSafeApp = Math.max(0, Math.min(this.junctionApproachCounts[destJ] - 1, destAppIdx));
    const targetFlatIdx = this.junctionApproachOffsets[destJ] + destSafeApp;
    const { untilSec, untilMs } = this._normalizeUntil(until);

    this.diversions.set(fromFlatIdx, {
      junctionId,
      approachIdx: safeAppIdx,
      targetJunctionId: this.junctions[destJ].junctionId,
      targetApproachIdx: destSafeApp,
      targetFlatIdx,
      reductionFraction: Math.max(0.05, Math.min(0.6, reductionFraction)),
      untilSec,
      untilMs,
    });
    return this.diversions.get(fromFlatIdx);
  }

  /**
   * Dispatch an emergency vehicle along a sequence of junctionIds.
   * @param {object} opts
   * @param {string[]} opts.path Ordered list of junctionIds
   * @param {boolean} [opts.preempt=false] Enable green-wave signal preemption
   */
  dispatchEmergency({ path, preempt = false } = {}) {
    if (!Array.isArray(path) || path.length === 0) {
      throw new Error('Emergency dispatch requires a non-empty path of junctionIds');
    }

    const legs = [];
    for (let r = 0; r < path.length; r++) {
      const targetId = path[r];
      const jIdx = this.junctionIndexById.get(targetId);
      if (jIdx === undefined) {
        throw new Error(`Unknown junctionId in emergency path: ${targetId}`);
      }

      if (r === 0) {
        let startApproachIdx = 0;
        if (path.length > 1) {
          const firstLink = this.linkLookup.get(`${targetId}->${path[1]}`);
          if (firstLink) startApproachIdx = firstLink.fromApproachIdx;
        }
        const flatIdx = this.junctionApproachOffsets[jIdx] + startApproachIdx;
        const startDistM = Math.min(300, this.storageCapM[flatIdx] * 0.8);
        legs.push({
          junctionId: targetId,
          junctionIdx: jIdx,
          approachIdx: startApproachIdx,
          lengthM: startDistM,
        });
      } else {
        const prevId = path[r - 1];
        const link = this.linkLookup.get(`${prevId}->${targetId}`);
        if (link) {
          legs.push({
            junctionId: targetId,
            junctionIdx: jIdx,
            approachIdx: link.toApproachIdx,
            lengthM: link.lengthM,
          });
        } else {
          // Geometric fallback when consecutive path nodes do not share a direct link
          const prevJ = this.junctions[this.junctionIndexById.get(prevId)];
          const currJ = this.junctions[jIdx];
          const distM = Math.max(
            200,
            Math.round(
              haversineKm(
                prevJ.location.latitude,
                prevJ.location.longitude,
                currJ.location.latitude,
                currJ.location.longitude
              ) *
                ROAD_TORTUOSITY_FACTOR *
                1000
            )
          );
          legs.push({
            junctionId: targetId,
            junctionIdx: jIdx,
            approachIdx: 0,
            lengthM: distM,
          });
        }
      }
    }

    const totalLengthM = legs.reduce((acc, l) => acc + l.lengthM, 0);
    const totalLengthKm = Number((totalLengthM / 1000).toFixed(3));
    const freeFlowTimeSec = Number((totalLengthM / (FREE_FLOW_SPEED_KMPH / 3.6)).toFixed(2));

    const id = `EMG-${this._nextEmergencySeq++}`;
    const agent = {
      id,
      path: [...path],
      preempt: Boolean(preempt),
      legs,
      legIndex: 0,
      remainingDistM: legs[0].lengthM,
      totalLengthM,
      totalLengthKm,
      freeFlowTimeSec,
      startSimSec: this.elapsedSec,
      endSimSec: null,
      travelTimeSec: null,
      waitingAtRedSec: 0,
      status: 'en-route',
    };
    this.emergencies.push(agent);
    return agent;
  }

  _approachSpeedKmph(flatIdx) {
    const q = this.queueVeh[flatIdx];
    const qMax = this.storageCapVeh[flatIdx];
    const occ = qMax > 0 ? Math.min(1, q / qMax) : 0;
    const baseSpeed = MIN_SPEED_KMPH + (FREE_FLOW_SPEED_KMPH - MIN_SPEED_KMPH) * Math.pow(1 - occ, 1.5);
    return baseSpeed * this.weather.speedFactor;
  }

  /**
   * Emergency vehicle kinematics:
   * - Upstream of back-of-queue (`remainingDistM > queueLengthM`): travels at 40 km/h free-flow (scaled by weather).
   * - Inside/weaving past stopped queue along the road shoulder (`remainingDistM <= queueLengthM`):
   *   travels at max(12 km/h * weatherSpeed, approachSpeed) rather than decelerating to the mixed-traffic 3 km/h tail.
   */
  _emergencySpeedMps(em, flatIdx) {
    const q = this.queueVeh[flatIdx];
    const queueLengthM = (q * EFFECTIVE_VEH_LENGTH_M) / Math.max(1, this.lanes[flatIdx]);
    if (em.remainingDistM > queueLengthM) {
      return (FREE_FLOW_SPEED_KMPH * this.weather.speedFactor) / 3.6;
    }
    const speedKmph = Math.max(
      EMERGENCY_WEAVING_SPEED_KMPH * this.weather.speedFactor,
      this._approachSpeedKmph(flatIdx)
    );
    return speedKmph / 3.6;
  }

  _expireIncidentsAndSurges() {
    for (const [flatIdx, inc] of this.incidents.entries()) {
      if (this.elapsedSec >= inc.untilSec || this.simTimeMs >= inc.untilMs) {
        this.incidents.delete(flatIdx);
        this.capacityFactor[flatIdx] = 1.0;
      }
    }
    for (const [junctionId, surge] of this.surges.entries()) {
      if (this.elapsedSec >= surge.untilSec || this.simTimeMs >= surge.untilMs) {
        this.surges.delete(junctionId);
      }
    }
    for (const [flatIdx, div] of this.diversions.entries()) {
      if (this.elapsedSec >= div.untilSec || this.simTimeMs >= div.untilMs) {
        this.diversions.delete(flatIdx);
      }
    }
    if (
      this.weather.active &&
      (this.elapsedSec >= this.weather.untilSec || this.simTimeMs >= this.weather.untilMs)
    ) {
      this.clearGlobalWeather();
    }
  }

  _preparePreemptionRequests() {
    this.preemptRequests.fill(-1);
    for (let i = 0; i < this.emergencies.length; i++) {
      const em = this.emergencies[i];
      if (em.status !== 'en-route' || !em.preempt) continue;
      const leg = em.legs[em.legIndex];
      const flatIdx = this.junctionApproachOffsets[leg.junctionIdx] + leg.approachIdx;
      const speedMps = this._emergencySpeedMps(em, flatIdx);
      const etaSec = em.remainingDistM / Math.max(0.5, speedMps);
      const effSat = Math.max(
        0.5,
        this.saturationFlowPerSec[flatIdx] * this.capacityFactor[flatIdx] * this.weather.capacityFactor
      );
      const queueClearanceSec = this.queueVeh[flatIdx] / effSat;
      if (etaSec <= PREEMPT_LEAD_WINDOW_SEC + queueClearanceSec) {
        this.preemptRequests[leg.junctionIdx] = leg.approachIdx;
      }
    }
  }

  _stepEmergencies() {
    const dt = this.dtSec;
    for (let i = 0; i < this.emergencies.length; i++) {
      const em = this.emergencies[i];
      if (em.status !== 'en-route') continue;

      const leg = em.legs[em.legIndex];
      const flatIdx = this.junctionApproachOffsets[leg.junctionIdx] + leg.approachIdx;
      const speedMps = this._emergencySpeedMps(em, flatIdx);

      if (em.remainingDistM > 0) {
        em.remainingDistM = Math.max(0, em.remainingDistM - speedMps * dt);
      }

      if (em.remainingDistM <= 1e-6) {
        const decision = this.lastDecisions[leg.junctionIdx];
        const isGreen = !decision.inIntergreen && decision.phaseIndex === leg.approachIdx;
        if (isGreen) {
          em.legIndex += 1;
          if (em.legIndex >= em.legs.length) {
            em.status = 'completed';
            em.endSimSec = this.elapsedSec + dt;
            em.travelTimeSec = em.endSimSec - em.startSimSec;
          } else {
            em.remainingDistM = em.legs[em.legIndex].lengthM;
          }
        } else {
          em.waitingAtRedSec += dt;
        }
      }
    }
  }

  /**
   * Advance the simulation by one discrete step `dtSec`.
   */
  step() {
    const dt = this.dtSec;
    const stepDemandMult = demandFactor(this.simTimeMs) * this.demandScale;

    // 1. Expire completed incidents / demand surges (without resetting queues)
    this._expireIncidentsAndSurges();

    // 2. Compute arrival packets for all approaches before signal updates & discharge
    this.arrivalsThisStep.fill(0);

    // 2a. Pop delayed upstream departures from link ring buffers (applying active diversions honestly)
    for (let l = 0; l < this.links.length; l++) {
      const link = this.links[l];
      const slot = this.stepIndex % link.delaySteps;
      const arrivedFromLink = link.ringBuffer[slot];
      link.ringBuffer[slot] = 0;
      const div = this.diversions.get(link.toFlatIdx);
      if (div && arrivedFromLink > 0) {
        const shifted = arrivedFromLink * div.reductionFraction;
        this.arrivalsThisStep[link.toFlatIdx] += arrivedFromLink - shifted;
        this.arrivalsThisStep[div.targetFlatIdx] += shifted;
        this.totalDivertedVeh += shifted;
      } else {
        this.arrivalsThisStep[link.toFlatIdx] += arrivedFromLink;
      }
    }

    // 2b. Sample external Poisson arrivals for boundary approaches
    for (let j = 0; j < this.numJunctions; j++) {
      const junc = this.junctions[j];
      const surge = this.surges.get(junc.junctionId);
      const offset = this.junctionApproachOffsets[j];
      const count = this.junctionApproachCounts[j];

      for (let a = 0; a < count; a++) {
        const flatIdx = offset + a;
        const div = this.diversions.get(flatIdx);
        if (this.hasUpstream[flatIdx] === 0) {
          let surgeMult = 1.0;
          if (surge && (surge.approachIdx === null || surge.approachIdx === undefined || surge.approachIdx === a)) {
            surgeMult = surge.factor;
          }
          const lambda = this.baseDemandPerSec[flatIdx] * stepDemandMult * surgeMult * dt;
          if (div) {
            const kept = this.approachRngs[flatIdx].poisson(lambda * (1 - div.reductionFraction));
            const diverted = this.approachRngs[flatIdx].poisson(lambda * div.reductionFraction);
            this.arrivalsThisStep[flatIdx] += kept;
            this.totalExternalArrived[flatIdx] += kept;
            this.arrivalsThisStep[div.targetFlatIdx] += diverted;
            this.totalExternalArrived[div.targetFlatIdx] += diverted;
            this.totalDivertedVeh += diverted;
          } else {
            const extArr = this.approachRngs[flatIdx].poisson(lambda);
            this.arrivalsThisStep[flatIdx] += extArr;
            this.totalExternalArrived[flatIdx] += extArr;
          }
        } else if (surge && surge.approachIdx === a) {
          // Optional targeted surge on an internal approach if explicitly requested
          const extraLambda = this.baseDemandPerSec[flatIdx] * stepDemandMult * Math.max(0, surge.factor - 1) * dt;
          if (extraLambda > 0) {
            const extraArr = this.approachRngs[flatIdx].poisson(extraLambda);
            if (div) {
              const kept = extraArr * (1 - div.reductionFraction);
              const diverted = extraArr - kept;
              this.arrivalsThisStep[flatIdx] += kept;
              this.totalExternalArrived[flatIdx] += kept;
              this.arrivalsThisStep[div.targetFlatIdx] += diverted;
              this.totalExternalArrived[div.targetFlatIdx] += diverted;
              this.totalDivertedVeh += diverted;
            } else {
              this.arrivalsThisStep[flatIdx] += extraArr;
              this.totalExternalArrived[flatIdx] += extraArr;
            }
          }
        }
      }
    }

    // Separate accumulation pass so diverted arrivals added to downstream/alternate targetFlatIdx are accounted once
    for (let flatIdx = 0; flatIdx < this.totalApproaches; flatIdx++) {
      const arr = this.arrivalsThisStep[flatIdx];
      this.totalArrived[flatIdx] += arr;

      // Maintain rolling 60s arrivals buffer
      const rbIdx = flatIdx * this.rollingSteps + this.rollingCursor;
      this.rollingSum[flatIdx] += arr - this.rollingBuffer[rbIdx];
      this.rollingBuffer[rbIdx] = arr;
    }

    this.rollingCursor = (this.rollingCursor + 1) % this.rollingSteps;

    // 3. Prepare emergency green-wave preemption requests
    this._preparePreemptionRequests();

    // 4. Evaluate signal controllers across all junctions (using state before discharge)
    for (let j = 0; j < this.numJunctions; j++) {
      const offset = this.junctionApproachOffsets[j];
      const count = this.junctionApproachCounts[j];
      const jState = this.junctionStates[j];
      const preemptApp = this.preemptRequests[j];
      jState.simTimeMs = this.simTimeMs;
      jState.preemptApproachIdx = preemptApp >= 0 ? preemptApp : null;

      for (let a = 0; a < count; a++) {
        const flatIdx = offset + a;
        const appScratch = jState.approaches[a];
        appScratch.queueVeh = this.queueVeh[flatIdx];
        appScratch.arrivalsThisStep = this.arrivalsThisStep[flatIdx];
        appScratch.arrivalRateVehPerSec = this.arrivalsThisStep[flatIdx] / dt;
        appScratch.capacityFactor = this.capacityFactor[flatIdx] * this.weather.capacityFactor;

        let penalty = 0;
        let occPenalty = 0;
        const outs = this.outgoingLinks[flatIdx];
        for (let m = 0; m < outs.length; m++) {
          const link = outs[m];
          const qDown = this.queueVeh[link.toFlatIdx];
          const qMaxDown = this.storageCapVeh[link.toFlatIdx];
          const occDown = qMaxDown > 0 ? qDown / qMaxDown : 0;
          penalty += link.turnFraction * qDown * (1 + occDown);
          occPenalty += link.turnFraction * occDown * (1 + occDown);
        }
        appScratch.downstreamPenalty = penalty;
        appScratch.downstreamOccupancyPenalty = occPenalty;
      }

      this.lastDecisions[j] = this.controllers[j].decide(jState, this.elapsedSec);
    }

    // 5. Discharge on green after intergreen, update queues & delay, enqueue link ring buffers
    this.departuresThisStep.fill(0);
    for (let j = 0; j < this.numJunctions; j++) {
      const decision = this.lastDecisions[j];
      const offset = this.junctionApproachOffsets[j];
      const count = this.junctionApproachCounts[j];

      for (let a = 0; a < count; a++) {
        const flatIdx = offset + a;
        const arr = this.arrivalsThisStep[flatIdx];
        const isGreen = !decision.inIntergreen && a === decision.phaseIndex;

        let dep = 0;
        if (isGreen) {
          const maxDischarge =
            this.saturationFlowPerSec[flatIdx] *
            this.capacityFactor[flatIdx] *
            this.weather.capacityFactor *
            dt;
          let downstreamSpace = Infinity;
          const outs = this.outgoingLinks[flatIdx];
          for (let m = 0; m < outs.length; m++) {
            const link = outs[m];
            const remSpace = Math.max(0, this.storageCapVeh[link.toFlatIdx] - this.queueVeh[link.toFlatIdx]);
            const allowedFromLink = remSpace / link.turnFraction;
            if (allowedFromLink < downstreamSpace) {
              downstreamSpace = allowedFromLink;
            }
          }
          dep = Math.min(this.queueVeh[flatIdx] + arr, maxDischarge, downstreamSpace);
          if (dep < 0) dep = 0;
        }

        this.departuresThisStep[flatIdx] = dep;
        const nextQ = this.queueVeh[flatIdx] + arr - dep;
        this.queueVeh[flatIdx] = nextQ;
        this.totalDeparted[flatIdx] += dep;
        this.delayVehSec[flatIdx] += nextQ * dt;
        if (nextQ > this.maxQueueVeh[flatIdx]) {
          this.maxQueueVeh[flatIdx] = nextQ;
        }

        if (dep > 0) {
          const outs = this.outgoingLinks[flatIdx];
          for (let m = 0; m < outs.length; m++) {
            const link = outs[m];
            const writeSlot = (this.stepIndex + link.delaySteps) % link.delaySteps;
            link.ringBuffer[writeSlot] += dep * link.turnFraction;
          }
        }
      }
    }

    // 6. Advance emergency vehicles using current approach speeds and signal states
    this._stepEmergencies();

    // 7. Advance simulation clocks
    this.stepIndex += 1;
    this.elapsedSec += dt;
    this.simTimeMs += dt * 1000;
  }

  /**
   * Build a telemetry-compatible snapshot for one junction (`junctionId`) or the full network.
   * Note: `vehiclesPerMin` consistently measures approach arrivals over the rolling 60s window.
   */
  snapshot(junctionId = null) {
    if (junctionId !== null && junctionId !== undefined) {
      const jIdx = this.junctionIndexById.get(junctionId);
      if (jIdx === undefined) return null;
      return this._buildJunctionSnapshot(jIdx);
    }

    const junctions = {};
    let totalDelayVehSec = 0;
    let totalArrived = 0;
    let totalThroughputVeh = 0;

    for (let j = 0; j < this.numJunctions; j++) {
      const jSnap = this._buildJunctionSnapshot(j);
      junctions[this.junctions[j].junctionId] = jSnap;
      totalDelayVehSec += jSnap.kpi.delayVehSec;
      totalArrived += jSnap.kpi.arrivedVeh;
      totalThroughputVeh += jSnap.kpi.throughputVeh;
    }

    const completedEmergencies = this.emergencies.filter((e) => e.status === 'completed');
    const activeEmergencies = this.emergencies.filter((e) => e.status === 'en-route');

    return {
      simTime: new Date(this.simTimeMs).toISOString(),
      elapsedSec: this.elapsedSec,
      demandScale: this.demandScale,
      demandFactor: Number((demandFactor(this.simTimeMs) * this.demandScale).toFixed(3)),
      junctions,
      network: {
        totalDelayVehSec: Number(totalDelayVehSec.toFixed(2)),
        totalDelayVehHours: Number((totalDelayVehSec / 3600).toFixed(4)),
        avgDelayPerVehSec: totalArrived > 0 ? Number((totalDelayVehSec / totalArrived).toFixed(2)) : 0,
        totalThroughputVeh: Number(totalThroughputVeh.toFixed(2)),
        activeEmergencies: activeEmergencies.length,
        completedEmergencies: completedEmergencies.length,
      },
    };
  }

  _buildJunctionSnapshot(jIdx) {
    const junc = this.junctions[jIdx];
    const decision = this.lastDecisions[jIdx];
    const ctrl = this.controllers[jIdx];
    const offset = this.junctionApproachOffsets[jIdx];
    const count = this.junctionApproachCounts[jIdx];

    const windowScale =
      this.elapsedSec > 0 && this.elapsedSec < 60
        ? 60 / this.elapsedSec
        : 1;

    let totalFlowVehiclesPerMin = 0;
    let maxQueueLengthM = 0;
    let sumSpeed = 0;
    let jDelayVehSec = 0;
    let jThroughputVeh = 0;
    let jArrivedVeh = 0;
    let maxSatRatio = 0;
    let maxStorageRatio = 0;
    let stalledVehicleDetected = false;

    const approaches = new Array(count);

    for (let a = 0; a < count; a++) {
      const flatIdx = offset + a;
      const appCfg = junc.approaches[a];

      const q = this.queueVeh[flatIdx];
      const qLenM = (q * EFFECTIVE_VEH_LENGTH_M) / this.lanes[flatIdx];
      const speedKmph = this._approachSpeedKmph(flatIdx);
      const vehiclesPerMin = Math.round(this.rollingSum[flatIdx] * windowScale);

      const isGreen = !decision.inIntergreen && a === decision.phaseIndex;
      const signal = isGreen ? 'green' : decision.inIntergreen && a === decision.phaseIndex ? 'amber' : 'red';
      const greenTimeSec = decision.splits[a] ?? appCfg.greenSplitSec ?? 30;

      if (this.incidents.has(flatIdx)) {
        stalledVehicleDetected = true;
      }

      totalFlowVehiclesPerMin += vehiclesPerMin;
      if (qLenM > maxQueueLengthM) maxQueueLengthM = qLenM;
      sumSpeed += speedKmph;

      jDelayVehSec += this.delayVehSec[flatIdx];
      jThroughputVeh += this.totalDeparted[flatIdx];
      jArrivedVeh += this.totalArrived[flatIdx];

      const greenShare = decision.cycleSec > 0 ? greenTimeSec / decision.cycleSec : 0.25;
      const approachCapVehPerSec =
        this.saturationFlowPerSec[flatIdx] *
        this.capacityFactor[flatIdx] *
        this.weather.capacityFactor *
        greenShare;
      const arrivalVehPerSec = (this.rollingSum[flatIdx] * windowScale) / 60;
      const vOverC = approachCapVehPerSec > 0 ? arrivalVehPerSec / approachCapVehPerSec : 1.5;
      if (vOverC > maxSatRatio) maxSatRatio = vOverC;

      const storageRatio = this.storageCapVeh[flatIdx] > 0 ? Math.min(1, q / this.storageCapVeh[flatIdx]) : 0;
      if (storageRatio > maxStorageRatio) maxStorageRatio = storageRatio;

      approaches[a] = {
        road: appCfg.road,
        dir: appCfg.dir,
        lanes: appCfg.lanes,
        vehiclesPerMin,
        queueVeh: Number(q.toFixed(2)),
        queueLengthM: Number(qLenM.toFixed(1)),
        avgSpeedKmph: Number(speedKmph.toFixed(1)),
        signal,
        greenTimeSec,
        vOverC: Number(Math.min(3.0, vOverC).toFixed(3)),
        storageRatio: Number(storageRatio.toFixed(3)),
      };
    }

    let ambulanceDetected = false;
    for (let i = 0; i < this.emergencies.length; i++) {
      const em = this.emergencies[i];
      if (em.status !== 'en-route') continue;
      const leg = em.legs[em.legIndex];
      if (leg.junctionIdx === jIdx && em.remainingDistM <= 500) {
        ambulanceDetected = true;
        break;
      }
    }

    const avgSpeedKmph = count > 0 ? Number((sumSpeed / count).toFixed(1)) : FREE_FLOW_SPEED_KMPH;

    // Composite congestion score (0..100):
    // 45% from degree of saturation (v/c normalized to 1.2) + 55% from worst queue/storage occupancy
    const satComponent = Math.min(1, maxSatRatio / 1.2) * 45;
    const queueComponent = maxStorageRatio * 55;
    const congestionScore = Math.min(100, Math.round(satComponent + queueComponent));

    return {
      approaches,
      vehicleMix: { ...junc.vehicleMix },
      stalledVehicleDetected,
      ambulanceDetected,
      totalFlowVehiclesPerMin,
      maxQueueLengthM: Number(maxQueueLengthM.toFixed(1)),
      avgSpeedKmph,
      congestionScore,
      control: {
        controller: ctrl.name,
        activeController: decision.activeController ?? ctrl.name,
        flowRatioY: decision.flowRatioY ?? null,
        reason: decision.reason ?? null,
        cycleSec: decision.cycleSec,
        phaseIndex: decision.phaseIndex,
        greenRemainingSec: decision.greenRemainingSec,
        splits: [...decision.splits],
        planned: decision.planned ?? null,
        realised: decision.realised ?? null,
        inIntergreen: decision.inIntergreen,
      },
      kpi: {
        delayVehSec: Number(jDelayVehSec.toFixed(2)),
        avgDelayPerVehSec: jArrivedVeh > 0 ? Number((jDelayVehSec / jArrivedVeh).toFixed(2)) : 0,
        throughputVeh: Number(jThroughputVeh.toFixed(2)),
        arrivedVeh: Number(jArrivedVeh.toFixed(2)),
        degreeOfSaturation: Number(Math.min(2.5, maxSatRatio).toFixed(3)),
      },
    };
  }
}
