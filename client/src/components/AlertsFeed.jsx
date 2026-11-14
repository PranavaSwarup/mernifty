import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle,
  Volume2,
  VolumeX,
  Trash2,
  Clock,
  Zap,
  RotateCcw,
  Tag,
  Shield,
  UserCheck,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export function AlertsFeed({ alerts = [], onAlertsChange }) {
  const { setAlerts } = useSocket();
  const { user } = useAuth();
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [actingAlertId, setActingAlertId] = useState(null);
  const [taggingAlertId, setTaggingAlertId] = useState(null);
  const [selectedCause, setSelectedCause] = useState('accident');
  const [causeNote, setCauseNote] = useState('');
  const [nowTime, setNowTime] = useState(Date.now());

  // 1-second interval to update live countdown timers
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isOfficerOrAdmin = user?.role === 'admin' || user?.role === 'officer';

  const checkAreaAuth = (alert) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'officer') {
      if (user.assignedZoneId && user.assignedZoneId === alert.zoneId) return true;
      if (user.assignedJunctionId && user.assignedJunctionId === (alert.junctionId || alert.deviceId)) return true;
    }
    return false;
  };

  const handleApplyAction = async (alert, action = null) => {
    const targetAction = action || alert.suggestedAction?.action || 'extend_green';
    setActingAlertId(alert.alertId);
    try {
      const res = await api.applyAlertAction(alert.alertId, targetAction, 'Officer manual action application');
      setAlerts((prev) =>
        prev.map((a) => (a.alertId === alert.alertId ? { ...a, ...res.alert } : a))
      );
      if (onAlertsChange) onAlertsChange();
    } catch (err) {
      alert(`Action error: ${err.message}`);
    } finally {
      setActingAlertId(null);
    }
  };

  const handleAcknowledge = async (alertId) => {
    setActingAlertId(alertId);
    try {
      const res = await api.acknowledgeAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a.alertId === alertId ? { ...a, ...res.alert } : a))
      );
      if (onAlertsChange) onAlertsChange();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setActingAlertId(null);
    }
  };

  const handleOverride = async (alertId) => {
    setActingAlertId(alertId);
    try {
      const res = await api.overrideAlertAction(alertId, 'Officer override to manual signal timing');
      setAlerts((prev) =>
        prev.map((a) => (a.alertId === alertId ? { ...a, ...res.alert } : a))
      );
      if (onAlertsChange) onAlertsChange();
    } catch (err) {
      alert(`Override error: ${err.message}`);
    } finally {
      setActingAlertId(null);
    }
  };

  const handleTagCause = async (alertId) => {
    setActingAlertId(alertId);
    try {
      const res = await api.tagAlertCause(alertId, selectedCause, causeNote);
      setAlerts((prev) =>
        prev.map((a) => (a.alertId === alertId ? { ...a, ...res.alert } : a))
      );
      setTaggingAlertId(null);
      setCauseNote('');
      if (onAlertsChange) onAlertsChange();
    } catch (err) {
      alert(`Tagging error: ${err.message}`);
    } finally {
      setActingAlertId(null);
    }
  };

  const handleResolve = async (alertId) => {
    setActingAlertId(alertId);
    try {
      await api.resolveAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a.alertId === alertId ? { ...a, resolved: true, status: 'resolved' } : a))
      );
      if (onAlertsChange) onAlertsChange();
    } catch (err) {
      alert(`Resolve error: ${err.message}`);
    } finally {
      setActingAlertId(null);
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

  const filtered = alerts.filter((a) => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

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
              Incident & Adaptive Remediation Feed
              {alerts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {alerts.length}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              Measured Jams, Sudden Blockages, 3m Countdown & Auto-Remediation
            </p>
          </div>
        </div>

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
        {['all', 'critical', 'warning', 'info'].map((s) => (
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
      <div className="flex-1 overflow-y-auto space-y-3 max-h-[460px] pr-1">
        {filtered.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs gap-1">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            <span>No active anomalies detected</span>
            <span className="text-[10px] text-slate-600">All monitored BLR corridors nominal</span>
          </div>
        ) : (
          filtered.map((item) => {
            const hasAuth = checkAreaAuth(item);
            const isResolved = item.resolved || item.status === 'resolved';

            // Calculate remaining seconds for countdown
            let secondsRemaining = 0;
            if (item.status === 'open' && item.suggestedAction?.deadline) {
              const deadlineMs = new Date(item.suggestedAction.deadline).getTime();
              secondsRemaining = Math.max(0, Math.round((deadlineMs - nowTime) / 1000));
            }

            return (
              <div
                key={item.alertId || item._id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isResolved
                    ? 'bg-slate-950/40 border-slate-800/40 opacity-60'
                    : item.severity === 'critical'
                    ? 'bg-rose-950/25 border-rose-900/50'
                    : item.severity === 'warning'
                    ? 'bg-amber-950/20 border-amber-900/40'
                    : 'bg-cyan-950/15 border-cyan-900/30'
                }`}
              >
                {/* Top bar: Severity + Timestamp + Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getSeverityBadge(item.severity)}
                    <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-slate-900 border border-slate-800 text-slate-300">
                      {item.status || 'open'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* Title & Message */}
                <div className="mt-2 font-bold text-xs text-slate-100">{item.title}</div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{item.message}</p>

                {/* Cause badge (Sensors tell us what; people tell us why) */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                  <span className="text-slate-400">Cause:</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${
                    item.cause === 'unknown'
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  }`}>
                    {item.cause || 'unknown'}
                  </span>
                  {item.causeSource && item.causeSource !== 'unknown' && (
                    <span className="text-slate-500">
                      via {item.causeSource === 'citizen_report' ? '👥 Citizen Report' : '👮 Officer'}
                    </span>
                  )}
                  {item.affectedRoad && (
                    <span className="text-amber-400/90 ml-auto">📍 {item.affectedRoad}</span>
                  )}
                </div>

                {/* Section 5.10: Auto-Remediation Countdown Banner */}
                {!isResolved && item.status === 'open' && item.suggestedAction && (
                  <div className="mt-2.5 p-2 rounded-lg bg-slate-900/90 border border-amber-500/30 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-amber-300">
                      <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                      <span className="font-bold">
                        {secondsRemaining > 0 ? `Auto-fix in ${secondsRemaining}s:` : 'Executing auto-fix...'}
                      </span>
                      <span className="text-slate-300 ml-1 font-mono">{item.suggestedAction.action}</span>
                    </div>
                    {hasAuth && (
                      <button
                        onClick={() => handleAcknowledge(item.alertId)}
                        disabled={actingAlertId === item.alertId}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700"
                        title="Officer acknowledges alert, pausing automated deadline"
                      >
                        Acknowledge (Pause)
                      </button>
                    )}
                  </div>
                )}

                {/* Action Applied Banner */}
                {(item.status === 'action_applied' || item.status === 'auto_applied') && (
                  <div className="mt-2.5 p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-[11px] flex items-center justify-between">
                    <span className="text-emerald-300 font-mono flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      Applied: <strong className="text-white">{item.actionApplied?.action || 'extend_green'}</strong> ({item.actionApplied?.appliedBy || 'system'})
                    </span>
                    {hasAuth && (
                      <button
                        onClick={() => handleOverride(item.alertId)}
                        disabled={actingAlertId === item.alertId}
                        className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/40 flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Override
                      </button>
                    )}
                  </div>
                )}

                {/* Tagging form dropdown if opened */}
                {taggingAlertId === item.alertId && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-slate-900 border border-purple-500/40 space-y-2 text-xs">
                    <div className="font-bold text-purple-300">Tag Incident Cause:</div>
                    <div className="flex gap-2">
                      <select
                        value={selectedCause}
                        onChange={(e) => setSelectedCause(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs flex-1"
                      >
                        <option value="accident">Accident / Collision</option>
                        <option value="road_blocked">Road Blocked / Obstacle</option>
                        <option value="waterlogging">Waterlogging</option>
                        <option value="signal_not_working">Signal Failure</option>
                        <option value="construction">Construction Backlog</option>
                      </select>
                      <button
                        onClick={() => handleTagCause(item.alertId)}
                        disabled={actingAlertId === item.alertId}
                        className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom Controls Bar */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-slate-400 text-[10px]">{item.deviceId} ({item.zoneId})</span>

                  <div className="flex items-center gap-2">
                    {/* Tag Cause Button */}
                    {!isResolved && hasAuth && (
                      <button
                        onClick={() => setTaggingAlertId(taggingAlertId === item.alertId ? null : item.alertId)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 text-[10px] flex items-center gap-1"
                      >
                        <Tag className="w-3 h-3" />
                        Tag Cause
                      </button>
                    )}

                    {/* Apply Suggested Action Button */}
                    {!isResolved && hasAuth && item.suggestedAction && (
                      <button
                        onClick={() => handleApplyAction(item)}
                        disabled={actingAlertId === item.alertId}
                        className="px-2.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        Apply Fix
                      </button>
                    )}

                    {/* Resolve Button */}
                    {!isResolved && hasAuth && (
                      <button
                        onClick={() => handleResolve(item.alertId)}
                        disabled={actingAlertId === item.alertId}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px]"
                      >
                        Resolve
                      </button>
                    )}

                    {!hasAuth && isOfficerOrAdmin && (
                      <span className="text-[10px] text-slate-500 italic">
                        Assigned area only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
