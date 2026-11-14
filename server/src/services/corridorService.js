import crypto from 'crypto';
import mongoose from 'mongoose';
import { JUNCTION_COORDINATES, getShortestRoute, haversineDistanceKm } from '../data/junctionGraph.js';
import { socketService } from './socketService.js';
import { Device } from '../models/Device.js';
import { CorridorTrip } from '../models/CorridorTrip.js';

class CorridorService {
  constructor() {
    this.activeTrips = new Map(); // vehicleId -> tripState
    this.preemptedJunctions = new Map(); // junctionId -> { tripId, preemptedAt, road }
  }

  // Check if a junction is currently under emergency corridor preemption
  isJunctionInCorridor(junctionId) {
    return this.preemptedJunctions.has(junctionId);
  }

  getPreemptionInfo(junctionId) {
    return this.preemptedJunctions.get(junctionId) || null;
  }

  // Start a new ambulance green corridor trip
  async startTrip({ vehicleId = 'AMB-BLR-01', startJunctionId = 'JNC-BLR-008', destinationJunctionId = 'JNC-BLR-004', durationSeconds = 75 }) {
    if (this.activeTrips.has(vehicleId)) {
      throw new Error(`Vehicle ${vehicleId} already has an active corridor trip in progress.`);
    }

    const route = getShortestRoute(startJunctionId, destinationJunctionId);
    if (!route || route.length < 2) {
      throw new Error(`No viable route found between ${startJunctionId} and ${destinationJunctionId}.`);
    }

    const tripId = `TRIP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const startTime = new Date();

    const trip = {
      tripId,
      vehicleId,
      route,
      startJunctionId,
      destinationJunctionId,
      startTime,
      durationSeconds: Math.max(30, durationSeconds),
      sequence: 0,
      currentIndex: 0,
      progressPct: 0,
      passedJunctions: new Set(),
      preemptedHistory: [], // { junctionId, preemptedAt, clearedAt }
      timer: null,
      status: 'active',
    };

    this.activeTrips.set(vehicleId, trip);

    // Announce corridor start
    socketService.io?.to('corridor').emit('corridor:started', {
      tripId,
      vehicleId,
      route,
      startJunctionId,
      destinationJunctionId,
      durationSeconds: trip.durationSeconds,
      timestamp: startTime.toISOString(),
    });

    // Immediately preempt the start junction and lookahead
    await this.preemptJunction(startJunctionId, tripId);
    if (route.length > 1) {
      await this.preemptJunction(route[1], tripId);
    }

    // Start movement loop (every 500ms = 2 ticks per second)
    const tickIntervalMs = 500;
    const totalTicks = (trip.durationSeconds * 1000) / tickIntervalMs;
    let tickCount = 0;

    trip.timer = setInterval(async () => {
      try {
        tickCount++;
        trip.sequence++;

        const overallProgress = Math.min(1.0, tickCount / totalTicks);
        trip.progressPct = Math.round(overallProgress * 100);

        // Determine which segment [fromIdx, toIdx] the ambulance is on
        const numSegments = route.length - 1;
        const segmentProgress = overallProgress * numSegments;
        const currentSegmentIdx = Math.min(numSegments - 1, Math.floor(segmentProgress));
        const segmentFraction = segmentProgress - currentSegmentIdx;

        const fromId = route[currentSegmentIdx];
        const toId = route[currentSegmentIdx + 1];

        const fromCoords = JUNCTION_COORDINATES[fromId];
        const toCoords = JUNCTION_COORDINATES[toId];

        // Linear interpolation of coordinates along current segment
        const lat = fromCoords.latitude + (toCoords.latitude - fromCoords.latitude) * segmentFraction;
        const lon = fromCoords.longitude + (toCoords.longitude - fromCoords.longitude) * segmentFraction;

        const segmentTotalDistKm = haversineDistanceKm(fromCoords.latitude, fromCoords.longitude, toCoords.latitude, toCoords.longitude);
        const segmentRemainingDistKm = segmentTotalDistKm * (1 - segmentFraction);
        const avgSpeedKmph = 48; // ambulance speed in corridor
        const etaToNextSec = Math.max(1, Math.round((segmentRemainingDistKm / avgSpeedKmph) * 3600));

        // Create canonical ambulance telemetry event
        const eventId = `${vehicleId}:${tripId}:${trip.sequence}`;
        const positionEvent = {
          eventId,
          type: 'ambulance',
          vehicleId,
          tripId,
          sequence: trip.sequence,
          timestamp: new Date().toISOString(),
          data: {
            latitude: parseFloat(lat.toFixed(6)),
            longitude: parseFloat(lon.toFixed(6)),
            speedKmph: avgSpeedKmph,
            lastJunctionId: fromId,
            nextJunctionId: toId,
            etaToNextSec,
            routeJunctionIds: route,
            progressPct: trip.progressPct,
          },
        };

        // Broadcast position event to corridor room
        socketService.io?.to('corridor').emit('corridor:position', positionEvent);

        // Check if passed a junction
        if (segmentFraction > 0.85 && !trip.passedJunctions.has(fromId)) {
          trip.passedJunctions.add(fromId);
          setTimeout(() => {
            this.clearJunction(fromId, tripId);
          }, 3000); // 3-second clearance buffer
        }

        // Lookahead: Preempt next junction and junction after that if within lookahead
        if (!this.isJunctionInCorridor(toId)) {
          await this.preemptJunction(toId, tripId);
        }
        const lookaheadNextIdx = currentSegmentIdx + 2;
        if (segmentFraction > 0.5 && lookaheadNextIdx < route.length) {
          const nextNextId = route[lookaheadNextIdx];
          if (!this.isJunctionInCorridor(nextNextId)) {
            await this.preemptJunction(nextNextId, tripId);
          }
        }

        // Check completion
        if (overallProgress >= 1.0) {
          clearInterval(trip.timer);
          await this.endTrip(vehicleId, 'completed');
        }
      } catch (err) {
        console.error(`[CorridorService] Error in trip tick for ${tripId}:`, err);
      }
    }, tickIntervalMs);

    if (trip.timer.unref) trip.timer.unref();

    return {
      success: true,
      tripId,
      vehicleId,
      route,
      startJunctionId,
      destinationJunctionId,
      estimatedDurationSec: trip.durationSeconds,
    };
  }

  // Preempt a junction for emergency vehicle
  async preemptJunction(junctionId, tripId) {
    if (this.preemptedJunctions.has(junctionId)) return;

    const info = {
      tripId,
      preemptedAt: new Date(),
    };
    this.preemptedJunctions.set(junctionId, info);

    const juncInfo = JUNCTION_COORDINATES[junctionId];
    const zoneId = juncInfo?.zoneId || 'south-bangalore';

    // Update Device in database if connected
    if (mongoose.connection?.readyState === 1) {
      try {
        await Device.updateOne(
          { deviceId: junctionId },
          { $set: { adaptiveSignalMode: 'emergency-corridor', status: 'online' } }
        );
      } catch (_) {}
    }

    // Emit junction preempted event
    socketService.io?.to('corridor').to(`zone:${zoneId}`).to(`junction:${junctionId}`).emit('corridor:junction_preempted', {
      junctionId,
      tripId,
      timestamp: info.preemptedAt.toISOString(),
      adaptiveSignalMode: 'emergency-corridor',
    });

    // Emit give-way alert to drivers viewing this junction
    socketService.io?.to(`junction:${junctionId}`).to(`zone:${zoneId}`).emit('corridor:giveway', {
      junctionId,
      tripId,
      etaToNextSec: 15,
      message: `Emergency Ambulance approaching ${juncInfo?.name || junctionId}. Give way immediately. Green Corridor active.`,
      timestamp: new Date().toISOString(),
    });
  }

  // Clear preemption and return junction to dynamic AI
  async clearJunction(junctionId, tripId) {
    if (!this.preemptedJunctions.has(junctionId)) return;

    this.preemptedJunctions.delete(junctionId);
    const clearedAt = new Date();
    const juncInfo = JUNCTION_COORDINATES[junctionId];
    const zoneId = juncInfo?.zoneId || 'south-bangalore';

    if (mongoose.connection?.readyState === 1) {
      try {
        await Device.updateOne(
          { deviceId: junctionId },
          { $set: { adaptiveSignalMode: 'dynamic-ai' } }
        );
      } catch (_) {}
    }

    socketService.io?.to('corridor').to(`zone:${zoneId}`).to(`junction:${junctionId}`).emit('corridor:junction_cleared', {
      junctionId,
      tripId,
      timestamp: clearedAt.toISOString(),
      adaptiveSignalMode: 'dynamic-ai',
    });
  }

  // End an active trip and save summary to MongoDB
  async endTrip(vehicleId, status = 'completed') {
    const trip = this.activeTrips.get(vehicleId);
    if (!trip) return;

    if (trip.timer) clearInterval(trip.timer);
    this.activeTrips.delete(vehicleId);

    // Clear any remaining junctions on route
    for (const juncId of trip.route) {
      await this.clearJunction(juncId, trip.tripId);
    }

    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - trip.startTime.getTime()) / 1000);

    const summary = {
      tripId: trip.tripId,
      vehicleId,
      startJunctionId: trip.startJunctionId,
      destinationJunctionId: trip.destinationJunctionId,
      routeJunctionIds: trip.route,
      status,
      startTime: trip.startTime,
      endTime,
      durationSeconds,
    };

    // Save summary to MongoDB CorridorTrip collection if connected
    if (mongoose.connection?.readyState === 1) {
      try {
        await CorridorTrip.create(summary);
      } catch (err) {
        console.warn('[CorridorService] Warning saving trip summary:', err.message);
      }
    }

    socketService.io?.to('corridor').emit('corridor:ended', summary);

    return summary;
  }

  // Cancel an active corridor trip
  async cancelTrip(tripId) {
    for (const [vehicleId, trip] of this.activeTrips.entries()) {
      if (trip.tripId === tripId || !tripId) {
        return await this.endTrip(vehicleId, 'cancelled');
      }
    }
    throw new Error(`No active trip found matching ${tripId}`);
  }

  // Safety: reset all junctions if server restarts or simulator stops
  async resetAllCorridors() {
    for (const [vehicleId, trip] of this.activeTrips.entries()) {
      if (trip.timer) clearInterval(trip.timer);
      for (const jId of trip.route) {
        await this.clearJunction(jId, trip.tripId);
      }
    }
    this.activeTrips.clear();
    this.preemptedJunctions.clear();

    if (mongoose.connection?.readyState === 1) {
      try {
        await Device.updateMany(
          { adaptiveSignalMode: 'emergency-corridor' },
          { $set: { adaptiveSignalMode: 'dynamic-ai' } }
        );
      } catch (_) {}
    }
  }
}

export const corridorService = new CorridorService();
