/**
 * Real-Time Traffic Signal Controllers
 *
 * Common interface:
 *   controller.decide(junctionState, nowSec)
 *     -> {
 *          controller, phaseIndex, greenRemainingSec, cycleSec, splits,
 *          planned: { cycleSec, splits } | null,
 *          realised: { windowSec, observedSec, cycleSec, splits, greenSec, greenSharePct, phaseSwitches },
 *          inIntergreen, intergreenRemainingSec, activePeriod?
 *        }
 *   controller.name
 *   controller.describe() -> metadata object with active parameters + planned/realised timing
 */

import { getTodPeriod } from './demand.js';
import { loadStudyPolicy, recommendControllerForRegime } from './studyPolicy.js';

export const INTERGREEN_SEC = 4; // 3s amber + 1s all-red clearance
export const MIN_GREEN_SEC = 10;
export const MAX_GREEN_SEC = 60;
export const MIN_CYCLE_SEC = 45;
export const MAX_CYCLE_SEC = 150;
export const SATURATION_PER_LANE_VEH_PER_SEC = 0.5; // 1800 PCU/h/lane
export const MAX_PRESSURE_EVAL_INTERVAL_SEC = 5;
export const MAX_PRESSURE_ETA = 0.15;
export const MAX_PRESSURE_THETA = 2.0;
export const DEFAULT_MAX_RED_SEC = 120;
export const REALISED_WINDOW_SEC = 300;
export const PREEMPT_LEAD_WINDOW_SEC = INTERGREEN_SEC + 6; // 10s base green-wave lead

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Pure Webster (1958) optimal cycle length and green split calculator.
 */
export function computeWebsterPlan({
  flowRatios,
  intergreenSec = INTERGREEN_SEC,
  minCycleSec = MIN_CYCLE_SEC,
  maxCycleSec = MAX_CYCLE_SEC,
  minGreenSec = MIN_GREEN_SEC,
  maxGreenSec = MAX_GREEN_SEC,
}) {
  const numPhases = flowRatios.length;
  const totalLostTimeSec = numPhases * intergreenSec;
  const rawY = flowRatios.reduce((acc, y) => acc + Math.max(0, y), 0);

  if (rawY <= 1e-9) {
    const equalGreen = clamp(
      Math.round((minCycleSec - totalLostTimeSec) / numPhases),
      minGreenSec,
      maxGreenSec
    );
    const splits = new Array(numPhases).fill(equalGreen);
    const cycleSec = splits.reduce((a, b) => a + b, 0) + totalLostTimeSec;
    return {
      cycleSec,
      splits,
      flowRatios: flowRatios.map(() => 0),
      criticalRatio: 0,
      rawCriticalRatio: 0,
      saturated: false,
    };
  }

  const saturated = rawY > 0.9;
  const clampedY = Math.min(0.9, rawY);
  const rawC0 = saturated
    ? maxCycleSec
    : (1.5 * totalLostTimeSec + 5) / (1 - clampedY);
  const C0 = clamp(rawC0, minCycleSec, maxCycleSec);
  const effectiveGreenBudget = Math.max(numPhases * minGreenSec, C0 - totalLostTimeSec);

  const splits = flowRatios.map((yk) => {
    const share = Math.max(0, yk) / rawY;
    const rawGreen = Math.round(share * effectiveGreenBudget);
    return clamp(rawGreen, minGreenSec, maxGreenSec);
  });

  const cycleSec = splits.reduce((a, b) => a + b, 0) + totalLostTimeSec;

  return {
    cycleSec,
    splits,
    flowRatios: flowRatios.map((y) => Number(y.toFixed(4))),
    criticalRatio: Number(clampedY.toFixed(4)),
    rawCriticalRatio: Number(rawY.toFixed(4)),
    saturated,
  };
}

/**
 * Rolling 300 s realised green-time & cycle-length tracker.
 * Measures actual green seconds, phase switches, completed cycle lengths,
 * and mean green durations per phase without fabricating splits.
 */
class RealisedTimingTracker {
  constructor(numPhases, intergreenSec = INTERGREEN_SEC, windowSec = REALISED_WINDOW_SEC) {
    this.numPhases = numPhases;
    this.intergreenSec = intergreenSec;
    this.windowSec = windowSec;

    this.slices = []; // { startSec, endSec, phaseIndex, inIntergreen }
    this.episodes = []; // completed green episodes: { phaseIndex, durationSec, endSec }
    this.cycleLengths = []; // { durationSec, endSec }
    this._activeEpisodeStart = 0;
    this._activePhase = null;
    this._activeInIntergreen = false;
    this._lastCycleStartSec = null;
    this._sawNonZeroPhase = false;
    this._lastNowSec = null;
  }

  record(nowSec, dt, phaseIndex, inIntergreen) {
    if (this._activePhase === null) {
      this._activePhase = phaseIndex;
      this._activeInIntergreen = inIntergreen;
      this._activeEpisodeStart = nowSec;
      this._lastCycleStartSec = phaseIndex === 0 && !inIntergreen ? nowSec : null;
      this._lastNowSec = nowSec;
      return;
    }

    if (dt > 0) {
      const startSec = nowSec - dt;
      this.slices.push({
        startSec,
        endSec: nowSec,
        phaseIndex: this._activePhase,
        inIntergreen: this._activeInIntergreen,
      });
    }

    // Detect transition from green -> intergreen (green episode completed)
    if (!this._activeInIntergreen && inIntergreen) {
      const dur = nowSec - this._activeEpisodeStart;
      if (dur > 0) {
        this.episodes.push({
          phaseIndex: this._activePhase,
          durationSec: dur,
          endSec: nowSec,
        });
      }
      if (this._activePhase !== 0) {
        this._sawNonZeroPhase = true;
      }
    }

    // Detect transition from intergreen -> green (new green episode begins)
    if (this._activeInIntergreen && !inIntergreen) {
      this._activeEpisodeStart = nowSec;
      if (phaseIndex === 0 && this._sawNonZeroPhase) {
        if (this._lastCycleStartSec !== null) {
          this.cycleLengths.push({
            durationSec: nowSec - this._lastCycleStartSec,
            endSec: nowSec,
          });
        }
        this._lastCycleStartSec = nowSec;
        this._sawNonZeroPhase = false;
      } else if (phaseIndex === 0 && this._lastCycleStartSec === null) {
        this._lastCycleStartSec = nowSec;
      }
    }

