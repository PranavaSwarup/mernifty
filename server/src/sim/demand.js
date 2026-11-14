/**
 * Bengaluru (IST, UTC+05:30) Time-of-Day Traffic Demand Profile
 *
 * Smoothly interpolates across characteristic Bengaluru arterial demand regimes:
 * - Night trough (00:00–05:00 IST): ~0.30x
 * - Morning office/IT corridor peak (08:00–11:00 IST): ~1.55x–1.75x
 * - Midday baseline (12:30–15:30 IST): ~1.00x
 * - Evening return peak (17:00–21:00 IST): ~1.60x–1.85x
 */

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

// Smooth cosine-interpolated hourly demand knots (IST hours [0..24])
const DEMAND_KNOTS = [
  [0.0, 0.30],
  [4.5, 0.30],
  [6.5, 0.85],
  [8.0, 1.58],
  [9.5, 1.75],
  [11.0, 1.48],
  [12.5, 1.00],
  [15.5, 1.00],
  [17.0, 1.62],
  [19.0, 1.85],
  [20.5, 1.65],
  [21.75, 1.05],
  [23.25, 0.34],
  [24.0, 0.30],
];

/**
 * Extract fractional IST hour [0, 24) from Date | number | ISO string.
 * @param {Date|number|string} simDate
 * @returns {number}
 */
export function getIstHour(simDate) {
  const utcMs =
    simDate instanceof Date
      ? simDate.getTime()
      : typeof simDate === 'number'
        ? simDate
        : Date.parse(simDate);
  const validMs = Number.isFinite(utcMs) ? utcMs : Date.now();
  const ist = new Date(validMs + IST_OFFSET_MS);
  return (
    ist.getUTCHours() +
    ist.getUTCMinutes() / 60 +
    ist.getUTCSeconds() / 3600 +
    ist.getUTCMilliseconds() / 3600000
  );
}

/**
 * Compute smooth Bengaluru time-of-day traffic demand multiplier.
 * @param {Date|number|string} simDate
 * @returns {number} Demand multiplier (~0.30 to ~1.85)
 */
export function demandFactor(simDate) {
  const h = getIstHour(simDate);
  for (let i = 0; i < DEMAND_KNOTS.length - 1; i++) {
    const [h0, v0] = DEMAND_KNOTS[i];
    const [h1, v1] = DEMAND_KNOTS[i + 1];
    if (h >= h0 && h <= h1) {
      const span = h1 - h0;
      const t = span > 0 ? (h - h0) / span : 0;
      // Raised-cosine easing guarantees C1 smooth slopes across regime boundaries
      const eased = 0.5 * (1 - Math.cos(Math.PI * t));
      return v0 + (v1 - v0) * eased;
    }
  }
  return DEMAND_KNOTS[0][1];
}

/**
 * Human-readable label for the current IST demand regime.
 * @param {Date|number|string} simDate
 * @returns {string}
 */
export function getDemandRegimeLabel(simDate) {
  const h = getIstHour(simDate);
  if (h >= 8 && h <= 11) return 'Morning Peak';
  if (h >= 17 && h <= 21) return 'Evening Peak';
  if (h >= 12.5 && h <= 15.5) return 'Midday Baseline';
  if (h < 5 || h >= 23) return 'Night Trough';
  return 'Transition';
}

/**
 * 5 exhaustive Time-of-Day (TOD) signal timing periods in IST [0, 24).
 */
export const TOD_PERIODS = [
  { id: 'night', label: 'Night Trough (22:00–06:00 IST)', startHour: 22, endHour: 6 },
  { id: 'am-peak', label: 'AM Peak (06:00–11:30 IST)', startHour: 6, endHour: 11.5 },
  { id: 'midday', label: 'Midday (11:30–16:30 IST)', startHour: 11.5, endHour: 16.5 },
  { id: 'pm-peak', label: 'PM Peak (16:30–20:30 IST)', startHour: 16.5, endHour: 20.5 },
  { id: 'evening', label: 'Evening (20:30–22:00 IST)', startHour: 20.5, endHour: 22 },
];

/**
 * Resolve the TOD period metadata for a given timestamp.
 * @param {Date|number|string} simDate
 */
export function getTodPeriod(simDate) {
  const h = getIstHour(simDate);
  for (const p of TOD_PERIODS) {
    if (p.startHour < p.endHour) {
      if (h >= p.startHour && h < p.endHour) return p;
    } else {
      // Wraps midnight (e.g. 22:00 -> 06:00)
      if (h >= p.startHour || h < p.endHour) return p;
    }
  }
  return TOD_PERIODS[0];
}

function evalDemandAtIstHour(h) {
  const wrapped = ((h % 24) + 24) % 24;
  for (let i = 0; i < DEMAND_KNOTS.length - 1; i++) {
    const [h0, v0] = DEMAND_KNOTS[i];
    const [h1, v1] = DEMAND_KNOTS[i + 1];
    if (wrapped >= h0 && wrapped <= h1) {
      const span = h1 - h0;
      const t = span > 0 ? (wrapped - h0) / span : 0;
      const eased = 0.5 * (1 - Math.cos(Math.PI * t));
      return v0 + (v1 - v0) * eased;
    }
  }
  return DEMAND_KNOTS[0][1];
}

/**
 * Compute exact numerical mean of demandFactor across a TOD period's IST hours.
 * Used offline by the Webster-tuned Fixed-TOD plan generator.
 */
const PERIOD_MEAN_CACHE = new Map();
export function getPeriodMeanDemandFactor(periodId) {
  if (PERIOD_MEAN_CACHE.has(periodId)) return PERIOD_MEAN_CACHE.get(periodId);
  const period = TOD_PERIODS.find((p) => p.id === periodId);
  if (!period) return 1.0;

  const durationHrs =
    period.startHour < period.endHour
      ? period.endHour - period.startHour
      : 24 - period.startHour + period.endHour;

  const steps = 120;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const offset = ((i + 0.5) / steps) * durationHrs;
    sum += evalDemandAtIstHour(period.startHour + offset);
  }
  const mean = sum / steps;
  PERIOD_MEAN_CACHE.set(periodId, mean);
  return mean;
}
