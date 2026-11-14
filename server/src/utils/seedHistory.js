import { Telemetry } from '../models/Telemetry.js';
import { INITIAL_DEVICES } from '../data/junctionDevices.js';

// Hourly volume profile for Bengaluru arterial roads
export function getHourVolumeMultiplier(hour) {
  if (hour >= 8 && hour <= 10) return 2.1; // Morning commute rush
  if (hour >= 17 && hour <= 20) return 2.3; // Evening tech corridor rush
  if (hour >= 11 && hour <= 16) return 1.1; // Midday business hours
  if (hour >= 21 && hour <= 23) return 0.7; // Late evening taper
  return 0.35; // Late night (12 AM - 6 AM)
}

export async function seed24HourHistory() {
  console.log('[SeedHistory] Checking 24-hour historical telemetry dataset in MongoDB...');

  const oneDayMs = 24 * 60 * 60 * 1000;
  const intervalMs = 2 * 60 * 1000; // 1 record per junction every 2 minutes (720 records per junction)
  const expectedCount = Math.floor(oneDayMs / intervalMs) * INITIAL_DEVICES.length; // 8,640 records

  const count = await Telemetry.countDocuments({ seeded: true });
  if (count >= expectedCount) {
    console.log(`[SeedHistory] Found ${count} existing seeded records (>= ${expectedCount}). Skipping re-seed.`);
    return count;
  }

  if (count > 0 && count < expectedCount) {
    console.log(`[SeedHistory] Found partial seeded history (${count}/${expectedCount} records). Resetting partial seed...`);
    try {
      // In MongoDB time-series collections, deletes are permitted when filtering on metaField (junctionId)
      for (const junc of INITIAL_DEVICES) {
        await Telemetry.deleteMany({ junctionId: junc.junctionId });
      }
    } catch (delErr) {
      console.warn('[SeedHistory] Note on time-series delete:', delErr.message);
    }
  }

  console.log(`[SeedHistory] Seeding 24 hours of believable Bengaluru junction telemetry (${expectedCount} records expected)...`);

  const now = Date.now();
  const startTime = now - oneDayMs;

  const records = [];

  for (let t = startTime; t < now; t += intervalMs) {
    const recordDate = new Date(t);
    const hour = recordDate.getHours();
    const multiplier = getHourVolumeMultiplier(hour);

    for (const junc of INITIAL_DEVICES) {
      let totalFlow = 0;
      let maxQueue = 0;
      let sumSpeed = 0;

      const approaches = junc.baseApproaches.map((app, idx) => {
        const isGreen = idx === 0;
        const jitter = 1 + (Math.sin(t / 100000 + idx) * 0.15);
        const vehiclesPerMin = Math.round(app.baseVehiclesPerMin * multiplier * jitter);

        let queueLengthM = Math.round(app.baseQueueM * (multiplier >= 1.5 ? multiplier * 1.2 : multiplier * 0.8) * jitter);
        let avgSpeedKmph = Math.max(3, Math.round(app.baseSpeed / (multiplier >= 1.5 ? 1.6 : 1.0) * jitter));

        totalFlow += vehiclesPerMin;
        if (queueLengthM > maxQueue) maxQueue = queueLengthM;
        sumSpeed += avgSpeedKmph;

        return {
          road: app.road,
          vehiclesPerMin,
          queueLengthM,
          avgSpeedKmph,
          signal: isGreen ? 'green' : 'red',
          greenTimeSec: app.greenSplitSec,
        };
      });

      const avgSpeed = parseFloat((sumSpeed / approaches.length).toFixed(1));
      const queueFactor = Math.min(100, (maxQueue / 220) * 60);
      const speedFactor = Math.max(0, (1 - avgSpeed / 30) * 40);
      const congestionScore = Math.min(100, Math.round(queueFactor + speedFactor));

      let status = 'healthy';
      if (congestionScore >= 80) status = 'gridlock';
      else if (congestionScore >= 60) status = 'congested';
      else if (congestionScore >= 45) status = 'warning';

      records.push({
        eventId: `SEED-24H-${junc.junctionId}-${t}`,
        junctionId: junc.junctionId,
        deviceId: junc.junctionId,
        deviceName: junc.name,
        zoneId: junc.zoneId,
        category: junc.zoneId,
        timestamp: recordDate,
        sequence: Math.floor(t / intervalMs),
        data: {
          approaches,
          vehicleMix: junc.vehicleMix,
          simulatedTime: recordDate.toISOString(),
          totalFlowVehiclesPerMin: totalFlow,
          maxQueueLengthM: maxQueue,
          avgSpeedKmph: avgSpeed,
          congestionScore,
          adaptiveSignalMode: 'dynamic-ai',
        },
        metrics: {
          totalFlowVehiclesPerMin: totalFlow,
          maxQueueLengthM: maxQueue,
          avgSpeedKmph: avgSpeed,
          congestionScore,
          adaptiveSignalMode: 'dynamic-ai',
        },
        status,
        seeded: true,
      });
    }
  }

  // Insert in batches of 1,000 records using insertOne (strictly time-series collection compatible)
  const batchSize = 1000;
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    await Telemetry.bulkWrite(
      chunk.map((doc) => ({
        insertOne: {
          document: doc,
        },
      })),
      { ordered: false }
    );
  }

  console.log(`[SeedHistory] Successfully seeded ${records.length} historical records across 24 hours.`);
  return records.length;
}