    this._activePhase = phaseIndex;
    this._activeInIntergreen = inIntergreen;
    this._lastNowSec = nowSec;

    // Prune entries completely outside trailing window
    const cutoff = nowSec - this.windowSec;
    while (this.slices.length > 0 && this.slices[0].endSec <= cutoff) {
      this.slices.shift();
    }
    while (this.episodes.length > 0 && this.episodes[0].endSec <= cutoff) {
      this.episodes.shift();
    }
    while (this.cycleLengths.length > 0 && this.cycleLengths[0].endSec <= cutoff) {
      this.cycleLengths.shift();
    }
  }

  getSummary(nowSec) {
    const cutoff = nowSec - this.windowSec;
    const greenSec = new Array(this.numPhases).fill(0);
    let totalObserved = 0;

    for (let i = 0; i < this.slices.length; i++) {
      const sl = this.slices[i];
      const clampedStart = Math.max(sl.startSec, cutoff);
      const dur = Math.max(0, sl.endSec - clampedStart);
      if (dur <= 0) continue;
      totalObserved += dur;
      if (!sl.inIntergreen && sl.phaseIndex >= 0 && sl.phaseIndex < this.numPhases) {
        greenSec[sl.phaseIndex] += dur;
      }
    }

    const epSum = new Array(this.numPhases).fill(0);
    const epCount = new Array(this.numPhases).fill(0);
    let totalEpisodes = 0;
    for (let i = 0; i < this.episodes.length; i++) {
      const ep = this.episodes[i];
      epSum[ep.phaseIndex] += ep.durationSec;
      epCount[ep.phaseIndex] += 1;
      totalEpisodes += 1;
    }

    // If current phase is active in green and has no completed episode yet, include ongoing duration
    const splits = new Array(this.numPhases).fill(0);
    for (let k = 0; k < this.numPhases; k++) {
      if (epCount[k] > 0) {
        splits[k] = Math.round(epSum[k] / epCount[k]);
      } else if (!this._activeInIntergreen && this._activePhase === k && this._lastNowSec !== null) {
        splits[k] = Math.round(Math.max(0, this._lastNowSec - this._activeEpisodeStart));
      }
    }

    let meanCycleSec = 0;
    if (this.cycleLengths.length > 0) {
      const sumC = this.cycleLengths.reduce((acc, c) => acc + c.durationSec, 0);
      meanCycleSec = Math.round(sumC / this.cycleLengths.length);
    } else if (totalEpisodes > 0 && totalObserved > 0) {
      const meanSlotSec = totalObserved / totalEpisodes;
      meanCycleSec = Math.round(meanSlotSec * this.numPhases);
    }

    const greenSharePct = greenSec.map((g) =>
      totalObserved > 0 ? Number(((g / totalObserved) * 100).toFixed(1)) : 0
    );

    return {
      windowSec: this.windowSec,
      observedSec: Number(totalObserved.toFixed(1)),
      cycleSec: meanCycleSec,
      splits,
      greenSec: greenSec.map((g) => Number(g.toFixed(1))),
      greenSharePct,
      phaseSwitches: totalEpisodes,
    };
  }

  clone() {
    const copy = new RealisedTimingTracker(this.numPhases, this.intergreenSec, this.windowSec);
    copy.slices = this.slices.map((s) => ({ ...s }));
    copy.episodes = this.episodes.map((e) => ({ ...e }));
    copy.cycleLengths = this.cycleLengths.map((c) => ({ ...c }));
    copy._activeEpisodeStart = this._activeEpisodeStart;
    copy._activePhase = this._activePhase;
    copy._activeInIntergreen = this._activeInIntergreen;
    copy._lastCycleStartSec = this._lastCycleStartSec;
    copy._sawNonZeroPhase = this._sawNonZeroPhase;
    copy._lastNowSec = this._lastNowSec;
    return copy;
  }
}

/**
 * Shared preemption transition helper used by all controllers when an emergency
 * responder with `preempt=true` requests priority.
 */
function handlePreemptionTransition(ctrl, preemptApproachIdx) {
  if (preemptApproachIdx === null || preemptApproachIdx === undefined) {
    return false;
  }

  if (ctrl.inIntergreen) {
    ctrl.pendingPhaseIndex = preemptApproachIdx;
    return true;
  }

  if (ctrl.phaseIndex === preemptApproachIdx) {
    ctrl.greenRemainingSec = Math.max(ctrl.greenRemainingSec, 2);
    return true;
  }

  ctrl.inIntergreen = true;
  ctrl.intergreenRemainingSec = ctrl.intergreenSec;
  ctrl.pendingPhaseIndex = preemptApproachIdx;
  ctrl.greenRemainingSec = 0;
  return true;
}

/**
 * Fixed-Time Signal Controller
 *
 * Modes:
 * - 'tod' (default): "Fixed-time (Webster-tuned TOD plan)". Uses a precomputed offline
 *   time-of-day (night / am-peak / midday / pm-peak / evening) plan table derived via
 *   Webster's formula from expected mean period demand, switching plans at period boundaries.
 * - 'naive': Uses raw static catalogue `greenSplitSec` values (retained strictly for tests).
 */
