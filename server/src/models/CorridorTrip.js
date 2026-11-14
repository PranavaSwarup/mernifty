import mongoose from 'mongoose';

const CorridorTripSchema = new mongoose.Schema(
  {
    tripId: { type: String, required: true, unique: true, index: true },
    vehicleId: { type: String, required: true, index: true },
    startJunctionId: { type: String, required: true },
    destinationJunctionId: { type: String, required: true },
    routeJunctionIds: [{ type: String }],
    status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    durationSeconds: { type: Number },
    junctionEvents: [
      {
        junctionId: { type: String },
        preemptedAt: { type: Date },
        clearedAt: { type: Date },
      },
    ],
    positions: [{ type: mongoose.Schema.Types.Mixed }],
  },
  { timestamps: true }
);

export const CorridorTrip = mongoose.model('CorridorTrip', CorridorTripSchema);
