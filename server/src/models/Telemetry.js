import mongoose from 'mongoose';
import { config } from '../config/config.js';

const telemetrySchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
    },
    junctionId: {
      type: String,
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    junctionName: {
      type: String,
    },
    zoneId: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    sequence: {
      type: Number,
      default: 0,
    },
    late: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      default: 'external',
    },
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['healthy', 'warning', 'critical', 'congested', 'gridlock'],
      default: 'healthy',
      index: true,
    },
    location: {
      latitude: Number,
      longitude: Number,
      label: String,
    },
  },
  {
    timestamps: true,
  }
);

// Integrity, ordering, query, and TTL indexes on regular collection (no timeseries)
telemetrySchema.index({ eventId: 1 }, { unique: true });
telemetrySchema.index({ junctionId: 1, sequence: -1 });
telemetrySchema.index({ junctionId: 1, timestamp: -1 });
telemetrySchema.index({ zoneId: 1, timestamp: -1 });
telemetrySchema.index({ deviceId: 1, timestamp: -1 });
telemetrySchema.index({ category: 1, timestamp: -1 });
// TTL: MongoDB deletes telemetry older than TELEMETRY_TTL_SEC. On an existing database the
// value is kept up to date at startup by ensureTelemetryRetention() (utils/telemetryRetention.js).
telemetrySchema.index({ timestamp: 1 }, { expireAfterSeconds: config.telemetryTtlSec });

export const Telemetry = mongoose.models.Telemetry || mongoose.model('Telemetry', telemetrySchema);