export class FixedTimeController {
  constructor(junctionConfig, options = {}) {
    this.mode = options.mode === 'naive' ? 'naive' : 'tod';
    this.name = this.mode === 'naive' ? 'fixed-naive' : 'fixed-tod';
    this.label =
      this.mode === 'naive'
        ? 'Fixed-time (Naive Catalogue Plan)'
        : 'Fixed-time (Webster-tuned TOD plan)';
    this.intergreenSec = options.intergreenSec ?? INTERGREEN_SEC;
    this.startTimeMs = options.startTimeMs ?? Date.parse('2026-11-14T13:30:00.000Z');

    const approaches = junctionConfig?.approaches || junctionConfig?.baseApproaches || [];
    this.numPhases = Math.max(1, approaches.length);
    this.naiveSplits = approaches.map((a) => Math.max(MIN_GREEN_SEC, a.greenSplitSec || 35));
    this.todPlans = junctionConfig?.todPlans || null;

    this.activePeriodId = null;
    if (this.mode === 'tod' && this.todPlans) {
      const p = getTodPeriod(this.startTimeMs);
      const plan = this.todPlans[p.id];
      this.activePeriodId = p.id;
      this.splits = plan ? [...plan.splits] : [...this.naiveSplits];
    } else {
      this.splits = [...this.naiveSplits];
    }
    this.cycleSec = this.splits.reduce((a, b) => a + b, 0) + this.numPhases * this.intergreenSec;

    this.phaseIndex = options.initialPhaseIndex ?? 0;
    this.greenRemainingSec = this.splits[this.phaseIndex] ?? 35;
    this.inIntergreen = false;
    this.intergreenRemainingSec = 0;
    this.pendingPhaseIndex = this.phaseIndex;
    this._lastNowSec = null;
    this._tracker = new RealisedTimingTracker(this.numPhases, this.intergreenSec);
  }

  _syncTodPlan(simTimeMs) {
    if (this.mode !== 'tod' || !this.todPlans) return;
    const p = getTodPeriod(simTimeMs);
    if (p.id !== this.activePeriodId && this.todPlans[p.id]) {
      this.activePeriodId = p.id;
      this.splits = [...this.todPlans[p.id].splits];
      this.cycleSec = this.todPlans[p.id].cycleSec;
    }
  }

  describe() {
    const nowSec = this._lastNowSec ?? 0;
    return {
      name: this.name,
      label: this.label,
      mode: this.mode,
      activePeriod: this.activePeriodId,
      intergreenSec: this.intergreenSec,
      cycleSec: this.cycleSec,
      splits: [...this.splits],
      planned: {
        cycleSec: this.cycleSec,
        splits: [...this.splits],
      },
      realised: this._tracker.getSummary(nowSec),
    };
  }

  decide(junctionState = {}, nowSec = 0) {
    const dt = this._lastNowSec === null ? 0 : Math.max(0, nowSec - this._lastNowSec);
    this._lastNowSec = nowSec;

    const simTimeMs = junctionState.simTimeMs ?? (this.startTimeMs + nowSec * 1000);

    if (dt > 0) {
      if (this.inIntergreen) {
        this.intergreenRemainingSec -= dt;
        if (this.intergreenRemainingSec <= 1e-9) {
          this.inIntergreen = false;
          this.intergreenRemainingSec = 0;
          this.phaseIndex = this.pendingPhaseIndex;
          // Apply any TOD period boundary transition cleanly on cycle wrap
          if (this.phaseIndex === 0) {
            this._syncTodPlan(simTimeMs);
          }
          this.greenRemainingSec = this.splits[this.phaseIndex];
        }
      } else {
        this.greenRemainingSec -= dt;
        if (this.greenRemainingSec <= 1e-9) {
          this.inIntergreen = true;
          this.intergreenRemainingSec = this.intergreenSec;
          this.pendingPhaseIndex = (this.phaseIndex + 1) % this.numPhases;
          this.greenRemainingSec = 0;
        }
      }
    } else if (this.mode === 'tod' && this.todPlans) {
      this._syncTodPlan(simTimeMs);
    }

    const preemptIdx = junctionState.preemptApproachIdx;
    if (preemptIdx !== null && preemptIdx !== undefined) {
      handlePreemptionTransition(this, preemptIdx);
    }

    this._tracker.record(nowSec, dt, this.phaseIndex, this.inIntergreen);
    const realised = this._tracker.getSummary(nowSec);

    return {
      controller: this.name,
      activePeriod: this.activePeriodId,
      phaseIndex: this.phaseIndex,
      greenRemainingSec: Math.max(0, Math.round(this.greenRemainingSec)),
      cycleSec: this.cycleSec,
      splits: [...this.splits],
      planned: {
        cycleSec: this.cycleSec,
        splits: [...this.splits],
      },
      realised,
      inIntergreen: this.inIntergreen,
      intergreenRemainingSec: Math.max(0, Math.round(this.intergreenRemainingSec)),
    };
  }

  clone() {
    const copy = Object.create(FixedTimeController.prototype);
    copy.mode = this.mode;
    copy.name = this.name;
    copy.label = this.label;
    copy.intergreenSec = this.intergreenSec;
    copy.startTimeMs = this.startTimeMs;
    copy.numPhases = this.numPhases;
    copy.naiveSplits = [...this.naiveSplits];
    copy.todPlans = this.todPlans;
    copy.activePeriodId = this.activePeriodId;
    copy.splits = [...this.splits];
    copy.cycleSec = this.cycleSec;
    copy.phaseIndex = this.phaseIndex;
    copy.greenRemainingSec = this.greenRemainingSec;
    copy.inIntergreen = this.inIntergreen;
    copy.intergreenRemainingSec = this.intergreenRemainingSec;
    copy.pendingPhaseIndex = this.pendingPhaseIndex;
    copy._lastNowSec = this._lastNowSec;
    copy._tracker = this._tracker.clone();
    return copy;
  }
}

/**
 * Webster Adaptive Cycle & Split Controller
 * Continuously estimates arrival flow rates via EWMA and recomputes optimal cycle
 * length C0 and splits g_k at the start of every cycle.
 */
