/**
 * Bengaluru Approximate Arterial Corridor Network Topology
 *
 * Source & Assumptions (documented honestly):
 * - Node coordinates and base approach metadata come from INITIAL_DEVICES in
 *   `./junctions.data.js` (12 major Bengaluru junctions across 4 zones).
 * - Directed corridor links approximate major Bengaluru arterials (Outer Ring Road,
 *   Hosur Road, Bannerghatta Road, Bellary Road, Tumkur/Ring Road).
 * - Link lengths are computed via Haversine great-circle distance multiplied by a
 *   1.3x urban road tortuosity factor; free-flow travel time assumes 40 km/h.
 * - Because this 12-node model omits minor intermediate intersections along multi-km
 *   stretches, each approach defines an effective signalized queue storage bay
 *   (`storageCapM`, 260–340 m depending on road hierarchy) before spillback engages.
 * - `baseDemandPerSec` scales `baseVehiclesPerMin` by `BASE_DEMAND_SCALE = 0.25` so
 *   that midday (1.0x) runs comfortably undersaturated (Y ~ 0.36–0.46) and
 *   Bengaluru evening peak (1.6–1.85x) reaches realistic heavy urban utilization
 *   (Y ~ 0.67–0.85, rising > 0.95 under demand surges) under 4-phase signals
 *   with 4 s intergreen lost time.
 * - Approaches with no incoming modelled link receive external Poisson arrivals;
 *   approaches with incoming links receive delayed departures from upstream links.
 */

import { INITIAL_DEVICES } from './junctions.data.js';
import { TOD_PERIODS, getPeriodMeanDemandFactor } from './demand.js';
import { computeWebsterPlan } from './controllers.js';

export const ROAD_TORTUOSITY_FACTOR = 1.3;
export const FREE_FLOW_SPEED_KMPH = 40;
export const MIN_SPEED_KMPH = 3;
export const APPROACH_SEGMENT_LENGTH_M = 400; // Representative signalized arterial approach segment (m)
export const EFFECTIVE_VEH_LENGTH_M = 5.5; // PCU-equivalent length for BLR two-wheeler-heavy mix
export const SATURATION_PER_LANE_VEH_PER_SEC = 0.5; // 1800 PCU/h/lane
export const BASE_DEMAND_SCALE = 0.25;

/**
 * Compute great-circle distance (km) between two WGS84 coordinates.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Approximate directed arterial corridor links.
 * Every (fromJunction, fromApproachIdx) has sum(turnFraction) <= 1.0 (excess exits network).
 */
