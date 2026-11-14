import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { playAlertSound } from '../utils/sound';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = soundEnabled;

  const [stats, setStats] = useState({
    ingestRate: 0,
    broadcastRate: 0,
    persistRate: 0,
    totalIngested: 0,
    totalBroadcasted: 0,
    totalPersisted: 0,
    avgLatencyMs: 0,
    connectedSockets: 1,
    bufferSize: 0,
    uptimeSeconds: 0,
  });

  const [alerts, setAlerts] = useState([]);
  const [latestByDevice, setLatestByDevice] = useState({});
  const [recentEvents, setRecentEvents] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [clientLatency, setClientLatency] = useState(0);

  // Section 5.3: Active Rooms and Client-side Events/sec Monitoring
  const [activeRooms, setActiveRooms] = useState(new Set(['city', 'corridor']));
  const activeRoomsRef = useRef(new Set(['city', 'corridor']));
  activeRoomsRef.current = activeRooms;

  const [eventsPerSec, setEventsPerSec] = useState(0);
  const eventCounterRef = useRef(0);

  // Section 5.2: Live Ambulance Green Corridor State
  const [activeCorridorTrip, setActiveCorridorTrip] = useState(null);
  const [corridorGiveway, setCorridorGiveway] = useState(null);
  const [corridorOfficerAlert, setCorridorOfficerAlert] = useState(null);
  const [preemptedJunctions, setPreemptedJunctions] = useState(new Set());

  // Section 5.13: Simulation Clock State
  const [simClock, setSimClock] = useState({ clockSpeed: 1, simulatedTime: null });

  const socketRef = useRef(null);
  const pendingBufferRef = useRef([]);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  useEffect(() => {
    // Read JWT token if user logged in
    const token = localStorage.getItem('hp_token');

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected to MetroPulse BLR server, ID:', socket.id);

      // Subscribe to initial active rooms on connection / reconnect
      for (const room of activeRoomsRef.current) {
        if (room === 'city') socket.emit('subscribe:city');
        else if (room === 'corridor') socket.emit('subscribe:corridor');
        else if (room === 'system') socket.emit('subscribe:system');
        else if (room.startsWith('zone:')) socket.emit('subscribe:zone', room.replace('zone:', ''));
        else if (room.startsWith('junction:')) socket.emit('subscribe:junction', room.replace('junction:', ''));
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected from MetroPulse BLR server');
    });

    // 1. Slim City-wide Summary (1s) - Map View
    socket.on('telemetry:city_summary', (summaries) => {
      eventCounterRef.current += summaries.length;
      setLatestByDevice((prev) => {
        const next = { ...prev };
        for (const item of summaries) {
          next[item.junctionId] = {
            ...item,
            deviceId: item.junctionId,
            metrics: {
              congestionScore: item.congestionScore,
              avgSpeedKmph: item.avgSpeedKmph,
              maxQueueLengthM: item.longestQueueM,
              adaptiveSignalMode: item.signalMode,
            },
          };
        }
        return next;
      });
    });

    // 2. Full Zonal Telemetry Batch
    socket.on('telemetry:batch', (batch) => {
      if (isPausedRef.current) return;
      eventCounterRef.current += batch.length;
      pendingBufferRef.current.push(...batch);
    });

    // 3. Junction Specific Feed
    socket.on('telemetry:device_feed', (events) => {
      if (isPausedRef.current) return;
      eventCounterRef.current += events.length;
      pendingBufferRef.current.push(...events);
    });

    // 4. Live Alerts
    socket.on('alert:new', (newAlert) => {
      eventCounterRef.current += 1;
      setAlerts((prev) => {
        if (prev.some((a) => a.alertId === newAlert.alertId)) return prev;
        return [newAlert, ...prev.slice(0, 49)];
      });
      if (soundEnabledRef.current) {
        playAlertSound(newAlert.severity);
      }
    });

    // 5. Ambulance Green Corridor Events (Section 5.2)
    socket.on('corridor:started', (data) => {
      setActiveCorridorTrip(data);
      setPreemptedJunctions(new Set([data.startJunctionId, data.route?.[1]].filter(Boolean)));
    });

    socket.on('corridor:position', (posEvent) => {
      setActiveCorridorTrip((prev) => ({
        ...prev,
        ...posEvent.data,
        vehicleId: posEvent.vehicleId,
        tripId: posEvent.tripId,
      }));
    });

    socket.on('corridor:junction_preempted', ({ junctionId }) => {
      setPreemptedJunctions((prev) => new Set([...prev, junctionId]));
    });

    socket.on('corridor:junction_cleared', ({ junctionId }) => {
      setPreemptedJunctions((prev) => {
        const next = new Set(prev);
        next.delete(junctionId);
        return next;
      });
    });

    socket.on('corridor:giveway', (notice) => {
      setCorridorGiveway(notice);
      setTimeout(() => setCorridorGiveway(null), 8000);
    });

    socket.on('corridor:officer_alert', (notice) => {
      setCorridorOfficerAlert(notice);
      setTimeout(() => setCorridorOfficerAlert(null), 10000);
    });

    socket.on('corridor:ended', () => {
      setActiveCorridorTrip(null);
      setPreemptedJunctions(new Set());
      setCorridorGiveway(null);
      setCorridorOfficerAlert(null);
    });

    // 6. Simulation Clock Updates (Section 5.13)
    socket.on('sim:clock_update', (data) => {
      setSimClock(data);
    });

    // System metrics snapshot
    socket.on('metrics:snapshot', (snapshot) => {
      setStats(snapshot);
    });

    // Ping-pong latency
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('telemetry:ping', Date.now());
      }
    }, 3000);

    socket.on('telemetry:pong', ({ clientTimestamp }) => {
      const rtt = Date.now() - clientTimestamp;
      setClientLatency(rtt);
    });

    // Rate counter (calculated every 1 second)
    const rateInterval = setInterval(() => {
      setEventsPerSec(eventCounterRef.current);
      eventCounterRef.current = 0;
    }, 1000);

    // Client-side Throttled Window Flush (100ms ~ 10 FPS)
    const flushInterval = setInterval(() => {
      if (pendingBufferRef.current.length === 0) return;

      const batchToProcess = pendingBufferRef.current.splice(0, pendingBufferRef.current.length);

      setLatestByDevice((prev) => {
        const next = { ...prev };
        for (const item of batchToProcess) {
          const jId = item.junctionId || item.deviceId;
          next[jId] = item;
        }
        return next;
      });

      setRecentEvents((prev) => {
        const merged = [...batchToProcess.reverse(), ...prev];
        return merged.slice(0, 100);
      });
    }, 100);

    return () => {
      clearInterval(pingInterval);
      clearInterval(rateInterval);
      clearInterval(flushInterval);
      socket.disconnect();
    };
  }, []);

  // Room management helpers
  const joinRoom = useCallback((room) => {
    setActiveRooms((prev) => {
      const next = new Set(prev);
      next.add(room);
      return next;
    });

    if (socketRef.current?.connected) {
      if (room === 'city') socketRef.current.emit('subscribe:city');
      else if (room === 'corridor') socketRef.current.emit('subscribe:corridor');
      else if (room === 'system') socketRef.current.emit('subscribe:system');
      else if (room.startsWith('zone:')) socketRef.current.emit('subscribe:zone', room.replace('zone:', ''));
      else if (room.startsWith('junction:')) socketRef.current.emit('subscribe:junction', room.replace('junction:', ''));
    }
  }, []);

  const leaveRoom = useCallback((room) => {
    setActiveRooms((prev) => {
      const next = new Set(prev);
      next.delete(room);
      return next;
    });

    if (socketRef.current?.connected) {
      if (room === 'city') socketRef.current.emit('unsubscribe:city');
      else if (room === 'corridor') socketRef.current.emit('unsubscribe:corridor');
      else if (room === 'system') socketRef.current.emit('unsubscribe:system');
      else if (room.startsWith('zone:')) socketRef.current.emit('unsubscribe:zone', room.replace('zone:', ''));
      else if (room.startsWith('junction:')) socketRef.current.emit('unsubscribe:junction', room.replace('junction:', ''));
    }
  }, []);

  const subscribeZone = useCallback((zoneId) => {
    // Leave other zones
    for (const r of activeRoomsRef.current) {
      if (r.startsWith('zone:') && r !== `zone:${zoneId}`) {
        leaveRoom(r);
      }
    }
    if (zoneId) {
      joinRoom(`zone:${zoneId}`);
    }
  }, [joinRoom, leaveRoom]);

  const clearEvents = useCallback(() => {
    pendingBufferRef.current = [];
    setRecentEvents([]);
  }, []);

  const subscribeJunction = useCallback((junctionId) => {
    if (junctionId) joinRoom(`junction:${junctionId}`);
  }, [joinRoom]);

  const unsubscribeJunction = useCallback((junctionId) => {
    if (junctionId) leaveRoom(`junction:${junctionId}`);
  }, [leaveRoom]);

  // Compatibility helpers
  const subscribeCategory = useCallback((cat) => subscribeZone(cat), [subscribeZone]);
  const subscribeDevice = useCallback((devId) => subscribeJunction(devId), [subscribeJunction]);
  const unsubscribeDevice = useCallback((devId) => unsubscribeJunction(devId), [unsubscribeJunction]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        stats,
        alerts,
        setAlerts,
        latestByDevice,
        recentEvents,
        clearEvents,
        isPaused,
        togglePause,
        soundEnabled,
        setSoundEnabled,
        clientLatency,
        activeRooms: Array.from(activeRooms),
        eventsPerSec,
        joinRoom,
        leaveRoom,
        subscribeZone,
        subscribeJunction,
        unsubscribeJunction,
        subscribeCategory,
        subscribeDevice,
        unsubscribeDevice,
        activeCorridorTrip,
        corridorGiveway,
        corridorOfficerAlert,
        preemptedJunctions,
        simClock,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return ctx;
}
