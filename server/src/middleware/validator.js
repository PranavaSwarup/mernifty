import crypto from 'crypto';
import { z } from 'zod';
import { INITIAL_DEVICES } from '../sim/junctions.data.js';
import { recordRejected, withSyncSpan } from '../telemetry/instruments.js';

export const JUNCTION_CATALOGUE = new Map(
  INITIAL_DEVICES.map((d) => [d.junctionId, d.zoneId])
);

const MAX_FUTURE_SKEW_MS = 30 * 1000;
const MAX_PAST_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH_SIZE = 1000;
const MAX_REJECTION_REASONS = 20;

const approachSchema = z
  .object({
    road: z.string().trim().min(1).max(120).optional(),
    dir: z.string().trim().max(16).optional(),
    lanes: z.number().int().min(1).max(8).optional(),
    vehiclesPerMin: z.number().finite().min(0).max(400),
    queueLengthM: z.number().finite().min(0).max(2000),
    avgSpeedKmph: z.number().finite().min(0).max(120),
    signal: z.enum(['green', 'amber', 'red']).optional(),
  })
  .passthrough();

const vehicleMixSchema = z
  .record(z.string(), z.number().finite().min(0).max(1))
  .refine(
    (mix) => {
      const vals = Object.values(mix);
      if (vals.length === 0) return false;
      const sum = vals.reduce((a, b) => a + b, 0);
      return sum >= 0.95 && sum <= 1.05;
    },
    { message: 'vehicleMix fractions must be in [0, 1] and sum to 1.0 (±0.05)' }
  );

