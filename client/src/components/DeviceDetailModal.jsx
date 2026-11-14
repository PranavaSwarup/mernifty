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
} from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';

export function DeviceDetailModal({ device, onClose }) {
  const { latestByDevice, subscribeDevice, unsubscribeDevice } = useSocket();
  const [historicalData, setHistoricalData] = useState([]);
  const [mergedTimeline, setMergedTimeline] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [copied, setCopied] = useState(false);
  const seenEventIdsRef = useRef(new Set());

  // 1. Fetch historical data from MongoDB on mount
  useEffect(() => {
    if (!device) return;

    subscribeDevice(device.deviceId);
    setIsLoadingHistory(true);

    api.getHistory({ deviceId: device.deviceId, limit: 40 })
      .then((res) => {
        if (res.records) {
          const formattedHistory = res.records.map((r) => {
            seenEventIdsRef.current.add(r.eventId);
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
          setHistoricalData(formattedHistory);
          setMergedTimeline(formattedHistory);
        }
      })
      .catch((err) => console.error('Error fetching history:', err))
      .finally(() => setIsLoadingHistory(false));

    return () => {
      unsubscribeDevice(device.deviceId);
      seenEventIdsRef.current.clear();
    };
  }, [device, subscribeDevice, unsubscribeDevice]);

  // 2. Seamlessly reconcile incoming live Socket.IO events into the timeline
  useEffect(() => {
    if (!device) return;
    const liveEvt = latestByDevice[device.deviceId];
    if (!liveEvt || !liveEvt.eventId) return;

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
      const updated = [...prev, liveRecord];
      return updated.slice(-60);
    });
  }, [latestByDevice, device]);

  if (!device) return null;

  const currentLive = latestByDevice[device.deviceId];
  const metrics = currentLive?.metrics || currentLive?.data || device.lastMetrics || device.lastData || {};
  const data = currentLive?.data || device.lastData || {};
  const approaches = data.approaches || device.approaches || [];
  const vehicleMix = data.vehicleMix || device.vehicleMix || { twoWheeler: 0.55, car: 0.3, bus: 0.05, truck: 0.1 };
  const stalled = Boolean(data.stalledVehicleDetected || metrics.stalledVehicleDetected || device.stalledVehicleDetected);
  const ambulance = Boolean(data.ambulanceDetected || metrics.ambulanceDetected || device.ambulanceDetected);

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
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CameraIcon className="w-5 h-5" />
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
            <div className="mt-3 relative h-40 bg-gradient-to-b from-slate-900 to-[#0A0F1D] rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden">
              {/* Scanlines effect */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-40" />

              {/* HUD Bounding Boxes */}
              <div className="absolute top-3 left-4 text-[10px] font-mono text-emerald-400 bg-slate-950/80 p-2 rounded border border-emerald-500/30">
                <div>YOLO-v9 ANPR: OPTICAL FLOW ACTIVE</div>
                <div>DETECTIONS: {approaches.reduce((a, b) => a + (b.vehiclesPerMin || 30), 0)} objects/min</div>
                <div>CLASSIFICATION CONFIDENCE: 98.4%</div>
              </div>

              {/* Status Alert in center if stalled / ambulance */}
              {ambulance && (
                <div className="z-10 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/60 text-blue-300 text-xs font-bold font-mono animate-bounce flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-400 animate-ping" />
                  AMBULANCE BEACON DETECTED • GREEN CORRIDOR RECOMMENDED
                </div>
              )}
              {stalled && !ambulance && (
                <div className="z-10 px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/60 text-rose-300 text-xs font-bold font-mono animate-bounce flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-400" />
                  STALLED VEHICLE IN LANE 2 • TOW DISPATCH RECOMMENDED
                </div>
              )}
              {!stalled && !ambulance && (
                <div className="text-center font-mono text-slate-500 text-xs">
                  <div className="text-emerald-400 font-bold mb-1">OPTICAL LANES CLEAR • ADAPTIVE TIMING NORMAL</div>
                  <span>Hospital Corridor / Arterial Feeder Inflow Nominal</span>
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
                  Zero-gap unified timeline reconciling disk persistence with live WebSocket telemetry
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
              </div>
            </div>

            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={mergedTimeline.map((item) => ({
                    time: item.formattedTime,
                    queue: item.metrics?.maxQueueLengthM || item.data?.maxQueueLengthM || 45,
                    speed: item.metrics?.avgSpeedKmph || item.data?.avgSpeedKmph || 18,
                    source: item.sourceType,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748B" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#64748B" tick={{ fontSize: 9 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Line type="monotone" dataKey="queue" name="Queue (m)" stroke="#EF4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="speed" name="Speed (km/h)" stroke="#06B6D4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
