import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
  {
    alertId: {
      type: String,
      required: true,
      unique: true,
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
    deviceName: {
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
    remediationAction: {
      type: String,
    },
    cause: {
      type: String,
      default: 'unknown',
    },
    causeSource: {
      type: String,
      enum: ['unknown', 'citizen_report', 'officer', 'system'],
      default: 'unknown',
    },
    affectedRoad: {
      type: String,
    },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'action_applied', 'auto_applied', 'overridden', 'resolved'],
      default: 'open',
      index: true,
    },
    suggestedAction: {
      action: { type: String },
      description: { type: String },
      deadline: { type: Date },
    },
    actionApplied: {
      action: { type: String },
      appliedBy: { type: String },
      appliedAt: { type: Date },
    },
    officerNote: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
alertSchema.index({ resolved: 1, timestamp: -1 });
alertSchema.index({ deviceId: 1, resolved: 1 });
alertSchema.index({ zoneId: 1, resolved: 1 });

export const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
