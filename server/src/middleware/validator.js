import { JUNCTION_COORDINATES } from '../data/junctionGraph.js';
import { metricsService } from '../services/metricsService.js';

// Section 5.5: Strict Validation Rules
export function validateTrafficEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    const err = new Error('Payload must be a JSON object');
    err.field = 'payload';
    throw err;
  }

  // 1. eventId: non-empty string of reasonable length. Never generated on server.
  if (!raw.eventId || typeof raw.eventId !== 'string' || raw.eventId.trim().length === 0 || raw.eventId.length > 120) {
    const err = new Error('Field "eventId" must be a non-empty string (max 120 characters)');
    err.field = 'eventId';
    throw err;
  }

  // 2. junctionId: must be one of the registered Bengaluru junctions
  const junctionId = raw.junctionId || raw.deviceId;
  if (!junctionId || !JUNCTION_COORDINATES[junctionId]) {
    const validIds = Object.keys(JUNCTION_COORDINATES).join(', ');
    const err = new Error(`Field "junctionId" must be one of registered junctions: [${validIds}]`);
    err.field = 'junctionId';
    throw err;
  }

  // 3. timestamp: parses as date, <= 5s in future, <= 5m (300s) in past
  if (!raw.timestamp) {
    const err = new Error('Field "timestamp" is required');
    err.field = 'timestamp';
    throw err;
  }
  const eventTime = new Date(raw.timestamp).getTime();
  if (isNaN(eventTime)) {
    const err = new Error('Field "timestamp" must be a valid ISO-8601 date');
    err.field = 'timestamp';
    throw err;
  }
  const now = Date.now();
  const diffMs = eventTime - now;
  if (diffMs > 5000) {
    const err = new Error('Field "timestamp" cannot be more than 5 seconds in the future');
    err.field = 'timestamp';
    throw err;
  }
  if (diffMs < -300000) {
    const err = new Error('Field "timestamp" cannot be older than 5 minutes (300 seconds)');
    err.field = 'timestamp';
    throw err;
  }

  // 4. sequence: non-negative integer
  if (raw.sequence !== undefined) {
    if (typeof raw.sequence !== 'number' || !Number.isInteger(raw.sequence) || raw.sequence < 0) {
      const err = new Error('Field "sequence" must be a non-negative integer');
      err.field = 'sequence';
      throw err;
    }
  }

  // 5. approaches: non-empty array with <= 8 entries
  const data = raw.data || raw.metrics || {};
  const approaches = data.approaches;
  if (!Array.isArray(approaches) || approaches.length === 0 || approaches.length > 8) {
    const err = new Error('Field "data.approaches" must be a non-empty array with at most 8 entries');
    err.field = 'data.approaches';
    throw err;
  }

  for (let i = 0; i < approaches.length; i++) {
    const app = approaches[i];
    if (!app || typeof app !== 'object') {
      const err = new Error(`Approach at index ${i} must be an object`);
      err.field = `data.approaches[${i}]`;
      throw err;
    }

    if (!app.road || typeof app.road !== 'string' || app.road.trim().length === 0) {
      const err = new Error(`Approach at index ${i} requires non-empty "road" string`);
      err.field = `data.approaches[${i}].road`;
      throw err;
    }

    if (typeof app.vehiclesPerMin !== 'number' || app.vehiclesPerMin < 0 || app.vehiclesPerMin > 300) {
      const err = new Error(`Approach at index ${i}: "vehiclesPerMin" must be between 0 and 300 (received: ${app.vehiclesPerMin})`);
      err.field = `data.approaches[${i}].vehiclesPerMin`;
      throw err;
    }

    if (typeof app.queueLengthM !== 'number' || app.queueLengthM < 0 || app.queueLengthM > 2000) {
      const err = new Error(`Approach at index ${i}: "queueLengthM" must be between 0 and 2000m (received: ${app.queueLengthM})`);
      err.field = `data.approaches[${i}].queueLengthM`;
      throw err;
    }

    if (typeof app.avgSpeedKmph !== 'number' || app.avgSpeedKmph < 0 || app.avgSpeedKmph > 120) {
      const err = new Error(`Approach at index ${i}: "avgSpeedKmph" must be between 0 and 120 km/h (received: ${app.avgSpeedKmph})`);
      err.field = `data.approaches[${i}].avgSpeedKmph`;
      throw err;
    }

    if (!['red', 'amber', 'green'].includes(app.signal)) {
      const err = new Error(`Approach at index ${i}: "signal" must be 'red', 'amber', or 'green' (received: ${app.signal})`);
      err.field = `data.approaches[${i}].signal`;
      throw err;
    }
  }

  return true;
}

