import { z } from 'zod';

const telemetryEventSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  deviceId: z.string().min(1, 'deviceId is required'),
  deviceName: z.string().optional(),
  category: z.enum(['server', 'fleet', 'turbine', 'iot']),
  timestamp: z.string().or(z.date()).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid timestamp format',
  }),
  sequence: z.number().int().nonnegative().optional(),
  metrics: z.record(z.any()).refine((m) => Object.keys(m).length > 0, {
    message: 'metrics object must contain at least one measurement',
  }),
  status: z.enum(['healthy', 'warning', 'critical', 'online', 'offline']).optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      label: z.string().optional(),
    })
    .optional(),
});

const batchSchema = z.array(telemetryEventSchema).min(1).max(5000);

export function validateTelemetryEvent(req, res, next) {
  try {
    req.validatedEvent = telemetryEventSchema.parse(req.body);
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid telemetry payload',
      details: err.errors ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`) : err.message,
    });
  }
}

export function validateTelemetryBatch(req, res, next) {
  try {
    const rawEvents = Array.isArray(req.body) ? req.body : req.body.events;
    if (!rawEvents || !Array.isArray(rawEvents)) {
      return res.status(400).json({
        success: false,
        error: 'Expected JSON array of telemetry events or { events: [...] }',
      });
    }
    req.validatedEvents = batchSchema.parse(rawEvents);
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid telemetry batch',
      details: err.errors ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`) : err.message,
    });
  }
}
