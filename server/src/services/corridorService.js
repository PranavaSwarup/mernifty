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
import { simulatorService } from './simulatorService.js';

class CorridorService {
  constructor() {
    this.activeTrips = new Map(); // vehicleId -> tripState
    this.preemptedJunctions = new Map(); // junctionId -> { tripId, preemptedAt, incomingRoad }
  }

  isJunctionInCorridor(junctionId) {
    return this.preemptedJunctions.has(junctionId);
  }

  getPreemptionInfo(junctionId) {
    return this.preemptedJunctions.get(junctionId) || null;
  }

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

      // Check live simulator state for incidents or high queue
      try {
        const liveWorld = simulatorService?.pair?.live;
        if (liveWorld) {
          for (const [flatIdx] of liveWorld.incidents) {
            const jIdx = liveWorld.approachJunctionIdx[flatIdx];
            const jId = liveWorld.junctions[jIdx]?.junctionId;
            if (jId && !jammedJunctionIds.includes(jId)) {
              jammedJunctionIds.push(jId);
            }
          }
        }
      } catch (_) {}

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
          for (const d of jammed) {
            const jId = d.junctionId || d.deviceId;
            if (jId && !jammedJunctionIds.includes(jId)) jammedJunctionIds.push(jId);
          }
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

    // Notify simulator service of emergency mode for path
    try {
      simulatorService?.enableEmergencyModeForPath?.(route);
    } catch (_) {}

    // Immediately preempt the start junction and lookahead first segment
    await this.preemptJunction(startJunctionId, tripId, null);
    if (route.length > 1) {
      await this.preemptJunction(route[1], tripId, startJunctionId);
    }

    // Start 2 Hz movement loop (every 500ms)
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

        const fromJunctionId = route[currentSegmentIdx];
        const toJunctionId = route[currentSegmentIdx + 1];

        const fromCoords = JUNCTION_COORDINATES[fromJunctionId] || { latitude: 12.9716, longitude: 77.5946 };
        const toCoords = JUNCTION_COORDINATES[toJunctionId] || { latitude: 12.9716, longitude: 77.5946 };

        // Linear interpolation between the two junctions
        const currentLat = fromCoords.latitude + (toCoords.latitude - fromCoords.latitude) * segmentFraction;
        const currentLon = fromCoords.longitude + (toCoords.longitude - fromCoords.longitude) * segmentFraction;

        // Realistic emergency speed: ~48 km/h with micro-fluctuations
        const speedKmph = Math.round(45 + Math.sin(tickCount * 0.3) * 6);

        // Calculate distance and ETA to next upcoming junction
        const remainingKmToNext = haversineDistanceKm(currentLat, currentLon, toCoords.latitude, toCoords.longitude);
        const etaToNextSec = Math.max(1, Math.round((remainingKmToNext / Math.max(20, speedKmph)) * 3600));

        // When nearing a junction (within 35% of segment), ensure next junction is pre-cleared
        if (segmentFraction >= 0.65 && currentSegmentIdx + 2 < route.length) {
          const lookaheadJunctionId = route[currentSegmentIdx + 2];
          await this.preemptJunction(lookaheadJunctionId, trip.tripId, toJunctionId);
        }

        // Clear passed junctions
        for (let i = 0; i <= currentSegmentIdx; i++) {
          const passedId = route[i];
          if (!trip.passedJunctions.has(passedId) && i < currentSegmentIdx) {
            trip.passedJunctions.add(passedId);
            await this.clearJunction(passedId, trip.tripId);
          }
        }

        const posPayload = {
          tripId: trip.tripId,
          vehicleId: trip.vehicleId,
          latitude: parseFloat(currentLat.toFixed(5)),
          longitude: parseFloat(currentLon.toFixed(5)),
          speedKmph,
          progressPct: trip.progressPct,
          lastJunctionId: fromJunctionId,
          nextJunctionId: toJunctionId,
          etaToNextSec,
          route,
          sequence: trip.sequence,
          timestamp: new Date().toISOString(),
        };

        if (trip.positions.length < 500) {
          trip.positions.push(posPayload);
        }

        // Broadcast 2 Hz GPS position with one chained emit, so a socket that is in several
        // of these rooms (map viewers, the next junction, its zone) receives each position once.
        const toZone = JUNCTION_COORDINATES[toJunctionId]?.zoneId;
        let positionTarget = socketService.io?.to('corridor').to(`junction:${toJunctionId}`);
        if (positionTarget && toZone) positionTarget = positionTarget.to(`zone:${toZone}`);
        positionTarget?.emit('corridor:position', posPayload);

        // Check completion
        if (tickCount >= totalTicks) {
          clearInterval(trip.timer);
          await this.endTrip(vehicleId, 'completed');
        }
      } catch (err) {
        console.error('[CorridorService] Error in corridor movement loop:', err.message);
      }
    }, tickIntervalMs);

    return {
      success: true,
      tripId,
      vehicleId,
      route,
      startJunctionId,
      destinationJunctionId,
      durationSeconds: trip.durationSeconds,
      isDynamicRerouted,
      rerouteReason,
      message: isDynamicRerouted
        ? `Emergency corridor activated via dynamic bypass: ${rerouteReason}`
        : `Emergency green corridor activated along ${route.join(' -> ')}`,
    };
  }

  // Preempt signals for incoming approach road
  async preemptJunction(junctionId, tripId, approachFromJunctionId) {
    if (this.preemptedJunctions.has(junctionId)) return;

    const juncInfo = JUNCTION_COORDINATES[junctionId];
    const incomingRoad = getIncomingApproachRoad(approachFromJunctionId, junctionId);
    const zoneId = juncInfo?.zoneId || 'south-bangalore';

    const info = {
      tripId,
      preemptedAt: new Date(),
      incomingRoad,
    };
    this.preemptedJunctions.set(junctionId, info);

    // Record preemptedAt in trip junctionEvents
    for (const trip of this.activeTrips.values()) {
      if (trip.tripId === tripId) {
        trip.junctionEvents.set(junctionId, {
          junctionId,
          incomingRoad,
          preemptedAt: info.preemptedAt,
          clearedAt: null,
        });
      }
    }

    if (mongoose.connection?.readyState === 1) {
      try {
        await Device.updateOne(
          { deviceId: junctionId },
          { $set: { adaptiveSignalMode: 'emergency-corridor' } }
        );
      } catch (_) {}
    }

    // Broadcast preemption event
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