// Section 5.5: Server Enrichment (Server owns zone, name, totals, congestion score and status)
export function enrichTrafficEvent(raw) {
  const junctionId = raw.junctionId || raw.deviceId;
  const regInfo = JUNCTION_COORDINATES[junctionId] || {};
  const serverZoneId = regInfo.zoneId || 'south-bangalore';
  const serverJunctionName = regInfo.name || junctionId;

  const data = raw.data || raw.metrics || {};
  const approaches = data.approaches || [];

  let totalFlow = 0;
  let maxQueue = 0;
  let sumSpeed = 0;

  for (const app of approaches) {
    totalFlow += app.vehiclesPerMin;
    if (app.queueLengthM > maxQueue) maxQueue = app.queueLengthM;
    sumSpeed += app.avgSpeedKmph;
  }

  const avgSpeed = approaches.length > 0 ? parseFloat((sumSpeed / approaches.length).toFixed(1)) : 18;

  // Server computed Congestion Score (0 - 100)
  const queueFactor = Math.min(100, (maxQueue / 220) * 60);
  const speedFactor = Math.max(0, (1 - avgSpeed / 30) * 40);
  const congestionScore = Math.min(100, Math.round(queueFactor + speedFactor));

  // Server computed Status
  let status = 'healthy';
  if (maxQueue > 140 || avgSpeed < 7) {
    status = 'gridlock';
  } else if (maxQueue > 80 || avgSpeed < 14) {
    status = 'congested';
  }

  const vehicleMix = data.vehicleMix || { twoWheeler: 0.5, car: 0.35, bus: 0.1, truck: 0.05 };

  const enrichedData = {
    approaches,
    vehicleMix,
    totalFlowVehiclesPerMin: totalFlow,
    maxQueueLengthM: maxQueue,
    avgSpeedKmph: avgSpeed,
    congestionScore,
    adaptiveSignalMode: data.adaptiveSignalMode || 'dynamic-ai',
  };

  const metrics = {
    totalFlowVehiclesPerMin: totalFlow,
    maxQueueLengthM: maxQueue,
    avgSpeedKmph: avgSpeed,
    congestionScore,
    adaptiveSignalMode: enrichedData.adaptiveSignalMode,
  };

  return {
    eventId: raw.eventId,
    junctionId,
    deviceId: junctionId,
    deviceName: serverJunctionName,
    junctionName: serverJunctionName,
    zoneId: serverZoneId, // Server owned - never trusts client
    category: serverZoneId,
    timestamp: new Date(raw.timestamp).toISOString(),
    receivedAt: new Date().toISOString(),
    sequence: raw.sequence || 0,
    data: enrichedData,
    metrics,
    status, // Server owned
    location: regInfo ? { latitude: regInfo.latitude, longitude: regInfo.longitude } : null,
  };
}

// Middleware for single event ingestion
export function validateTelemetryEvent(req, res, next) {
  try {
    validateTrafficEvent(req.body);
    req.validatedEvent = enrichTrafficEvent(req.body);
    next();
  } catch (err) {
    metricsService.recordRejected(1);
    return res.status(400).json({
      success: false,
      error: err.message,
      field: err.field,
    });
  }
}

// Middleware for batch ingestion: validates each individually, accepts good, returns rejected summary
export function validateTelemetryBatch(req, res, next) {
  const events = req.body;
  if (!Array.isArray(events)) {
    metricsService.recordRejected(1);
    return res.status(400).json({ success: false, error: 'Batch payload must be an array of event objects' });
  }

  const validatedEvents = [];
  const rejectedReasons = [];

  for (let i = 0; i < events.length; i++) {
    try {
      validateTrafficEvent(events[i]);
      validatedEvents.push(enrichTrafficEvent(events[i]));
    } catch (err) {
      if (rejectedReasons.length < 5) {
        rejectedReasons.push({ index: i, error: err.message, field: err.field });
      }
    }
  }

  const rejectedCount = events.length - validatedEvents.length;
  if (rejectedCount > 0) {
    metricsService.recordRejected(rejectedCount);
  }

  req.validatedEvents = validatedEvents;
  req.batchRejectedCount = rejectedCount;
  req.batchRejectedReasons = rejectedReasons;
  next();
}

// Compatibility helper used in existing tests and producers
export function normalizeTrafficEvent(raw) {
  validateTrafficEvent(raw);
  return enrichTrafficEvent(raw);
}
