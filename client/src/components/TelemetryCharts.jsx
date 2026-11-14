import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Database, Radio } from 'lucide-react';
import {
  useSocket,
  useJunctionLive,
  getJunctionSnapshot,
} from '../context/SocketContext';
import { api } from '../services/api';
import { createHistoryLiveState, mergeLiveFrame } from '../utils/historyMerge';

export function TelemetryCharts({ devices = [] }) {
  const { isPaused, subscribeDevice, unsubscribeDevice } = useSocket();
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [windowPoints, setWindowPoints] = useState(120);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [historyState, setHistoryState] = useState(() =>
    createHistoryLiveState([], 0, 1200)
  );
  const historyReadyForRef = useRef(null);
  const liveEvt = useJunctionLive(selectedDeviceId);

  // Filter devices by zone
  const filteredDevices = useMemo(() => {
    if (selectedZone === 'all') return devices;
    return devices.filter(
      (d) => d.category === selectedZone || d.zoneId === selectedZone
    );
  }, [devices, selectedZone]);

  // Set default selected junction
  useEffect(() => {
    if (
      filteredDevices.length > 0 &&
      (!selectedDeviceId ||
        !filteredDevices.some((d) => d.deviceId === selectedDeviceId))
    ) {
      setSelectedDeviceId(filteredDevices[0].deviceId);
    }
  }, [filteredDevices, selectedDeviceId]);

  // Fetch /api/telemetry/history?junctionId=...&limit=1200, subscribe to junction room, and seed merge state
  useEffect(() => {
    if (!selectedDeviceId) return;
    let cancelled = false;

    historyReadyForRef.current = null;
    setIsLoadingHistory(true);
    setHistoryState(createHistoryLiveState([], 0, 1200));
    subscribeDevice(selectedDeviceId);

    api
      .getHistory({ junctionId: selectedDeviceId, limit: 1200 })
      .then((res) => {
        if (cancelled) return;
        const records = Array.isArray(res?.records) ? res.records : [];
        const serverCursor =
          Number(res?.maxSequence) ||
          Number(res?.cursor?.[selectedDeviceId]) ||
          0;
        let nextState = createHistoryLiveState(records, serverCursor, 1200);

        // Reconcile latest buffered live frame without duplicating historical records
        const currentLive = getJunctionSnapshot(selectedDeviceId);
        if (currentLive && !isPaused) {
          nextState = mergeLiveFrame(nextState, currentLive);
        }

        historyReadyForRef.current = selectedDeviceId;
        setHistoryState(nextState);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch junction history:', err);
          historyReadyForRef.current = selectedDeviceId;
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
      unsubscribeDevice(selectedDeviceId);
    };
  }, [selectedDeviceId, subscribeDevice, unsubscribeDevice]);

  // Merge new live frame into reconciled timeline strictly for sequence > cursor
  useEffect(() => {
    if (isPaused || !selectedDeviceId || !liveEvt) return;
    const evtJunction = liveEvt.junctionId || liveEvt.deviceId;
    if (evtJunction !== selectedDeviceId) return;
    if (historyReadyForRef.current !== selectedDeviceId) return;

    setHistoryState((prev) => mergeLiveFrame(prev, liveEvt));
  }, [liveEvt, selectedDeviceId, isPaused]);

  const displayedPoints = useMemo(() => {
    return historyState.points.slice(-windowPoints);
  }, [historyState.points, windowPoints]);

  const seamVisible = Boolean(
    historyState.seamLabel &&
      displayedPoints.some((p) => p.timestamp === historyState.seamLabel)
  );

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
              Real-time optical queue accumulation & corridor velocity dynamics (history + live merge)
            </p>
          </div>
        </div>

        {/* Junction & Window Selectors */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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

          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-semibold focus:outline-none focus:border-emerald-500 max-w-[210px] truncate"
          >
            {filteredDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name.split('(')[0]} ({d.deviceId})
              </option>
            ))}
          </select>

          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            {[60, 120, 300, 1200].map((pts) => (
              <button
                key={pts}
                onClick={() => setWindowPoints(pts)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  windowPoints === pts
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {pts === 1200 ? '1200' : `${pts}p`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History + Live Merge Counters */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <Database className="w-3 h-3 text-cyan-400" />
            Historical: <strong>{historyState.historicalCount}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-emerald-300">
            <Radio className="w-3 h-3 text-emerald-400" />
            Live: <strong>{historyState.liveCount}</strong>
          </span>
          <span className="text-amber-300">
            Duplicates suppressed: <strong>{historyState.duplicateSuppressed}</strong>
          </span>
        </div>
        <div className="text-[10px] text-slate-400">
          {isLoadingHistory ? (
            <span>Loading 1200-pt history...</span>
          ) : historyState.seamLabel ? (
            <span className="text-emerald-400 font-semibold">
              Seam: live since {historyState.seamLabel} (cursor #{historyState.cursor})
            </span>
          ) : (
            <span>Cursor #{historyState.cursor} • awaiting live frame</span>
          )}
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
              <AreaChart data={displayedPoints}>
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
                {seamVisible && (
                  <ReferenceLine
                    x={historyState.seamLabel}
                    stroke="#10B981"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `live since ${historyState.seamLabel}`,
                      position: 'insideTopRight',
                      fill: '#34D399',
                      fontSize: 10,
                    }}
                  />
                )}
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
              <AreaChart data={displayedPoints}>
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
                {seamVisible && (
                  <ReferenceLine
                    x={historyState.seamLabel}
                    stroke="#10B981"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `live since ${historyState.seamLabel}`,
                      position: 'insideTopRight',
                      fill: '#34D399',
                      fontSize: 10,
                    }}
                  />
                )}
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
