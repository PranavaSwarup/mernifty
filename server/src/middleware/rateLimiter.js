import { config } from '../config/config.js';

const ipRequests = new Map();
const sourceEvents = new Map(); // junctionId -> { count, resetTime }

export function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000;
  const maxRequests = options.max || 1200;

  return (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const limit = apiKey ? maxRequests * 5 : maxRequests;
    const identifier = apiKey || req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!ipRequests.has(identifier)) {
      ipRequests.set(identifier, { count: 1, resetTime: now + windowMs });
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', limit - 1);
      return next();
    }

    const record = ipRequests.get(identifier);

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', limit - 1);
      return next();
    }

    record.count++;
    const remaining = Math.max(0, limit - record.count);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > limit) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please back off and throttle event submissions.',
        retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    next();
  };
}

// Check per-source rate limit (35 events/sec per junction; 350 for allowlisted stress test key)
export function checkSourceRateLimit(junctionId, apiKey = null, maxEventsPerSec = 35) {
  if (!junctionId) return { allowed: true, limit: maxEventsPerSec, count: 0 };

  const isStressKey = apiKey && apiKey === config.stressTestKey;
  const limit = isStressKey ? maxEventsPerSec * 10 : maxEventsPerSec;
  const windowMs = 1000;
  const now = Date.now();

  let record = sourceEvents.get(junctionId);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    sourceEvents.set(junctionId, record);
    return { allowed: true, limit, count: 1 };
  }

  record.count++;
  if (record.count > limit) {
    return { allowed: false, limit, count: record.count, retryAfterSeconds: 1 };
  }

  return { allowed: true, limit, count: record.count };
}

// Section 5.5: Per-source rate limiter (keyed by junctionId)
export function sourceRateLimiter(options = {}) {
  const maxEventsPerSec = options.maxPerSec || 35;

  return (req, res, next) => {
    const junctionId = req.body?.junctionId || req.body?.deviceId;
    if (!junctionId) return next();

    const apiKey = req.headers['x-api-key'] || req.query?.apiKey;
    const check = checkSourceRateLimit(junctionId, apiKey, maxEventsPerSec);

    if (!check.allowed) {
      return res.status(429).json({
        success: false,
        error: `Per-source rate limit exceeded for ${junctionId}. Max allowed: ${check.limit} events/sec.`,
        retryAfterSeconds: 1,
      });
    }

    next();
  };
}

// Clean up stale rate limits every 5 minutes (.unref() so Node tests never hang)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipRequests.entries()) {
    if (now > record.resetTime) {
      ipRequests.delete(key);
    }
  }
  for (const [key, record] of sourceEvents.entries()) {
    if (now > record.resetTime) {
      sourceEvents.delete(key);
    }
  }
}, 300000);
if (cleanupTimer.unref) cleanupTimer.unref();
