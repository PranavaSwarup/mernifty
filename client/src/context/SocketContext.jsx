import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
} from 'react';
import { io } from 'socket.io-client';
import { playAlertSound } from '../utils/sound';
import { useAuth } from './AuthContext';
import {
  DEFAULT_WIRE_SCHEMA,
  decodeZoneBatch,
  decodeJunctionBatch,
} from '../shared/wire.js';

const ALL_ZONES = [
  'south-bangalore',
  'east-bangalore',
  'north-bangalore',
  'central-bangalore',
];

/**
 * External hot-state store backed by useSyncExternalStore.
 * Eliminates full-tree React re-renders on 24+ frames/sec by dispatching
 * per-junction updates at a 100ms render cadence.
 */
class TelemetryHotStore {
  constructor() {
    this.latestByJunction = {};
    this.recentFrames = [];
    this.stats = {
      ingestRate: 0,
      broadcastRate: 0,
      persistRate: 0,
      totalIngested: 0,
      totalBroadcasted: 0,
      totalPersisted: 0,
      totalDropped: 0,
      avgLatencyMs: 0,
      connectedSockets: 1,
      bufferSize: 0,
      uptimeSeconds: 0,
      socketBytesPerSec: 0,
      socketBytesByRoom: {},
      totalSocketBytes: 0,
      socketCoalescedCount: 0,
      socketDroppedCount: 0,
      wireComparison: null,
    };

    this.junctionListeners = new Map();
    this.allJunctionListeners = new Set();
    this.recentListeners = new Set();
    this.statsListeners = new Set();
  }

  subscribeJunction(junctionId, cb) {
    if (!this.junctionListeners.has(junctionId)) {
      this.junctionListeners.set(junctionId, new Set());
    }
    this.junctionListeners.get(junctionId).add(cb);
    return () => {
      const set = this.junctionListeners.get(junctionId);
      if (set) {
        set.delete(cb);
        if (set.size === 0) this.junctionListeners.delete(junctionId);
      }
    };
  }

  subscribeAllJunctions(cb) {
    this.allJunctionListeners.add(cb);
    return () => this.allJunctionListeners.delete(cb);
  }

  subscribeRecent(cb) {
    this.recentListeners.add(cb);
    return () => this.recentListeners.delete(cb);
  }

  subscribeStats(cb) {
    this.statsListeners.add(cb);
    return () => this.statsListeners.delete(cb);
  }

  getJunctionSnapshot(junctionId) {
    return this.latestByJunction[junctionId] || null;
  }

  getAllJunctionsSnapshot = () => this.latestByJunction;
  getRecentSnapshot = () => this.recentFrames;
  getStatsSnapshot = () => this.stats;

  applyBatch(decodedEvents) {
    if (!decodedEvents || decodedEvents.length === 0) return;

    const changedIds = new Set();
    const nextLatest = { ...this.latestByJunction };

    for (const item of decodedEvents) {
      const jId = item.junctionId || item.deviceId;
      if (!jId) continue;
      // Preserve nested approaches when a zone summary update arrives for the same junction
      const existing = nextLatest[jId];
      const mergedItem =
        existing?.data?.approaches?.length && !item.data?.approaches?.length
          ? {
              ...item,
              data: {
                ...item.data,
                approaches: existing.data.approaches,
                vehicleMix: item.data?.vehicleMix || existing.data.vehicleMix,
              },
            }
          : item;
      nextLatest[jId] = mergedItem;
      changedIds.add(jId);
    }

    this.latestByJunction = nextLatest;
    this.recentFrames = [...decodedEvents.slice().reverse(), ...this.recentFrames].slice(0, 100);

    for (const jId of changedIds) {
      const set = this.junctionListeners.get(jId);
      if (set) set.forEach((cb) => cb());
    }
    this.allJunctionListeners.forEach((cb) => cb());
    this.recentListeners.forEach((cb) => cb());
  }

  setStats(nextStats) {
    this.stats = nextStats;
    this.statsListeners.forEach((cb) => cb());
  }
}

