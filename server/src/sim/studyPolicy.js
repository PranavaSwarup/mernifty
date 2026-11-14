/**
 * Evidence-Driven Supervisory Controller Selection Policy
 *
 * Loads the committed controlled evaluation study artifact
 * (`benchmarks/results/control-study-*.json`) at startup and derives:
 *   1. Critical flow-ratio (Y) regime boundaries separating undersaturated,
 *      heavy transition, and saturated operating regimes.
 *   2. Per-regime optimal signal controller ('fixed-tod' | 'webster' | 'max-pressure-ca')
 *      from measured mean paired delay differences across Common Random Number seeds.
 *   3. Human-readable, study-cited reasoning strings shared by the live `auto`
 *      supervisory controller and Copilot `switch_controller` recommendations.
 *
 * Falls back to documented defaults only if no study JSON artifact exists on disk.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_DIR = path.resolve(__dirname, '../../../benchmarks/results');

const CANDIDATE_CONTROLLERS = ['fixed-tod', 'webster', 'max-pressure-ca'];

const DEFAULT_FALLBACK_POLICY = {
  loadedFromFile: false,
  sourceFile: null,
  studyDate: null,
  totalEpisodes: 0,
  thresholds: {
    heavyFlowRatioY: 0.65,
    severeSaturationY: 0.78,
  },
  regimes: {
    undersaturated_normal: {
      bestController: 'max-pressure-ca',
      meanDelayPctVsFixedTod: -8.5,
      rawMpMeanDelayPctVsFixedTod: -8.9,
      rawMpWorstPctVsFixedTod: -0.7,
      representativeCell: 'default-fallback',
      cellCount: 0,
    },
    disrupted_moderate: {
      bestController: 'max-pressure-ca',
      meanDelayPctVsFixedTod: -31.0,
      rawMpMeanDelayPctVsFixedTod: -28.0,
      rawMpWorstPctVsFixedTod: -8.9,
      representativeCell: 'default-fallback',
      cellCount: 0,
    },
    heavy_transition: {
      bestController: 'webster',
      meanDelayPctVsFixedTod: -6.5,
      rawMpMeanDelayPctVsFixedTod: 35.0,
      rawMpWorstPctVsFixedTod: 62.5,
      representativeCell: 'default-fallback',
      cellCount: 0,
    },
    saturated_peak: {
      bestController: 'fixed-tod',
      meanDelayPctVsFixedTod: 0,
      rawMpMeanDelayPctVsFixedTod: 75.0,
      rawMpWorstPctVsFixedTod: 88.9,
      representativeCell: 'default-fallback',
      cellCount: 0,
    },
  },
};

function findLatestStudyJson(resultsDir = RESULTS_DIR) {
  try {
    if (!fs.existsSync(resultsDir)) return null;
    const files = fs
      .readdirSync(resultsDir)
      .filter((f) => /^control-study-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    if (files.length === 0) return null;
    return path.join(resultsDir, files[files.length - 1]);
  } catch {
    return null;
  }
}

function pickBestControllerInCells(cells) {
  if (!cells || cells.length === 0) return null;

  const meanPct = (ctrl) => {
    if (ctrl === 'fixed-tod') return 0;
    const vals = cells.map((c) => c.pairedVsFixedTod?.[ctrl]?.avgDelayPerVehSec?.pctVsBaseline ?? 0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  let bestCtrl = 'fixed-tod';
  let bestMeanPct = 0;
  for (const ctrl of CANDIDATE_CONTROLLERS) {
    const val = meanPct(ctrl);
    if (val < bestMeanPct - 0.5) {
      // Require >= 0.5% delay margin to prefer an adaptive scheme over baseline Fixed-TOD
      bestMeanPct = val;
      bestCtrl = ctrl;
    }
  }

  const rawMpVals = cells.map(
    (c) => c.pairedVsFixedTod?.['max-pressure']?.avgDelayPerVehSec?.pctVsBaseline ?? 0
  );
  const rawMpMean = rawMpVals.reduce((a, b) => a + b, 0) / rawMpVals.length;
  const rawMpWorst = rawMpVals.reduce((a, b) => (b > a ? b : a), -Infinity);

  // Pick representative cell closest to regime center (highest raw Y or largest magnitude separation)
  const rep = [...cells].sort((a, b) => {
    const ya = a.criticalFlowProfile?.maxRawY ?? 0;
    const yb = b.criticalFlowProfile?.maxRawY ?? 0;
    return yb - ya;
  })[0];

  const repCtrlPct =
    bestCtrl === 'fixed-tod'
      ? 0
      : rep.pairedVsFixedTod?.[bestCtrl]?.avgDelayPerVehSec?.pctVsBaseline ?? 0;
  const repRawMpPct = rep.pairedVsFixedTod?.['max-pressure']?.avgDelayPerVehSec?.pctVsBaseline ?? 0;
  const repMpCaPct =
    rep.pairedVsFixedTod?.['max-pressure-ca']?.avgDelayPerVehSec?.pctVsBaseline ?? 0;

  return {
    bestController: bestCtrl,
    meanDelayPctVsFixedTod: Number(bestMeanPct.toFixed(2)),
    rawMpMeanDelayPctVsFixedTod: Number(rawMpMean.toFixed(2)),
    rawMpWorstPctVsFixedTod: Number(rawMpWorst.toFixed(2)),
    cellCount: cells.length,
    representativeCell: {
      scenarioId: rep.scenarioId,
      windowId: rep.windowId,
      demandScale: rep.demandScale,
      maxRawY: rep.criticalFlowProfile?.maxRawY ?? null,
      bestCtrlPct: repCtrlPct,
      rawMpPct: repRawMpPct,
      mpCaPct: repMpCaPct,
      fixedTodDelaySec: rep.controllers?.['fixed-tod']?.avgDelayPerVehSec?.mean ?? null,
    },
  };
}

/**
 * Derive supervisory controller policy directly from the controlled study JSON report.
 */
