import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Database,
  Radio,
  Clock,
  Layers,
  Activity,
  CheckCircle2,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
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

    // Deduplication check
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
      // Append and keep last 60 records
      const updated = [...prev, liveRecord];
      return updated.slice(-60);
    });
  }, [latestByDevice, device]);

  if (!device) return null;

  const currentLive = latestByDevice[device.deviceId];
  const metrics = currentLive?.metrics || device.lastMetrics || {};

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentLive || device, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Flatten metrics for chart display
  const chartPoints = mergedTimeline.map((item) => ({
    timestamp: item.formattedTime,
    sourceType: item.sourceType,
    ...item.metrics,
  }));

  // Identify first 2 numeric keys for chart display
  const metricKeys = Object.keys(metrics).filter((k) => typeof metrics[k] === 'number').slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0B101D] border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-100">{device.name}</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {device.deviceId}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {device.region} • Category: <span className="capitalize">{device.category}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Historical Reconciliation Notice */}
          <div className="rounded-xl bg-gradient-to-r from-cyan-950/40 to-emerald-950/40 border border-cyan-800/40 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate-200">
                  Seamless Historical + Live Stream Reconciliation
                </h4>
                <p className="text-[11px] text-slate-400">
                  Initial window hydrated from MongoDB, seamlessly transitioning to incoming Socket.IO events with zero gap or duplicate frames.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Database className="w-3 h-3" /> MongoDB
              </span>
              <span className="text-slate-600">+</span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Radio className="w-3 h-3 animate-pulse" /> Live Socket
              </span>
            </div>
          </div>

          {/* Unified Chart */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300">
                Continuous Telemetry Waveform ({mergedTimeline.length} Points)
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                {metricKeys.map((k, idx) => (
                  <span key={k} className="flex items-center gap-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: idx === 0 ? '#10B981' : '#06B6D4' }}
                    />
                    <span className="text-slate-400 capitalize">{k}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="h-56 w-full">
              {isLoadingHistory ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Retrieving historical telemetry from MongoDB...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartPoints} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <XAxis dataKey="timestamp" stroke="#64748B" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                    {metricKeys[0] && (
                      <Line
                        type="monotone"
                        dataKey={metricKeys[0]}
                        stroke="#10B981"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    )}
                    {metricKeys[1] && (
                      <Line
                        type="monotone"
                        dataKey={metricKeys[1]}
                        stroke="#06B6D4"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Unified Feed Log (Historical vs Live) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">
                Event Sequence Audit Log
              </span>
              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy Latest Frame'}</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-[11px]">
              {mergedTimeline.slice().reverse().map((item, idx) => {
                const isLive = item.sourceType === 'LIVE_SOCKET_IO';
                return (
                  <div
                    key={item.eventId || idx}
                    className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60 text-slate-300 hover:bg-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          isLive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {isLive ? 'LIVE' : 'HISTORICAL'}
                      </span>
                      <span className="text-slate-400">{item.formattedTime}</span>
                      <span className="text-slate-500 text-[10px] hidden sm:inline">[{item.eventId}]</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {Object.entries(item.metrics || {})
                        .slice(0, 3)
                        .map(([k, v]) => (
                          <span key={k} className="text-slate-400">
                            <span className="text-slate-600">{k}:</span>{' '}
                            <span className="text-emerald-400 font-bold">{v}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
