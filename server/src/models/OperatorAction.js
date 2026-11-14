import mongoose from 'mongoose';

const operatorActionSchema = new mongoose.Schema(
  {
    actionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    junctionId: {
      type: String,
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    actor: {
      type: String,
      required: true,
      default: 'Operator',
    },
    actorRole: {
      type: String,
      default: 'operator',
    },
    actionType: {
      type: String,
      required: true,
      index: true,
    },
    findingId: {
      type: String,
      default: null,
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    studyEvidence: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    simTimeAtAction: {
      type: Date,
      required: true,
    },
    elapsedSecAtAction: {
      type: Number,
      required: true,
    },
    targetMeasureElapsedSec: {
      type: Number,
      required: true,
    },
    baselineMetricsAtAction: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    predictedEffect: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    realisedEffect: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'measured', 'cancelled'],
      default: 'pending',
      index: true,
    },
    resolvedAlertsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

operatorActionSchema.index({ junctionId: 1, createdAt: -1 });
operatorActionSchema.index({ status: 1, targetMeasureElapsedSec: 1 });

export const OperatorAction =
  mongoose.models.OperatorAction || mongoose.model('OperatorAction', operatorActionSchema);