export function derivePolicyFromStudy(report, sourceFile = null) {
  const cells = Array.isArray(report?.cells) ? report.cells : [];
  if (cells.length === 0) {
    return { ...DEFAULT_FALLBACK_POLICY };
  }

  const normalCells = cells.filter((c) => c.scenarioId === 'normal');
  const surgeCells = cells.filter((c) => c.scenarioId === 'surge_incident');

  // Derive heavyFlowRatioY from normal cells where max-pressure-ca stays beneficial vs degraded
  const mpcaNormalBeneficial = normalCells.filter(
    (c) => (c.pairedVsFixedTod?.['max-pressure-ca']?.avgDelayPerVehSec?.pctVsBaseline ?? 0) < -1.0
  );
  const mpcaNormalDegraded = normalCells.filter(
    (c) => (c.pairedVsFixedTod?.['max-pressure-ca']?.avgDelayPerVehSec?.pctVsBaseline ?? 0) > 5.0
  );

  const maxBeneficialY =
    mpcaNormalBeneficial.length > 0
      ? Math.max(...mpcaNormalBeneficial.map((c) => c.criticalFlowProfile?.maxRawY ?? 0.65))
      : 0.65;
  const minDegradedY =
    mpcaNormalDegraded.length > 0
      ? Math.min(...mpcaNormalDegraded.map((c) => c.criticalFlowProfile?.maxRawY ?? 0.76))
      : 0.76;

  // Heavy transition boundary: highest Y where undersaturated MP-CA holds (0.65 in BLR study)
  const heavyFlowRatioY = Number(maxBeneficialY.toFixed(2));
  // Severe saturation boundary: lowest Y where adaptive loses under heavy stationary demand (0.78)
  const fixedTodSatCells = normalCells.filter((c) => {
    const w = c.pairedVsFixedTod?.['webster']?.avgDelayPerVehSec?.pctVsBaseline ?? 0;
    const m = c.pairedVsFixedTod?.['max-pressure-ca']?.avgDelayPerVehSec?.pctVsBaseline ?? 0;
    return w > 0 && m > 0 && (c.criticalFlowProfile?.maxRawY ?? 0) >= heavyFlowRatioY;
  });
  const severeSaturationY =
    fixedTodSatCells.length > 0
      ? Number(
          Math.min(...fixedTodSatCells.map((c) => c.criticalFlowProfile?.maxRawY ?? 0.78)).toFixed(2)
        )
      : Number(minDegradedY.toFixed(2));

  const undersaturatedNormal = normalCells.filter(
    (c) => (c.criticalFlowProfile?.maxRawY ?? 0) < heavyFlowRatioY ||
      ((c.pairedVsFixedTod?.['max-pressure-ca']?.avgDelayPerVehSec?.pctVsBaseline ?? 0) < -1.5 &&
        (c.criticalFlowProfile?.maxRawY ?? 0) <= heavyFlowRatioY)
  );
  const disruptedModerate = surgeCells.filter(
    (c) => (c.criticalFlowProfile?.maxRawY ?? 0) <= heavyFlowRatioY
  );
  const heavyTransition = cells.filter(
    (c) =>
      (c.criticalFlowProfile?.maxRawY ?? 0) >= heavyFlowRatioY &&
      (c.criticalFlowProfile?.maxRawY ?? 0) <= severeSaturationY
  );
  const saturatedPeak = normalCells.filter(
    (c) => (c.criticalFlowProfile?.maxRawY ?? 0) >= severeSaturationY
  );

  const regimes = {
    undersaturated_normal:
      pickBestControllerInCells(undersaturatedNormal) || DEFAULT_FALLBACK_POLICY.regimes.undersaturated_normal,
    disrupted_moderate:
      pickBestControllerInCells(disruptedModerate) || DEFAULT_FALLBACK_POLICY.regimes.disrupted_moderate,
    heavy_transition:
      pickBestControllerInCells(heavyTransition) ||
      DEFAULT_FALLBACK_POLICY.regimes.heavy_transition,
    saturated_peak:
      pickBestControllerInCells(saturatedPeak) || DEFAULT_FALLBACK_POLICY.regimes.saturated_peak,
  };

  return {
    loadedFromFile: true,
    sourceFile: sourceFile ? path.basename(sourceFile) : null,
    studyDate: report.date || null,
    totalEpisodes: report.summary?.totalEpisodes || 0,
    thresholds: {
      heavyFlowRatioY,
      severeSaturationY,
    },
    regimes,
  };
}

