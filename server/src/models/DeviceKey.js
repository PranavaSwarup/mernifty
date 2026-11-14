import crypto from 'crypto';
import mongoose from 'mongoose';

const deviceKeySchema = new mongoose.Schema(
  {
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    prefix: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    scopes: {
      type: [String],
      enum: ['ingest', 'read'],
      default: ['ingest'],
    },
    allowedJunctionIds: {
      type: [String],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export function hashDeviceKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

export const DeviceKey =
  mongoose.models.DeviceKey || mongoose.model('DeviceKey', deviceKeySchema);
