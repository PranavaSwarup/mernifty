const ipRequests = new Map();

export function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000; // 1 minute
  const maxRequests = options.max || 1200; // 1200 req/min for high-throughput stream ingestion

  return (req, res, next) => {
    // API keys get higher rate limit
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

// Clean up stale rate limits every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipRequests.entries()) {
    if (now > record.resetTime) {
      ipRequests.delete(key);
    }
  }
}, 300000);