export class WebsterController {
  constructor(junctionConfig, options = {}) {
    this.name = 'webster';
    this.intergreenSec = options.intergreenSec ?? INTERGREEN_SEC;
    this.minCycleSec = options.minCycleSec ?? MIN_CYCLE_SEC;
    this.maxCycleSec = options.maxCycleSec ?? MAX_CYCLE_SEC;
    this.minGreenSec = options.minGreenSec ?? MIN_GREEN_SEC;
    this.maxGreenSec = options.maxGreenSec ?? MAX_GREEN_SEC;
    this.s0 = options.s0 ?? SATURATION_PER_LANE_VEH_PER_SEC;
    this.ewmaTimeConstantSec = options.ewmaTimeConstantSec ?? 45;

    const approaches = junctionConfig?.approaches || junctionConfig?.baseApproaches || [];
    this.numPhases = Math.max(1, approaches.length);
    this.saturationFlows = approaches.map(
      (a) => a.saturationFlowPerSec ?? (a.lanes || 2) * this.s0
    );

    this.ewmaFlows = approaches.map((a) =>
      options.zeroInitFlows ? 0 : (a.baseDemandPerSec ?? 0)
    );

    const initialPlan = this._computePlanFromEwma();
    this.splits = initialPlan.splits;
    this.cycleSec = initialPlan.cycleSec;
    this.lastPlan = initialPlan;

    this.phaseIndex = options.initialPhaseIndex ?? 0;
    this.greenRemainingSec = this.splits[this.phaseIndex];
    this.inIntergreen = false;
    this.intergreenRemainingSec = 0;
    this.pendingPhaseIndex = this.phaseIndex;
    this._lastNowSec = null;
    this._tracker = new RealisedTimingTracker(this.numPhases, this.intergreenSec);
  }

  _computePlanFromEwma() {
    const flowRatios = this.ewmaFlows.map((q, i) => {
      const S = this.saturationFlows[i] || this.s0 * 2;
      return q / S;
    });
    return computeWebsterPlan({
      flowRatios,
      intergreenSec: this.intergreenSec,
      minCycleSec: this.minCycleSec,
      maxCycleSec: this.maxCycleSec,
      minGreenSec: this.minGreenSec,
      maxGreenSec: this.maxGreenSec,
    });
  }

  describe() {
    const nowSec = this._lastNowSec ?? 0;
    return {
      name: this.name,
      label: 'Webster Optimal Cycle & Split Controller',
      s0PcuPerHourPerLane: Math.round(this.s0 * 3600),
      intergreenSec: this.intergreenSec,
      minCycleSec: this.minCycleSec,
      maxCycleSec: this.maxCycleSec,
      minGreenSec: this.minGreenSec,
      maxGreenSec: this.maxGreenSec,
      ewmaTimeConstantSec: this.ewmaTimeConstantSec,
      cycleSec: this.cycleSec,
      splits: [...this.splits],
      planned: {
        cycleSec: this.cycleSec,
        splits: [...this.splits],
      },
      realised: this._tracker.getSummary(nowSec),
    };
  }

  _updateEwma(approaches, dt) {
    if (!Array.isArray(approaches) || dt <= 0) return;
    const alpha = 1 - Math.exp(-dt / this.ewmaTimeConstantSec);
    for (let i = 0; i < this.numPhases; i++) {
      const app = approaches[i];
      if (!app) continue;
      let instRate = null;
      if (typeof app.arrivalRateVehPerSec === 'number') {
        instRate = app.arrivalRateVehPerSec;
      } else if (typeof app.arrivalsThisStep === 'number') {
        instRate = app.arrivalsThisStep / dt;
      }
      if (instRate !== null) {
        this.ewmaFlows[i] = alpha * instRate + (1 - alpha) * this.ewmaFlows[i];
      }
    }
  }

  decide(junctionState = {}, nowSec = 0) {
    const dt = this._lastNowSec === null ? 0 : Math.max(0, nowSec - this._lastNowSec);
    this._lastNowSec = nowSec;

    if (dt > 0) {
      this._updateEwma(junctionState.approaches, dt);

      if (this.inIntergreen) {
        this.intergreenRemainingSec -= dt;
        if (this.intergreenRemainingSec <= 1e-9) {
          this.inIntergreen = false;
          this.intergreenRemainingSec = 0;
          this.phaseIndex = this.pendingPhaseIndex;

          if (this.phaseIndex === 0) {
            const plan = this._computePlanFromEwma();
            this.splits = plan.splits;
            this.cycleSec = plan.cycleSec;
            this.lastPlan = plan;
          }

          this.greenRemainingSec = this.splits[this.phaseIndex];
        }
      } else {
        this.greenRemainingSec -= dt;
        if (this.greenRemainingSec <= 1e-9) {
          this.inIntergreen = true;
          this.intergreenRemainingSec = this.intergreenSec;
          this.pendingPhaseIndex = (this.phaseIndex + 1) % this.numPhases;
          this.greenRemainingSec = 0;
        }
      }
    }

    const preemptIdx = junctionState.preemptApproachIdx;
    if (preemptIdx !== null && preemptIdx !== undefined) {
      handlePreemptionTransition(this, preemptIdx);
    }

    this._tracker.record(nowSec, dt, this.phaseIndex, this.inIntergreen);
    const realised = this._tracker.getSummary(nowSec);

    return {
      controller: this.name,
      phaseIndex: this.phaseIndex,
      greenRemainingSec: Math.max(0, Math.round(this.greenRemainingSec)),
      cycleSec: this.cycleSec,
      splits: [...this.splits],
      planned: {
        cycleSec: this.cycleSec,
        splits: [...this.splits],
      },
      realised,
      inIntergreen: this.inIntergreen,
      intergreenRemainingSec: Math.max(0, Math.round(this.intergreenRemainingSec)),
    };
  }

  clone() {
    const copy = Object.create(WebsterController.prototype);
    copy.name = this.name;
    copy.intergreenSec = this.intergreenSec;
    copy.minCycleSec = this.minCycleSec;
    copy.maxCycleSec = this.maxCycleSec;
    copy.minGreenSec = this.minGreenSec;
    copy.maxGreenSec = this.maxGreenSec;
    copy.s0 = this.s0;
    copy.ewmaTimeConstantSec = this.ewmaTimeConstantSec;
    copy.numPhases = this.numPhases;
    copy.saturationFlows = [...this.saturationFlows];
    copy.ewmaFlows = [...this.ewmaFlows];
    copy.splits = [...this.splits];
    copy.cycleSec = this.cycleSec;
    copy.lastPlan = {
      ...this.lastPlan,
      splits: [...this.lastPlan.splits],
      flowRatios: [...this.lastPlan.flowRatios],
    };
    copy.phaseIndex = this.phaseIndex;
    copy.greenRemainingSec = this.greenRemainingSec;
    copy.inIntergreen = this.inIntergreen;
    copy.intergreenRemainingSec = this.intergreenRemainingSec;
    copy.pendingPhaseIndex = this.pendingPhaseIndex;
    copy._lastNowSec = this._lastNowSec;
    copy._tracker = this._tracker.clone();
    return copy;
  }
}

