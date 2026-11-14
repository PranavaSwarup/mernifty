/**
 * Real-Time Traffic Signal Controllers
 *
 * Common interface:
 *   controller.decide(junctionState, nowSec)
 *     -> { phaseIndex, greenRemainingSec, cycleSec, splits, inIntergreen, intergreenRemainingSec, controller }
 *   controller.name      (string identifier)
 *   controller.describe() -> plain metadata object with active parameters (for UI/telemetry)
 */

export const INTERGREEN_SEC = 4; // 3s amber + 1s all-red clearance
export const MIN_GREEN_SEC = 10;
export const MAX_GREEN_SEC = 60;
export const MIN_CYCLE_SEC = 45;
export const MAX_CYCLE_SEC = 150;
export const SATURATION_PER_LANE_VEH_PER_SEC = 0.5; // 1800 PCU/h/lane
export const MAX_PRESSURE_EVAL_INTERVAL_SEC = 5;
export const MAX_PRESSURE_ETA = 0.15;
export const MAX_PRESSURE_THETA = 2.0;
export const PREEMPT_LEAD_WINDOW_SEC = INTERGREEN_SEC + 6; // 10s lead time for green wave

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Pure Webster (1958) optimal cycle length and green split calculator.
 *
 * @param {object} params
 * @param {number[]} params.flowRatios Critical flow ratios y_k = q_k / S_k per phase
 * @param {number} [params.intergreenSec=4]
 * @param {number} [params.minCycleSec=45]
 * @param {number} [params.maxCycleSec=150]
 * @param {number} [params.minGreenSec=10]
 * @param {number} [params.maxGreenSec=60]
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
 * Shared preemption transition helper used by all controllers when an emergency
 * responder with `preempt=true` requests priority within PREEMPT_LEAD_WINDOW_SEC.
 */
function handlePreemptionTransition(ctrl, preemptApproachIdx) {
  if (preemptApproachIdx === null || preemptApproachIdx === undefined) {
    return false;
  }

  if (ctrl.inIntergreen) {
    // Redirect target phase safely while clearance is already active
    ctrl.pendingPhaseIndex = preemptApproachIdx;
    return true;
  }

  if (ctrl.phaseIndex === preemptApproachIdx) {
    // Hold current phase green while emergency responder clears stop line
    ctrl.greenRemainingSec = Math.max(ctrl.greenRemainingSec, 2);
    return true;
  }

  // Trigger immediate clearance transition toward the emergency approach
  ctrl.inIntergreen = true;
  ctrl.intergreenRemainingSec = ctrl.intergreenSec;
  ctrl.pendingPhaseIndex = preemptApproachIdx;
  ctrl.greenRemainingSec = 0;
  return true;
}

/**
 * Fixed-Time Signal Controller
 * Uses static greenSplitSec values from the junction catalogue with fixed 4 s intergreen.
 */
export class FixedTimeController {
  constructor(junctionConfig, options = {}) {
    this.name = 'fixed-time';
    this.intergreenSec = options.intergreenSec ?? INTERGREEN_SEC;
    const approaches = junctionConfig?.approaches || junctionConfig?.baseApproaches || [];
    this.numPhases = Math.max(1, approaches.length);
    this.splits = approaches.map((a) => Math.max(MIN_GREEN_SEC, a.greenSplitSec || 35));
    this.cycleSec = this.splits.reduce((a, b) => a + b, 0) + this.numPhases * this.intergreenSec;

    this.phaseIndex = options.initialPhaseIndex ?? 0;
    this.greenRemainingSec = this.splits[this.phaseIndex] ?? 35;
    this.inIntergreen = false;
    this.intergreenRemainingSec = 0;
    this.pendingPhaseIndex = this.phaseIndex;
    this._lastNowSec = null;
  }

  describe() {
    return {
      name: this.name,
      label: 'Fixed-Time Pre-Timed Controller',
      intergreenSec: this.intergreenSec,
      cycleSec: this.cycleSec,
      splits: [...this.splits],
    };
  }