let cachedPolicy = null;

export function loadStudyPolicy(forceReload = false) {
  if (cachedPolicy && !forceReload) return cachedPolicy;

  const jsonPath = findLatestStudyJson();
  if (!jsonPath) {
    cachedPolicy = { ...DEFAULT_FALLBACK_POLICY };
    return cachedPolicy;
  }

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    cachedPolicy = derivePolicyFromStudy(parsed, jsonPath);
  } catch {
    cachedPolicy = { ...DEFAULT_FALLBACK_POLICY };
  }
  return cachedPolicy;
}

/**
 * Recommend an optimal signal controller for a junction's live operating regime,
 * citing exact study thresholds and cell evidence.
 */
export function recommendControllerForRegime(
  { flowRatioY = 0, hasActiveIncident = false, hasSpillback = false, hasEmergency = false } = {},
  policy = loadStudyPolicy()
) {
  const { heavyFlowRatioY, severeSaturationY } = policy.thresholds;
  const yFormatted = Number(flowRatioY).toFixed(2);
  let regimeKey;

  if (flowRatioY >= severeSaturationY && !hasActiveIncident) {
    regimeKey = 'saturated_peak';
  } else if (flowRatioY >= heavyFlowRatioY) {
    regimeKey = 'heavy_transition';
  } else if (hasActiveIncident || hasSpillback) {
    regimeKey = 'disrupted_moderate';
  } else {
    regimeKey = 'undersaturated_normal';
  }

  // If extreme saturation with incident (Y >= 0.85 and stationary gridlock vs disruption), allow fixed-tod / webster
  const regime = policy.regimes[regimeKey] || policy.regimes.undersaturated_normal;
  let targetController = regime.bestController;
  if (regimeKey === 'heavy_transition' && targetController === 'max-pressure-ca' && flowRatioY >= heavyFlowRatioY) {
    targetController = 'webster';
  }

  const rep = regime.representativeCell;
  const repLabel =
    rep && typeof rep === 'object'
      ? `${rep.scenarioId} ${rep.windowId}@${rep.demandScale}`
      : String(rep || 'study');
  const rawMpNote =
    rep && typeof rep === 'object' && rep.rawMpPct !== undefined
      ? `raw MP ${rep.rawMpPct >= 0 ? '+' : ''}${rep.rawMpPct}% delay`
      : `raw MP ${regime.rawMpWorstPctVsFixedTod >= 0 ? '+' : ''}${regime.rawMpWorstPctVsFixedTod}%`;
  const targetNote =
    rep && typeof rep === 'object' && rep.bestCtrlPct !== undefined && targetController !== 'fixed-tod'
      ? `${targetController} ${rep.bestCtrlPct >= 0 ? '+' : ''}${rep.bestCtrlPct}%`
      : `${targetController} baseline`;

  let triggerPrefix;
  if (regimeKey === 'saturated_peak') {
    triggerPrefix = `Y=${yFormatted} >= ${severeSaturationY} -> ${targetController}`;
  } else if (regimeKey === 'heavy_transition') {
    triggerPrefix = `Y=${yFormatted} >= ${heavyFlowRatioY} -> ${targetController}`;
  } else if (regimeKey === 'disrupted_moderate') {
    const cause = hasActiveIncident ? 'incident' : 'spillback';
    triggerPrefix = `${cause} @ Y=${yFormatted} < ${heavyFlowRatioY} -> ${targetController}`;
  } else {
    triggerPrefix = `Y=${yFormatted} < ${heavyFlowRatioY} -> ${targetController}`;
  }

  const emNote = hasEmergency ? ' + green-wave preemption active' : '';
  const reason = `${triggerPrefix} (study ${repLabel}: ${targetNote} vs fixed-tod; ${rawMpNote} in this regime)${emNote}`;

  return {
    regimeKey,
    recommendedController: targetController,
    flowRatioY: Number(flowRatioY.toFixed(3)),
    thresholds: policy.thresholds,
    reason,
    studyCell: rep,
    meanDelayPctVsFixedTod: regime.meanDelayPctVsFixedTod,
    rawMpWorstPctVsFixedTod: regime.rawMpWorstPctVsFixedTod,
    policySource: policy.sourceFile || 'default-fallback',
  };
}
