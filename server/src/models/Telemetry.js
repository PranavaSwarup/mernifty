import mongoose from 'mongoose';

const telemetrySchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['server', 'fleet', 'turbine', 'iot'],
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
    status: {
      type: String,
      enum: ['healthy', 'warning', 'critical'],
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
      metaField: 'deviceId',
      granularity: 'seconds',
    },
  }
);

// Compound indexes for high-speed time-range queries
telemetrySchema.index({ deviceId: 1, timestamp: -1 });
telemetrySchema.index({ category: 1, timestamp: -1 });
telemetrySchema.index({ timestamp: -1 });

export const Telemetry = mongoose.models.Telemetry || mongoose.model('Telemetry', telemetrySchema);
