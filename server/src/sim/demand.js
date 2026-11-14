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
