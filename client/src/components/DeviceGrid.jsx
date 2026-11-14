import React, { useState, useMemo, memo } from 'react';
import {
  MapPin,
  Search,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useJunctionLive, getJunctionSnapshot } from '../context/SocketContext';

function getStatusBadge(status, stalled, ambulance) {
  if (ambulance) {
    return (
      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
        AMBULANCE
      </span>
    );
  }
  if (stalled) {
    return (
      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
        STALLED VEHICLE
      </span>
    );
  }
  switch (status) {
    case 'gridlock':
    case 'critical':
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
          GRIDLOCK
        </span>
      );
    case 'congested':
    case 'warning':
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          HEAVY QUEUE
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          FLOW NORMAL
        </span>
      );
  }
}

function getZoneLabel(zoneId) {
  switch (zoneId) {
    case 'south-bangalore':
      return 'South Zone';
    case 'east-bangalore':
      return 'East Zone';
    case 'north-bangalore':
      return 'North Zone';
    case 'central-bangalore':
      return 'Central Zone';
    default:
      return 'Bengaluru Zone';
  }
}

/**
 * Isolated per-junction card subscribed strictly to its own junction slice via useSyncExternalStore.
 * Ticking one junction never re-renders sibling cards.
 */
const DeviceCard = memo(function DeviceCard({ dev, onSelectDevice, onOpenCopilot }) {
  const live = useJunctionLive(dev.deviceId);
  const metrics = live?.metrics || live?.data || dev.lastMetrics || dev.lastData || {};
  const status = live?.status || dev.status || 'healthy';
  const approaches =
    (live?.data?.approaches && live.data.approaches.length > 0 ? live.data.approaches : null) ||
    dev.approaches ||
    [];
  const vehicleMix = live?.data?.vehicleMix || dev.vehicleMix || {
    twoWheeler: 0.55,
    car: 0.3,
    bus: 0.05,
    truck: 0.1,
  };
  const stalled = Boolean(
    live?.data?.stalledVehicleDetected ?? metrics.stalledVehicleDetected ?? dev.stalledVehicleDetected
  );
  const ambulance = Boolean(
    live?.data?.ambulanceDetected ?? metrics.ambulanceDetected ?? dev.ambulanceDetected
  );

  const maxQueue =
    metrics.maxQueueLengthM ??
    (approaches.length > 0 ? Math.max(...approaches.map((a) => a.queueLengthM || 0)) : 45);
  const avgSpeed =
    metrics.avgSpeedKmph ??
    (approaches.length > 0
      ? (approaches.reduce((a, b) => a + (b.avgSpeedKmph || 15), 0) / approaches.length).toFixed(1)
      : 18);
  const totalFlow =
    metrics.totalFlowVehiclesPerMin ??
    (approaches.length > 0 ? approaches.reduce((a, b) => a + (b.vehiclesPerMin || 30), 0) : 120);

  return (
    <div
      className={`group relative rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between ${
        stalled || ambulance || status === 'gridlock' || status === 'critical'
          ? 'bg-rose-950/15 border-rose-500/40 hover:border-rose-500/70 shadow-lg shadow-rose-950/20'
          : status === 'congested' || status === 'warning'
          ? 'bg-amber-950/10 border-amber-500/30 hover:border-amber-500/60'
          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
      }`}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-slate-100 group-hover:text-emerald-300 transition-colors">
                {dev.name.split('(')[0]}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-slate-400">{dev.deviceId}</span>
                <span className="text-[10px] text-cyan-400 font-semibold px-1 rounded bg-cyan-500/10">
                  {getZoneLabel(dev.zoneId || dev.category)}
                </span>
              </div>
            </div>
          </div>
          <div>{getStatusBadge(status, stalled, ambulance)}</div>
        </div>

        {/* Road label / subtitle */}
        <p className="text-[11px] text-slate-400 mt-2 line-clamp-1 italic">
          {dev.name.includes('(') ? dev.name.match(/\((.*?)\)/)?.[1] || dev.region : dev.region}
        </p>

        {/* Key Summary Indicators */}
        <div className="grid grid-cols-3 gap-2 mt-3 p-2 rounded-lg bg-slate-950/50 border border-slate-800 text-xs font-mono">
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Max Queue</span>
            <span className={`font-bold ${maxQueue > 140 ? 'text-rose-400 font-extrabold' : 'text-slate-200'}`}>
              {maxQueue}m
            </span>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Speed</span>
            <span className={`font-bold ${avgSpeed < 10 ? 'text-amber-400' : 'text-cyan-400'}`}>
              {avgSpeed} km/h
            </span>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Flow Rate</span>
            <span className="text-emerald-400 font-bold">
              {totalFlow} <span className="text-[9px] font-normal text-slate-500">v/m</span>
            </span>
          </div>
        </div>

        {/* Approaches Status (first 3) */}
        <div className="mt-3 space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
            Approach Signals & Queues
          </span>
          {approaches.slice(0, 3).map((app, idx) => {
            const isGreen = app.signal === 'green';
            const queuePercent = Math.min(100, Math.round(((app.queueLengthM || 40) / 200) * 100));
            return (
              <div key={idx} className="text-[11px] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isGreen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-slate-300 truncate font-mono text-[10px]">
                    {app.road.split('(')[0]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className={`h-full ${
                        queuePercent > 70 ? 'bg-rose-500' : queuePercent > 40 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${queuePercent}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 w-9 text-right">
                    {app.queueLengthM}m
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Vehicle Mix Tags */}
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
          <span className="text-slate-500">Mix:</span>
          <span className="text-cyan-300">2W: {Math.round((vehicleMix.twoWheeler || 0.55) * 100)}%</span>
          <span>•</span>
          <span className="text-emerald-300">Car: {Math.round((vehicleMix.car || 0.3) * 100)}%</span>
          <span>•</span>
          <span className="text-amber-300">Bus: {Math.round((vehicleMix.bus || 0.05) * 100)}%</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
        <button
          onClick={() => onSelectDevice(dev)}
          className="flex-1 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Deep Dive</span>
        </button>

        <button
          onClick={() => onOpenCopilot(dev)}
          className="py-1.5 px-3 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm shadow-purple-500/10"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>AI Copilot</span>
        </button>
      </div>
    </div>
  );
});

export function DeviceGrid({
  devices = [],
  onSelectDevice,
  onOpenCopilot,
  zoneFilter,
  onZoneFilterChange,
}) {
  const [internalZone, setInternalZone] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filterZone = zoneFilter !== undefined ? zoneFilter : internalZone;
  const setFilterZone = (val) => {
    if (onZoneFilterChange) onZoneFilterChange(val);
    else setInternalZone(val);
  };

  const filtered = useMemo(() => {
    return devices.filter((dev) => {
      const zone = dev.zoneId || dev.category;
      const matchesZone = filterZone === 'all' || zone === filterZone;
      const matchesSearch =
        dev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (dev.region && dev.region.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesZone || !matchesSearch) return false;
      if (filterStatus === 'all') return true;

      const live = getJunctionSnapshot(dev.deviceId);
      const status = live?.status || dev.status || 'healthy';
      return status === filterStatus;
    });
  }, [devices, filterZone, searchQuery, filterStatus]);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B101D]/70 p-4 backdrop-blur-md">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            Bengaluru Traffic Junction Matrix
            <span className="text-xs font-mono font-normal text-slate-400">
              ({filtered.length} junctions monitored)
            </span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Real-time camera feed telemetry, approach queues, and adaptive signal phase tracking
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search box */}
          <div className="relative flex-1 md:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search junction / road..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Zone Tabs */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'south-bangalore', label: 'South' },
              { id: 'east-bangalore', label: 'East' },
              { id: 'north-bangalore', label: 'North' },
              { id: 'central-bangalore', label: 'Central' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterZone(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterZone === tab.id
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Status</option>
            <option value="healthy">Flow Normal</option>
            <option value="congested">Heavy Queue</option>
            <option value="gridlock">Gridlock</option>
          </select>
        </div>
      </div>

      {/* Junction Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {filtered.map((dev) => (
          <DeviceCard
            key={dev.deviceId}
            dev={dev}
            onSelectDevice={onSelectDevice}
            onOpenCopilot={onOpenCopilot}
          />
        ))}
      </div>
    </div>
  );
}
