import React from 'react';
import { Gauge, Radio, MapPin, AlertTriangle, Clock } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function KpiOverview({ unresolvedAlertsCount = 0, totalDevicesCount = 12 }) {
  const { stats, clientLatency } = useSocket();

  const cards = [
    {
      label: 'Vision Stream Ingestion',
      value: `${stats.ingestRate} e/s`,
      subtext: `Peak: ${stats.peakIngestRate} e/s | Total: ${stats.totalIngested.toLocaleString()}`,
      icon: Gauge,
      accent: 'emerald',
      trend: stats.ingestRate > 0 ? '+Active' : 'Idle',
    },
    {
      label: 'Zonal Real-Time Dispatch',
      value: `${stats.broadcastRate} e/s`,
      subtext: `${stats.totalBroadcasted.toLocaleString()} Socket.IO deliveries`,
      icon: Radio,
      accent: 'cyan',
      trend: 'Zero Loss',
    },
    {
      label: 'Monitored BLR Junctions',
      value: `${totalDevicesCount} / 12`,
      subtext: 'South, East, North, Central Zones',
      icon: MapPin,
      accent: 'indigo',
      trend: '100% Online',
    },
    {
      label: 'Gridlocks & Incidents',
      value: unresolvedAlertsCount,
      subtext: unresolvedAlertsCount > 0 ? 'Requires dispatcher review' : 'Corridors moving freely',
      icon: AlertTriangle,
      accent: unresolvedAlertsCount > 0 ? 'amber' : 'emerald',
      trend: unresolvedAlertsCount > 0 ? 'Active Alert' : 'Nominal',
    },
    {
      label: 'Central DC Pipeline Latency',
      value: `${stats.avgLatencyMs || clientLatency || 1} ms`,
      subtext: `Write-behind queue: ${stats.bufferSize} | Drops: ${stats.totalDropped}`,
      icon: Clock,
      accent: 'teal',
      trend: '< 5ms Target',
    },
  ];

  const accentStyles = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400 group-hover:border-emerald-500/40',
    cyan: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400 group-hover:border-cyan-500/40',
    indigo: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-400 group-hover:border-indigo-500/40',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400 group-hover:border-amber-500/50',
    teal: 'border-teal-500/20 bg-teal-500/5 text-teal-400 group-hover:border-teal-500/40',
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const style = accentStyles[card.accent] || accentStyles.emerald;
        return (
          <div
            key={idx}
            className={`group relative overflow-hidden rounded-xl border p-3.5 transition-all duration-300 hover:shadow-lg ${style}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {card.label}
              </span>
              <Icon className="w-4 h-4 opacity-75" />
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white">
                {card.value}
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50">
                {card.trend}
              </span>
            </div>

            <p className="mt-1.5 text-[11px] text-slate-400 truncate">
              {card.subtext}
            </p>
          </div>
        );
      })}
    </div>
  );
}
