import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    junctionId: {
      type: String,
      index: true,
    },
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
    zoneId: {
      type: String,
      required: true,
      index: true,
    },
    zoneName: {
      type: String,
      default: 'Bengaluru Traffic Zone',
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    region: {
      type: String,
      default: 'Bengaluru Metro Area',
    },
    status: {
      type: String,
      enum: ['online', 'healthy', 'congested', 'gridlock', 'warning', 'critical', 'offline'],
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
    lastData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastLocation: {
      latitude: Number,
      longitude: Number,
      label: String,
    },
    approaches: [
      {
        road: String,
        vehiclesPerMin: Number,
        queueLengthM: Number,
        avgSpeedKmph: Number,
        signal: String,
        greenTimeSec: Number,
      },
    ],
    vehicleMix: {
      twoWheeler: { type: Number, default: 0.55 },
      car: { type: Number, default: 0.30 },
      bus: { type: Number, default: 0.05 },
      truck: { type: Number, default: 0.10 },
    },
    stalledVehicleDetected: {
      type: Boolean,
      default: false,
    },
    ambulanceDetected: {
      type: Boolean,
      default: false,
    },
    adaptiveSignalMode: {
      type: String,
      enum: ['dynamic-ai', 'fixed-timer', 'emergency-corridor', 'manual-override'],
      default: 'dynamic-ai',
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

// Compound indexes
deviceSchema.index({ zoneId: 1, status: 1 });

export const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
