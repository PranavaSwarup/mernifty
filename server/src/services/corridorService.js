import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  JUNCTION_COORDINATES,
  getShortestRoute,
  getCongestionAwareRoute,
  getIncomingApproachRoad,
  haversineDistanceKm,
} from '../data/junctionGraph.js';
import { socketService } from './socketService.js';
import { Device } from '../models/Device.js';
import { CorridorTrip } from '../models/CorridorTrip.js';

class CorridorService {
  constructor() {
    this.activeTrips = new Map(); // vehicleId -> tripState
    this.preemptedJunctions = new Map(); // junctionId -> { tripId, preemptedAt, incomingRoad }
  }

  // Check if a junction is currently under emergency corridor preemption
  isJunctionInCorridor(junctionId) {
    return this.preemptedJunctions.has(junctionId);
  }

  getPreemptionInfo(junctionId) {
    return this.preemptedJunctions.get(junctionId) || null;
  }

  // Start a new ambulance green corridor trip
  async startTrip({
    vehicleId = 'AMB-BLR-01',
    startJunctionId = 'JNC-BLR-008',
    destinationJunctionId = 'JNC-BLR-004',
    durationSeconds = 75,
    avoidJams = true,
  }) {
    if (this.activeTrips.has(vehicleId)) {
      throw new Error(`Vehicle ${vehicleId} already has an active corridor trip in progress.`);
    }

    // Default distance-based shortest path
    const defaultRoute = getShortestRoute(startJunctionId, destinationJunctionId);
    if (!defaultRoute || defaultRoute.length < 2) {
      throw new Error(`No viable route found between ${startJunctionId} and ${destinationJunctionId}.`);
    }

    let route = defaultRoute;
    let isDynamicRerouted = false;
    let rerouteReason = null;

    // Check for jammed junctions if avoidJams is requested
    if (avoidJams) {
      let jammedJunctionIds = [];
      if (mongoose.connection?.readyState === 1) {
        try {
          const jammed = await Device.find(
            {
              $or: [
                { status: 'gridlock' },
                { 'lastMetrics.status': 'gridlock' },
                { 'lastMetrics.maxQueueLengthM': { $gt: 140 } },
              ],
            },
            'deviceId junctionId'
          ).lean();
          jammedJunctionIds = jammed.map((d) => d.junctionId || d.deviceId);
        } catch (_) {}
      }

      if (jammedJunctionIds.length > 0) {
        const altRoute = getCongestionAwareRoute(startJunctionId, destinationJunctionId, {
          avoidJams: true,
          jammedJunctionIds,
        });
        if (altRoute && altRoute.length >= 2 && altRoute.join(',') !== defaultRoute.join(',')) {
          route = altRoute;
          isDynamicRerouted = true;
          rerouteReason = `Dynamically rerouted via ${altRoute.join(' -> ')} to bypass gridlocked nodes: ${jammedJunctionIds.join(', ')}`;
          console.log(`[CorridorService] ${rerouteReason}`);
        }
      }
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
      junctionEvents: new Map(), // junctionId -> { junctionId, incomingRoad, preemptedAt, clearedAt }
      positions: [],
      timer: null,
      status: 'active',
      isDynamicRerouted,
      rerouteReason,
    };

    this.activeTrips.set(vehicleId, trip);

    // Announce corridor start to all interested rooms
    socketService.io?.to('corridor').emit('corridor:started', {
      tripId,
      vehicleId,
      route,
      startJunctionId,
      destinationJunctionId,
      durationSeconds: trip.durationSeconds,
      isDynamicRerouted,
      rerouteReason,
      timestamp: startTime.toISOString(),
    });

    // Immediately preempt the start junction and lookahead first segment
    await this.preemptJunction(startJunctionId, tripId, null);
    if (route.length > 1) {
      await this.preemptJunction(route[1], tripId, startJunctionId);
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
            isDynamicRerouted,
          },
        };

        // Broadcast position event to corridor room
        socketService.io?.to('corridor').emit('corridor:position', positionEvent);

