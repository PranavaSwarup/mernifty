import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
  {
    alertId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    deviceName: {
      type: String,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'high', 'critical'],
      default: 'warning',
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    metric: {
      type: String,
    },
    triggerValue: {
      type: Number,
    },
    thresholdValue: {
      type: Number,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

alertSchema.index({ severity: 1, resolved: 1, timestamp: -1 });

export const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