/**
 * Varaiya Max-Pressure Adaptive Controller (with R1 starvation guard & R2 realised timing)
 *
 * Variants:
 * - Standard (`capacityAware = false`):
 *     w_i(t) = Q_i(t) - sum_{j in out(i)} r_ij * Q_j(t) * (1 + Q_j(t) / Q_max_j)
 *     P_k(t) = sum_{i in k} S_i * max(0, w_i(t))
 * - Capacity-Aware (`capacityAware = true`, Gregoire et al. 2015 + saturation-adaptive gmin):
 *     Normalizes upstream & downstream queues by storage capacity (x = Q / Q_max) to prevent
 *     4-lane downstream arterials from artificially starving 2-lane upstream approaches, and
 *     scales effective gmin smoothly from 10s up to 28s under heavy congestion to eliminate
 *     24% all-red intergreen chatter loss.
 */
export class MaxPressureController {
  constructor(junctionConfig, options = {}) {
    this.capacityAware = Boolean(options.capacityAware);
    this.name = this.capacityAware ? 'max-pressure-ca' : 'max-pressure';
    this.intergreenSec = options.intergreenSec ?? INTERGREEN_SEC;
    this.minGreenSec = options.minGreenSec ?? MIN_GREEN_SEC;
    this.maxGreenSec = options.maxGreenSec ?? MAX_GREEN_SEC;
    this.maxRedSec = options.maxRedSec ?? DEFAULT_MAX_RED_SEC;
    this.evalIntervalSec = options.evalIntervalSec ?? MAX_PRESSURE_EVAL_INTERVAL_SEC;
    this.eta = options.eta ?? MAX_PRESSURE_ETA;
    this.theta = options.theta ?? MAX_PRESSURE_THETA;
    this.s0 = options.s0 ?? SATURATION_PER_LANE_VEH_PER_SEC;

    const approaches = junctionConfig?.approaches || junctionConfig?.baseApproaches || [];
    this.numPhases = Math.max(1, approaches.length);
    this.saturationFlows = approaches.map(
      (a) => a.saturationFlowPerSec ?? (a.lanes || 2) * this.s0
    );
    this.storageCaps = approaches.map((a) => a.storageCapVeh ?? 150);

    this.phaseIndex = options.initialPhaseIndex ?? 0;
    this.greenElapsedSec = options.initialGreenElapsedSec ?? 0;
    this.nextEvalAtSec = this.minGreenSec;
    this.inIntergreen = false;
    this.intergreenRemainingSec = 0;
    this.pendingPhaseIndex = this.phaseIndex;
    this.redElapsedSec = new Array(this.numPhases).fill(0);
    this.lastPressures = new Array(this.numPhases).fill(0);
    this._lastNowSec = null;
    this._tracker = new RealisedTimingTracker(this.numPhases, this.intergreenSec);
  }

  describe() {
    const nowSec = this._lastNowSec ?? 0;
    const realised = this._tracker.getSummary(nowSec);
    return {
      name: this.name,
      label: this.capacityAware
        ? 'Capacity-Aware Max-Pressure Controller (Gregoire + Loss-Adaptive)'
        : 'Varaiya Max-Pressure Adaptive Controller',
      capacityAware: this.capacityAware,
      s0PcuPerHourPerLane: Math.round(this.s0 * 3600),
      intergreenSec: this.intergreenSec,
      minGreenSec: this.minGreenSec,
      maxGreenSec: this.maxGreenSec,
      maxRedSec: this.maxRedSec,
      evalIntervalSec: this.evalIntervalSec,
      hysteresisEta: this.eta,
      hysteresisTheta: this.theta,
      cycleSec: realised.cycleSec,
      splits: realised.splits,
      planned: null,
      realised,
    };
  }

  computePressures(approaches = []) {
    const pressures = new Array(this.numPhases).fill(0);
    for (let k = 0; k < this.numPhases; k++) {
      const app = approaches[k];
      if (!app) continue;
      const S = app.saturationFlowPerSec ?? this.saturationFlows[k] ?? this.s0 * 2;
      const q = app.queueVeh ?? 0;

      if (this.capacityAware) {
        const qMax = Math.max(1, app.storageCapVeh ?? this.storageCaps[k] ?? 150);
        const occUp = q / qMax;
        let occDownTerm = 0;
        if (typeof app.downstreamOccupancyPenalty === 'number') {
          occDownTerm = app.downstreamOccupancyPenalty;
        } else if (Array.isArray(app.downstreamQueues)) {
          for (let m = 0; m < app.downstreamQueues.length; m++) {
            const ds = app.downstreamQueues[m];
            const dsCap = Math.max(1, ds.storageCapVeh ?? 150);
            const occDown = (ds.queueVeh ?? 0) / dsCap;
            occDownTerm += (ds.turnFraction ?? 0) * occDown * (1 + occDown);
          }
        }
        // Rescale normalized occupancy pressure back to equivalent vehicle scale (~150 veh ref)
        const wNorm = occUp - occDownTerm;
        pressures[k] = S * Math.max(0, wNorm * qMax);
      } else {
        let downstreamTerm = 0;
        if (typeof app.downstreamPenalty === 'number') {
          downstreamTerm = app.downstreamPenalty;
        } else if (Array.isArray(app.downstreamQueues)) {
          for (let m = 0; m < app.downstreamQueues.length; m++) {
            const ds = app.downstreamQueues[m];
            const qj = ds.queueVeh ?? 0;
            const qMax = Math.max(1, ds.storageCapVeh ?? 150);
            const r = ds.turnFraction ?? 0;
            downstreamTerm += r * qj * (1 + qj / qMax);
          }
        }
        const w = q - downstreamTerm;
        pressures[k] = S * Math.max(0, w);
      }
    }
    return pressures;
  }