        // Store position history for incident replay
        trip.positions.push({
          sequence: trip.sequence,
          timestamp: positionEvent.timestamp,
          latitude: positionEvent.data.latitude,
          longitude: positionEvent.data.longitude,
          speedKmph: positionEvent.data.speedKmph,
          progressPct: positionEvent.data.progressPct,
          lastJunctionId: fromId,
          nextJunctionId: toId,
        });

        // Check if passed a junction
        if (segmentFraction > 0.85 && !trip.passedJunctions.has(fromId)) {
          trip.passedJunctions.add(fromId);
          setTimeout(() => {
            this.clearJunction(fromId, tripId);
          }, 3000); // 3-second clearance buffer
        }

        // Lookahead: Preempt next junction and junction after that if within lookahead
        if (!this.isJunctionInCorridor(toId)) {
          await this.preemptJunction(toId, tripId, fromId);
        }
        const lookaheadNextIdx = currentSegmentIdx + 2;
        if (segmentFraction > 0.5 && lookaheadNextIdx < route.length) {
          const nextNextId = route[lookaheadNextIdx];
          if (!this.isJunctionInCorridor(nextNextId)) {
            await this.preemptJunction(nextNextId, tripId, toId);
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
      isDynamicRerouted,
      rerouteReason,
    };
  }

  // Preempt a junction for emergency vehicle
  async preemptJunction(junctionId, tripId, fromJunctionId = null) {
    if (this.preemptedJunctions.has(junctionId)) return;

    const incomingRoad = getIncomingApproachRoad(fromJunctionId, junctionId);
    const info = {
      tripId,
      preemptedAt: new Date(),
      incomingRoad,
    };
    this.preemptedJunctions.set(junctionId, info);

    // Track in trip junctionEvents
    const trip = Array.from(this.activeTrips.values()).find((t) => t.tripId === tripId);
    if (trip) {
      if (!trip.junctionEvents) trip.junctionEvents = new Map();
      trip.junctionEvents.set(junctionId, {
        junctionId,
        incomingRoad,
        preemptedAt: info.preemptedAt,
        clearedAt: null,
      });
    }

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

    // Emit junction preempted event with incoming road and green wave status
    socketService.io?.to('corridor').to(`zone:${zoneId}`).to(`junction:${junctionId}`).emit('corridor:junction_preempted', {
      junctionId,
      tripId,
      incomingRoad,
      timestamp: info.preemptedAt.toISOString(),
      adaptiveSignalMode: 'emergency-corridor',
    });

    // Emit officer tactical alert to that junction and zone
    socketService.io?.to(`junction:${junctionId}`).to(`zone:${zoneId}`).emit('corridor:officer_alert', {
      junctionId,
      tripId,
      junctionName: juncInfo?.name || junctionId,
      incomingRoad,
      etaToNextSec: 12,
      message: `Emergency Corridor active at ${juncInfo?.name || junctionId}. Signals locked GREEN on ${incomingRoad} to flush queue. Hold cross-traffic.`,
      timestamp: new Date().toISOString(),
    });

    // Emit public traffic advisory notice to citizens watching this junction
    socketService.io?.to(`junction:${junctionId}`).to(`zone:${zoneId}`).emit('corridor:giveway', {
      junctionId,
      tripId,
      etaToNextSec: 12,
      junctionName: juncInfo?.name || junctionId,
      incomingRoad,
      message: `Emergency vehicle approaching ${juncInfo?.name || junctionId}. Ahead signals automatically set to GREEN on ${incomingRoad} to flush queue.`,
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

    // Record clearedAt in trip junctionEvents
    for (const trip of this.activeTrips.values()) {
      if (trip.tripId === tripId && trip.junctionEvents?.has(junctionId)) {
        trip.junctionEvents.get(junctionId).clearedAt = clearedAt;
      }
    }

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

    // Clear any remaining junctions on route before deleting trip
    for (const juncId of trip.route) {
      await this.clearJunction(juncId, trip.tripId);
    }
    this.activeTrips.delete(vehicleId);

    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - trip.startTime.getTime()) / 1000);
    const junctionEvents = Array.from(trip.junctionEvents?.values() || []);

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
      junctionEvents,
      positions: trip.positions || [],
      isDynamicRerouted: Boolean(trip.isDynamicRerouted),
      rerouteReason: trip.rerouteReason || null,
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
