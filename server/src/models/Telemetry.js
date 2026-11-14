import mongoose from 'mongoose';

const telemetrySchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    junctionId: {
      type: String,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    junctionName: {
      type: String,
    },
    zoneId: {
      type: String,
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    sequence: {
      type: Number,
      default: 0,
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
    timeseries: {
      timeField: 'timestamp',
      metaField: 'junctionId',
      granularity: 'seconds',
    },
  }
);

// Compound indexes for high-speed time-range queries
telemetrySchema.index({ junctionId: 1, timestamp: -1 });
telemetrySchema.index({ deviceId: 1, timestamp: -1 });
telemetrySchema.index({ zoneId: 1, timestamp: -1 });
telemetrySchema.index({ category: 1, timestamp: -1 });
telemetrySchema.index({ timestamp: -1 });

export const Telemetry = mongoose.models.Telemetry || mongoose.model('Telemetry', telemetrySchema);
