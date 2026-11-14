import crypto from 'crypto';

export function normalizeTrafficEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Event payload must be a JSON object');
  }

  const junctionId = raw.junctionId || raw.deviceId;
  if (!junctionId) {
    throw new Error('Missing junctionId (or deviceId)');
  }

  const zoneId = raw.zoneId || raw.category || 'south-bangalore';
  const eventId = raw.eventId || `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const timestamp = raw.timestamp ? new Date(raw.timestamp).toISOString() : new Date().toISOString();
  const sequence = typeof raw.sequence === 'number' ? raw.sequence : 0;

  // Extract traffic data
  const data = raw.data || raw.metrics || {};
  const approaches = Array.isArray(data.approaches) ? data.approaches : [];

  let totalFlow = 0;
  let maxQueue = 0;
  let sumSpeed = 0;

  for (const app of approaches) {
    const flow = typeof app.vehiclesPerMin === 'number' ? app.vehiclesPerMin : 0;
    const queue = typeof app.queueLengthM === 'number' ? app.queueLengthM : 0;
    const speed = typeof app.avgSpeedKmph === 'number' ? app.avgSpeedKmph : 15;

    totalFlow += flow;
    if (queue > maxQueue) maxQueue = queue;
    sumSpeed += speed;
  }

  const avgSpeed = approaches.length > 0 ? parseFloat((sumSpeed / approaches.length).toFixed(1)) : 15;
  const queueFactor = Math.min(100, (maxQueue / 200) * 60);
  const speedFactor = Math.max(0, (1 - avgSpeed / 30) * 40);
  const congestionScore = Math.min(100, Math.round(queueFactor + speedFactor));

  const stalledVehicleDetected = Boolean(data.stalledVehicleDetected);
  const ambulanceDetected = Boolean(data.ambulanceDetected);

  const vehicleMix = data.vehicleMix || { twoWheeler: 0.55, car: 0.30, bus: 0.05, truck: 0.10 };

  const enrichedData = {
    approaches,
    vehicleMix,
    stalledVehicleDetected,
    ambulanceDetected,
    totalFlowVehiclesPerMin: data.totalFlowVehiclesPerMin || totalFlow,
    maxQueueLengthM: data.maxQueueLengthM || maxQueue,
    avgSpeedKmph: data.avgSpeedKmph || avgSpeed,
    congestionScore: data.congestionScore || congestionScore,
    cameraProcessingLatencyMs: data.cameraProcessingLatencyMs || 12,
  };

  const metrics = {
    totalFlowVehiclesPerMin: enrichedData.totalFlowVehiclesPerMin,
    maxQueueLengthM: enrichedData.maxQueueLengthM,
    avgSpeedKmph: enrichedData.avgSpeedKmph,
    congestionScore: enrichedData.congestionScore,
    stalledVehicleDetected,
    ambulanceDetected,
    // also include raw keys if provided
    ...(typeof raw.metrics === 'object' ? raw.metrics : {}),
  };

  let status = raw.status || 'healthy';
  if (stalledVehicleDetected || ambulanceDetected) {
    status = 'critical';
  } else if (enrichedData.maxQueueLengthM > 180 || enrichedData.avgSpeedKmph < 7) {
    status = 'gridlock';
  } else if (enrichedData.maxQueueLengthM > 120 || enrichedData.avgSpeedKmph < 12) {
    status = 'congested';
  } else if (enrichedData.maxQueueLengthM > 85) {
    status = 'warning';
  }

  return {
    eventId,
    junctionId,
    deviceId: junctionId,
    deviceName: raw.deviceName || raw.junctionName || junctionId,
    junctionName: raw.junctionName || raw.deviceName || junctionId,
    zoneId,
    category: zoneId,
    timestamp,
    sequence,
    data: enrichedData,
    metrics,
    status,
    location: raw.location || null,
  };
}

export function validateTelemetryEvent(req, res, next) {
  try {
    req.validatedEvent = normalizeTrafficEvent(req.body);
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid traffic telemetry payload',
      details: err.message,
    });
  }
}

export function validateTelemetryBatch(req, res, next) {
  try {
    const rawEvents = Array.isArray(req.body) ? req.body : req.body.events;
    if (!rawEvents || !Array.isArray(rawEvents)) {
      return res.status(400).json({
        success: false,
        error: 'Expected JSON array of traffic telemetry events or { events: [...] }',
      });
    }

    req.validatedEvents = rawEvents.map(normalizeTrafficEvent);
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid traffic telemetry batch',
      details: err.message,
    });
  }
}
