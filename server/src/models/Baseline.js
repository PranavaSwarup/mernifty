import mongoose from 'mongoose';

const BaselineSchema = new mongoose.Schema(
  {
    junctionId: { type: String, required: true, index: true },
    hour: { type: Number, required: true, min: 0, max: 23 },
    avgCongestionScore: { type: Number, default: 40 },
    avgSpeedKmph: { type: Number, default: 20 },
    avgMaxQueueM: { type: Number, default: 60 },
    sampleCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

BaselineSchema.index({ junctionId: 1, hour: 1 }, { unique: true });

export const Baseline = mongoose.model('Baseline', BaselineSchema);
