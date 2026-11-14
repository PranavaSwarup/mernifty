import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Search,
  Copy,
  Check,
  WifiOff,
  RotateCcw,
  Binary,
  FileJson,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function TerminalStreamInspector() {
  const {
    recentEvents,
    isPaused,
    togglePause,
    isConnected,
    stats,
    schema,
    lastReplayStats,
    disconnectCountdownSec,
    simulateDisconnect,
  } = useSocket();
  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewMode, setViewMode] = useState('decoded'); // 'decoded' | 'tuple'
  const [copiedId, setCopiedId] = useState(null);
  const logContainerRef = useRef(null);

  const filteredEvents = recentEvents.filter((e) => {
    if (!filterText) return true;
    const text = JSON.stringify(e).toLowerCase();
    return text.includes(filterText.toLowerCase());
  });

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [recentEvents, autoScroll]);

  const copyFrame = (e, id, payload) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const wireComp = stats?.wireComparison;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col font-mono">
      {/* Terminal Title Bar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200">
            Smart City Camera Telemetry Packet Tap (Wire v1 Stream)
          </span>
          <span className="text-[10px] text-slate-500">[{recentEvents.length} frames buffer]</span>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Grep 'Hosur' / 'stalled'..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 pl-7 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Wire Format Toggle */}
          <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800 text-[10px]">
            <button
              onClick={() => setViewMode('decoded')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                viewMode === 'decoded'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileJson className="w-3 h-3" />
              <span>Decoded Schema JSON</span>
            </button>
            <button
              onClick={() => setViewMode('tuple')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                viewMode === 'tuple'
                  ? 'bg-purple-500/20 text-purple-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Binary className="w-3 h-3" />
              <span>Compact Tuples</span>
            </button>
          </div>

          {/* Simulate Disconnect 10 s */}
          <button
            onClick={() => simulateDisconnect(10000)}
            disabled={disconnectCountdownSec > 0}
            className={`px-2.5 py-1 text-[10px] rounded border flex items-center gap-1.5 transition-colors font-bold ${
              disconnectCountdownSec > 0
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : 'bg-slate-900 hover:bg-rose-500/15 text-rose-300 border-rose-500/30'
            }`}
          >
            <WifiOff className="w-3 h-3" />
            <span>
              {disconnectCountdownSec > 0
                ? `Reconnecting in ${disconnectCountdownSec}s...`
                : 'Simulate disconnect 10 s'}
            </span>
          </button>

          <button
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`px-2 py-1 text-[10px] rounded border transition-colors ${
              autoScroll
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {autoScroll ? 'AUTO-PIN: ON' : 'AUTO-PIN: OFF'}
          </button>

          <button
            onClick={togglePause}
            className={`px-2 py-1 text-[10px] rounded border transition-colors ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {isPaused ? 'PAUSED' : 'STREAMING'}
          </button>
        </div>
      </div>

      {/* Wire v1 & Resume Telemetry Bar */}
      <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Schema v{schema?.v ?? 1} ({schema?.junctionIds?.length ?? 12} junctions indexed)
          </span>
          {wireComp && (
            <span className="text-emerald-300">
              Wire savings: full {wireComp.fullBytesPerEvent}B → tuple {wireComp.zoneWireBytesPerEvent}B (
              <strong>-{wireComp.zoneSavingsPct}%</strong>)
            </span>
          )}
          <span className="text-cyan-300">
            Egress: {(stats?.socketBytesPerSec || 0).toLocaleString()} B/s | Coalesced:{' '}
            {stats?.socketCoalescedCount || 0}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!isConnected && disconnectCountdownSec === 0 && (
            <span className="text-rose-400 font-bold">DISCONNECTED</span>
          )}
          {lastReplayStats && (
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              replayed {lastReplayStats.replayed} frames, {lastReplayStats.fromMemory} from memory,{' '}
              {lastReplayStats.fromDb} from DB, gap {lastReplayStats.gap}
              {lastReplayStats.clipped ? ' (clipped)' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        ref={logContainerRef}
        className="p-3 bg-[#060A12] text-xs overflow-y-auto max-h-[500px] space-y-2"
      >
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-slate-600">
            Awaiting streaming camera vision frames from Central DC...
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const jId = evt.junctionId || evt.deviceId;
            const zId = evt.zoneId || evt.category;
            const isStalled = Boolean(
              evt.data?.stalledVehicleDetected || evt.metrics?.stalledVehicleDetected
            );
            const isAmb = Boolean(evt.data?.ambulanceDetected || evt.metrics?.ambulanceDetected);

            const displayPayload =
              viewMode === 'tuple'
                ? {
                    wireVersion: evt._wire?.v || 1,
                    kind: evt._wire?.kind || 'replay',
                    tuple: evt._wire?.tuple || null,
                    schemaLegend:
                      '[jIdx, seq, tMsDelta, statusIdx, flow, maxQ, speed10, score, controllerIdx, flags?, approaches?, mix4?, kpi?]',
                  }
                : {
                    junctionId: jId,
                    zoneId: zId,
                    sequence: evt.sequence,
                    timestamp: evt.timestamp,
                    data: evt.data || evt.metrics,
                  };

            return (
              <div
                key={evt.eventId}
                className="group p-2.5 rounded bg-slate-950/70 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 transition-colors flex flex-col gap-1.5 text-[11px]"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1 border-b border-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">{evt.eventId}</span>
                    <span className="text-cyan-400 font-semibold">[{jId}]</span>
                    <span className="text-purple-400 font-medium">{zId}</span>
                    {evt._wire && (
                      <span className="px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/20">
                        wire:{evt._wire.kind}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAmb && (
                      <span className="text-blue-400 font-bold px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 animate-pulse">
                        AMBULANCE
                      </span>
                    )}
                    {isStalled && (
                      <span className="text-rose-400 font-bold px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 animate-pulse">
                        STALLED
                      </span>
                    )}
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                    <button
                      onClick={(e) => copyFrame(e, evt.eventId, displayPayload)}
                      className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                      title="Copy payload"
                    >
                      {copiedId === evt.eventId ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Tuple or Decoded Schema JSON Body */}
                <pre className="text-slate-300 overflow-x-auto text-[10px] leading-relaxed p-1">
                  {JSON.stringify(displayPayload, null, viewMode === 'tuple' ? 0 : 2)}
                </pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
