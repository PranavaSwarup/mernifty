import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle,
  Volume2,
  VolumeX,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';

export function AlertsFeed({ alerts = [], onAlertsChange }) {
  const { setAlerts } = useSocket();
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  // Filter alerts by severity
  const filtered = alerts.filter((a) => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  const handleResolve = async (alertId) => {
    setResolvingId(alertId);
    try {
      await api.resolveAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a.alertId === alertId ? { ...a, resolved: true } : a))
      );
      if (onAlertsChange) onAlertsChange();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const handleClearResolved = async () => {
    try {
      await api.clearResolvedAlerts();
      setAlerts((prev) => prev.filter((a) => !a.resolved));
      if (onAlertsChange) onAlertsChange();
    } catch (err) {
      console.error('Failed to clear resolved alerts:', err);
    }
  };

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'critical':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
            <AlertOctagon className="w-3 h-3 text-rose-400" />
            CRITICAL
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            WARNING
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <Info className="w-3 h-3 text-cyan-400" />
            INFO
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B101D]/70 p-4 backdrop-blur-md flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              Live Anomaly Feed
              {alerts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {alerts.length}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              Statistical Z-Score & Dynamic Threshold Detection
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={soundEnabled ? 'Mute alert chime' : 'Enable alert sound'}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={handleClearResolved}
            title="Clear resolved alerts"
            className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px] my-3">
        {['all', 'critical', 'warning'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterSeverity(s)}
            className={`flex-1 py-1 rounded-md capitalize font-medium transition-colors ${
              filterSeverity === s ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 max-h-96 pr-1">
        {filtered.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs gap-1">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            <span>No active anomalies detected</span>
            <span className="text-[10px] text-slate-600">All monitored metrics nominal</span>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.alertId || item._id}
              className={`p-3 rounded-lg border transition-all ${
                item.resolved
                  ? 'bg-slate-950/40 border-slate-800/40 opacity-60'
                  : item.severity === 'critical'
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : 'bg-amber-950/20 border-amber-900/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                {getSeverityBadge(item.severity)}
                <span className="text-[10px] font-mono text-slate-400">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <div className="mt-1.5 font-bold text-xs text-slate-200">{item.title}</div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{item.message}</p>

              <div className="mt-2 pt-2 border-t border-slate-800/50 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500">{item.deviceId}</span>
                {item.resolved ? (
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Resolved
                  </span>
                ) : (
                  <button
                    onClick={() => handleResolve(item.alertId)}
                    disabled={resolvingId === item.alertId}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    {resolvingId === item.alertId ? 'Resolving...' : 'Acknowledge & Resolve'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