const RAW_CORRIDOR_LINKS = [
  // --- ORR East Corridor (Bidirectional): Silk Board(001) <-> Bellandur(005) <-> Marathahalli(007) <-> Tin Factory(006) <-> Hebbal(008) ---
  { id: 'LNK-001-005-A', corridor: 'ORR East', fromJunction: 'JNC-BLR-001', fromApproachIdx: 0, toJunction: 'JNC-BLR-005', toApproachIdx: 0, turnFraction: 0.55 },
  { id: 'LNK-001-005-B', corridor: 'ORR East', fromJunction: 'JNC-BLR-001', fromApproachIdx: 3, toJunction: 'JNC-BLR-005', toApproachIdx: 0, turnFraction: 0.45 },
  { id: 'LNK-005-001', corridor: 'ORR East', fromJunction: 'JNC-BLR-005', fromApproachIdx: 2, toJunction: 'JNC-BLR-001', toApproachIdx: 1, turnFraction: 0.60 },

  { id: 'LNK-005-007-A', corridor: 'ORR East', fromJunction: 'JNC-BLR-005', fromApproachIdx: 0, toJunction: 'JNC-BLR-007', toApproachIdx: 1, turnFraction: 0.60 },
  { id: 'LNK-005-007-B', corridor: 'ORR East', fromJunction: 'JNC-BLR-005', fromApproachIdx: 3, toJunction: 'JNC-BLR-007', toApproachIdx: 1, turnFraction: 0.40 },
  { id: 'LNK-007-005', corridor: 'ORR East', fromJunction: 'JNC-BLR-007', fromApproachIdx: 3, toJunction: 'JNC-BLR-005', toApproachIdx: 2, turnFraction: 0.60 },

  { id: 'LNK-007-006-A', corridor: 'ORR East', fromJunction: 'JNC-BLR-007', fromApproachIdx: 1, toJunction: 'JNC-BLR-006', toApproachIdx: 1, turnFraction: 0.60 },
  { id: 'LNK-007-006-B', corridor: 'ORR East', fromJunction: 'JNC-BLR-007', fromApproachIdx: 2, toJunction: 'JNC-BLR-006', toApproachIdx: 1, turnFraction: 0.35 },
  { id: 'LNK-006-007', corridor: 'ORR East', fromJunction: 'JNC-BLR-006', fromApproachIdx: 2, toJunction: 'JNC-BLR-007', toApproachIdx: 3, turnFraction: 0.60 },

  { id: 'LNK-006-008-A', corridor: 'ORR North', fromJunction: 'JNC-BLR-006', fromApproachIdx: 1, toJunction: 'JNC-BLR-008', toApproachIdx: 1, turnFraction: 0.55 },
  { id: 'LNK-006-008-B', corridor: 'ORR North', fromJunction: 'JNC-BLR-006', fromApproachIdx: 0, toJunction: 'JNC-BLR-008', toApproachIdx: 1, turnFraction: 0.35 },
  { id: 'LNK-008-006-A', corridor: 'ORR North', fromJunction: 'JNC-BLR-008', fromApproachIdx: 3, toJunction: 'JNC-BLR-006', toApproachIdx: 2, turnFraction: 0.55 },
  { id: 'LNK-008-006-B', corridor: 'ORR North', fromJunction: 'JNC-BLR-008', fromApproachIdx: 0, toJunction: 'JNC-BLR-006', toApproachIdx: 2, turnFraction: 0.30 },

  // --- ORR South: Jayadeva(004) <-> Silk Board(001) ---
  { id: 'LNK-004-001', corridor: 'ORR South', fromJunction: 'JNC-BLR-004', fromApproachIdx: 3, toJunction: 'JNC-BLR-001', toApproachIdx: 3, turnFraction: 0.60 },
  { id: 'LNK-001-004', corridor: 'ORR South', fromJunction: 'JNC-BLR-001', fromApproachIdx: 1, toJunction: 'JNC-BLR-004', toApproachIdx: 1, turnFraction: 0.55 },

  // --- Hosur Rd & Bannerghatta Rd: Silk Board(001) - Dairy Circle(003) - Richmond(011) - Town Hall(012) + Jayadeva(004) ---
  { id: 'LNK-001-003', corridor: 'Hosur Rd', fromJunction: 'JNC-BLR-001', fromApproachIdx: 0, toJunction: 'JNC-BLR-003', toApproachIdx: 1, turnFraction: 0.35 },
  { id: 'LNK-003-001', corridor: 'Hosur Rd', fromJunction: 'JNC-BLR-003', fromApproachIdx: 2, toJunction: 'JNC-BLR-001', toApproachIdx: 2, turnFraction: 0.50 },
  { id: 'LNK-004-003', corridor: 'Bannerghatta Rd', fromJunction: 'JNC-BLR-004', fromApproachIdx: 0, toJunction: 'JNC-BLR-003', toApproachIdx: 0, turnFraction: 0.55 },
  { id: 'LNK-003-004', corridor: 'Bannerghatta Rd', fromJunction: 'JNC-BLR-003', fromApproachIdx: 2, toJunction: 'JNC-BLR-004', toApproachIdx: 2, turnFraction: 0.40 },

  { id: 'LNK-003-011-A', corridor: 'Hosur Rd', fromJunction: 'JNC-BLR-003', fromApproachIdx: 0, toJunction: 'JNC-BLR-011', toApproachIdx: 2, turnFraction: 0.55 },
  { id: 'LNK-003-011-B', corridor: 'Hosur Rd', fromJunction: 'JNC-BLR-003', fromApproachIdx: 1, toJunction: 'JNC-BLR-011', toApproachIdx: 2, turnFraction: 0.45 },
  { id: 'LNK-011-003', corridor: 'Hosur Rd', fromJunction: 'JNC-BLR-011', fromApproachIdx: 0, toJunction: 'JNC-BLR-003', toApproachIdx: 2, turnFraction: 0.50 },

  { id: 'LNK-011-012-A', corridor: 'Central', fromJunction: 'JNC-BLR-011', fromApproachIdx: 2, toJunction: 'JNC-BLR-012', toApproachIdx: 1, turnFraction: 0.45 },
  { id: 'LNK-011-012-B', corridor: 'Central', fromJunction: 'JNC-BLR-011', fromApproachIdx: 1, toJunction: 'JNC-BLR-012', toApproachIdx: 1, turnFraction: 0.45 },
  { id: 'LNK-012-011', corridor: 'Central', fromJunction: 'JNC-BLR-012', fromApproachIdx: 3, toJunction: 'JNC-BLR-011', toApproachIdx: 3, turnFraction: 0.50 },

  // --- Koramangala Feeder: Silk Board(001) <-> Sony World(002) & Dairy Circle(003) -> Sony World(002) ---
  { id: 'LNK-001-002', corridor: 'Koramangala 80ft', fromJunction: 'JNC-BLR-001', fromApproachIdx: 3, toJunction: 'JNC-BLR-002', toApproachIdx: 2, turnFraction: 0.35 },
  { id: 'LNK-003-002', corridor: 'Koramangala 100ft', fromJunction: 'JNC-BLR-003', fromApproachIdx: 1, toJunction: 'JNC-BLR-002', toApproachIdx: 3, turnFraction: 0.35 },
  { id: 'LNK-002-001', corridor: 'Koramangala 80ft', fromJunction: 'JNC-BLR-002', fromApproachIdx: 0, toJunction: 'JNC-BLR-001', toApproachIdx: 2, turnFraction: 0.40 },

  // --- North Bengaluru: Goraguntepalya(009) <-> Hebbal(008) & Mekhri(010) <-> Hebbal(008) ---
  { id: 'LNK-009-008-A', corridor: 'ORR West', fromJunction: 'JNC-BLR-009', fromApproachIdx: 0, toJunction: 'JNC-BLR-008', toApproachIdx: 3, turnFraction: 0.45 },
  { id: 'LNK-009-008-B', corridor: 'ORR West', fromJunction: 'JNC-BLR-009', fromApproachIdx: 2, toJunction: 'JNC-BLR-008', toApproachIdx: 3, turnFraction: 0.55 },
  { id: 'LNK-008-009', corridor: 'ORR West', fromJunction: 'JNC-BLR-008', fromApproachIdx: 1, toJunction: 'JNC-BLR-009', toApproachIdx: 1, turnFraction: 0.55 },

  { id: 'LNK-010-008', corridor: 'Bellary Rd', fromJunction: 'JNC-BLR-010', fromApproachIdx: 2, toJunction: 'JNC-BLR-008', toApproachIdx: 2, turnFraction: 0.60 },
  { id: 'LNK-008-010', corridor: 'Bellary Rd', fromJunction: 'JNC-BLR-008', fromApproachIdx: 0, toJunction: 'JNC-BLR-010', toApproachIdx: 0, turnFraction: 0.55 },

  // --- Central-North Connectors: Richmond(011) -> Mekhri(010) -> Town Hall(012) ---
  { id: 'LNK-011-010', corridor: 'Bellary Connector', fromJunction: 'JNC-BLR-011', fromApproachIdx: 2, toJunction: 'JNC-BLR-010', toApproachIdx: 2, turnFraction: 0.45 },
  { id: 'LNK-010-012', corridor: 'KG Corridor', fromJunction: 'JNC-BLR-010', fromApproachIdx: 0, toJunction: 'JNC-BLR-012', toApproachIdx: 0, turnFraction: 0.55 },
];

