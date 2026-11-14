import mongoose from 'mongoose';
import { Baseline } from '../models/Baseline.js';
import { Telemetry } from '../models/Telemetry.js';
import { INITIAL_DEVICES } from '../data/junctionDevices.js';
import { getHourVolumeMultiplier } from '../utils/seedHistory.js';

class BaselineService {
  constructor() {
    this.cache = new Map(); // `${junctionId}:${hour}` -> { avgCongestionScore, avgSpeedKmph, avgMaxQueueM, sampleCount }
    this.initDefaultBaselines();
  }

  // Pre-seed in-memory default baselines from initial device definitions and volume profiles
  initDefaultBaselines() {
    for (const junc of INITIAL_DEVICES) {
      const baseSpeed = junc.baseApproaches.reduce((acc, a) => acc + a.baseSpeed, 0) / junc.baseApproaches.length;
      const baseQueue = Math.max(...junc.baseApproaches.map((a) => a.baseQueueM));

      for (let h = 0; h < 24; h++) {
        const mult = getHourVolumeMultiplier(h);
        const avgSpeed = parseFloat(Math.max(3, baseSpeed / (mult >= 1.5 ? 1.5 : 1.0)).toFixed(1));
        const avgQueue = Math.round(baseQueue * (mult >= 1.5 ? mult * 1.1 : mult * 0.85));
        const queueFactor = Math.min(100, (avgQueue / 220) * 60);
        const speedFactor = Math.max(0, (1 - avgSpeed / 30) * 40);
        const avgCongestion = Math.min(100, Math.round(queueFactor + speedFactor));

        this.cache.set(`${junc.junctionId}:${h}`, {
          junctionId: junc.junctionId,
          hour: h,
          avgCongestionScore: avgCongestion,
          avgSpeedKmph: avgSpeed,
          avgMaxQueueM: avgQueue,
          sampleCount: 100,
        });
      }
    }
  }

  // Scheduled background baseline computation from stored MongoDB telemetry (Section 5.14)
  async computeBaselines() {
    if (mongoose.connection?.readyState !== 1) return;

    try {
      const results = await Telemetry.aggregate([
        {
          $project: {
            junctionId: 1,
            hour: { $hour: '$timestamp' },
            congestionScore: '$data.congestionScore',
            avgSpeedKmph: '$data.avgSpeedKmph',
            maxQueueLengthM: '$data.maxQueueLengthM',
          },
        },
        {
          $match: {
            congestionScore: { $ne: null },
            avgSpeedKmph: { $ne: null },
          },
        },
        {
          $group: {
            _id: { junctionId: '$junctionId', hour: '$hour' },
            avgCongestionScore: { $avg: '$congestionScore' },
            avgSpeedKmph: { $avg: '$avgSpeedKmph' },
            avgMaxQueueM: { $avg: '$maxQueueLengthM' },
            sampleCount: { $sum: 1 },
          },
        },
      ]);

      for (const r of results) {
        if (!r._id.junctionId || r.sampleCount < 3) continue;

        const record = {
          junctionId: r._id.junctionId,
          hour: r._id.hour,
          avgCongestionScore: Math.round(r.avgCongestionScore),
          avgSpeedKmph: parseFloat(r.avgSpeedKmph.toFixed(1)),
          avgMaxQueueM: Math.round(r.avgMaxQueueM),
          sampleCount: r.sampleCount,
          updatedAt: new Date(),
        };

        this.cache.set(`${record.junctionId}:${record.hour}`, record);

        await Baseline.findOneAndUpdate(
          { junctionId: record.junctionId, hour: record.hour },
          { $set: record },
          { upsert: true }
        ).catch(() => {});
      }

      console.log(`[BaselineService] Aggregated baselines updated for ${results.length} junction-hour slots.`);
    } catch (err) {
      console.warn('[BaselineService] Baseline aggregation warning:', err.message);
    }
  }

  getBaseline(junctionId, hour) {
    const key = `${junctionId}:${hour}`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    return null;
  }

  getDeviation(junctionId, hour, currentSpeed, currentScore) {
    const baseline = this.getBaseline(junctionId, hour);
    if (!baseline || !baseline.avgSpeedKmph) {
      return { hasBaseline: false, label: 'No baseline' };
    }

    const speedDiff = currentSpeed - baseline.avgSpeedKmph;
    const speedDeviationPct = Math.round((speedDiff / baseline.avgSpeedKmph) * 100);
    const scoreDiff = currentScore - baseline.avgCongestionScore;

    let label = 'Normal for this hour';
    if (speedDeviationPct <= -25) {
      label = `${Math.abs(speedDeviationPct)}% slower than usual for ${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
    } else if (speedDeviationPct >= 25) {
      label = `${speedDeviationPct}% faster than usual for ${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
    }

    const isSignificantlyWorse = speedDeviationPct <= -35 || scoreDiff >= 25;

    return {
      hasBaseline: true,
      hour,
      baselineSpeed: baseline.avgSpeedKmph,
      baselineCongestionScore: baseline.avgCongestionScore,
      currentSpeed,
      currentScore,
      speedDeviationPct,
      scoreDiff,
      label,
      isSignificantlyWorse,
    };
  }

  getAllCityDeviations(simulatedHour = new Date().getHours(), junctionStates = new Map()) {
    const deviations = [];

    for (const junc of INITIAL_DEVICES) {
      const state = junctionStates.get(junc.junctionId);
      const currentScore = state?.congestionScore || 40;
      const currentSpeed = junc.baseApproaches[0]?.baseSpeed || 15;
      const dev = this.getDeviation(junc.junctionId, simulatedHour, currentSpeed, currentScore);

      deviations.push({
        junctionId: junc.junctionId,
        name: junc.name,
        zoneId: junc.zoneId,
        hour: simulatedHour,
        currentScore,
        ...dev,
      });
    }

    return deviations;
  }
}

export const baselineService = new BaselineService();
