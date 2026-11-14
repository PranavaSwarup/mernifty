import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
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
  const [activeCategory, setActiveCategory] = useState('all');

  const socketRef = useRef(null);
  const pendingBufferRef = useRef([]);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  useEffect(() => {
    // Connect to backend Socket.IO
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected to telemetry server, ID:', socket.id);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected from telemetry server');
    });

    // Throughput stats
    socket.on('metrics:snapshot', (snapshot) => {
      setStats(snapshot);
    });

    // Ingested & broadcast telemetry batches
    socket.on('telemetry:batch', (batch) => {
      if (isPausedRef.current) return;
      pendingBufferRef.current.push(...batch);
    });

    // Live alert events
    socket.on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
    });

    // Telemetry ping-pong for real-time WebSocket RTT latency
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('telemetry:ping', Date.now());
      }
    }, 3000);

    socket.on('telemetry:pong', ({ clientTimestamp }) => {
      const rtt = Date.now() - clientTimestamp;
      setClientLatency(rtt);
    });

    // Client-side Throttled Window Flush (every 100ms ~ 10 FPS)
    // Prevents excessive React re-renders when handling 100-1000+ events/sec
    const flushInterval = setInterval(() => {
      if (pendingBufferRef.current.length === 0) return;

      const batchToProcess = pendingBufferRef.current.splice(0, pendingBufferRef.current.length);

      setLatestByDevice((prev) => {
        const next = { ...prev };
        for (const item of batchToProcess) {
          next[item.deviceId] = item;
        }
        return next;
      });

      setRecentEvents((prev) => {
        // Keep circular buffer of last 100 events
        const merged = [...batchToProcess.reverse(), ...prev];
        return merged.slice(0, 100);
      });
    }, 100);

    return () => {
      clearInterval(pingInterval);
      clearInterval(flushInterval);
      socket.disconnect();
    };
  }, []);

  // Room Subscription helper
  const subscribeCategory = useCallback((category) => {
    setActiveCategory(category);
    if (!socketRef.current) return;

    if (category === 'all') {
      socketRef.current.emit('subscribe:category', 'server');
      socketRef.current.emit('subscribe:category', 'fleet');
      socketRef.current.emit('subscribe:category', 'turbine');
    } else {
      socketRef.current.emit('subscribe:category', category);
    }
  }, []);

  const subscribeDevice = useCallback((deviceId) => {
    if (socketRef.current && deviceId) {
      socketRef.current.emit('subscribe:device', deviceId);
    }
  }, []);

  const unsubscribeDevice = useCallback((deviceId) => {
    if (socketRef.current && deviceId) {
      socketRef.current.emit('unsubscribe:device', deviceId);
    }
  }, []);

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
        isPaused,
        togglePause,
        clientLatency,
        activeCategory,
        subscribeCategory,
        subscribeDevice,
        unsubscribeDevice,
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
