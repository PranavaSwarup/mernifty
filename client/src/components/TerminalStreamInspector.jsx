import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Pause, Play, Trash2, Search, Copy, Check, Filter, Navigation } from 'lucide-react';
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
            Smart City Camera Telemetry Packet Tap (WebSocket Stream)
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
              placeholder="Grep 'Hosur' / 'stalled'..."
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
            const approaches = evt.data?.approaches || [];
            const isStalled = Boolean(evt.data?.stalledVehicleDetected || evt.metrics?.stalledVehicleDetected);
            const isAmb = Boolean(evt.data?.ambulanceDetected || evt.metrics?.ambulanceDetected);

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