  _effectiveMinGreen(approaches = []) {
    if (!this.capacityAware || approaches.length === 0) {
      return this.minGreenSec;
    }
    let sumOcc = 0;
    for (let i = 0; i < approaches.length; i++) {
      const app = approaches[i];
      const qMax = Math.max(1, app?.storageCapVeh ?? this.storageCaps[i] ?? 150);
      sumOcc += Math.min(1, (app?.queueVeh ?? 0) / qMax);
    }
    const meanOcc = sumOcc / approaches.length;
    // Scale min green smoothly from 10s (light) up to 28s (heavy congestion) to avoid intergreen loss
    return Math.round(this.minGreenSec + Math.min(1, meanOcc * 1.4) * 18);
  }

  decide(junctionState = {}, nowSec = 0) {
    const dt = this._lastNowSec === null ? 0 : Math.max(0, nowSec - this._lastNowSec);
    this._lastNowSec = nowSec;

    const approaches = junctionState.approaches || [];
    const pressures = this.computePressures(approaches);
    this.lastPressures = pressures;

    if (dt > 0) {
      // Update red-wait elapsed timers for every phase
      for (let k = 0; k < this.numPhases; k++) {
        if (!this.inIntergreen && k === this.phaseIndex) {
          this.redElapsedSec[k] = 0;
        } else {
          this.redElapsedSec[k] += dt;
        }
      }

      if (this.inIntergreen) {
        this.intergreenRemainingSec -= dt;
        if (this.intergreenRemainingSec <= 1e-9) {
          this.inIntergreen = false;
          this.intergreenRemainingSec = 0;
          this.phaseIndex = this.pendingPhaseIndex;
          this.redElapsedSec[this.phaseIndex] = 0;
          this.greenElapsedSec = 0;
          this.nextEvalAtSec = this.minGreenSec;
        }
      } else {
        this.greenElapsedSec += dt;
      }
    }

    const preemptIdx = junctionState.preemptApproachIdx;
    const isPreempted =
      preemptIdx !== null &&
      preemptIdx !== undefined &&
      handlePreemptionTransition(this, preemptIdx);

    if (isPreempted) {
      if (!this.inIntergreen && this.phaseIndex === preemptIdx) {
        this.nextEvalAtSec = Math.max(this.nextEvalAtSec, this.greenElapsedSec + this.evalIntervalSec);
      }
    } else if (!this.inIntergreen && this.numPhases > 1) {
      const effGmin = this._effectiveMinGreen(approaches);

      // R1 Starvation Guard: any queued phase waiting >= maxRedSec must be served next once gmin met
      let starvedPhase = -1;
      if (this.greenElapsedSec >= this.minGreenSec - 1e-9) {
        let worstRed = -1;
        for (let k = 0; k < this.numPhases; k++) {
          if (k === this.phaseIndex) continue;
          const qk = approaches[k]?.queueVeh ?? 0;
          if (qk > 0 && this.redElapsedSec[k] >= this.maxRedSec - 1e-9) {
            if (this.redElapsedSec[k] > worstRed) {
              worstRed = this.redElapsedSec[k];
              starvedPhase = k;
            }
          }
        }
      }

      if (starvedPhase !== -1) {
        this.inIntergreen = true;
        this.intergreenRemainingSec = this.intergreenSec;
        this.pendingPhaseIndex = starvedPhase;
      } else if (this.greenElapsedSec >= this.maxGreenSec - 1e-9) {
        // Force phase switch at gmax
        let bestOther = (this.phaseIndex + 1) % this.numPhases;
        let bestOtherP = -Infinity;
        for (let offset = 1; offset < this.numPhases; offset++) {
          const k = (this.phaseIndex + offset) % this.numPhases;
          if (pressures[k] > bestOtherP) {
            bestOtherP = pressures[k];
            bestOther = k;
          }
        }
        this.inIntergreen = true;
        this.intergreenRemainingSec = this.intergreenSec;
        this.pendingPhaseIndex = bestOther;
      } else if (
        this.greenElapsedSec >= effGmin - 1e-9 &&
        this.greenElapsedSec >= this.nextEvalAtSec - 1e-9
      ) {
        while (this.nextEvalAtSec <= this.greenElapsedSec + 1e-9) {
          this.nextEvalAtSec += this.evalIntervalSec;
        }

        let bestK = this.phaseIndex;
        let bestP = pressures[this.phaseIndex];
        for (let k = 0; k < this.numPhases; k++) {
          if (pressures[k] > bestP) {
            bestP = pressures[k];
            bestK = k;
          }
        }

        const currentP = pressures[this.phaseIndex];
        const switchThreshold = (1 + this.eta) * currentP + this.theta;
        if (bestK !== this.phaseIndex && bestP > switchThreshold) {
          this.inIntergreen = true;
          this.intergreenRemainingSec = this.intergreenSec;
          this.pendingPhaseIndex = bestK;
        }
      }
    }

    this._tracker.record(nowSec, dt, this.phaseIndex, this.inIntergreen);
    const realised = this._tracker.getSummary(nowSec);

    const greenRemainingSec = this.inIntergreen
      ? 0
      : Math.max(0, Math.round(this.maxGreenSec - this.greenElapsedSec));

    return {
      controller: this.name,
      phaseIndex: this.phaseIndex,
      greenRemainingSec,
      cycleSec: realised.cycleSec,
      splits: realised.splits,
      planned: null,
      realised,
      inIntergreen: this.inIntergreen,
      intergreenRemainingSec: Math.max(0, Math.round(this.intergreenRemainingSec)),
      pressures,
    };
  }

