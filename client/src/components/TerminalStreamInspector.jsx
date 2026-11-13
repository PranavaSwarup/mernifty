import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Pause, Play, Trash2, Search, Copy, Check, Filter } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function TerminalStreamInspector() {
  const { recentEvents, isPaused, togglePause } = useSocket();
  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
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

  const copyFrame = (e, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(e, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col font-mono">
      {/* Terminal Title Bar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200">
            Live Telemetry Terminal Stream (WebSocket Ingestion Tap)
          </span>
          <span className="text-[10px] text-slate-500">[{recentEvents.length} frames buffer]</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Grep packet..."
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
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        ref={logContainerRef}
        className="p-3 bg-[#060A12] text-xs overflow-y-auto max-h-96 space-y-1.5"
      >
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-slate-600">
            Awaiting streaming frames...
          </div>
        ) : (
          filteredEvents.map((evt) => (
            <div
              key={evt.eventId}
              className="group p-2 rounded bg-slate-950/60 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 transition-colors flex items-start justify-between gap-3 text-[11px]"
            >
              <div className="flex-1 space-y-0.5 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{new Date(evt.timestamp).toISOString().slice(11, 23)}</span>
                  <span className="font-bold text-emerald-400">[{evt.deviceId}]</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300">
                    {evt.category}
                  </span>
                  <span className="text-slate-600 text-[10px]">seq:{evt.sequence || 0}</span>
                </div>
                <div className="text-slate-300 truncate font-mono text-[11px]">
                  {Object.entries(evt.metrics || {}).map(([k, v]) => (
                    <span key={k} className="mr-3">
                      <span className="text-cyan-400">{k}:</span>{' '}
                      <span className="text-white font-semibold">{v}</span>
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={(e) => copyFrame(evt, evt.eventId)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-white"
                title="Copy raw JSON frame"
              >
                {copiedId === evt.eventId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