/**
 * Compute offline Webster-tuned Time-of-Day (TOD) signal plans for each junction
 * and TOD period via fixed-point expected arrival propagation over the directed link graph.
 *
 * Uses the exact period mean demand multiplier from demand.js and caps internal link
 * propagation at each upstream approach's scheduled green discharge capacity.
 */
export function computeNetworkTodPlans(junctions, links, periods = TOD_PERIODS) {
  const jIdxById = new Map(junctions.map((j, idx) => [j.junctionId, idx]));
  const plansByJunction = junctions.map(() => ({}));

  for (const period of periods) {
    const periodFactor = getPeriodMeanDemandFactor(period.id);
    let arrRates = junctions.map((j) =>
      j.approaches.map((a) => (a.hasUpstream ? 0 : a.baseDemandPerSec * periodFactor))
    );
    let currentPlans = new Array(junctions.length);

    for (let iter = 0; iter < 20; iter++) {
      for (let jIdx = 0; jIdx < junctions.length; jIdx++) {
        const junc = junctions[jIdx];
        currentPlans[jIdx] = computeWebsterPlan({
          flowRatios: junc.approaches.map(
            (a, aIdx) => arrRates[jIdx][aIdx] / a.saturationFlowPerSec
          ),
        });
      }

      const nextArrRates = junctions.map((j) =>
        j.approaches.map((a) => (a.hasUpstream ? 0 : a.baseDemandPerSec * periodFactor))
      );

      for (const link of links) {
        const fromJIdx = jIdxById.get(link.fromJunction);
        const toJIdx = jIdxById.get(link.toJunction);
        if (fromJIdx === undefined || toJIdx === undefined) continue;

        const fromApp = junctions[fromJIdx].approaches[link.fromApproachIdx];
        const plan = currentPlans[fromJIdx];
        const greenShare = plan.splits[link.fromApproachIdx] / plan.cycleSec;
        const maxDischargeRate = fromApp.saturationFlowPerSec * greenShare;
        const meanOutflow = Math.min(arrRates[fromJIdx][link.fromApproachIdx], maxDischargeRate);
        nextArrRates[toJIdx][link.toApproachIdx] += meanOutflow * link.turnFraction;
      }

      arrRates = nextArrRates;
    }

    for (let jIdx = 0; jIdx < junctions.length; jIdx++) {
      const junc = junctions[jIdx];
      const finalPlan = computeWebsterPlan({
        flowRatios: junc.approaches.map(
          (a, aIdx) => arrRates[jIdx][aIdx] / a.saturationFlowPerSec
        ),
      });
      plansByJunction[jIdx][period.id] = {
        ...finalPlan,
        periodId: period.id,
        periodLabel: period.label,
        periodDemandFactor: periodFactor,
      };
    }
  }

  for (let jIdx = 0; jIdx < junctions.length; jIdx++) {
    junctions[jIdx].todPlans = plansByJunction[jIdx];
  }

  return plansByJunction;
}

