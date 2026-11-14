import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    groupId: {
      type: String,
      index: true, // For grouping duplicate reports at the same junction within 10 minutes
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['accident', 'road_blocked', 'waterlogging', 'signal_not_working', 'construction', 'other'],
      required: true,
      index: true,
    },
    location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    nearestJunctionId: {
      type: String,
      required: true,
      index: true,
    },
    zoneId: {
      type: String,
      required: true,
      index: true,
    },
    note: {
      type: String,
      maxlength: 200,
      default: '',
    },
    reportCount: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['received', 'verified', 'action_taken', 'dismissed'],
      default: 'received',
      index: true,
    },
    linkedAlertId: {
      type: String,
      default: null,
      index: true,
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

reportSchema.index({ nearestJunctionId: 1, category: 1, timestamp: -1 });

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
