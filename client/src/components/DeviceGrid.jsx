import React, { useState, useMemo } from 'react';
import { Server, Truck, Wind, Search, Filter, ShieldCheck, AlertCircle, ExternalLink, Activity, Sparkles } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function DeviceGrid({ devices = [], onSelectDevice, onOpenCopilot }) {
  const { latestByDevice } = useSocket();
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    return devices.filter((dev) => {
      const matchesCategory = filterCategory === 'all' || dev.category === filterCategory;
      const matchesSearch =
        dev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev.region.toLowerCase().includes(searchQuery.toLowerCase());

      const live = latestByDevice[dev.deviceId];
      const status = live?.status || dev.status || 'healthy';
      const matchesStatus = filterStatus === 'all' || status === filterStatus;

      return matchesCategory && matchesSearch && matchesStatus;
    });
  }, [devices, latestByDevice, filterCategory, searchQuery, filterStatus]);

  const getCategoryIcon = (cat) => {
    switch (cat) {
      case 'server':
        return <Server className="w-4 h-4 text-emerald-400" />;
      case 'fleet':
        return <Truck className="w-4 h-4 text-cyan-400" />;
      case 'turbine':
        return <Wind className="w-4 h-4 text-amber-400" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
            CRITICAL
          </span>
        );
      case 'warning':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            WARNING
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            ONLINE
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B101D]/70 p-4 backdrop-blur-md">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            Telemetry Node Matrix
            <span className="text-xs font-mono font-normal text-slate-400">
              ({filtered.length} nodes)
            </span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Multi-stream hardware agents, edge servers, and logistics transports
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search box */}
          <div className="relative flex-1 md:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search node or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            {['all', 'server', 'fleet', 'turbine'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                  filterCategory === cat
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of Device Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-3">
        {filtered.map((dev) => {
          const live = latestByDevice[dev.deviceId];
          const metrics = live?.metrics || dev.lastMetrics || dev.baseMetrics || {};
          const status = live?.status || dev.status || 'healthy';

          return (
            <div
              key={dev.deviceId}
              onClick={() => onSelectDevice(dev)}
              className="group relative rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 hover:bg-slate-900 hover:border-slate-700 cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              {/* Top Row: Icon + Name + Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50">
                    {getCategoryIcon(dev.category)}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-100 group-hover:text-emerald-400 transition-colors truncate max-w-[150px]">
                      {dev.name}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">{dev.deviceId}</span>
                  </div>
                </div>
                {getStatusBadge(status)}
              </div>

              {/* Middle: Region & Sequence */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5 pb-2 border-b border-slate-800/60">
                <span className="truncate">{dev.region}</span>
                <span className="font-mono text-[10px] text-slate-500">
                  seq #{live?.sequence || 0}
                </span>
              </div>

              {/* Bottom: Dynamic Metrics Preview */}
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                {dev.category === 'server' && (
                  <>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">CPU</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {metrics.cpuPercent ? Math.round(metrics.cpuPercent) : 0}%
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">MEM</span>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {metrics.memoryPercent ? Math.round(metrics.memoryPercent) : 0}%
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">LAT</span>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {metrics.latencyMs ? Math.round(metrics.latencyMs) : 0}ms
                      </span>
                    </div>
                  </>
                )}

                {dev.category === 'fleet' && (
                  <>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">SPEED</span>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {metrics.speedKmh ? Math.round(metrics.speedKmh) : 0}
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">BATT</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {metrics.batteryLevel ? metrics.batteryLevel : 0}%
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">TEMP</span>
                      <span className="text-xs font-mono font-bold text-rose-400">
                        {metrics.motorTempC ? Math.round(metrics.motorTempC) : 0}°C
                      </span>
                    </div>
                  </>
                )}

                {dev.category === 'turbine' && (
                  <>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">POWER</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {metrics.powerOutputMw || 0}MW
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">VIB</span>
                      <span className="text-xs font-mono font-bold text-pink-400">
                        {metrics.vibrationMmS || 0}
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                      <span className="text-[9px] text-slate-500 block">RPM</span>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {metrics.rotorRpm ? Math.round(metrics.rotorRpm) : 0}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Actions Footer */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                {onOpenCopilot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCopilot(dev);
                    }}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-bold px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>AI Copilot</span>
                  </button>
                )}
                <div className="flex items-center text-slate-400 group-hover:text-emerald-400 font-semibold gap-1 ml-auto">
                  <span>Waveform</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
