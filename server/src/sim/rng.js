/**
 * Deterministic Seeded PRNG (Mulberry32) & Statistical Distributions
 * Zero runtime dependencies; produces identical sequences given identical seeds.
 */

/**
 * FNV-1a 32-bit string/number hash to derive independent sub-stream seeds.
 * @param {number|string} baseSeed
 * @param {string} [label]
 * @returns {number} Unsigned 32-bit integer seed
 */
export function deriveSeed(baseSeed, label = '') {
  let h = 2166136261 >>> 0;
  const input = `${baseSeed}:${label}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mulberry32 deterministic 32-bit PRNG returning floats in [0, 1).
 * @param {number|string} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let state = typeof seed === 'number' ? (seed >>> 0) : deriveSeed(seed);
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample from Poisson(lambda).
 * - Exact Knuth algorithm for lambda <= 30.
 * - Box-Muller normal approximation clamped at 0 for lambda > 30.
 * @param {number} lambda
 * @param {() => number} randFn
 * @returns {number}
 */
export function poisson(lambda, randFn) {
  if (!(lambda > 0)) return 0;

  if (lambda <= 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= randFn();
    } while (p > L);
    return k - 1;
  }

  // Normal approximation for large lambda (> 30) using Box-Muller transform
  let u1 = randFn();
  if (u1 < 1e-12) u1 = 1e-12;
  const u2 = randFn();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}

/**
 * Create a seeded RNG bundle with convenience samplers.
 * @param {number|string} seed
 */
export function createRng(seed) {
  const rand = mulberry32(seed);
  return {
    next: rand,
    poisson: (lambda) => poisson(lambda, rand),
    nextInt: (maxExclusive) => Math.floor(rand() * maxExclusive),
    derive: (label) => createRng(deriveSeed(seed, label)),
  };
}
