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
import { TrendingUp, RefreshCw, Cpu, Truck, Wind, Maximize2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function TelemetryCharts({ devices = [] }) {
  const { latestByDevice, isPaused } = useSocket();
  const [selectedCategory, setSelectedCategory] = useState('server');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [windowPoints, setWindowPoints] = useState(30);

  // Time-series ring buffer: array of snapshots
  const [chartData, setChartData] = useState([]);
  const chartDataRef = useRef([]);
  chartDataRef.current = chartData;

  // Filter devices for selected category
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => d.category === selectedCategory);
  }, [devices, selectedCategory]);

  // Set default selected device when category changes
  useEffect(() => {
    if (filteredDevices.length > 0 && (!selectedDeviceId || !filteredDevices.some(d => d.deviceId === selectedDeviceId))) {
      setSelectedDeviceId(filteredDevices[0].deviceId);
    }
  }, [filteredDevices, selectedDeviceId]);

  // Append new telemetry point when latestByDevice updates
  useEffect(() => {
    if (isPaused || !selectedDeviceId) return;

    const event = latestByDevice[selectedDeviceId];
    if (!event || !event.metrics) return;

    const timeStr = new Date(event.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const newPoint = {
      timestamp: timeStr,
      ...event.metrics,
      status: event.status,
    };

    setChartData((prev) => {
      // Avoid duplicate consecutive timestamps
      if (prev.length > 0 && prev[prev.length - 1].timestamp === timeStr) {
        return prev;
      }
      const updated = [...prev, newPoint];
      return updated.slice(-windowPoints);
    });
  }, [latestByDevice, selectedDeviceId, windowPoints, isPaused]);

  // Category specific metric configurations
  const metricConfigs = {
    server: [
      { key: 'cpuPercent', name: 'CPU Load', unit: '%', color: '#10B981', fill: 'url(#gradCpu)' },
      { key: 'memoryPercent', name: 'Memory Load', unit: '%', color: '#06B6D4', fill: 'url(#gradMem)' },
      { key: 'latencyMs', name: 'API Latency', unit: 'ms', color: '#F59E0B', fill: 'url(#gradLat)' },
    ],
    fleet: [
      { key: 'speedKmh', name: 'Vehicle Speed', unit: 'km/h', color: '#3B82F6', fill: 'url(#gradSpeed)' },
      { key: 'batteryLevel', name: 'Battery SoC', unit: '%', color: '#10B981', fill: 'url(#gradBatt)' },
      { key: 'motorTempC', name: 'Motor Temp', unit: '°C', color: '#EF4444', fill: 'url(#gradTemp)' },
    ],
    turbine: [
      { key: 'powerOutputMw', name: 'Power Output', unit: 'MW', color: '#10B981', fill: 'url(#gradPwr)' },
      { key: 'vibrationMmS', name: 'Vibration', unit: 'mm/s', color: '#EC4899', fill: 'url(#gradVib)' },
      { key: 'oilTempC', name: 'Bearing Temp', unit: '°C', color: '#F59E0B', fill: 'url(#gradOil)' },
    ],
  };

  const currentConfigs = metricConfigs[selectedCategory] || metricConfigs.server;

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
              High-Frequency Telemetry Stream
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Sub-second live streaming window ({chartData.length} samples)
            </p>
          </div>
        </div>

        {/* Category & Device Selection */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Category Tabs */}
          <div className="flex bg-slate-900/90 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedCategory('server')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedCategory === 'server'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3 h-3" />
              Servers
            </button>
            <button
              onClick={() => setSelectedCategory('fleet')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedCategory === 'fleet'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Truck className="w-3 h-3" />
              Fleet
            </button>
            <button
              onClick={() => setSelectedCategory('turbine')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedCategory === 'turbine'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wind className="w-3 h-3" />
              Turbines
            </button>
          </div>

          {/* Device Dropdown */}
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              setChartData([]); // reset buffer for clean view of new device
            }}
            className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {filteredDevices.map((dev) => (
              <option key={dev.deviceId} value={dev.deviceId}>
                {dev.name} ({dev.deviceId})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-3 gap-3 my-3">
        {currentConfigs.map((cfg) => {
          const latestPoint = chartData[chartData.length - 1];
          const val = latestPoint ? latestPoint[cfg.key] : '--';
          return (
            <div
              key={cfg.key}
              className="rounded-lg bg-slate-900/60 border border-slate-800/80 p-2.5 flex items-center justify-between"
            >
              <div>
                <span className="text-[11px] font-medium text-slate-400">{cfg.name}</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-bold font-mono text-white">{val}</span>
                  <span className="text-xs text-slate-500">{cfg.unit}</span>
                </div>
              </div>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cfg.color }}
              />
            </div>
          );
        })}
      </div>

      {/* Chart Canvas */}
      <div className="h-64 sm:h-72 w-full pt-2">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-xs">Buffering live telemetry stream...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradLat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradSpeed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradBatt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradPwr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradVib" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EC4899" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#EC4899" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradOil" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis
                dataKey="timestamp"
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#F8FAFC',
                }}
              />
              {currentConfigs.map((cfg) => (
                <Area
                  key={cfg.key}
                  type="monotone"
                  dataKey={cfg.key}
                  name={cfg.name}
                  stroke={cfg.color}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={cfg.fill}
                  isAnimationActive={false} // Disabled animation for 0-jitter high-throughput streaming
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