/**
 * Build an enriched, immutable-ready Bengaluru network topology object.
 * @param {object|Array} [optionsOrDevices] Options `{ devices, rawLinks, demandScale }` or legacy junction array
 * @param {Array} [rawLinksArg] Optional link definitions override (legacy positional signature)
 */
export function buildNetwork(optionsOrDevices = {}, rawLinksArg = RAW_CORRIDOR_LINKS) {
  const isLegacyArray = Array.isArray(optionsOrDevices);
  const devices = isLegacyArray
    ? optionsOrDevices
    : optionsOrDevices.devices || INITIAL_DEVICES;
  const rawLinks = isLegacyArray
    ? rawLinksArg
    : optionsOrDevices.rawLinks || RAW_CORRIDOR_LINKS;
  const demandScale = isLegacyArray
    ? BASE_DEMAND_SCALE
    : optionsOrDevices.demandScale ?? BASE_DEMAND_SCALE;

  const junctions = devices.map((j) => {
    const approaches = j.baseApproaches.map((a, idx) => {
      const lanes = a.lanes || 2;
      const dir = a.dir || ['N', 'E', 'S', 'W'][idx % 4];
      const storageCapM = 240 + lanes * 25; // 290 m (2 lanes) to 340 m (4 lanes)
      const storageCapVeh = (storageCapM * lanes) / EFFECTIVE_VEH_LENGTH_M;
      const baseDemandPerSec = ((a.baseVehiclesPerMin || 25) / 60) * demandScale;
      const saturationFlowPerSec = lanes * SATURATION_PER_LANE_VEH_PER_SEC;

      return {
        ...a,
        index: idx,
        dir,
        lanes,
        storageCapM,
        storageCapVeh,
        baseDemandPerSec,
        saturationFlowPerSec,
        hasUpstream: false,
      };
    });

    return {
      ...j,
      approaches,
      todPlans: {},
    };
  });

  const junctionMap = new Map(junctions.map((j) => [j.junctionId, j]));

  const links = [];
  for (const raw of rawLinks) {
    const fromJ = junctionMap.get(raw.fromJunction);
    const toJ = junctionMap.get(raw.toJunction);
    if (!fromJ || !toJ) continue;

    const crowKm = haversineKm(
      fromJ.location.latitude,
      fromJ.location.longitude,
      toJ.location.latitude,
      toJ.location.longitude
    );
    const lengthKm = crowKm * ROAD_TORTUOSITY_FACTOR;
    const lengthM = Math.round(lengthKm * 1000);
    const freeFlowTravelTimeSec = Math.max(1, Math.round((lengthKm / FREE_FLOW_SPEED_KMPH) * 3600));

    toJ.approaches[raw.toApproachIdx].hasUpstream = true;

    links.push({
      ...raw,
      lengthKm: Number(lengthKm.toFixed(3)),
      lengthM,
      freeFlowTravelTimeSec,
    });
  }

  computeNetworkTodPlans(junctions, links);

  return {
    junctions,
    links,
    junctionMap,
    demandScale,
  };
}

