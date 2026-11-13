import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['server', 'fleet', 'turbine', 'iot'],
      index: true,
    },
    region: {
      type: String,
      default: 'Global',
    },
    status: {
      type: String,
      enum: ['online', 'degraded', 'offline', 'warning', 'critical'],
      default: 'online',
      index: true,
    },
    healthScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    lastMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastLocation: {
      latitude: Number,
      longitude: Number,
      label: String,
    },
    tags: [String],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
