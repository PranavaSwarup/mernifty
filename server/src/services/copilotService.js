import crypto from 'crypto';
import mongoose from 'mongoose';
import { Device } from '../models/Device.js';
import { Alert } from '../models/Alert.js';
import { OperatorAction } from '../models/OperatorAction.js';
import { simulatorService } from './simulatorService.js';
import { socketService } from './socketService.js';
import { haversineKm, ROAD_TORTUOSITY_FACTOR } from '../sim/network.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { loadStudyPolicy, recommendControllerForRegime } from '../sim/studyPolicy.js';

const BTP_TOW_DEPOTS = [
  { id: 'BTP-TMC-CENTRE', name: 'Infantry Rd TMC Depot', latitude: 12.9794, longitude: 77.6006 },
  { id: 'BTP-MADIWALA', name: 'Madiwala BTP Tow Yard', latitude: 12.9182, longitude: 77.6245 },
  { id: 'BTP-HEBBAL', name: 'Hebbal Flyover Depot', latitude: 13.0358, longitude: 77.5970 },
  { id: 'BTP-YESHWANTHPUR', name: 'Yeshwanthpur BTP Yard', latitude: 13.0250, longitude: 77.5498 },
];

const ACTION_ALIASES = {
  switch_controller: 'switch_controller',
  adaptive_green_split: 'switch_controller',
  dispatch_tow: 'dispatch_tow',
  dispatch_tow_incident: 'dispatch_tow',
  emergency_corridor: 'emergency_corridor',
  emergency_green_corridor: 'emergency_corridor',
  upstream_diversion: 'upstream_diversion',
};

const VALID_TARGET_CONTROLLERS = new Set([
  'auto',
  'fixed-tod',
  'fixed-naive',
  'webster',
  'max-pressure',
  'max-pressure-ca',
]);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function isDbConnected() {
  return mongoose.connection?.readyState === 1;
}

/**
 * Ordinary Least Squares linear regression of queue over trailing window points.
 * Expects points sorted chronologically: `{ elapsedSec, totalQueueVeh, maxQueueLengthM }`.
 */
export function computeQueueLinearTrend(points = []) {
  const n = points.length;
  if (n < 3) {
    return {
      sampleCount: n,
      slopeVehPerMin: 0,
      slopeMPerMin: 0,
      r2: 0,
    };
  }

  const t0 = points[0].elapsedSec;
  let sumX = 0;
  let sumYVeh = 0;
  let sumYM = 0;

  for (let i = 0; i < n; i++) {
    const x = points[i].elapsedSec - t0;
    sumX += x;
    sumYVeh += points[i].totalQueueVeh ?? 0;
    sumYM += points[i].maxQueueLengthM ?? 0;
  }

  const meanX = sumX / n;
  const meanYVeh = sumYVeh / n;
  const meanYM = sumYM / n;

  let sxx = 0;
  let sxyVeh = 0;
  let sxyM = 0;
  let syyVeh = 0;

  for (let i = 0; i < n; i++) {
    const dx = points[i].elapsedSec - t0 - meanX;
    const dyVeh = (points[i].totalQueueVeh ?? 0) - meanYVeh;
    const dyM = (points[i].maxQueueLengthM ?? 0) - meanYM;
    sxx += dx * dx;
    sxyVeh += dx * dyVeh;
    sxyM += dx * dyM;
    syyVeh += dyVeh * dyVeh;
  }

  if (sxx <= 1e-9) {
    return { sampleCount: n, slopeVehPerMin: 0, slopeMPerMin: 0, r2: 0 };
  }

  const slopeVehPerSec = sxyVeh / sxx;
  const slopeMPerSec = sxyM / sxx;
  const r2 =
    syyVeh > 1e-9 ? clamp((sxyVeh * sxyVeh) / (sxx * syyVeh), 0, 1) : 0;

  return {
    sampleCount: n,
    slopeVehPerMin: Number((slopeVehPerSec * 60).toFixed(2)),
    slopeMPerMin: Number((slopeMPerSec * 60).toFixed(2)),
    r2: Number(r2.toFixed(3)),
  };
}

/**
 * Compute travel delay (90-240s) from nearest BTP tow depot to junction coordinates.
 */
function computeTowDispatchEta(junc, currentSpeedKmph = 20) {
  const lat = junc?.location?.latitude ?? 12.9716;
  const lon = junc?.location?.longitude ?? 77.5946;

  let nearest = BTP_TOW_DEPOTS[0];
  let bestCrowKm = Infinity;
  for (const depot of BTP_TOW_DEPOTS) {
    const d = haversineKm(lat, lon, depot.latitude, depot.longitude);
    if (d < bestCrowKm) {
      bestCrowKm = d;
      nearest = depot;
    }
  }

  const roadKm = bestCrowKm * ROAD_TORTUOSITY_FACTOR;
  const effectiveSpeedKmph = clamp((currentSpeedKmph + 22) / 2, 14, 30);
  const travelSec = (roadKm / effectiveSpeedKmph) * 3600;
  const dispatchMobilizationSec = 45;
  const etaSec = Math.round(clamp(travelSec + dispatchMobilizationSec, 90, 240));

  return {
    nearestDepot: nearest.name,
    distanceKm: Number(roadKm.toFixed(2)),
    towEtaSec: etaSec,
  };
}

/**
 * Compute live phase-summed flow ratio Y = sum_a (arrival_a / effSat_a) for a junction.
 */
