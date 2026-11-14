import React, { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  X as CloseIcon,
  Copy as CopyIcon,
  Check as CheckIcon,
  Camera as CameraIcon,
  MapPin,
  Clock,
  Layers,
  Database,
  Radio,
  Car,
  AlertTriangle,
  Siren,
} from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';

export function DeviceDetailModal({ device, onClose }) {
  const { latestByDevice, subscribeDevice, unsubscribeDevice, isConnected } = useSocket();
  const [historicalData, setHistoricalData] = useState([]);
  const [mergedTimeline, setMergedTimeline] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [baselineHourMap, setBaselineHourMap] = useState({});
  const [currentDeviation, setCurrentDeviation] = useState(null);
  const [copied, setCopied] = useState(false);

  const seenEventIdsRef = useRef(new Set());
  const liveBufferRef = useRef([]);
  const isHistoryLoadedRef = useRef(false);
  const prevConnectedRef = useRef(isConnected);

  // 1. Subscribe to junction room FIRST, then fetch history (Section 5.9)
  useEffect(() => {
    if (!device) return;

    // Step A: Subscribe to junction room before requesting history to avoid lost events
    subscribeDevice(device.deviceId);
    setIsLoadingHistory(true);
    isHistoryLoadedRef.current = false;
    liveBufferRef.current = [];

    // Step B: Fetch historical data from MongoDB
    api.getHistory({ deviceId: device.deviceId, limit: 40 })
      .then((res) => {
        if (res.records) {
          const formattedHistory = res.records.map((r) => {
            if (r.eventId) seenEventIdsRef.current.add(r.eventId);
            return {
              ...r,
              sourceType: 'HISTORICAL_MONGODB',
              formattedTime: new Date(r.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
            };
          });

          // Step C: Reconcile buffered live events that arrived while history was in flight
          const bufferedLive = [];
          for (const liveEvt of liveBufferRef.current) {
            if (!seenEventIdsRef.current.has(liveEvt.eventId)) {
              seenEventIdsRef.current.add(liveEvt.eventId);
              bufferedLive.push({
                ...liveEvt,
                sourceType: 'LIVE_SOCKET_IO',
                formattedTime: new Date(liveEvt.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              });
            }
          }
          liveBufferRef.current = [];
          isHistoryLoadedRef.current = true;

          // Merge, sort by timestamp with sequence as tie-breaker
          const combined = [...formattedHistory, ...bufferedLive].sort((a, b) => {
            const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            if (timeDiff !== 0) return timeDiff;
            return (a.sequence || 0) - (b.sequence || 0);
          });

          setHistoricalData(formattedHistory);
          setMergedTimeline(combined.slice(-60));
        }
      })
      .catch((err) => console.error('Error fetching history:', err))
      .finally(() => setIsLoadingHistory(false));

    // Step D: Fetch 24-hour Baseline Curve (Section 5.14)
    api.getJunctionBaseline(device.deviceId)
      .then((res) => {
        if (res.baselines) {
          const map = {};
          for (const b of res.baselines) {
            map[b.hour] = b;
          }
          setBaselineHourMap(map);
        }
      })
      .catch((err) => console.warn('Baseline fetch notice:', err.message));

    return () => {
      unsubscribeDevice(device.deviceId);
      seenEventIdsRef.current.clear();
      liveBufferRef.current = [];
      isHistoryLoadedRef.current = false;
    };
  }, [device, subscribeDevice, unsubscribeDevice]);

  // 2. Seamlessly reconcile incoming live Socket.IO events into the timeline (Section 5.9)
  useEffect(() => {
    if (!device) return;
    const liveEvt = latestByDevice[device.deviceId];
    if (!liveEvt || !liveEvt.eventId) return;

    if (!isHistoryLoadedRef.current) {
      liveBufferRef.current.push(liveEvt);
      return;
    }

    if (seenEventIdsRef.current.has(liveEvt.eventId)) return;
    seenEventIdsRef.current.add(liveEvt.eventId);

    const liveRecord = {
      ...liveEvt,
      sourceType: 'LIVE_SOCKET_IO',
      formattedTime: new Date(liveEvt.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };

    setMergedTimeline((prev) => {
      const updated = [...prev, liveRecord].sort((a, b) => {
        const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (a.sequence || 0) - (b.sequence || 0);
      });
      return updated.slice(-60); // Cap window at 60 points to bound memory
    });
  }, [latestByDevice, device]);

  // 3. Gap-filling on reconnect (Section 5.9)
  useEffect(() => {
    if (!prevConnectedRef.current && isConnected && device && isHistoryLoadedRef.current) {
      subscribeDevice(device.deviceId);

      if (mergedTimeline.length > 0) {
        const lastRec = mergedTimeline[mergedTimeline.length - 1];
        api.getHistory({ deviceId: device.deviceId, from: lastRec.timestamp, limit: 50 })
          .then((res) => {
            if (res.records && res.records.length > 0) {
              const gapRecords = [];
              for (const r of res.records) {
                if (r.eventId && !seenEventIdsRef.current.has(r.eventId)) {
                  seenEventIdsRef.current.add(r.eventId);
                  gapRecords.push({
                    ...r,
                    sourceType: 'HISTORICAL_MONGODB',
                    formattedTime: new Date(r.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }),
                  });
                }
              }
              if (gapRecords.length > 0) {
                setMergedTimeline((prev) => {
                  const updated = [...prev, ...gapRecords].sort((a, b) => {
                    const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                    if (timeDiff !== 0) return timeDiff;
                    return (a.sequence || 0) - (b.sequence || 0);
                  });
                  return updated.slice(-60);
                });
              }
            }
          })
          .catch((err) => console.error('Error filling gap on reconnect:', err));
      }
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, device, mergedTimeline, subscribeDevice]);

  if (!device) return null;

  const currentLive = latestByDevice[device.deviceId];
  const metrics = currentLive?.metrics || currentLive?.data || device.lastMetrics || device.lastData || {};
  const data = currentLive?.data || device.lastData || {};
  const approaches = data.approaches || device.approaches || [];
  const vehicleMix = data.vehicleMix || device.vehicleMix || { twoWheeler: 0.55, car: 0.3, bus: 0.05, truck: 0.1 };
  const inCorridor = data.inCorridor || data.adaptiveSignalMode === 'emergency-corridor' || metrics.adaptiveSignalMode === 'emergency-corridor';
  const isCongested = metrics.congestionScore > 70 || (metrics.maxQueueLengthM && metrics.maxQueueLengthM > 140);

  // Section 5.14: "Now versus usual" Baseline Deviation calculation
  const currentHour = currentLive?.data?.simulatedTime
    ? new Date(currentLive.data.simulatedTime).getHours()
    : new Date().getHours();
  const currentBaseline = baselineHourMap[currentHour];
  let deviationLabel = null;
  if (currentBaseline && currentBaseline.avgSpeedKmph) {
    const curSpeed = metrics.avgSpeedKmph || 18;
    const diffPct = Math.round(((curSpeed - currentBaseline.avgSpeedKmph) / currentBaseline.avgSpeedKmph) * 100);
    if (diffPct <= -20) {
      deviationLabel = `${Math.abs(diffPct)}% slower than usual for ${currentHour % 12 || 12} ${currentHour >= 12 ? 'PM' : 'AM'}`;
    } else if (diffPct >= 20) {
      deviationLabel = `${diffPct}% faster than usual for ${currentHour % 12 || 12} ${currentHour >= 12 ? 'PM' : 'AM'}`;
    } else {
      deviationLabel = 'Normal for this hour';
    }
  }

  const copyJsonPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(currentLive || device, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl bg-[#0B101D] border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${inCorridor ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 animate-pulse' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
              {inCorridor ? <Siren className="w-5 h-5 text-blue-400" /> : <CameraIcon className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">{device.name}</h3>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {device.deviceId}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {device.zoneName || device.zoneId}
                </span>
                {inCorridor && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse">
                    🚑 CORRIDOR PREEMPTION ACTIVE
                  </span>
                )}
                {deviationLabel && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                      deviationLabel.includes('slower')
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    📊 {deviationLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Centralized Vision Processing Telemetry & Optical Approach Queues
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyJsonPayload}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors"
              title="Copy current frame JSON"
            >
              {copied ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <CopyIcon className="w-4 h-4" />}
              <span className="hidden sm:inline font-mono text-[11px]">{copied ? 'Copied' : 'JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Simulated CCTV Camera Feed & AI Recognition Overlay */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 text-xs font-mono">
              <div className="flex items-center gap-2 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="font-bold">LIVE CAMERA FEED • CAM-BLR-{device.deviceId.slice(-3)}</span>
              </div>
              <span className="text-slate-400">Central Data Center GPU Pipeline • 14ms Latency</span>
            </div>

            {/* Video Viewport Mock */}
            <div className="mt-3 relative h-36 bg-gradient-to-b from-slate-900 to-[#0A0F1D] rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-40" />

              {/* HUD Bounding Boxes */}
              <div className="absolute top-3 left-4 text-[10px] font-mono text-emerald-400 bg-slate-950/80 p-2 rounded border border-emerald-500/30">
                <div>YOLO-v9 ANPR: OPTICAL FLOW ACTIVE</div>
                <div>DETECTIONS: {approaches.reduce((a, b) => a + (b.vehiclesPerMin || 30), 0)} objects/min</div>
                <div>SIGNAL MODE: {data.adaptiveSignalMode || 'dynamic-ai'}</div>
              </div>

              {/* Status Alert Banner */}
              {inCorridor && (
                <div className="z-10 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/60 text-blue-300 text-xs font-bold font-mono animate-bounce flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-400 animate-ping" />
                  🚑 AMBULANCE GREEN CORRIDOR PREEMPTION ACTIVE • ARRIVAL ROAD GREEN
                </div>
              )}
              {isCongested && !inCorridor && (
                <div className="z-10 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-bold font-mono flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                  HEAVY QUEUE BACKLOG • CONGESTION SCORE {metrics.congestionScore || 75}/100
                </div>
              )}
              {!isCongested && !inCorridor && (
                <div className="text-center font-mono text-slate-500 text-xs">
                  <div className="text-emerald-400 font-bold mb-1">OPTICAL FLOW NOMINAL • ADAPTIVE TIMING NORMAL</div>
                  <span>Bengaluru Arterial Feeder Inflow Within Capacity</span>
                </div>
              )}
            </div>
          </div>

          {/* 4 Approaches Grid */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
              Approach Lanes & Signal Cycle
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {approaches.map((app, idx) => {
                const isGreen = app.signal === 'green';
                const queuePercent = Math.min(100, Math.round(((app.queueLengthM || 40) / 220) * 100));

                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border ${
                      isGreen ? 'bg-emerald-950/20 border-emerald-500/40' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            isGreen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-bold text-xs text-slate-200">{app.road}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                          isGreen ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {app.signal}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-slate-500 block">QUEUE</span>
                        <span className={`font-bold ${app.queueLengthM > 120 ? 'text-rose-400' : 'text-slate-200'}`}>
                          {app.queueLengthM}m
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">SPEED</span>
                        <span className="text-cyan-400 font-bold">{app.avgSpeedKmph} km/h</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">FLOW</span>
                        <span className="text-emerald-400 font-bold">{app.vehiclesPerMin} v/m</span>
                      </div>
                    </div>

                    {/* Queue meter bar */}
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
                      <div
                        className={`h-full ${
                          queuePercent > 70 ? 'bg-rose-500' : queuePercent > 40 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${queuePercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vehicle Mix Card */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
              Vision Vehicle Classification Breakdown
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Two-Wheelers</span>
                <span className="text-lg font-bold text-cyan-400">
                  {Math.round((vehicleMix.twoWheeler || 0.55) * 100)}%
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Cars / Taxis</span>
                <span className="text-lg font-bold text-emerald-400">
                  {Math.round((vehicleMix.car || 0.3) * 100)}%
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">BMTC Buses</span>
                <span className="text-lg font-bold text-amber-400">
                  {Math.round((vehicleMix.bus || 0.05) * 100)}%
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Commercial Trucks</span>
                <span className="text-lg font-bold text-purple-400">
                  {Math.round((vehicleMix.truck || 0.1) * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Gapless Historical & Live Reconciled Waveform */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="font-bold text-xs text-slate-200">
                  Historical MongoDB vs Sub-Second Live Socket Reconciler
                </h4>
                <p className="text-[11px] text-slate-400">
                  Zero-gap unified timeline: MongoDB historical partition stitched with live WebSocket stream
                </p>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span className="text-slate-300">HISTORICAL_MONGODB</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-300">LIVE_SOCKET_IO</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-slate-400" />
                  <span className="text-slate-400">USUAL_BASELINE</span>
                </div>
              </div>
            </div>

            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={mergedTimeline.map((item) => {
                    const itemHour = item.timestamp ? new Date(item.timestamp).getHours() : currentHour;
                    const b = baselineHourMap[itemHour];
                    return {
                      time: item.formattedTime,
                      queue: item.metrics?.maxQueueLengthM || item.data?.maxQueueLengthM || 45,
                      speed: item.metrics?.avgSpeedKmph || item.data?.avgSpeedKmph || 18,
                      baselineSpeed: b?.avgSpeedKmph || null,
                      source: item.sourceType,
                      sequence: item.sequence || 0,
                    };
                  })}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748B" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#64748B" tick={{ fontSize: 9 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const dataItem = payload[0].payload;
                        const isHistorical = dataItem.source === 'HISTORICAL_MONGODB';
                        return (
                          <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-lg shadow-xl text-xs font-mono">
                            <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-slate-800">
                              <span className="text-slate-300 font-bold">{label}</span>
                              <span
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                                  isHistorical
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {dataItem.source}
                              </span>
                            </div>
                            <div className="text-rose-400">Queue: {dataItem.queue}m</div>
                            <div className="text-cyan-400">Speed: {dataItem.speed} km/h</div>
                            {dataItem.sequence ? (
                              <div className="text-slate-500 text-[10px] mt-1">Seq: #{dataItem.sequence}</div>
                            ) : null}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="queue"
                    name="Queue (m)"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={({ cx, cy, payload }) => {
                      // Show prominent join marker for live socket points vs historical
                      if (payload.source === 'LIVE_SOCKET_IO') {
                        return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.5} fill="#10B981" stroke="#064E3B" strokeWidth={1} />;
                      }
                      return null;
                    }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="speed"
                    name="Speed (km/h)"
                    stroke="#06B6D4"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baselineSpeed"
                    name="Usual Baseline Speed"
                    stroke="#94A3B8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