  clone() {
    const copy = Object.create(MaxPressureController.prototype);
    copy.capacityAware = this.capacityAware;
    copy.name = this.name;
    copy.intergreenSec = this.intergreenSec;
    copy.minGreenSec = this.minGreenSec;
    copy.maxGreenSec = this.maxGreenSec;
    copy.maxRedSec = this.maxRedSec;
    copy.evalIntervalSec = this.evalIntervalSec;
    copy.eta = this.eta;
    copy.theta = this.theta;
    copy.s0 = this.s0;
    copy.numPhases = this.numPhases;
    copy.saturationFlows = [...this.saturationFlows];
    copy.storageCaps = [...this.storageCaps];
    copy.phaseIndex = this.phaseIndex;
    copy.greenElapsedSec = this.greenElapsedSec;
    copy.nextEvalAtSec = this.nextEvalAtSec;
    copy.inIntergreen = this.inIntergreen;
    copy.intergreenRemainingSec = this.intergreenRemainingSec;
    copy.pendingPhaseIndex = this.pendingPhaseIndex;
    copy.redElapsedSec = [...this.redElapsedSec];
    copy.lastPressures = [...this.lastPressures];
    copy._lastNowSec = this._lastNowSec;
    copy._tracker = this._tracker.clone();
    return copy;
  }
}

/**
 * Evidence-Driven Supervisory Auto Controller (`auto`)
 *
 * Monitors live EWMA critical flow ratio (Y = sum(q_k / S_k)), downstream spillback,
 * and active lane incidents every cycle wrap, selecting among `fixed-tod`, `webster`,
 * and `max-pressure-ca` using thresholds derived from the committed study JSON.
 * Enforces >= 2 full cycles hysteresis before switching modes and logs every transition
 * with its study-backed justification.
 */
export class AutoSupervisoryController {
  constructor(junctionConfig, options = {}) {
    this.name = 'auto';
    this.intergreenSec = options.intergreenSec ?? INTERGREEN_SEC;
    this.ewmaTimeConstantSec = options.ewmaTimeConstantSec ?? 45;
    this.minHoldCycles = Math.max(2, options.minHoldCycles ?? 2);
    this.s0 = options.s0 ?? SATURATION_PER_LANE_VEH_PER_SEC;
    this.policy = options.studyPolicy || loadStudyPolicy();

    const approaches = junctionConfig?.approaches || junctionConfig?.baseApproaches || [];
    this.numPhases = Math.max(1, approaches.length);
    this.saturationFlows = approaches.map(
      (a) => a.saturationFlowPerSec ?? (a.lanes || 2) * this.s0
    );
    this.storageCaps = approaches.map((a) => a.storageCapVeh ?? 150);
    this.ewmaFlows = approaches.map((a) =>
      options.zeroInitFlows ? 0 : (a.baseDemandPerSec ?? 0)
    );

    this.delegates = {
      'fixed-tod': new FixedTimeController(junctionConfig, { ...options, mode: 'tod' }),
      webster: new WebsterController(junctionConfig, options),
      'max-pressure-ca': new MaxPressureController(junctionConfig, { ...options, capacityAware: true }),
    };

    const initY = this._computeFlowRatioY();
    const initRec = recommendControllerForRegime({ flowRatioY: initY }, this.policy);
    this.activeMode = options.initialMode || initRec.recommendedController;
    this.lastFlowRatioY = initY;
    this.lastReason = initRec.reason;
    this.cyclesSinceSwitch = 0;
    this._sawNonZeroPhaseInCycle = false;
    this._prevPhase = null;
    this._prevInIntergreen = false;
    this._lastNowSec = null;
    this._tracker = new RealisedTimingTracker(this.numPhases, this.intergreenSec);
    this.switchLog = [
      {
        atSec: 0,
        from: null,
        to: this.activeMode,
        flowRatioY: Number(initY.toFixed(3)),
        reason: initRec.reason,
        studyCell: initRec.studyCell,
      },
    ];
  }

  _computeFlowRatioY() {
    let sumY = 0;
    for (let i = 0; i < this.numPhases; i++) {
      const S = this.saturationFlows[i] || this.s0 * 2;
      sumY += Math.max(0, this.ewmaFlows[i]) / S;
    }
    return sumY;
  }

  _updateEwma(approaches, dt) {
    if (!Array.isArray(approaches) || dt <= 0) return;
    const alpha = 1 - Math.exp(-dt / this.ewmaTimeConstantSec);
    for (let i = 0; i < this.numPhases; i++) {
      const app = approaches[i];
      if (!app) continue;
      let instRate = null;
      if (typeof app.arrivalRateVehPerSec === 'number') {
        instRate = app.arrivalRateVehPerSec;
      } else if (typeof app.arrivalsThisStep === 'number') {
        instRate = app.arrivalsThisStep / dt;
      }
      if (instRate !== null) {
        this.ewmaFlows[i] = alpha * instRate + (1 - alpha) * this.ewmaFlows[i];
      }
    }
  }

  _handoffState(fromCtrl, toCtrl, nowSec) {
    toCtrl.phaseIndex = fromCtrl.phaseIndex;
    toCtrl.inIntergreen = fromCtrl.inIntergreen;
    toCtrl.intergreenRemainingSec = fromCtrl.intergreenRemainingSec;
    toCtrl.pendingPhaseIndex = fromCtrl.pendingPhaseIndex;
    toCtrl._lastNowSec = nowSec;
    if (typeof toCtrl.greenRemainingSec === 'number' && Array.isArray(toCtrl.splits)) {
      toCtrl.greenRemainingSec = toCtrl.splits[toCtrl.phaseIndex] ?? 25;
    }
    if (typeof toCtrl.greenElapsedSec === 'number') {
      toCtrl.greenElapsedSec = 0;
      toCtrl.nextEvalAtSec = toCtrl.minGreenSec;
    }
    if (Array.isArray(toCtrl.ewmaFlows)) {
      toCtrl.ewmaFlows = [...this.ewmaFlows];
      if (typeof toCtrl._computePlanFromEwma === 'function') {
        const plan = toCtrl._computePlanFromEwma();
        toCtrl.splits = plan.splits;
        toCtrl.cycleSec = plan.cycleSec;
        toCtrl.lastPlan = plan;
        toCtrl.greenRemainingSec = toCtrl.splits[toCtrl.phaseIndex] ?? 25;
      }
    }
  }