  decide(junctionState = {}, nowSec = 0) {
    const dt =
      this._lastNowSec === null
        ? 0
        : Math.max(0, nowSec - this._lastNowSec);
    this._lastNowSec = nowSec;

    if (dt > 0) {
      if (this.inIntergreen) {
        this.intergreenRemainingSec -= dt;
        if (this.intergreenRemainingSec <= 1e-9) {
          this.inIntergreen = false;
          this.intergreenRemainingSec = 0;
          this.phaseIndex = this.pendingPhaseIndex;
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

    return {
      controller: this.name,
      phaseIndex: this.phaseIndex,
      greenRemainingSec: Math.max(0, Math.round(this.greenRemainingSec)),
      cycleSec: this.cycleSec,
      splits: [...this.splits],
      inIntergreen: this.inIntergreen,
      intergreenRemainingSec: Math.max(0, Math.round(this.intergreenRemainingSec)),
    };
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

    // Seed EWMA arrival flow estimates from configured base demands unless zero-init requested
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
    const dt =
      this._lastNowSec === null
        ? 0
        : Math.max(0, nowSec - this._lastNowSec);
    this._lastNowSec = nowSec;

    if (dt > 0) {
      this._updateEwma(junctionState.approaches, dt);

      if (this.inIntergreen) {
        this.intergreenRemainingSec -= dt;
        if (this.intergreenRemainingSec <= 1e-9) {
          this.inIntergreen = false;
          this.intergreenRemainingSec = 0;
          this.phaseIndex = this.pendingPhaseIndex;

          // Recompute optimal cycle & splits at the start of every new cycle
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

    return {
      controller: this.name,
      phaseIndex: this.phaseIndex,
      greenRemainingSec: Math.max(0, Math.round(this.greenRemainingSec)),
      cycleSec: this.cycleSec,
      splits: [...this.splits],
      inIntergreen: this.inIntergreen,
      intergreenRemainingSec: Math.max(0, Math.round(this.intergreenRemainingSec)),
    };
  }
}

/**
 * Varaiya Max-Pressure Adaptive Controller
 *
 * Evaluates phase pressures every 5s once gmin (10s) is satisfied:
 *   w_i(t) = Q_i(t) - sum_{j in out(i)} r_ij * Q_j(t) * (1 + Q_j(t) / Q_max_j)
 *   P_k(t) = sum_{i in k} S_i * max(0, w_i(t))
 *
 * Switches with hysteresis (eta = 0.15, theta = 2.0) to prevent chattering,
 * forces phase rotation at gmax (60s), and never switches during intergreen (4s).
 */
export class MaxPressureController {
  constructor(junctionConfig, options = {}) {
    this.name = 'max-pressure';
    this.intergreenSec = options.intergreenSec ?? INTERGREEN_SEC;
    this.minGreenSec = options.minGreenSec ?? MIN_GREEN_SEC;
    this.maxGreenSec = options.maxGreenSec ?? MAX_GREEN_SEC;
    this.evalIntervalSec = options.evalIntervalSec ?? MAX_PRESSURE_EVAL_INTERVAL_SEC;
    this.eta = options.eta ?? MAX_PRESSURE_ETA;
    this.theta = options.theta ?? MAX_PRESSURE_THETA;
    this.s0 = options.s0 ?? SATURATION_PER_LANE_VEH_PER_SEC;

    const approaches = junctionConfig?.approaches || junctionConfig?.baseApproaches || [];
    this.numPhases = Math.max(1, approaches.length);
    this.saturationFlows = approaches.map(
      (a) => a.saturationFlowPerSec ?? (a.lanes || 2) * this.s0
    );
    this.splits = approaches.map((a) => clamp(a.greenSplitSec || 30, this.minGreenSec, this.maxGreenSec));
    this.cycleSec = this.splits.reduce((a, b) => a + b, 0) + this.numPhases * this.intergreenSec;

    this.phaseIndex = options.initialPhaseIndex ?? 0;
    this.greenElapsedSec = options.initialGreenElapsedSec ?? 0;
    this.nextEvalAtSec = this.minGreenSec;
    this.inIntergreen = false;
    this.intergreenRemainingSec = 0;
    this.pendingPhaseIndex = this.phaseIndex;
    this.lastPressures = new Array(this.numPhases).fill(0);
    this._lastNowSec = null;
  }

  describe() {
    return {
      name: this.name,
      label: 'Varaiya Max-Pressure Adaptive Controller',
      s0PcuPerHourPerLane: Math.round(this.s0 * 3600),
      intergreenSec: this.intergreenSec,
      minGreenSec: this.minGreenSec,
      maxGreenSec: this.maxGreenSec,
      evalIntervalSec: this.evalIntervalSec,
      hysteresisEta: this.eta,
      hysteresisTheta: this.theta,
      cycleSec: this.cycleSec,
      splits: [...this.splits],
    };
  }

  /**
   * Compute pressure P_k for each phase k from current approach queues and downstream spillback penalties.
   */
  computePressures(approaches = []) {
    const pressures = new Array(this.numPhases).fill(0);
    for (let k = 0; k < this.numPhases; k++) {
      const app = approaches[k];
      if (!app) continue;
      const S = app.saturationFlowPerSec ?? this.saturationFlows[k] ?? this.s0 * 2;
      const q = app.queueVeh ?? 0;

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
    return pressures;
  }

  _updateEstimatedSplits(pressures) {
    const totalP = pressures.reduce((a, b) => a + b, 0);
    const budget = this.numPhases * 30;
    for (let k = 0; k < this.numPhases; k++) {
      if (totalP > 1e-6) {
        this.splits[k] = clamp(
          Math.round((pressures[k] / totalP) * budget),
          this.minGreenSec,
          this.maxGreenSec
        );
      } else {
        this.splits[k] = this.minGreenSec;
      }
    }
    this.cycleSec = this.splits.reduce((a, b) => a + b, 0) + this.numPhases * this.intergreenSec;
  }

  decide(junctionState = {}, nowSec = 0) {
    const dt =
      this._lastNowSec === null
        ? 0
        : Math.max(0, nowSec - this._lastNowSec);
    this._lastNowSec = nowSec;

    const pressures = this.computePressures(junctionState.approaches);
    this.lastPressures = pressures;

    if (dt > 0) {
      if (this.inIntergreen) {
        // Strictly no switching during intergreen clearance
        this.intergreenRemainingSec -= dt;
        if (this.intergreenRemainingSec <= 1e-9) {
          this.inIntergreen = false;
          this.intergreenRemainingSec = 0;
          this.phaseIndex = this.pendingPhaseIndex;
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
        // Reset next eval after emergency clears so we return smoothly to normal control
        this.nextEvalAtSec = Math.max(this.nextEvalAtSec, this.greenElapsedSec + this.evalIntervalSec);
      }
    } else if (!this.inIntergreen && this.numPhases > 1) {
      // Force phase switch once gmax is reached
      if (this.greenElapsedSec >= this.maxGreenSec - 1e-9) {
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
        this.greenElapsedSec >= this.minGreenSec - 1e-9 &&
        this.greenElapsedSec >= this.nextEvalAtSec - 1e-9
      ) {
        // Advance evaluation schedule by 5s increments
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

    this._updateEstimatedSplits(pressures);

    const greenRemainingSec = this.inIntergreen
      ? 0
      : Math.max(0, Math.round(this.maxGreenSec - this.greenElapsedSec));

    return {
      controller: this.name,
      phaseIndex: this.phaseIndex,
      greenRemainingSec,
      cycleSec: this.cycleSec,
      splits: [...this.splits],
      inIntergreen: this.inIntergreen,
      intergreenRemainingSec: Math.max(0, Math.round(this.intergreenRemainingSec)),
      pressures,
    };
  }
}

export function createController(type, junctionConfig, options = {}) {
  switch (type) {
    case 'webster':
      return new WebsterController(junctionConfig, options);
    case 'max-pressure':
    case 'max_pressure':
    case 'maxpressure':
      return new MaxPressureController(junctionConfig, options);
    case 'fixed-time':
    case 'fixed':
    default:
      return new FixedTimeController(junctionConfig, options);
  }
}