const eventEnvelopeSchema = z
  .object({
    eventId: z
      .string()
      .trim()
      .min(3)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/, 'eventId may only contain [A-Za-z0-9._:-]')
      .optional(),
    junctionId: z.string().trim().min(1).max(64).optional(),
    deviceId: z.string().trim().min(1).max(64).optional(),
    junctionName: z.string().trim().max(120).optional(),
    deviceName: z.string().trim().max(120).optional(),
    zoneId: z.string().trim().min(1).max(64).optional(),
    category: z.string().trim().min(1).max(64).optional(),
    timestamp: z.union([z.string(), z.number(), z.date()]).optional(),
    sequence: z.number().int().min(0).max(1e12).optional(),
    source: z.string().trim().max(64).optional(),
    status: z.enum(['healthy', 'warning', 'critical', 'congested', 'gridlock']).optional(),
    location: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        label: z.string().max(120).optional(),
      })
      .nullable()
      .optional(),
    data: z
      .object({
        approaches: z.array(approachSchema).min(1).max(8),
        vehicleMix: vehicleMixSchema.optional(),
        stalledVehicleDetected: z.boolean().optional(),
        ambulanceDetected: z.boolean().optional(),
        totalFlowVehiclesPerMin: z.number().finite().min(0).max(3200).optional(),
        maxQueueLengthM: z.number().finite().min(0).max(2000).optional(),
        avgSpeedKmph: z.number().finite().min(0).max(120).optional(),
        congestionScore: z.number().finite().min(0).max(100).optional(),
        cameraProcessingLatencyMs: z.number().finite().min(0).max(10000).optional(),
        control: z.record(z.any()).optional(),
        kpi: z.record(z.any()).optional(),
      })
      .passthrough()
      .optional(),
    metrics: z
      .object({
        approaches: z.array(approachSchema).min(1).max(8).optional(),
        vehicleMix: vehicleMixSchema.optional(),
        stalledVehicleDetected: z.boolean().optional(),
        ambulanceDetected: z.boolean().optional(),
        totalFlowVehiclesPerMin: z.number().finite().min(0).max(3200).optional(),
        maxQueueLengthM: z.number().finite().min(0).max(2000).optional(),
        avgSpeedKmph: z.number().finite().min(0).max(120).optional(),
        congestionScore: z.number().finite().min(0).max(100).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function normalizeTrafficEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Event payload must be a JSON object');
  }

  const parsed = eventEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const pathStr = firstIssue.path.length > 0 ? `${firstIssue.path.join('.')}: ` : '';
    throw new Error(`${pathStr}${firstIssue.message}`);
  }

  const v = parsed.data;
  const junctionId = v.junctionId ?? v.deviceId;
  if (!junctionId) {
    throw new Error('Missing junctionId (or deviceId)');
  }

  const expectedZone = JUNCTION_CATALOGUE.get(junctionId);
  if (!expectedZone) {
    throw new Error(`Unknown junctionId '${junctionId}' (not in Bengaluru junction catalogue)`);
  }

  const suppliedZone = v.zoneId ?? v.category;
  if (suppliedZone !== undefined && suppliedZone !== expectedZone) {
    throw new Error(
      `zoneId '${suppliedZone}' does not match junction '${junctionId}' zone '${expectedZone}'`
    );
  }
  const zoneId = expectedZone;

  const eventId =
    v.eventId ?? `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  // Validate timestamp bounded to [now - 24h, now + 30s]
  const nowMs = Date.now();
  const tsDate = v.timestamp !== undefined ? new Date(v.timestamp) : new Date(nowMs);
  const tsMs = tsDate.getTime();
  if (!Number.isFinite(tsMs)) {
    throw new Error('timestamp must be a valid ISO-8601 date or epoch milliseconds');
  }
  if (tsMs > nowMs + MAX_FUTURE_SKEW_MS) {
    throw new Error('timestamp cannot be more than 30s in the future');
  }
  if (tsMs < nowMs - MAX_PAST_AGE_MS) {
    throw new Error('timestamp cannot be older than 24 hours');
  }
  const timestamp = tsDate.toISOString();

  const sequence = v.sequence ?? 0;

  // Require data.approaches or metrics.approaches (1..8 items validated above)
  const dataObj = v.data ?? v.metrics ?? {};
  const approaches = dataObj.approaches;
  if (!Array.isArray(approaches) || approaches.length < 1 || approaches.length > 8) {
    throw new Error('data.approaches must contain between 1 and 8 approach measurements');
  }

  let totalFlow = 0;
  let maxQueue = 0;
  let sumSpeed = 0;

  for (const app of approaches) {
    const flow = app.vehiclesPerMin ?? 0;
    const queue = app.queueLengthM ?? 0;
    const speed = app.avgSpeedKmph ?? 15;

    totalFlow += flow;
    if (queue > maxQueue) maxQueue = queue;
    sumSpeed += speed;
  }

  const avgSpeed = parseFloat((sumSpeed / approaches.length).toFixed(1));
  const queueFactor = Math.min(100, (maxQueue / 200) * 60);
  const speedFactor = Math.max(0, (1 - avgSpeed / 30) * 40);
  const congestionScore = Math.min(100, Math.round(queueFactor + speedFactor));

  const stalledVehicleDetected = Boolean(dataObj.stalledVehicleDetected);
  const ambulanceDetected = Boolean(dataObj.ambulanceDetected);
  const vehicleMix = dataObj.vehicleMix ?? {
    twoWheeler: 0.55,
    car: 0.30,
    bus: 0.05,
    truck: 0.10,
  };

  const enrichedData = {
    approaches,
    vehicleMix,
    stalledVehicleDetected,
    ambulanceDetected,
    totalFlowVehiclesPerMin: dataObj.totalFlowVehiclesPerMin ?? totalFlow,
    maxQueueLengthM: dataObj.maxQueueLengthM ?? maxQueue,
    avgSpeedKmph: dataObj.avgSpeedKmph ?? avgSpeed,
    congestionScore: dataObj.congestionScore ?? congestionScore,
    cameraProcessingLatencyMs: dataObj.cameraProcessingLatencyMs ?? 12,
    ...(dataObj.control ? { control: dataObj.control } : {}),
    ...(dataObj.kpi ? { kpi: dataObj.kpi } : {}),
  };

  const metrics = {
    totalFlowVehiclesPerMin: enrichedData.totalFlowVehiclesPerMin,
    maxQueueLengthM: enrichedData.maxQueueLengthM,
    avgSpeedKmph: enrichedData.avgSpeedKmph,
    congestionScore: enrichedData.congestionScore,
    stalledVehicleDetected,
    ambulanceDetected,
    ...(v.metrics && typeof v.metrics === 'object' ? v.metrics : {}),
  };

  let status = v.status ?? 'healthy';
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
    deviceName: v.deviceName ?? v.junctionName ?? junctionId,
    junctionName: v.junctionName ?? v.deviceName ?? junctionId,
    zoneId,
    category: zoneId,
    timestamp,
    sequence,
    source: v.source ?? 'external',
    data: enrichedData,
    metrics,
    status,
    location: v.location ?? null,
  };
}

export function validateTelemetryEvent(req, res, next) {
  let valid = false;
  withSyncSpan('telemetry.validate', { attributes: { 'batch.size': 1 } }, (span) => {
    try {
      req.validatedEvent = normalizeTrafficEvent(req.body);
      valid = true;
    } catch (err) {
      recordRejected('validation', 1);
      span?.setAttribute('validation.error', err.message);
      res.status(400).json({
        success: false,
        error: 'Invalid traffic telemetry payload',
        details: err.message,
      });
    }
  });
  if (valid) next();
}

export function validateTelemetryBatch(req, res, next) {
  let valid = false;
  withSyncSpan('telemetry.validate', {}, (span) => {
    const rawEvents = Array.isArray(req.body) ? req.body : req.body?.events;
    if (!Array.isArray(rawEvents)) {
      recordRejected('validation', 1);
      res.status(400).json({
        success: false,
        error: 'Expected JSON array of traffic telemetry events or { events: [...] }',
      });
      return;
    }
    if (rawEvents.length === 0) {
      recordRejected('validation', 1);
      res.status(400).json({
        success: false,
        error: 'Batch must contain at least 1 event',
      });
      return;
    }
    if (rawEvents.length > MAX_BATCH_SIZE) {
      recordRejected('batch_too_large', rawEvents.length);
      res.status(400).json({
        success: false,
        error: `Batch exceeds maximum allowed size of ${MAX_BATCH_SIZE} events`,
      });
      return;
    }

    span?.setAttribute('batch.size', rawEvents.length);
    const validItems = [];
    const rejectedItems = [];

    for (let i = 0; i < rawEvents.length; i++) {
      const raw = rawEvents[i];
      try {
        const normalized = normalizeTrafficEvent(raw);
        validItems.push({ index: i, event: normalized });
      } catch (err) {
        rejectedItems.push({
          index: i,
          eventId: raw && typeof raw === 'object' ? raw.eventId ?? null : null,
          reason: err.message,
        });
      }
    }

    if (rejectedItems.length > 0) {
      recordRejected('validation', rejectedItems.length);
    }

    if (validItems.length === 0) {
      res.status(400).json({
        success: false,
        error: 'All events in batch failed validation',
        totalReceived: rawEvents.length,
        acceptedCount: 0,
        rejectedCount: rejectedItems.length,
        rejected: rejectedItems.slice(0, MAX_REJECTION_REASONS),
      });
      return;
    }

    req.validatedBatchItems = validItems;
    req.rejectedBatchItems = rejectedItems;
    req.validatedEvents = validItems.map((x) => x.event);
    valid = true;
  });
  if (valid) next();
}