  describe() {
    const nowSec = this._lastNowSec ?? 0;
    const activeDelegate = this.delegates[this.activeMode];
    const delDesc = activeDelegate.describe();
    return {
      name: this.name,
      label: `Auto Supervisory (${this.activeMode})`,
      activeController: this.activeMode,
      minHoldCycles: this.minHoldCycles,
      cyclesSinceSwitch: this.cyclesSinceSwitch,
      flowRatioY: Number(this.lastFlowRatioY.toFixed(3)),
      lastReason: this.lastReason,
      recentSwitches: this.switchLog.slice(-10),
      cycleSec: delDesc.cycleSec,
      splits: delDesc.splits,
      planned: delDesc.planned,
      realised: this._tracker.getSummary(nowSec),
      studyThresholds: this.policy.thresholds,
      policySource: this.policy.sourceFile || 'default-fallback',
    };
  }

  decide(junctionState = {}, nowSec = 0) {
    const dt = this._lastNowSec === null ? 0 : Math.max(0, nowSec - this._lastNowSec);
    this._lastNowSec = nowSec;

    const approaches = junctionState.approaches || [];
    if (dt > 0) {
      this._updateEwma(approaches, dt);
    }

    const liveY = this._computeFlowRatioY();
    this.lastFlowRatioY = liveY;

    const hasActiveIncident = approaches.some((a) => (a?.capacityFactor ?? 1) < 0.99);
    const hasSpillback = approaches.some((a, i) => {
      const qMax = Math.max(1, a?.storageCapVeh ?? this.storageCaps[i] ?? 150);
      const occ = (a?.queueVeh ?? 0) / qMax;
      return (a?.downstreamOccupancyPenalty ?? 0) >= 0.65 || occ >= 0.85;
    });

    // Sync background fixed-tod TOD table if needed and delegate control step
    const activeCtrl = this.delegates[this.activeMode];
    const decision = activeCtrl.decide(junctionState, nowSec);

    // Track full cycles for >= 2-cycle hysteresis
    if (!decision.inIntergreen && decision.phaseIndex !== 0) {
      this._sawNonZeroPhaseInCycle = true;
    }
    const wrappedToPhaseZero =
      !decision.inIntergreen &&
      decision.phaseIndex === 0 &&
      (this._prevInIntergreen || (this._prevPhase !== null && this._prevPhase !== 0)) &&
      this._sawNonZeroPhaseInCycle;

    if (wrappedToPhaseZero) {
      this._sawNonZeroPhaseInCycle = false;
      this.cyclesSinceSwitch += 1;

      if (this.cyclesSinceSwitch >= this.minHoldCycles) {
        const rec = recommendControllerForRegime(
          {
            flowRatioY: liveY,
            hasActiveIncident,
            hasSpillback,
            hasEmergency:
              junctionState.preemptApproachIdx !== null &&
              junctionState.preemptApproachIdx !== undefined,
          },
          this.policy
        );
        this.lastReason = rec.reason;

        if (rec.recommendedController !== this.activeMode && this.delegates[rec.recommendedController]) {
          const prevMode = this.activeMode;
          const nextCtrl = this.delegates[rec.recommendedController];
          this._handoffState(activeCtrl, nextCtrl, nowSec);
          this.activeMode = rec.recommendedController;
          this.cyclesSinceSwitch = 0;
          this.switchLog.push({
            atSec: Math.round(nowSec),
            from: prevMode,
            to: this.activeMode,
            flowRatioY: Number(liveY.toFixed(3)),
            hasActiveIncident,
            hasSpillback,
            reason: rec.reason,
            studyCell: rec.studyCell,
          });
          if (this.switchLog.length > 30) {
            this.switchLog.shift();
          }
        }
      }
    }

    this._prevPhase = decision.phaseIndex;
    this._prevInIntergreen = decision.inIntergreen;

    this._tracker.record(nowSec, dt, decision.phaseIndex, decision.inIntergreen);
    const realised = this._tracker.getSummary(nowSec);

    return {
      ...decision,
      controller: 'auto',
      activeController: this.activeMode,
      flowRatioY: Number(liveY.toFixed(3)),
      reason: this.lastReason,
      realised,
    };
  }

  clone() {
    const copy = Object.create(AutoSupervisoryController.prototype);
    copy.name = this.name;
    copy.intergreenSec = this.intergreenSec;
    copy.ewmaTimeConstantSec = this.ewmaTimeConstantSec;
    copy.minHoldCycles = this.minHoldCycles;
    copy.s0 = this.s0;
    copy.policy = this.policy;
    copy.numPhases = this.numPhases;
    copy.saturationFlows = [...this.saturationFlows];
    copy.storageCaps = [...this.storageCaps];
    copy.ewmaFlows = [...this.ewmaFlows];
    copy.delegates = {
      'fixed-tod': this.delegates['fixed-tod'].clone(),
      webster: this.delegates.webster.clone(),
      'max-pressure-ca': this.delegates['max-pressure-ca'].clone(),
    };
    copy.activeMode = this.activeMode;
    copy.lastFlowRatioY = this.lastFlowRatioY;
    copy.lastReason = this.lastReason;
    copy.cyclesSinceSwitch = this.cyclesSinceSwitch;
    copy._sawNonZeroPhaseInCycle = this._sawNonZeroPhaseInCycle;
    copy._prevPhase = this._prevPhase;
    copy._prevInIntergreen = this._prevInIntergreen;
    copy._lastNowSec = this._lastNowSec;
    copy._tracker = this._tracker.clone();
    copy.switchLog = this.switchLog.map((s) => ({ ...s }));
    return copy;
  }
}

export function createController(type, junctionConfig, options = {}) {
  switch (type) {
    case 'auto':
      return new AutoSupervisoryController(junctionConfig, options);
    case 'webster':
      return new WebsterController(junctionConfig, options);
    case 'max-pressure':
    case 'max_pressure':
    case 'maxpressure':
      return new MaxPressureController(junctionConfig, { ...options, capacityAware: false });
    case 'max-pressure-ca':
    case 'maxpressure-ca':
      return new MaxPressureController(junctionConfig, { ...options, capacityAware: true });
    case 'fixed-naive':
      return new FixedTimeController(junctionConfig, { ...options, mode: 'naive' });
    case 'fixed-tod':
    case 'fixed-time':
    case 'fixed':
    default:
      return new FixedTimeController(junctionConfig, { ...options, mode: 'tod' });
  }
}
