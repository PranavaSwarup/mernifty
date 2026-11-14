import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, RefreshCw, MapPin, Gauge, Activity } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function TelemetryCharts({ devices = [] }) {
  const { latestByDevice, isPaused } = useSocket();
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [windowPoints, setWindowPoints] = useState(30);

  const [chartData, setChartData] = useState([]);

  // Filter devices by zone
  const filteredDevices = useMemo(() => {
    if (selectedZone === 'all') return devices;
    return devices.filter((d) => d.category === selectedZone || d.zoneId === selectedZone);
  }, [devices, selectedZone]);

  // Set default selected junction
  useEffect(() => {
    if (filteredDevices.length > 0 && (!selectedDeviceId || !filteredDevices.some((d) => d.deviceId === selectedDeviceId))) {
      setSelectedDeviceId(filteredDevices[0].deviceId);
    }
  }, [filteredDevices, selectedDeviceId]);

  // Append new telemetry point
  useEffect(() => {
    if (isPaused || !selectedDeviceId) return;

    const event = latestByDevice[selectedDeviceId];
    if (!event || (!event.metrics && !event.data)) return;

    const timeStr = new Date(event.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const metrics = event.metrics || event.data || {};

    const newPoint = {
      timestamp: timeStr,
      maxQueueLengthM: metrics.maxQueueLengthM || 0,
      avgSpeedKmph: metrics.avgSpeedKmph || 0,
      totalFlowVehiclesPerMin: metrics.totalFlowVehiclesPerMin || 0,
      congestionScore: metrics.congestionScore || 0,
      status: event.status,
    };

    setChartData((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].timestamp === timeStr) {
        return prev;
      }
      const updated = [...prev, newPoint];
      return updated.slice(-windowPoints);
    });
  }, [latestByDevice, selectedDeviceId, windowPoints, isPaused]);

  const currentDev = devices.find((d) => d.deviceId === selectedDeviceId) || devices[0];
  const liveEvt = selectedDeviceId ? latestByDevice[selectedDeviceId] : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B101D]/70 p-4 backdrop-blur-md">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              Central Camera Stream Waveforms
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Real-time optical queue accumulation & corridor velocity dynamics
            </p>
          </div>
        </div>

        {/* Junction & Window Selectors */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Zone Selector */}
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Bengaluru Zones</option>
            <option value="south-bangalore">South Zone</option>
            <option value="east-bangalore">East Zone</option>
            <option value="north-bangalore">North Zone</option>
            <option value="central-bangalore">Central Zone</option>
          </select>

          {/* Junction Selector */}
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              setChartData([]);
            }}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-semibold focus:outline-none focus:border-emerald-500 max-w-[210px] truncate"
          >
            {filteredDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name.split('(')[0]} ({d.deviceId})
              </option>
            ))}
          </select>

          {/* Time Window Buttons */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            {[20, 30, 60].map((pts) => (
              <button
                key={pts}
                onClick={() => setWindowPoints(pts)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  windowPoints === pts
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {pts}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Value Stat Chips */}
      {liveEvt && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
              Max Queue Length
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-bold font-mono text-rose-400">
                {liveEvt.metrics?.maxQueueLengthM || 0}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">meters</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
              Avg Speed
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-bold font-mono text-cyan-400">
                {liveEvt.metrics?.avgSpeedKmph || 0}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">km/h</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
              Total Inflow Rate
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-bold font-mono text-emerald-400">
                {liveEvt.metrics?.totalFlowVehiclesPerMin || 0}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">veh/min</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
              Congestion Index
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-bold font-mono text-amber-400">
                {liveEvt.metrics?.congestionScore || 0}%
              </span>
              <span className="text-[10px] text-slate-500 font-mono">index</span>
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {/* Chart 1: Queue Length & Flow */}
        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-xs font-bold text-slate-200">Max Queue Length (m)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-slate-400 font-mono">Inflow (veh/min)</span>
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradQueue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradFlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748B" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 10 }} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Area type="monotone" dataKey="maxQueueLengthM" name="Queue (m)" stroke="#EF4444" fill="url(#gradQueue)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="totalFlowVehiclesPerMin" name="Flow (veh/min)" stroke="#10B981" fill="url(#gradFlow)" strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Speed & Congestion Score */}
        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-xs font-bold text-slate-200">Corridor Velocity (km/h)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[11px] text-slate-400 font-mono">Congestion Index</span>
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradSpeed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradCongest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748B" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Area type="monotone" dataKey="avgSpeedKmph" name="Speed (km/h)" stroke="#06B6D4" fill="url(#gradSpeed)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="congestionScore" name="Congestion %" stroke="#F59E0B" fill="url(#gradCongest)" strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
