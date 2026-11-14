/**
 * Counterfactual Twin Simulation Pair
 *
 * Runs two synchronized TrafficWorld instances side-by-side under Common Random Numbers
 * (identical seed, network topology, time-of-day demand, incidents, and surges):
 *  - `live`: adaptive/switchable signal controller (Fixed, Webster, or Max-Pressure) + optional preemption
 *  - `baseline`: locked to Fixed-Time pre-timed control with no preemption
 */

import { TrafficWorld } from './engine.js';
import { DEFAULT_NETWORK } from './network.js';

export class CounterfactualPair {
  /**
   * @param {object} [opts]
   * @param {number|string} [opts.seed=20261114]
   * @param {object} [opts.network=DEFAULT_NETWORK]
   * @param {Date|number|string} [opts.startTime]
   * @param {number} [opts.dtSec=1]
   * @param {Function|string} [opts.liveControllerFactory='max-pressure']
   * @param {boolean} [opts.prewarmLinks=true]
   */
  constructor({
    seed = 20261114,
    network = DEFAULT_NETWORK,
    startTime = '2026-11-14T13:30:00.000Z',
    dtSec = 1,
    liveControllerFactory = 'max-pressure',
    prewarmLinks = true,
  } = {}) {
    this.seed = seed;
    this.network = network;
    this.dtSec = dtSec;

    this.live = new TrafficWorld({
      seed,
      network,
      startTime,
      dtSec,
      controllerFactory: liveControllerFactory,
      prewarmLinks,
    });

    this.baseline = new TrafficWorld({
      seed,
      network,
      startTime,
      dtSec,
      controllerFactory: 'fixed-time',
      prewarmLinks,
    });

    this.emergencyPairs = [];
  }

  step() {
    this.live.step();
    this.baseline.step();
  }

  /**
   * Switch controller ONLY on the live world (baseline remains Fixed-Time).
   */
  setController(junctionId, controllerOrFactory) {
    this.live.setController(junctionId, controllerOrFactory);
  }

  /**
   * Inject identical physical incident into both worlds.
   */
  injectIncident(junctionId, approachIdx, opts) {
    const l = this.live.injectIncident(junctionId, approachIdx, opts);
    const b = this.baseline.injectIncident(junctionId, approachIdx, opts);
    return l && b;
  }

  /**
   * Clear incident (defaults to clearing live only for operator remediation,
   * or both if liveOnly=false).
   */
  clearIncident(junctionId, approachIdx = null, { liveOnly = false } = {}) {
    const l = this.live.clearIncident(junctionId, approachIdx);
    const b = liveOnly ? true : this.baseline.clearIncident(junctionId, approachIdx);
    return l && b;
  }

  /**
   * Apply identical demand surge into both worlds.
   */
  setDemandSurge(junctionId, factor, until = null, approachIdx = null) {
    const l = this.live.setDemandSurge(junctionId, factor, until, approachIdx);
    const b = this.baseline.setDemandSurge(junctionId, factor, until, approachIdx);
    return l && b;
  }

  clearDemandSurge(junctionId) {
    this.live.clearDemandSurge(junctionId);
    this.baseline.clearDemandSurge(junctionId);
  }

  /**
   * Dispatch emergency responder on both twins along identical path.
   * Baseline NEVER receives preemption even if preempt=true on live.
   */
  dispatchEmergency({ path, preempt = true } = {}) {
    const liveAgent = this.live.dispatchEmergency({ path, preempt: Boolean(preempt) });
    const baselineAgent = this.baseline.dispatchEmergency({ path, preempt: false });
    const pair = { live: liveAgent, baseline: baselineAgent };
    this.emergencyPairs.push(pair);
    return pair;
  }