function computeJunctionFlowRatioY(world, jIdx, jSnap) {
  const offset = world.junctionApproachOffsets[jIdx];
  const count = world.junctionApproachCounts[jIdx];
  const approaches = jSnap?.approaches || [];

  let sumY = 0;
  for (let a = 0; a < count; a++) {
    const flatIdx = offset + a;
    const effSat = Math.max(
      0.1,
      world.saturationFlowPerSec[flatIdx] *
        world.capacityFactor[flatIdx] *
        world.weather.capacityFactor
    );
    const arrivalVehPerSec = (approaches[a]?.vehiclesPerMin || 0) / 60;
    sumY += arrivalVehPerSec / effSat;
  }

  return Number(clamp(sumY, 0, 2.0).toFixed(3));
}

const EVIDENCE_FORMULA =
  'clamp(round(28 + 22*min(1, sampleCount/30) + 20*r2 + 18*min(1, excessRatio) + 16*directEventStrength), 40, 99)';

function percentileSorted(sorted, q) {
  if (!sorted || sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function runSinglePairedRollout(liveWorld, deviceId, applyActionFn, horizonSec, rolloutSeedSalt = null) {
  const startSnap = liveWorld.snapshot(deviceId);
  if (!startSnap) return null;

  const worldWithout = liveWorld.clone();
  const worldWith = liveWorld.clone();

  if (rolloutSeedSalt !== null) {
    for (let f = 0; f < worldWithout.totalApproaches; f++) {
      const fSeed = deriveSeed(liveWorld.seed, `${rolloutSeedSalt}:${f}`);
      worldWithout.approachRngs[f] = createRng(fSeed);
      worldWith.approachRngs[f] = createRng(fSeed);
    }
  }

  applyActionFn(worldWith);

  const steps = Math.max(1, Math.round(horizonSec / liveWorld.dtSec));
  for (let s = 0; s < steps; s++) {
    worldWithout.step();
    worldWith.step();
  }

  const withoutSnap = worldWithout.snapshot(deviceId);
  const withSnap = worldWith.snapshot(deviceId);
  const withoutNet = worldWithout.snapshot();
  const withNet = worldWith.snapshot();

  const sumQ = (snap) =>
    (snap?.approaches || []).reduce((acc, a) => acc + (a.queueVeh || 0), 0);

  const startDelay = startSnap.kpi.delayVehSec;
  const withoutFutureDelay = Math.max(0, withoutSnap.kpi.delayVehSec - startDelay);
  const withFutureDelay = Math.max(0, withSnap.kpi.delayVehSec - startDelay);
  const delayDeltaVehSec = Number((withSnap.kpi.delayVehSec - withoutSnap.kpi.delayVehSec).toFixed(2));
  const futureDelayReductionPct =
    withoutFutureDelay > 1e-6
      ? Number((((withoutFutureDelay - withFutureDelay) / withoutFutureDelay) * 100).toFixed(1))
      : 0;

  let emergencyTimeDeltaSec = null;
  const activePairs = [];
  for (const emWith of worldWith.emergencies) {
    const emWithout = worldWithout.emergencies.find((e) => e.id === emWith.id);
    if (!emWithout) continue;
    if (!emWith.path.includes(deviceId)) continue;
    activePairs.push({ emWith, emWithout });
  }
  if (activePairs.length > 0) {
    const diffs = activePairs.map(({ emWith, emWithout }) => {
      if (emWith.travelTimeSec !== null && emWithout.travelTimeSec !== null) {
        return emWith.travelTimeSec - emWithout.travelTimeSec;
      }
      return emWith.waitingAtRedSec - emWithout.waitingAtRedSec;
    });
    emergencyTimeDeltaSec = Number(
      (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)
    );
  }

  return {
    horizonSec,
    withoutController: withoutSnap.control.activeController || withoutSnap.control.controller,
    withController: withSnap.control.activeController || withSnap.control.controller,
    queueDeltaVeh: Number((sumQ(withSnap) - sumQ(withoutSnap)).toFixed(2)),
    maxQueueDeltaM: Number((withSnap.maxQueueLengthM - withoutSnap.maxQueueLengthM).toFixed(2)),
    delayDeltaVehSec,
    baselineFutureDelayDeltaVehSec: Number(withoutFutureDelay.toFixed(2)),
    projectedFutureDelayDeltaVehSec: Number(withFutureDelay.toFixed(2)),
    futureDelayReductionPct,
    avgDelayPerVehDeltaSec: Number(
      (withSnap.kpi.avgDelayPerVehSec - withoutSnap.kpi.avgDelayPerVehSec).toFixed(2)
    ),
    speedDeltaKmph: Number((withSnap.avgSpeedKmph - withoutSnap.avgSpeedKmph).toFixed(2)),
    networkDelayDeltaVehSec: Number(
      (withNet.network.totalDelayVehSec - withoutNet.network.totalDelayVehSec).toFixed(2)
    ),
    emergencyTimeDeltaSec,
  };
}

/**
 * Run paired 300-second counterfactual rollout on cloned TrafficWorld instances.
 */
export function rolloutPredictedEffect(liveWorld, deviceId, applyActionFn, horizonSec = 300) {
  return runSinglePairedRollout(liveWorld, deviceId, applyActionFn, horizonSec, null);
}

/**
 * Run K=12 independent future-arrival CRN 300s rollouts in non-blocking setImmediate chunks.
 * Confidence is P(with-action delay < without-action delay) across the K rollouts,
 * accompanied by mean delay delta and 90% [p5, p95] empirical interval.
 */
export async function rolloutMonteCarloEffect(
  liveWorld,
  deviceId,
  applyActionFn,
  { horizonSec = 300, rolloutsK = 12, chunkSize = 2 } = {}
) {
  const t0 = performance.now();
  const samples = [];

  for (let k = 0; k < rolloutsK; k++) {
    const salt = `mc:${liveWorld.elapsedSec}:${deviceId}:k${k}`;
    const sample = runSinglePairedRollout(liveWorld, deviceId, applyActionFn, horizonSec, salt);
    if (!sample) return null;
    samples.push(sample);

    if ((k + 1) % chunkSize === 0 && k + 1 < rolloutsK) {
      await yieldEventLoop();
    }
  }

  const elapsedMs = Number((performance.now() - t0).toFixed(2));
  const deltas = samples.map((s) => s.delayDeltaVehSec);
  const sorted = [...deltas].sort((a, b) => a - b);
  const improvedCount = deltas.filter((d) => d < -1e-6).length;
  const probabilityImproves = Number((improvedCount / rolloutsK).toFixed(4));
  const confidencePct = Math.round(probabilityImproves * 100);

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const meanDeltaVehSec = Number(mean(deltas).toFixed(2));
  const p5DeltaVehSec = Number(percentileSorted(sorted, 0.05).toFixed(2));
  const p95DeltaVehSec = Number(percentileSorted(sorted, 0.95).toFixed(2));

  const emSamples = samples.map((s) => s.emergencyTimeDeltaSec).filter((v) => v !== null);
  const ref = samples[0];

  return {
    horizonSec,
    rolloutsK,
    withoutController: ref.withoutController,
    withController: ref.withController,
    probabilityImproves,
    confidencePct,
    improvedRollouts: improvedCount,
    rolloutsRatio: `${improvedCount}/${rolloutsK}`,
    rolloutsSummary: `${improvedCount}/${rolloutsK} rollouts improved`,
    meanDeltaVehSec,
    interval90: {
      low: p5DeltaVehSec,
      high: p95DeltaVehSec,
    },
    p5DeltaVehSec,
    p95DeltaVehSec,
    rolloutDurationMs: elapsedMs,
    offHotPathChunked: true,
    delayDeltaVehSec: meanDeltaVehSec,
    queueDeltaVeh: Number(mean(samples.map((s) => s.queueDeltaVeh)).toFixed(2)),
    maxQueueDeltaM: Number(mean(samples.map((s) => s.maxQueueDeltaM)).toFixed(2)),
    baselineFutureDelayDeltaVehSec: Number(
      mean(samples.map((s) => s.baselineFutureDelayDeltaVehSec)).toFixed(2)
    ),
    projectedFutureDelayDeltaVehSec: Number(
      mean(samples.map((s) => s.projectedFutureDelayDeltaVehSec)).toFixed(2)
    ),
    futureDelayReductionPct: Number(
      mean(samples.map((s) => s.futureDelayReductionPct)).toFixed(1)
    ),
    avgDelayPerVehDeltaSec: Number(mean(samples.map((s) => s.avgDelayPerVehDeltaSec)).toFixed(2)),
    speedDeltaKmph: Number(mean(samples.map((s) => s.speedDeltaKmph)).toFixed(2)),
    networkDelayDeltaVehSec: Number(mean(samples.map((s) => s.networkDelayDeltaVehSec)).toFixed(2)),
    emergencyTimeDeltaSec:
      emSamples.length > 0 ? Number(mean(emSamples).toFixed(2)) : null,
  };
}

class CopilotService {
  normalizeAction(action) {
    return ACTION_ALIASES[action] || null;
  }

  computeEvidenceScore({ sampleCount = 0, r2 = 0, excessRatio = 0, directEventStrength = 0 }) {
    const sampleTerm = 22 * Math.min(1, sampleCount / 30);
    const fitTerm = 20 * clamp(r2, 0, 1);
    const magnitudeTerm = 18 * Math.min(1, Math.max(0, excessRatio));
    const eventTerm = 16 * Math.min(1, Math.max(0, directEventStrength));
    const raw = 28 + sampleTerm + fitTerm + magnitudeTerm + eventTerm;
    return {
      evidenceScore: Math.round(clamp(raw, 40, 99)),
      evidenceInputs: {
        formula: EVIDENCE_FORMULA,
        sampleCount,
        r2: Number(clamp(r2, 0, 1).toFixed(3)),
        excessRatio: Number(clamp(excessRatio, 0, 2).toFixed(3)),
        directEventStrength: Number(clamp(directEventStrength, 0, 1).toFixed(3)),
      },
    };
  }

  _collectJunctionState(deviceId) {
    const liveWorld = simulatorService.pair.live;
    const jIdx = liveWorld.junctionIndexById.get(deviceId);
    if (jIdx === undefined) return null;

    const junc = liveWorld.junctions[jIdx];
    const jSnap = liveWorld.snapshot(deviceId);
    const ctrl = liveWorld.controllers[jIdx];
    const activeControllerName = jSnap.control.activeController || ctrl.name;
    const flowRatioY = computeJunctionFlowRatioY(liveWorld, jIdx, jSnap);

    // Inspect active incidents at this junction
    const activeIncidents = [];
    const offset = liveWorld.junctionApproachOffsets[jIdx];
    const count = liveWorld.junctionApproachCounts[jIdx];
    for (let a = 0; a < count; a++) {
      const inc = liveWorld.incidents.get(offset + a);
      if (inc) activeIncidents.push(inc);
    }

    // Inspect downstream link spillback storage occupancy
    const downstreamCongestedLinks = [];
    for (let a = 0; a < count; a++) {
      const links = liveWorld.outgoingLinks[offset + a] || [];
      for (const link of links) {
        const toFlat = link.toFlatIdx;
        const occ =
          liveWorld.storageCapVeh[toFlat] > 0
            ? liveWorld.queueVeh[toFlat] / liveWorld.storageCapVeh[toFlat]
            : 0;
        if (occ >= 0.6) {
          downstreamCongestedLinks.push({
            linkId: link.id,
            toJunction: link.toJunction,
            toApproachIdx: link.toApproachIdx,
            occupancyRatio: Number(occ.toFixed(3)),
            queueVeh: Number(liveWorld.queueVeh[toFlat].toFixed(1)),
          });
        }
      }
    }

    // Inspect active inbound/passing emergencies
    const activeEmergencies = liveWorld.emergencies.filter(
      (e) => e.status === 'en-route' && e.path.includes(deviceId)
    );

    const hasSpillback = downstreamCongestedLinks.some((d) => d.occupancyRatio >= 0.75);
    const studyPolicy = loadStudyPolicy();
    const policyRec = recommendControllerForRegime(
      {
        flowRatioY,
        hasActiveIncident: activeIncidents.length > 0,
        hasSpillback,
        hasEmergency: activeEmergencies.length > 0,
      },
      studyPolicy
    );

    const history120s = simulatorService.getQueueHistory(deviceId, 120);
    const trend = computeQueueLinearTrend(history120s);

    const approaches = jSnap.approaches.map((a, idx) => ({ ...a, index: idx }));
    const worstApproach = [...approaches].sort((a, b) => b.vOverC - a.vOverC)[0];

    return {
      liveWorld,
      jIdx,
      junc,
      jSnap,
      ctrl,
      activeControllerName,
      flowRatioY,
      activeIncidents,
      downstreamCongestedLinks,
      hasSpillback,
      activeEmergencies,
      policyRec,
      trend,
      worstApproach,
      approaches,
    };
  }

  async _pickBestControllerCandidate(state) {
    const { liveWorld, ctrl, activeControllerName, policyRec, junc } = state;
    const primary = policyRec.recommendedController;
    const candidates = [primary];

    if (state.flowRatioY >= policyRec.thresholds.heavyFlowRatioY) {
      for (const alt of ['webster', 'fixed-tod']) {
        if (!candidates.includes(alt)) candidates.push(alt);
      }
    } else {
      for (const alt of ['max-pressure-ca', 'webster']) {
        if (!candidates.includes(alt)) candidates.push(alt);
      }
    }

    // Screen only when primary matches current controller; otherwise go directly to K=12 Monte Carlo
    let chosen = candidates.find((c) => c !== activeControllerName && c !== ctrl.name) || primary;
    if (chosen !== primary) {
      let bestScreen = null;
      for (const candidate of candidates) {
        if (candidate === activeControllerName || candidate === ctrl.name) continue;
        const quick = rolloutPredictedEffect(
          liveWorld,
          junc.junctionId,
          (w) => w.setController(junc.junctionId, candidate),
          300
        );
        if (quick && (!bestScreen || quick.delayDeltaVehSec < bestScreen.delayDeltaVehSec)) {
          bestScreen = quick;
          chosen = candidate;
        }
      }
    }

    const rollout = await rolloutMonteCarloEffect(
      liveWorld,
      junc.junctionId,
      (w) => w.setController(junc.junctionId, chosen),
      { horizonSec: 300, rolloutsK: 12, chunkSize: 2 }
    );

    return {
      targetController: chosen,
      rollout,
    };
  }

  async analyzeDevice(deviceId) {
    const diagnoseStartMs = performance.now();
    const state = this._collectJunctionState(deviceId);
    if (!state) return null;

    const {
      liveWorld,
      junc,
      jSnap,
      activeControllerName,
      flowRatioY,
      activeIncidents,
      downstreamCongestedLinks,
      activeEmergencies,
      policyRec,
      trend,
      worstApproach,
    } = state;

    let deviceDoc = null;
    let activeAlerts = [];
    if (isDbConnected()) {
      [deviceDoc, activeAlerts] = await Promise.all([
        Device.findOne({ deviceId }).lean(),
        Alert.find({ deviceId, resolved: false }).sort({ timestamp: -1 }).lean(),
      ]);
    }

    const findings = [];
    const maxVOverC = worstApproach?.vOverC ?? jSnap.kpi.degreeOfSaturation ?? 0;
    const currentTotalQueueVeh = Number(
      jSnap.approaches.reduce((s, a) => s + a.queueVeh, 0).toFixed(1)
    );
    let totalRolloutDurationMs = 0;

    // 1. Stalled vehicle / lane blockage -> distance-based BTP tow dispatch
    if (activeIncidents.length > 0) {
      const inc = activeIncidents[0];
      const appCfg = junc.approaches[inc.approachIdx];
      const towMeta = computeTowDispatchEta(junc, jSnap.avgSpeedKmph);
      const rollout = await rolloutMonteCarloEffect(
        liveWorld,
        deviceId,
        (w) => {
          const origStep = w.step.bind(w);
          const clearAt = w.elapsedSec + towMeta.towEtaSec;
          w.step = () => {
            if (w.elapsedSec >= clearAt) {
              w.clearIncident(deviceId, inc.approachIdx);
            }
            origStep();
          };
        },
        { horizonSec: 300, rolloutsK: 12, chunkSize: 2 }
      );
      totalRolloutDurationMs += rollout.rolloutDurationMs;

      const { evidenceScore, evidenceInputs } = this.computeEvidenceScore({
        sampleCount: trend.sampleCount,
        r2: trend.r2,
        excessRatio: 1 - inc.capacityFactor,
        directEventStrength: 1 - inc.capacityFactor,
      });

      findings.push({
        id: `finding-incident-${deviceId}`,
        rule: 'Lane Capacity Loss: Active Stalled Vehicle Incident',
        severity: 'critical',
        confidence: rollout.confidencePct,
        probabilityImproves: rollout.probabilityImproves,
        improvedRollouts: rollout.improvedRollouts,
        rolloutsCount: rollout.rolloutsK,
        rolloutsRatio: rollout.rolloutsRatio,
        rolloutsSummary: rollout.rolloutsSummary,
        interval90: rollout.interval90,
        evidenceScore,
        evidenceInputs,
        rolloutDurationMs: rollout.rolloutDurationMs,
        rootCause: `${appCfg.road} (${appCfg.dir}) discharge capacity degraded to ${Math.round(
          inc.capacityFactor * 100
        )}% due to active incident; queue growing at ${trend.slopeVehPerMin >= 0 ? '+' : ''}${
          trend.slopeVehPerMin
        } veh/min (R²=${trend.r2}, n=${trend.sampleCount}).`,
        impact: `K=12 CRN 300s rollouts (${towMeta.nearestDepot}, ${towMeta.distanceKm} km, ETA ${
          towMeta.towEtaSec
        }s): P(improves)=${(rollout.probabilityImproves * 100).toFixed(0)}%, mean ${
          rollout.meanDeltaVehSec
        } veh-s (90% [${rollout.interval90.low}, ${rollout.interval90.high}] veh-s), max queue ${
          rollout.maxQueueDeltaM >= 0 ? '+' : ''
        }${rollout.maxQueueDeltaM} m.`,
        evidence: {
          approach: `${appCfg.road} (${appCfg.dir})`,
          capacityFactor: inc.capacityFactor,
          queueTrendVehPerMin: trend.slopeVehPerMin,
          r2: trend.r2,
          sampleCount: trend.sampleCount,
          towDispatch: towMeta,
        },
        predictedEffect: rollout,
        runbook: {
          title: `Dispatch BTP Tow from ${towMeta.nearestDepot} (ETA ${towMeta.towEtaSec}s)`,
          action: 'dispatch_tow',
          params: { approachIdx: inc.approachIdx, towEtaSec: towMeta.towEtaSec },
          description: `Dispatches recovery unit from ${towMeta.nearestDepot} (${towMeta.distanceKm} km away); lane restores physically after ${towMeta.towEtaSec}s travel delay on live twin only.`,
        },
      });
    }

    // 2. Active emergency corridor -> green-wave preemption
    if (activeEmergencies.length > 0) {
      const em = activeEmergencies[0];
      const path = em.path;
      const rollout = await rolloutMonteCarloEffect(
        liveWorld,
        deviceId,
        (w) => {
          for (const candidate of w.emergencies) {
            if (candidate.status === 'en-route' && candidate.path.includes(deviceId)) {
              candidate.preempt = true;
            }
          }
        },
        { horizonSec: 300, rolloutsK: 12, chunkSize: 2 }
      );
      totalRolloutDurationMs += rollout.rolloutDurationMs;

      const { evidenceScore, evidenceInputs } = this.computeEvidenceScore({
        sampleCount: trend.sampleCount,
        r2: Math.max(trend.r2, 0.4),
        excessRatio: Math.min(1.2, em.remainingDistM / 500),
        directEventStrength: em.preempt ? 0.65 : 0.95,
      });

      const emDeltaText =
        rollout.emergencyTimeDeltaSec !== null
          ? `corridor transit ${rollout.emergencyTimeDeltaSec >= 0 ? '+' : ''}${
              rollout.emergencyTimeDeltaSec
            }s`
          : `network delay ${rollout.networkDelayDeltaVehSec.toFixed(0)} veh-s`;

      findings.push({
        id: `finding-emergency-${deviceId}`,
        rule: `Emergency Vehicle En-Route (${em.id})`,
        severity: 'critical',
        confidence: rollout.confidencePct,
        probabilityImproves: rollout.probabilityImproves,
        improvedRollouts: rollout.improvedRollouts,
        rolloutsCount: rollout.rolloutsK,
        rolloutsRatio: rollout.rolloutsRatio,
        rolloutsSummary: rollout.rolloutsSummary,
        interval90: rollout.interval90,
        evidenceScore,
        evidenceInputs,
        rolloutDurationMs: rollout.rolloutDurationMs,
        rootCause: `Ambulance ${em.id} traversing ${path.join(' -> ')} (${Math.round(
          em.remainingDistM
        )}m remaining on current leg, preempt=${em.preempt}).`,
        impact: `K=12 CRN 300s rollouts along path: ${emDeltaText}, P(delay improves)=${(
          rollout.probabilityImproves * 100
        ).toFixed(0)}%, mean ${rollout.meanDeltaVehSec} veh-s (90% [${rollout.interval90.low}, ${
          rollout.interval90.high
        }]).`,
        evidence: {
          emergencyId: em.id,
          corridorPath: path,
          remainingDistM: Math.round(em.remainingDistM),
          waitingAtRedSec: em.waitingAtRedSec,
          preemptActive: em.preempt,
        },
        predictedEffect: rollout,
        runbook: {
          title: 'Activate Connected Emergency Green Wave',
          action: 'emergency_corridor',
          params: { path },
          description: `Enables bounded signal preemption along ${path.join(
            ' -> '
          )} in the live controller; baseline twin remains un-preempted for counterfactual comparison.`,
        },
      });
    }

    // 3. Downstream link spillback / storage occupancy or severe sustained overload -> upstream diversion
    if (
      state.hasSpillback ||
      (maxVOverC > 1.1 && trend.slopeVehPerMin > 1.0 && currentTotalQueueVeh > 25)
    ) {
      const targetAppIdx = worstApproach?.index ?? 0;
      const rollout = await rolloutMonteCarloEffect(
        liveWorld,
        deviceId,
        (w) => {
          w.applyDiversion({
            junctionId: deviceId,
            approachIdx: targetAppIdx,
            reductionFraction: 0.2,
            until: w.elapsedSec + 600,
          });
        },
        { horizonSec: 300, rolloutsK: 12, chunkSize: 2 }
      );
      totalRolloutDurationMs += rollout.rolloutDurationMs;

      const peakOcc =
        downstreamCongestedLinks.length > 0
          ? Math.max(...downstreamCongestedLinks.map((d) => d.occupancyRatio))
          : worstApproach?.storageRatio ?? 0.5;

      const { evidenceScore, evidenceInputs } = this.computeEvidenceScore({
        sampleCount: trend.sampleCount,
        r2: trend.r2,
        excessRatio: Math.max(peakOcc - 0.65, maxVOverC - 0.9),
        directEventStrength: state.hasSpillback ? 0.8 : 0.45,
      });

      const spillDetail =
        downstreamCongestedLinks.length > 0
          ? `downstream link ${downstreamCongestedLinks[0].linkId} at ${Math.round(
              downstreamCongestedLinks[0].occupancyRatio * 100
            )}% storage occupancy`
          : `${worstApproach.road} (${worstApproach.dir}) at v/c=${maxVOverC.toFixed(2)}`;

      findings.push({
        id: `finding-spillback-${deviceId}`,
        rule: state.hasSpillback
          ? 'Downstream Storage Spillback Risk'
          : 'Approach Demand Exceeding Signal Capacity',
        severity: maxVOverC > 1.2 || peakOcc >= 0.85 ? 'critical' : 'warning',
        confidence: rollout.confidencePct,
        probabilityImproves: rollout.probabilityImproves,
        improvedRollouts: rollout.improvedRollouts,
        rolloutsCount: rollout.rolloutsK,
        rolloutsRatio: rollout.rolloutsRatio,
        rolloutsSummary: rollout.rolloutsSummary,
        interval90: rollout.interval90,
        evidenceScore,
        evidenceInputs,
        rolloutDurationMs: rollout.rolloutDurationMs,
        rootCause: `${spillDetail}; trailing 120s queue slope ${
          trend.slopeVehPerMin >= 0 ? '+' : ''
        }${trend.slopeVehPerMin} veh/min (R²=${trend.r2}, n=${trend.sampleCount}).`,
        impact: `K=12 CRN 300s diversion rollouts: P(improves)=${(
          rollout.probabilityImproves * 100
        ).toFixed(0)}%, mean ${rollout.meanDeltaVehSec} veh-s (90% [${rollout.interval90.low}, ${
          rollout.interval90.high
        }] veh-s), max queue ${rollout.maxQueueDeltaM >= 0 ? '+' : ''}${
          rollout.maxQueueDeltaM
        } m.`,
        evidence: {
          flowRatioY,
          maxVOverC,
          downstreamCongestedLinks,
          queueTrendVehPerMin: trend.slopeVehPerMin,
          r2: trend.r2,
          sampleCount: trend.sampleCount,
        },
        predictedEffect: rollout,
        runbook: {
          title: 'Trigger 20% Conservation-Honest Upstream Diversion (10 min)',
          action: 'upstream_diversion',
          params: { approachIdx: targetAppIdx, reductionFraction: 0.2, durationSec: 600 },
          description: `Redirects 20% of incoming corridor flow on ${
            worstApproach?.road || deviceId
          } to an alternate entry link for 10 min on the live twin.`,
        },
      });
    }

    // 4. Signal timing / regime mismatch -> study-backed controller switch with K=12 CRN 300s rollouts
    const isCongestedOrGrowing =
      maxVOverC > 0.85 ||
      trend.slopeVehPerMin > 1.5 ||
      flowRatioY >= policyRec.thresholds.heavyFlowRatioY ||
      jSnap.congestionScore >= 45 ||
      activeControllerName !== policyRec.recommendedController;

    if (isCongestedOrGrowing) {
      const { targetController, rollout } = await this._pickBestControllerCandidate(state);
      if (rollout) totalRolloutDurationMs += rollout.rolloutDurationMs;

      const shouldEmit =
        targetController !== activeControllerName &&
        rollout &&
        (rollout.delayDeltaVehSec < -1 || rollout.probabilityImproves > 0.5);

      if (shouldEmit) {
        const { evidenceScore, evidenceInputs } = this.computeEvidenceScore({
          sampleCount: trend.sampleCount,
          r2: trend.r2,
          excessRatio: Math.max(maxVOverC - 0.75, flowRatioY - 0.55),
          directEventStrength: rollout.delayDeltaVehSec < 0 ? 0.5 : 0.2,
        });

        const repCell = policyRec.studyCell;
        const studyCellLabel =
          repCell && typeof repCell === 'object'
            ? `${repCell.scenarioId}/${repCell.windowId}@${repCell.demandScale}`
            : String(repCell || 'control-study');

        findings.push({
          id: `finding-controller-${deviceId}`,
          rule: `Signal Regime ${policyRec.regimeKey.replace('_', ' ')}: v/c=${maxVOverC.toFixed(
            2
          )}, Y=${flowRatioY.toFixed(2)}`,
          severity: maxVOverC > 1.1 || jSnap.congestionScore > 75 ? 'critical' : 'warning',
          confidence: rollout.confidencePct,
          probabilityImproves: rollout.probabilityImproves,
          improvedRollouts: rollout.improvedRollouts,
          rolloutsCount: rollout.rolloutsK,
          rolloutsRatio: rollout.rolloutsRatio,
          rolloutsSummary: rollout.rolloutsSummary,
          interval90: rollout.interval90,
          evidenceScore,
          evidenceInputs,
          rolloutDurationMs: rollout.rolloutDurationMs,
          rootCause: `Active controller '${activeControllerName}' under v/c=${maxVOverC.toFixed(
            2
          )} (${worstApproach?.road || 'junction'} ${worstApproach?.dir || ''}) and Y=${flowRatioY.toFixed(
            2
          )}; queue slope ${trend.slopeVehPerMin >= 0 ? '+' : ''}${
            trend.slopeVehPerMin
          } veh/min (R²=${trend.r2}). Study evidence (${studyCellLabel}): ${policyRec.reason}.`,
          impact: `K=12 CRN 300s rollouts ('${activeControllerName}' -> '${targetController}'): P(improves)=${(
            rollout.probabilityImproves * 100
          ).toFixed(0)}%, mean ${rollout.meanDeltaVehSec} veh-s (90% [${rollout.interval90.low}, ${
            rollout.interval90.high
          }] veh-s), avg delay ${rollout.avgDelayPerVehDeltaSec >= 0 ? '+' : ''}${
            rollout.avgDelayPerVehDeltaSec
          } s/veh, speed ${rollout.speedDeltaKmph >= 0 ? '+' : ''}${rollout.speedDeltaKmph} km/h.`,
          evidence: {
            activeController: activeControllerName,
            recommendedController: targetController,
            studyRecommendedController: policyRec.recommendedController,
            studyRegime: policyRec.regimeKey,
            studyCell: policyRec.studyCell,
            studyReason: policyRec.reason,
            policySource: policyRec.policySource,
            flowRatioY,
            maxVOverC,
            queueTrend: trend,
            currentQueueVeh: currentTotalQueueVeh,
          },
          predictedEffect: rollout,
          runbook: {
            title: `Switch Live Controller to '${targetController}'`,
            action: 'switch_controller',
            params: { controller: targetController, findingId: `finding-controller-${deviceId}` },
            description: `Switches live twin at ${deviceId} to '${targetController}' (${policyRec.reason}) while baseline keeps Fixed-TOD for 300s accuracy auditing.`,
          },
        });
      }
    }

    const liveStatus = simulatorService.determineStatus(jSnap);
    const computedHealthScore = Math.round(
      clamp(100 - jSnap.congestionScore * 0.85 - (activeIncidents.length > 0 ? 12 : 0), 5, 100)
    );
    const totalDiagnoseMs = Number((performance.now() - diagnoseStartMs).toFixed(2));

    return {
      deviceId,
      deviceName: deviceDoc?.name || junc.name,
      zoneId: deviceDoc?.zoneId || junc.zoneId,
      status: deviceDoc?.status || liveStatus,
      healthScore: deviceDoc?.healthScore ?? computedHealthScore,
      activeAlertsCount: activeAlerts.length,
      currentState: {
        activeController: activeControllerName,
        flowRatioY,
        maxVOverC: Number(maxVOverC.toFixed(3)),
        maxQueueLengthM: jSnap.maxQueueLengthM,
        avgSpeedKmph: jSnap.avgSpeedKmph,
        congestionScore: jSnap.congestionScore,
        queueTrend: trend,
        weatherActive: liveWorld.weather.active,
      },
      diagnosticsTiming: {
        totalMs: totalDiagnoseMs,
        rolloutDurationMs: Number(totalRolloutDurationMs.toFixed(2)),
        offHotPathChunked: true,
        rolloutsK: 12,
      },
      findings,
      timestamp: new Date(),
    };
  }

  async executeRemediation(deviceId, rawAction, actor = 'Operator', params = {}) {
    const canonicalAction = this.normalizeAction(rawAction);
    if (!canonicalAction) {
      throw new Error(`Unsupported remediation action: ${rawAction}`);
    }

    const liveWorld = simulatorService.pair.live;
    const jIdx = liveWorld.junctionIndexById.get(deviceId);
    if (jIdx === undefined) {
      throw new Error(`Junction node not found: ${deviceId}`);
    }

    const state = this._collectJunctionState(deviceId);
    const startSnap = state.jSnap;
    const startCf = simulatorService.pair.comparison();
    const startJCf = startCf.byJunction[deviceId];

    let predictedEffect;
    let appliedParams = { ...params };
    let studyEvidence = null;
    let runbookTitle = '';
    let message = '';

    if (canonicalAction === 'switch_controller') {
      const targetController =
        params.controller && VALID_TARGET_CONTROLLERS.has(params.controller)
          ? params.controller
          : this._pickBestControllerCandidate(state).targetController;

      appliedParams.controller = targetController;
      studyEvidence = {
        regime: state.policyRec.regimeKey,
        studyCell: state.policyRec.studyCell,
        reason: state.policyRec.reason,
        flowRatioY: state.flowRatioY,
      };

      predictedEffect = rolloutPredictedEffect(
        liveWorld,
        deviceId,
        (w) => w.setController(deviceId, targetController),
        300
      );

      // Mutate LIVE twin ONLY
      liveWorld.setController(deviceId, targetController);
      runbookTitle = `Switch Live Controller to '${targetController}'`;
      message = `Live twin at ${deviceId} switched to '${targetController}'. 300s MPC projects ${predictedEffect.delayDeltaVehSec.toFixed(
        0
      )} veh-s delay delta; realised effect will be measured in 300 sim-s.`;
    } else if (canonicalAction === 'dispatch_tow') {
      const inc = state.activeIncidents[0];
      const approachIdx = Number.isInteger(params.approachIdx)
        ? params.approachIdx
        : inc?.approachIdx ?? 0;
      const towMeta = computeTowDispatchEta(state.junc, startSnap.avgSpeedKmph);
      const towEtaSec = Number.isFinite(params.towEtaSec)
        ? clamp(Math.round(params.towEtaSec), 90, 240)
        : towMeta.towEtaSec;

      appliedParams = { ...appliedParams, approachIdx, ...towMeta, towEtaSec };

      predictedEffect = rolloutPredictedEffect(
        liveWorld,
        deviceId,
        (w) => {
          const origStep = w.step.bind(w);
          const clearAt = w.elapsedSec + towEtaSec;
          w.step = () => {
            if (w.elapsedSec >= clearAt) {
              w.clearIncident(deviceId, approachIdx);
            }
            origStep();
          };
        },
        300
      );

      // Schedule live-only clearance after physical travel delay; baseline incident stays untouched
      simulatorService.scheduleDelayedTask(towEtaSec, () => {
        simulatorService.pair.live.clearIncident(deviceId, approachIdx);
        console.log(
          `[Copilot] BTP tow arrived at ${deviceId} approach ${approachIdx} after ${towEtaSec} sim-s; live lane cleared.`
        );
      });

      runbookTitle = `Dispatch BTP Tow from ${towMeta.nearestDepot} (ETA ${towEtaSec}s)`;
      message = `BTP recovery unit dispatched from ${towMeta.nearestDepot} (${towMeta.distanceKm} km); live lane clears after ${towEtaSec} sim-s travel delay.`;
    } else if (canonicalAction === 'emergency_corridor') {
      const path =
        Array.isArray(params.path) && params.path.length > 0
          ? params.path
          : simulatorService.findCorridorPathThrough(deviceId, 4);
      appliedParams.path = path;

      predictedEffect = rolloutPredictedEffect(
        liveWorld,
        deviceId,
        (w) => {
          for (const em of w.emergencies) {
            if (em.status === 'en-route' && em.path.some((id) => path.includes(id))) {
              em.preempt = true;
            }
          }
        },
        300
      );

      simulatorService.enableEmergencyModeForPath(path);
      runbookTitle = `Activate Emergency Green Wave (${path.join(' -> ')})`;
      message = `Emergency corridor preemption armed across ${path.join(
        ' -> '
      )} on live twin only; baseline twin remains un-preempted.`;
    } else if (canonicalAction === 'upstream_diversion') {
      const approachIdx = Number.isInteger(params.approachIdx)
        ? params.approachIdx
        : state.worstApproach?.index ?? 0;
      const reductionFraction = clamp(Number(params.reductionFraction) || 0.2, 0.05, 0.5);
      const durationSec = clamp(Number(params.durationSec) || 600, 60, 1800);

      predictedEffect = rolloutPredictedEffect(
        liveWorld,
        deviceId,
        (w) => {
          w.applyDiversion({
            junctionId: deviceId,
            approachIdx,
            reductionFraction,
            until: w.elapsedSec + durationSec,
          });
        },
        300
      );

      const divObj = liveWorld.applyDiversion({
        junctionId: deviceId,
        approachIdx,
        reductionFraction,
        until: liveWorld.elapsedSec + durationSec,
      });
      appliedParams = {
        ...appliedParams,
        approachIdx,
        reductionFraction,
        durationSec,
        targetJunctionId: divObj?.targetJunctionId,
        targetApproachIdx: divObj?.targetApproachIdx,
      };

      runbookTitle = `20% Conservation-Honest Upstream Diversion (${durationSec}s)`;
      message = `Shifted ${Math.round(reductionFraction * 100)}% of inbound volume from ${deviceId} approach ${approachIdx} onto ${
        divObj?.targetJunctionId || 'alternate corridor'
      } for ${durationSec} sim-s on live twin.`;
    }

    const actionId = `ACT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const actionRecord = {
      actionId,
      junctionId: deviceId,
      deviceId,
      actor: actor || 'Operator',
      actorRole: params.actorRole || 'operator',
      actionType: canonicalAction,
      findingId: params.findingId || null,
      params: appliedParams,
      studyEvidence,
      simTimeAtAction: new Date(liveWorld.simTimeMs),
      elapsedSecAtAction: liveWorld.elapsedSec,
      targetMeasureElapsedSec: liveWorld.elapsedSec + 300,
      baselineMetricsAtAction: {
        junctionDelayVehSec: startSnap.kpi.delayVehSec,
        avgDelayPerVehSec: startSnap.kpi.avgDelayPerVehSec,
        maxQueueLengthM: startSnap.maxQueueLengthM,
        avgSpeedKmph: startSnap.avgSpeedKmph,
        congestionScore: startSnap.congestionScore,
        cfDelaySavedVehSecAtAction: startJCf?.delaySavedVehSec ?? 0,
      },
      predictedEffect,
      realisedEffect: null,
      status: 'pending',
      resolvedAlertsCount: 0,
    };

    let resolvedAlertsCount = 0;
    if (isDbConnected()) {
      const alertRes = await Alert.updateMany(
        { deviceId, resolved: false },
        {
          $set: {
            resolved: true,
            resolvedAt: new Date(),
            resolvedBy: actor || 'Operator',
            remediationAction: runbookTitle,
          },
        }
      );
      resolvedAlertsCount = alertRes.modifiedCount ?? 0;
      actionRecord.resolvedAlertsCount = resolvedAlertsCount;

      if (canonicalAction === 'switch_controller' || canonicalAction === 'emergency_corridor') {
        await Device.updateOne(
          { deviceId },
          {
            $set: {
              adaptiveSignalMode:
                canonicalAction === 'emergency_corridor'
                  ? 'emergency-corridor'
                  : appliedParams.controller,
            },
          }
        );
      }

      await OperatorAction.create(actionRecord);
    }

    simulatorService.registerPendingAction(actionRecord);

    // Emit operational metadata update without overwriting Device.lastMetrics / lastData
    socketService.broadcastDeviceStatus({
      junctionId: deviceId,
      deviceId,
      adaptiveSignalMode:
        canonicalAction === 'switch_controller'
          ? appliedParams.controller
          : canonicalAction === 'emergency_corridor'
          ? 'emergency-corridor'
          : undefined,
      lastRemediation: {
        actionId,
        action: canonicalAction,
        actor: actionRecord.actor,
        runbook: runbookTitle,
        predictedEffect,
      },
    });

    console.log(
      `[Copilot] Executed '${canonicalAction}' at ${deviceId} by ${actionRecord.actor} (300s predicted delayDelta=${predictedEffect.delayDeltaVehSec} veh-s)`
    );

    return {
      success: true,
      action: rawAction,
      canonicalAction,
      runbook: runbookTitle,
      message,
      resolvedAlertsCount,
      predictedEffect,
      actionRecord,
    };
  }
}

export const copilotService = new CopilotService();