const hotStore = new TelemetryHotStore();

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();

  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = soundEnabled;

  const [alerts, setAlerts] = useState([]);
  const [counterfactual, setCounterfactual] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [clientLatency, setClientLatency] = useState(0);
  const [clientE2eStats, setClientE2eStats] = useState({ p50: 0, p95: 0, p99: 0, count: 0, clockOffsetMs: 0 });
  const [obsUpdate, setObsUpdate] = useState(null);
  const [schema, setSchema] = useState(DEFAULT_WIRE_SCHEMA);
  const [lastReplayStats, setLastReplayStats] = useState(null);
  const [socketError, setSocketError] = useState(null);
  const [disconnectCountdownSec, setDisconnectCountdownSec] = useState(0);

  const schemaRef = useRef(DEFAULT_WIRE_SCHEMA);
  const socketRef = useRef(null);
  const pendingBufferRef = useRef([]);
  const pendingRenderEmitRef = useRef([]);
  const e2eSamplesRef = useRef([]);
  const clockOffsetSamplesRef = useRef([]);
  const clockOffsetMsRef = useRef(0);
  const cursorsRef = useRef({});
  const hasConnectedOnceRef = useRef(false);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  const viewSubsRef = useRef({
    city: true,
    zones: [...ALL_ZONES],
    junctions: [],
    alerts: ['all'],
    engineering: false,
  });
  const detailJunctionsRef = useRef(new Set());
  const disconnectTimerRef = useRef(null);

  const computeEffectiveSubscriptions = useCallback(() => {
    const base = viewSubsRef.current;
    const isOperator = user?.role === 'operator';
    const userZones = Array.isArray(user?.zones) ? user.zones : [];

    let zones = Array.isArray(base.zones) ? base.zones : [];
    if (isOperator && userZones.length > 0) {
      zones = zones.filter((z) => userZones.includes(z));
      if (zones.length === 0) zones = [...userZones];
    }

    const alertsSub =
      Array.isArray(base.alerts) && base.alerts.length > 0
        ? isOperator
          ? userZones
          : base.alerts
        : isOperator
          ? userZones
          : ['all'];

    const junctions = Array.from(
      new Set([...(base.junctions || []), ...Array.from(detailJunctionsRef.current)])
    );

    return {
      city: Boolean(base.city),
      engineering: Boolean(base.engineering),
      zones,
      junctions,
      alerts: alertsSub,
    };
  }, [user]);

  const sendActiveSubscription = useCallback(
    (forceResume = false) => {
      const sock = socketRef.current;
      if (!sock || !sock.connected) return;
      const subs = computeEffectiveSubscriptions();
      const hasCursors = Object.keys(cursorsRef.current).length > 0;

      if (forceResume || hasCursors) {
        sock.emit('resume', { subscriptions: subs, cursors: cursorsRef.current });
      } else {
        sock.emit('subscribe', subs);
      }
    },
    [computeEffectiveSubscriptions]
  );

  // Recreate socket whenever auth token changes so server re-authenticates JWT cleanly
  useEffect(() => {
    if (disconnectTimerRef.current) {
      clearInterval(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
      setDisconnectCountdownSec(0);
    }

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      auth: token ? { token } : {},
    });
    socketRef.current = socket;

    const acceptDecodedEvents = (events) => {
      if (isPausedRef.current || !Array.isArray(events) || events.length === 0) return;
      const fresh = [];
      for (const evt of events) {
        const jId = evt.junctionId || evt.deviceId;
        const seq = Number(evt.sequence) || 0;
        const prevSeq = cursorsRef.current[jId] || 0;
        if (seq > 0 && seq <= prevSeq) continue;
        if (seq > prevSeq) {
          cursorsRef.current[jId] = seq;
        }
        fresh.push(evt);
      }
      if (fresh.length > 0) {
        pendingBufferRef.current.push(...fresh);
      }
    };

    socket.on('connect', () => {
      setIsConnected(true);
      setSocketError(null);
      clockOffsetSamplesRef.current = [];
      socket.emit('telemetry:ping', Date.now());
      const isReconnect = hasConnectedOnceRef.current || Object.keys(cursorsRef.current).length > 0;
      hasConnectedOnceRef.current = true;
      sendActiveSubscription(isReconnect);
    });

    socket.on('connect_error', (err) => {
      setSocketError(err?.message || 'Socket connection failed');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('error', (errPayload) => {
      setSocketError(errPayload?.message || errPayload?.code || 'Socket authorization error');
    });

    socket.on('wire:schema', (srvSchema) => {
      if (srvSchema && Array.isArray(srvSchema.junctionIds)) {
        schemaRef.current = srvSchema;
        setSchema(srvSchema);
      }
    });

    socket.on('metrics:snapshot', (snapshot) => {
      hotStore.setStats(snapshot);
    });

    socket.on('obs:update', (payload) => {
      if (payload?.metrics) {
        hotStore.setStats(payload.metrics);
      }
      setObsUpdate(payload || null);
    });

    socket.on('cf:update', (cf) => {
      setCounterfactual(cf);
    });

    const recordFrameEmitTimestamp = (wirePkt) => {
      const serverEmitTs = Number(wirePkt?.et || wirePkt?.t0);
      if (!Number.isFinite(serverEmitTs) || serverEmitTs <= 0) return;
      pendingRenderEmitRef.current.push(serverEmitTs);
      if (pendingRenderEmitRef.current.length > 50) {
        pendingRenderEmitRef.current.shift();
      }
    };

    socket.on('telemetry:zone', (wirePkt) => {
      if (isPausedRef.current) return;
      recordFrameEmitTimestamp(wirePkt);
      const decoded = decodeZoneBatch(wirePkt, schemaRef.current);
      acceptDecodedEvents(decoded);
    });

    socket.on('telemetry:junction', (wirePkt) => {
      if (isPausedRef.current) return;
      recordFrameEmitTimestamp(wirePkt);
      const decoded = decodeJunctionBatch(wirePkt, schemaRef.current);
      acceptDecodedEvents(decoded);
    });

    socket.on('replay', (replayPkt) => {
      if (Array.isArray(replayPkt?.events)) {
        acceptDecodedEvents(replayPkt.events);
      }
      setLastReplayStats({
        replayed: replayPkt?.replayed || 0,
        fromMemory: replayPkt?.fromMemory || 0,
        fromDb: replayPkt?.fromDb || 0,
        clipped: Boolean(replayPkt?.clipped),
        gap: 0,
        receivedAt: new Date().toISOString(),
      });
    });

    socket.on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
      if (soundEnabledRef.current) {
        playAlertSound(newAlert.severity);
      }
    });

    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('telemetry:ping', Date.now());
      }
    }, 3000);

    // Send initial ping immediately on connect for fast NTP clock offset convergence
    socket.on('telemetry:pong', (pong = {}) => {
      const t3 = Date.now();
      const t0 = Number(pong.clientTimestamp);
      const t1 = Number(pong.serverRecvTimestamp ?? pong.serverTimestamp);
      const t2 = Number(pong.serverSendTimestamp ?? t1);
      if (!Number.isFinite(t0)) return;

      const rtt = Number.isFinite(t1) && Number.isFinite(t2) ? Math.max(0, t3 - t0 - (t2 - t1)) : Math.max(0, t3 - t0);
      setClientLatency(Math.round(rtt));

      if (Number.isFinite(t1) && Number.isFinite(t2)) {
        const offsetSample = (t1 - t0 + (t2 - t3)) / 2;
        clockOffsetSamplesRef.current.push(offsetSample);
        if (clockOffsetSamplesRef.current.length > 7) {
          clockOffsetSamplesRef.current.shift();
        }
        const sortedOffsets = [...clockOffsetSamplesRef.current].sort((a, b) => a - b);
        clockOffsetMsRef.current = sortedOffsets[Math.floor(sortedOffsets.length / 2)];
      }
    });

    const pct = (sorted, q) => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
      return Number(sorted[idx].toFixed(2));
    };

    const latencyReportInterval = setInterval(() => {
      const samples = e2eSamplesRef.current.splice(0, e2eSamplesRef.current.length);
      if (!socket.connected || samples.length === 0) return;
      const sorted = [...samples].sort((a, b) => a - b);
      const summary = {
        room: viewSubsRef.current.engineering ? 'engineering' : 'city',
        p50: pct(sorted, 0.5),
        p95: pct(sorted, 0.95),
        p99: pct(sorted, 0.99),
        count: sorted.length,
        samplesMs: sorted.slice(0, 50),
        clockOffsetMs: Number(clockOffsetMsRef.current.toFixed(2)),
      };
      setClientE2eStats({
        p50: summary.p50,
        p95: summary.p95,
        p99: summary.p99,
        count: summary.count,
        clockOffsetMs: summary.clockOffsetMs,
      });
      socket.emit('client:latency', summary);
    }, 5000);

    let rafId = null;
    // 100ms throttled render flush to external hot store
    const flushInterval = setInterval(() => {
      if (pendingBufferRef.current.length === 0) return;
      const batchToProcess = pendingBufferRef.current.splice(0, pendingBufferRef.current.length);
      const emitTimestamps = pendingRenderEmitRef.current.splice(0, pendingRenderEmitRef.current.length);
      hotStore.applyBatch(batchToProcess);

      if (emitTimestamps.length > 0 && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        rafId = window.requestAnimationFrame(() => {
          const renderedAt = Date.now();
          const offset = clockOffsetMsRef.current;
          for (const srvEmitTs of emitTimestamps) {
            const clientEmitTs = srvEmitTs - offset;
            const e2eMs = Math.max(0, renderedAt - clientEmitTs);
            if (e2eMs < 30000) {
              e2eSamplesRef.current.push(e2eMs);
              if (e2eSamplesRef.current.length > 200) {
                e2eSamplesRef.current.shift();
              }
            }
          }
        });
      }
    }, 100);

    return () => {
      clearInterval(pingInterval);
      clearInterval(latencyReportInterval);
      clearInterval(flushInterval);
      if (rafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafId);
      }
      socket.disconnect();
    };
  }, [token, sendActiveSubscription]);

  const setViewSubscription = useCallback(
    (nextViewSubs) => {
      viewSubsRef.current = {
        city: Boolean(nextViewSubs.city),
        engineering: Boolean(nextViewSubs.engineering),
        zones: Array.isArray(nextViewSubs.zones) ? nextViewSubs.zones : [],
        junctions: Array.isArray(nextViewSubs.junctions) ? nextViewSubs.junctions : [],
        alerts: Array.isArray(nextViewSubs.alerts) ? nextViewSubs.alerts : ['all'],
      };
      sendActiveSubscription(false);
    },
    [sendActiveSubscription]
  );

  const subscribeCategory = useCallback(
    (category) => {
      const zones = !category || category === 'all' ? [...ALL_ZONES] : [category];
      setViewSubscription({ ...viewSubsRef.current, zones });
    },
    [setViewSubscription]
  );

  const subscribeDevice = useCallback(
    (deviceId) => {
      if (!deviceId) return;
      detailJunctionsRef.current.add(deviceId);
      sendActiveSubscription(false);
    },
    [sendActiveSubscription]
  );

  const unsubscribeDevice = useCallback(
    (deviceId) => {
      if (!deviceId) return;
      detailJunctionsRef.current.delete(deviceId);
      sendActiveSubscription(false);
    },
    [sendActiveSubscription]
  );

  const simulateDisconnect = useCallback((durationMs = 10000) => {
    const sock = socketRef.current;
    if (!sock) return;
    if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);

    let remainingSec = Math.max(1, Math.round(durationMs / 1000));
    setDisconnectCountdownSec(remainingSec);
    sock.disconnect();

    disconnectTimerRef.current = setInterval(() => {
      remainingSec -= 1;
      if (remainingSec <= 0) {
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
        setDisconnectCountdownSec(0);
        if (socketRef.current) {
          socketRef.current.connect();
        }
      } else {
        setDisconnectCountdownSec(remainingSec);
      }
    }, 1000);
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const stats = useSyncExternalStore(
    hotStore.subscribeStats.bind(hotStore),
    hotStore.getStatsSnapshot
  );
  const latestByDevice = useSyncExternalStore(
    hotStore.subscribeAllJunctions.bind(hotStore),
    hotStore.getAllJunctionsSnapshot
  );
  const recentEvents = useSyncExternalStore(
    hotStore.subscribeRecent.bind(hotStore),
    hotStore.getRecentSnapshot
  );

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        stats,
        alerts,
        setAlerts,
        counterfactual,
        latestByDevice,
        recentEvents,
        isPaused,
        togglePause,
        soundEnabled,
        setSoundEnabled,
        clientLatency,
        clientE2eStats,
        obsUpdate,
        schema,
        lastReplayStats,
        socketError,
        setSocketError,
        disconnectCountdownSec,
        simulateDisconnect,
        setViewSubscription,
        subscribeCategory,
        subscribeDevice,
        unsubscribeDevice,
        cursorsRef,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function getJunctionSnapshot(junctionId) {
  return junctionId ? hotStore.getJunctionSnapshot(junctionId) : null;
}

export function useJunctionLive(junctionId) {
  return useSyncExternalStore(
    useCallback(
      (cb) => (junctionId ? hotStore.subscribeJunction(junctionId, cb) : () => {}),
      [junctionId]
    ),
    useCallback(
      () => (junctionId ? hotStore.getJunctionSnapshot(junctionId) : null),
      [junctionId]
    )
  );
}

export function useSocketStats() {
  return useSyncExternalStore(
    useCallback((cb) => hotStore.subscribeStats(cb), []),
    hotStore.getStatsSnapshot
  );
}

export function useRecentFrames() {
  return useSyncExternalStore(
    useCallback((cb) => hotStore.subscribeRecent(cb), []),
    hotStore.getRecentSnapshot
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return ctx;
}
