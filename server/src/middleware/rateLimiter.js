const buckets = new Map();

function getPrincipalDescriptor(req, opts) {
  // Trust ONLY authenticated principals set by auth middleware — NEVER raw x-api-key header
  if (req.deviceKey && req.deviceKey._id) {
    return {
      key: `dk:${req.deviceKey._id}`,
      capacity: opts.authCapacity ?? (parseInt(process.env.RATE_LIMIT_AUTH_CAPACITY, 10) || 2000),
      refillPerSec:
        opts.authRefillPerSec ?? (parseFloat(process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC) || 200),
    };
  }
  if (req.user && !req.user.anonymous && req.user.id) {
    return {
      key: `user:${req.user.id}`,
      capacity: opts.authCapacity ?? (parseInt(process.env.RATE_LIMIT_AUTH_CAPACITY, 10) || 2000),
      refillPerSec:
        opts.authRefillPerSec ?? (parseFloat(process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC) || 200),
    };
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return {
    key: `ip:${ip}`,
    capacity: opts.anonCapacity ?? (parseInt(process.env.RATE_LIMIT_ANON_CAPACITY, 10) || 120),
    refillPerSec:
      opts.anonRefillPerSec ?? (parseFloat(process.env.RATE_LIMIT_ANON_REFILL_PER_SEC) || 20),
  };
}

/**
 * Token-bucket rate limiter keyed by authenticated principal (DeviceKey ID / User ID / IP fallback).
 * Supports per-event cost (e.g., batch of 500 events consumes 500 tokens).
 */
export function tokenBucketRateLimiter(options = {}) {
  const bucketScope = options.scope || 'default';
  const costFn =
    typeof options.costFn === 'function'
      ? options.costFn
      : () => 1;

  return (req, res, next) => {
    const now = Date.now();
    const principal = getPrincipalDescriptor(req, options);
    const bucketKey = `${bucketScope}:${principal.key}`;
    const cost = Math.max(1, Number(costFn(req)) || 1);

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        tokens: principal.capacity,
        lastRefillMs: now,
        capacity: principal.capacity,
        refillPerSec: principal.refillPerSec,
      };
      buckets.set(bucketKey, bucket);
    } else {
      bucket.capacity = principal.capacity;
      bucket.refillPerSec = principal.refillPerSec;
      const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedSec * bucket.refillPerSec);
      bucket.lastRefillMs = now;
    }

    res.setHeader('X-RateLimit-Limit', String(bucket.capacity));

    if (bucket.tokens < cost) {
      const deficit = cost - bucket.tokens;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(deficit / Math.max(0.01, bucket.refillPerSec))
      );
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please throttle telemetry submissions.',
        cost,
        remainingTokens: Math.floor(bucket.tokens),
        retryAfterSeconds,
      });
    }

    bucket.tokens -= cost;
    res.setHeader('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)));
    next();
  };
}

// Legacy alias kept for drop-in compatibility
export function rateLimiter(options = {}) {
  return tokenBucketRateLimiter(options);
}

export function resetRateLimitBuckets() {
  buckets.clear();
}

// Prune idle buckets every 5 minutes
const pruneTimer = setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, b] of buckets.entries()) {
    if (b.lastRefillMs < cutoff) {
      buckets.delete(k);
    }
  }
}, 300000);
if (pruneTimer.unref) pruneTimer.unref();