  /**
   * Compute live vs baseline counterfactual comparison across network & every junction.
   */
  comparison() {
    const liveSnap = this.live.snapshot();
    const baseSnap = this.baseline.snapshot();

    const byJunction = {};
    for (const junc of this.live.junctions) {
      const id = junc.junctionId;
      const l = liveSnap.junctions[id];
      const b = baseSnap.junctions[id];
      const delaySavedVehSec = b.kpi.delayVehSec - l.kpi.delayVehSec;
      const delaySavedVehHours = delaySavedVehSec / 3600;
      const delayReductionPct =
        b.kpi.delayVehSec > 0 ? (delaySavedVehSec / b.kpi.delayVehSec) * 100 : 0;

      byJunction[id] = {
        delaySavedVehSec: Number(delaySavedVehSec.toFixed(2)),
        delaySavedVehHours: Number(delaySavedVehHours.toFixed(4)),
        delayReductionPct: Number(delayReductionPct.toFixed(2)),
        live: {
          controller: l.control.controller,
          delayVehSec: l.kpi.delayVehSec,
          avgDelayPerVehSec: l.kpi.avgDelayPerVehSec,
          throughputVeh: l.kpi.throughputVeh,
          congestionScore: l.congestionScore,
          maxQueueLengthM: l.maxQueueLengthM,
        },
        baseline: {
          controller: b.control.controller,
          delayVehSec: b.kpi.delayVehSec,
          avgDelayPerVehSec: b.kpi.avgDelayPerVehSec,
          throughputVeh: b.kpi.throughputVeh,
          congestionScore: b.congestionScore,
          maxQueueLengthM: b.maxQueueLengthM,
        },
      };
    }

    const totalDelaySavedVehSec =
      baseSnap.network.totalDelayVehSec - liveSnap.network.totalDelayVehSec;
    const totalDelaySavedVehHours = totalDelaySavedVehSec / 3600;
    const totalDelayReductionPct =
      baseSnap.network.totalDelayVehSec > 0
        ? (totalDelaySavedVehSec / baseSnap.network.totalDelayVehSec) * 100
        : 0;

    const completedLiveTimes = [];
    const completedBaseTimes = [];
    const pairSummaries = this.emergencyPairs.map(({ live, baseline }) => {
      if (live.travelTimeSec !== null) completedLiveTimes.push(live.travelTimeSec);
      if (baseline.travelTimeSec !== null) completedBaseTimes.push(baseline.travelTimeSec);
      return {
        path: live.path,
        liveStatus: live.status,
        baselineStatus: baseline.status,
        liveTravelTimeSec: live.travelTimeSec,
        baselineTravelTimeSec: baseline.travelTimeSec,
        timeSavedSec:
          live.travelTimeSec !== null && baseline.travelTimeSec !== null
            ? Number((baseline.travelTimeSec - live.travelTimeSec).toFixed(2))
            : null,
      };
    });

    const mean = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const liveAvgEmergencySec = mean(completedLiveTimes);
    const baseAvgEmergencySec = mean(completedBaseTimes);

    return {
      elapsedSec: this.live.elapsedSec,
      simTime: liveSnap.simTime,
      delaySavedVehHours: Number(totalDelaySavedVehHours.toFixed(4)),
      delaySavedVehSec: Number(totalDelaySavedVehSec.toFixed(2)),
      delayReductionPct: Number(totalDelayReductionPct.toFixed(2)),
      live: {
        totalDelayVehSec: liveSnap.network.totalDelayVehSec,
        totalDelayVehHours: liveSnap.network.totalDelayVehHours,
        avgDelayPerVehSec: liveSnap.network.avgDelayPerVehSec,
        throughputVeh: liveSnap.network.totalThroughputVeh,
      },
      baseline: {
        totalDelayVehSec: baseSnap.network.totalDelayVehSec,
        totalDelayVehHours: baseSnap.network.totalDelayVehHours,
        avgDelayPerVehSec: baseSnap.network.avgDelayPerVehSec,
        throughputVeh: baseSnap.network.totalThroughputVeh,
      },
      emergency: {
        liveTravelTimeSec: liveAvgEmergencySec !== null ? Number(liveAvgEmergencySec.toFixed(2)) : null,
        baselineTravelTimeSec: baseAvgEmergencySec !== null ? Number(baseAvgEmergencySec.toFixed(2)) : null,
        timeSavedSec:
          liveAvgEmergencySec !== null && baseAvgEmergencySec !== null
            ? Number((baseAvgEmergencySec - liveAvgEmergencySec).toFixed(2))
            : null,
        trips: pairSummaries,
      },
      byJunction,
    };
  }
}
