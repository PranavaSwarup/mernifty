import React, { useState, useEffect } from 'react';
import { Database, Calendar, Download, RefreshCw, Filter, Layers, BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { api } from '../services/api';

export function HistoricalAnalytics({ devices = [] }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]?.deviceId || 'JNC-BLR-001');
  const [minutesWindow, setMinutesWindow] = useState(30);
  const [bucketSeconds, setBucketSeconds] = useState(15);
  const [buckets, setBuckets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].deviceId);
    }
  }, [devices, selectedDeviceId]);

  const fetchAggregateData = async () => {
    if (!selectedDeviceId) return;
    setIsLoading(true);
    try {
      const res = await api.getAggregate(selectedDeviceId, minutesWindow, bucketSeconds);
      if (res.buckets) {
        setBuckets(
          res.buckets.map((b) => ({
            time: new Date(b.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            count: b.count,
            ...b.metrics,
          }))
        );
      }
    } catch (err) {
      console.error('Aggregate fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAggregateData();
  }, [selectedDeviceId, minutesWindow, bucketSeconds]);

  // Export handlers
  const exportAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(buckets, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', `telemetry_${selectedDeviceId}_${Date.now()}.json`);
    dl.click();
  };

  const exportAsCsv = () => {
    if (buckets.length === 0) return;
    const keys = Object.keys(buckets[0]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [keys.join(','), ...buckets.map((row) => keys.map((k) => row[k] ?? '').join(','))].join('\n');
    const dl = document.createElement('a');
    dl.setAttribute('href', encodeURI(csvContent));
    dl.setAttribute('download', `telemetry_${selectedDeviceId}_${Date.now()}.csv`);
    dl.click();
  };

  // Find metric keys
  const metricKeys = buckets.length > 0
    ? Object.keys(buckets[0]).filter((k) => k !== 'time' && k !== 'count' && typeof buckets[0][k] === 'number')
    : [];

  return (
    <div className="space-y-4">
      {/* Top Filter & Export Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-100">
              MongoDB Historical Telemetry & Aggregation Engine
            </h3>
            <p className="text-xs text-slate-400">
              Time-bucketed aggregation queries across persistent MongoDB collections
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Device select */}
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name} ({d.deviceId})
              </option>
            ))}
          </select>

          {/* Time Window */}
          <select
            value={minutesWindow}
            onChange={(e) => setMinutesWindow(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value={5}>Last 5 mins</option>
            <option value={15}>Last 15 mins</option>
            <option value={60}>Last 1 hour</option>
            <option value={360}>Last 6 hours</option>
          </select>

          {/* Resolution Buckets */}
          <select
            value={bucketSeconds}
            onChange={(e) => setBucketSeconds(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value={5}>5s buckets</option>
            <option value={15}>15s buckets</option>
            <option value={60}>1m buckets</option>
          </select>

          {/* Refresh button */}
          <button
            onClick={fetchAggregateData}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Export buttons */}
          <button
            onClick={exportAsCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold hover:bg-emerald-500/30 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={exportAsJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold hover:bg-cyan-500/30 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* Aggregate Bar Chart */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h4 className="font-bold text-sm text-slate-200">
              Aggregated Averages ({buckets.length} Time Buckets)
            </h4>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Bucket resolution: {bucketSeconds}s
          </span>
        </div>

        <div className="h-64 w-full">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Aggregating data from MongoDB...
            </div>
          ) : buckets.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No historical records in selected window. Ensure simulator is active.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
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
                  <Bar dataKey={metricKeys[0]} fill="#10B981" radius={[4, 4, 0, 0]} />
                )}
                {metricKeys[1] && (
                  <Bar dataKey={metricKeys[1]} fill="#06B6D4" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Historical Data Table */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101D] overflow-hidden">
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300">Historical Aggregation Audit Table</span>
          <span className="text-xs text-slate-500 font-mono">Showing {buckets.length} rows</span>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3 font-semibold">Bucket Window</th>
                <th className="p-3 font-semibold">Samples Count</th>
                {metricKeys.map((k) => (
                  <th key={k} className="p-3 font-semibold capitalize">
                    Avg {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {buckets.slice().reverse().map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/50">
                  <td className="p-3 text-cyan-400">{row.time}</td>
                  <td className="p-3 text-slate-400">{row.count} events</td>
                  {metricKeys.map((k) => (
                    <td key={k} className="p-3 font-bold text-emerald-400">
                      {row[k] ?? '--'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