/**
 * Classify junction status from combined queue, speed, v/c saturation, and delay
 * so undersaturated queues cannot mask v/c >= 1.0 oversaturation.
 */
export function classifyTrafficStatus(trafficData = {}) {
  if (trafficData.stalledVehicleDetected || trafficData.ambulanceDetected) {
    return 'critical';
  }
  const q = Number(trafficData.maxQueueLengthM ?? 0);
  const spd = Number(trafficData.avgSpeedKmph ?? FREE_FLOW_SPEED_KMPH);
  const vc = Number(
    trafficData.kpi?.degreeOfSaturation ??
      trafficData.degreeOfSaturation ??
      trafficData.vOverC ??
      0
  );
  const delay = Number(
    trafficData.kpi?.avgDelayPerVehSec ?? trafficData.avgDelayPerVehSec ?? 0
  );

  if (q > 180 || spd < 10 || delay >= 65 || (vc >= 2.0 && q >= 60)) {
    return 'gridlock';
  }
  if (q > 120 || spd < 15 || vc >= 1.0 || delay >= 35) {
    return 'congested';
  }
  if (q > 85 || spd < 20 || vc >= 0.85 || delay >= 22) {
    return 'warning';
  }
  return 'healthy';
}

export const DEFAULT_NETWORK = buildNetwork();
export { INITIAL_DEVICES as JUNCTIONS, RAW_CORRIDOR_LINKS };
