import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Pause, Play, Trash2, Search, Copy, Check, Filter, Navigation, Radio } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const ZONE_OPTIONS = [
  { id: 'all', label: 'All City Cameras (4 Zones • 12 Feeds)' },
  { id: 'south-bangalore', label: 'South Zone (Silk Board, Sony World, Jayadeva)' },
  { id: 'east-bangalore', label: 'East Zone (Bellandur, Marathahalli, Whitefield)' },
  { id: 'north-bangalore', label: 'North Zone (Hebbal, Tin Factory, Mekhri Circle)' },
  { id: 'central-bangalore', label: 'Central Zone (Richmond Circle, Town Hall)' },
];

export function TerminalStreamInspector() {
  const { recentEvents, clearEvents, isPaused, togglePause, joinRoom, leaveRoom, eventsPerSec } = useSocket();
  const [selectedZone, setSelectedZone] = useState('all');
  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const logContainerRef = useRef(null);

  // Subscribe to requested camera telemetry streams on mount and zone changes
  useEffect(() => {
    const zones =
      selectedZone === 'all'
        ? ['zone:south-bangalore', 'zone:east-bangalore', 'zone:north-bangalore', 'zone:central-bangalore']
        : [`zone:${selectedZone}`];

    zones.forEach((z) => joinRoom(z));

    return () => {
      zones.forEach((z) => leaveRoom(z));
    };
  }, [selectedZone, joinRoom, leaveRoom]);

  const filteredEvents = recentEvents.filter((e) => {
    const zId = e.zoneId || e.category;
    if (selectedZone !== 'all' && zId !== selectedZone) return false;
    if (!filterText) return true;
    const text = JSON.stringify(e).toLowerCase();
    return text.includes(filterText.toLowerCase());
  });

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [filteredEvents.length, autoScroll]);

  const copyFrame = (e, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(e, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col font-mono shadow-2xl">
      {/* Terminal Title Bar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200">
            Smart City Camera Telemetry Packet Tap (WebSocket Stream)
          </span>
          <span className="text-[10px] text-slate-500">[{filteredEvents.length} frames buffer]</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
            {eventsPerSec} evt/s
          </span>
        </div>

        {/* Action Controls & Stream Filter */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          {/* Zone Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">TAP:</label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="bg-transparent text-emerald-400 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {ZONE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-slate-950 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Grep Search */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Grep 'Hosur' / 'JNC-BLR-001'..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 pl-7 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

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

          {clearEvents && (
            <button
              onClick={clearEvents}
              title="Clear terminal buffer"
              className="p-1 text-slate-400 hover:text-rose-400 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        ref={logContainerRef}
        className="p-3 bg-[#060A12] text-xs overflow-y-auto max-h-[500px] space-y-2 min-h-[300px]"
      >
        {filteredEvents.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-emerald-400">
              <Radio className="w-4 h-4 animate-pulse" />
              <span className="font-semibold text-xs">
                Awaiting streaming vision frames from {selectedZone === 'all' ? 'All Bengaluru Camera Feeds' : selectedZone}...
              </span>
            </div>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Joined room <span className="text-cyan-400 font-bold font-mono">{selectedZone === 'all' ? 'zone:south-bangalore, zone:east-bangalore, zone:north-bangalore, zone:central-bangalore' : `zone:${selectedZone}`}</span>. Micro-batched optical queue and vehicle classification packets will appear below.
            </p>
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const jId = evt.junctionId || evt.deviceId;
            const zId = evt.zoneId || evt.category;
            const isCorridor = Boolean(evt.data?.inCorridor || evt.data?.adaptiveSignalMode === 'emergency-corridor');

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
                  </div>
                  <div className="flex items-center gap-2">
                    {isCorridor && (
                      <span className="text-blue-400 font-bold px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 animate-pulse">
                        CORRIDOR
                      </span>
                    )}
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                    <button
                      onClick={(e) => copyFrame(evt, evt.eventId)}
                      className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                      title="Copy JSON"
                    >
                      {copiedId === evt.eventId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Formatted JSON Body */}
                <pre className="text-slate-300 overflow-x-auto text-[10px] leading-relaxed p-1">
                  {JSON.stringify(
                    {
                      junctionId: jId,
                      zoneId: zId,
                      timestamp: evt.timestamp,
                      data: evt.data || evt.metrics,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
