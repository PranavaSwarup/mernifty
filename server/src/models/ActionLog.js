import mongoose from 'mongoose';

const actionLogSchema = new mongoose.Schema(
  {
    logId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    alertId: {
      type: String,
      required: true,
      index: true,
    },
    junctionId: {
      type: String,
      required: true,
      index: true,
    },
    zoneId: {
      type: String,
      index: true,
    },
    action: {
      type: String,
      required: true, // e.g. 'extend_green', 'hold_upstream', 'divert', 'manual-override', 'fixed_timer'
    },
    actor: {
      type: String,
      required: true, // user email or 'system'
      index: true,
    },
    actorRole: {
      type: String,
      enum: ['system', 'officer', 'admin'],
      default: 'system',
    },
    details: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

actionLogSchema.index({ junctionId: 1, timestamp: -1 });

export const ActionLog = mongoose.models.ActionLog || mongoose.model('ActionLog', actionLogSchema);

