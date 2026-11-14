import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Terminal, Pause, Play, Search, Copy, Check, Lock, Unlock, Eye, Sparkles } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

// Memoized Packet Card Component to prevent unnecessary DOM reflows and paint invalidations
const PacketFrame = React.memo(function PacketFrame({ evt, onCopy, isCopied }) {
  const jId = evt.junctionId || evt.deviceId;
  const zId = evt.zoneId || evt.category;
  const isStalled = Boolean(evt.data?.stalledVehicleDetected || evt.metrics?.stalledVehicleDetected);
  const isAmb = Boolean(evt.data?.ambulanceDetected || evt.metrics?.ambulanceDetected);

  const formattedJson = useMemo(() => {
    return JSON.stringify(
      {
        junctionId: jId,
        zoneId: zId,
        timestamp: evt.timestamp,
        data: evt.data || evt.metrics,
      },
      null,
      2
    );
  }, [jId, zId, evt.timestamp, evt.data, evt.metrics]);

  const formattedTime = useMemo(() => {
    try {
      return new Date(evt.timestamp).toLocaleTimeString();
    } catch {
      return '';
    }
  }, [evt.timestamp]);

  return (
    <div className="p-2.5 rounded bg-slate-950/80 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 flex flex-col gap-1.5 text-[11px] select-text">
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
          <span>{formattedTime}</span>
          <button
            onClick={(e) => onCopy(e, evt)}
            className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Copy JSON to clipboard"
          >
            {isCopied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Formatted JSON Body */}
      <pre className="text-slate-300 overflow-x-auto text-[10px] leading-relaxed p-1 font-mono">
        {formattedJson}
      </pre>
    </div>
  );
});

export function TerminalStreamInspector() {
  const { recentEvents, isPaused, togglePause } = useSocket();
  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [freezeOnHover, setFreezeOnHover] = useState(true);
  const [frozenSnapshot, setFrozenSnapshot] = useState(null);

  const logContainerRef = useRef(null);
  const isHoveredRef = useRef(false);
  const userScrolledRef = useRef(false);

  // Filter incoming events
  const filteredEvents = useMemo(() => {
    if (!filterText) return recentEvents;
    const lower = filterText.toLowerCase();
    return recentEvents.filter((e) => {
      const text = `${e.eventId} ${e.junctionId || e.deviceId} ${e.zoneId || e.category} ${JSON.stringify(e.data || e.metrics)}`.toLowerCase();
      return text.includes(lower);
    });
  }, [recentEvents, filterText]);

  // When hover is entered, snapshot the currently displayed events so the view does not shift or jump
  const handleMouseEnter = () => {
    if (!freezeOnHover) return;
    isHoveredRef.current = true;
    setIsHovered(true);
    setFrozenSnapshot(filteredEvents.slice(0, 30));
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    setIsHovered(false);
    setFrozenSnapshot(null);
  };

  const handleResumeStream = () => {
    isHoveredRef.current = false;
    setIsHovered(false);
    setFrozenSnapshot(null);
    userScrolledRef.current = false;
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  };

  // User manual scroll detection
  const handleScroll = (e) => {
    if (!logContainerRef.current) return;
    if (logContainerRef.current.scrollTop > 20) {
      userScrolledRef.current = true;
    } else {
      userScrolledRef.current = false;
    }
  };

  // Only auto-scroll when autoScroll is ON, user hasn't scrolled down, and cursor is NOT hovering
  useEffect(() => {
    if (autoScroll && !isHovered && !userScrolledRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [filteredEvents, autoScroll, isHovered]);

  const copyFrame = useCallback((e, evt) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(evt, null, 2));
    setCopiedId(evt.eventId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Use frozen snapshot if hovered and freezing is active, otherwise latest 30 frames
  const displayList = isHovered && frozenSnapshot ? frozenSnapshot : filteredEvents.slice(0, 30);

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col font-mono shadow-2xl">
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
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Hover Freeze Toggle */}
          <button
            onClick={() => {
              setFreezeOnHover((prev) => !prev);
              if (isHovered) {
                setIsHovered(false);
                setFrozenSnapshot(null);
              }
            }}
            title={freezeOnHover ? 'Freeze on hover is active (prevents jumping under cursor)' : 'Freeze on hover is off'}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border font-semibold transition-colors ${
              freezeOnHover
                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            {freezeOnHover ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>STABLE HOVER</span>
          </button>

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
            onClick={() => {
              setAutoScroll((prev) => !prev);
              userScrolledRef.current = false;
            }}
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

      {/* Hover Freeze Notification Bar */}
      {isHovered && freezeOnHover && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 flex items-center justify-between text-[11px] text-amber-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-semibold">
              Inspection Lock Active • Stream frozen under cursor for stable reading
            </span>
          </div>
          <button
            onClick={handleResumeStream}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[10px] font-bold"
          >
            Resume Live
          </button>
        </div>
      )}

      {/* Terminal Output Area */}
      <div
        ref={logContainerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
        className="p-3 bg-[#060A12] text-xs overflow-y-auto max-h-[500px] space-y-2 overscroll-contain"
        style={{ scrollBehavior: 'auto' }}
      >
        {displayList.length === 0 ? (
          <div className="py-12 text-center text-slate-600">
            Awaiting streaming camera vision frames from Central DC...
          </div>
        ) : (
          displayList.map((evt) => (
            <PacketFrame
              key={evt.eventId}
              evt={evt}
              onCopy={copyFrame}
              isCopied={copiedId === evt.eventId}
            />
          ))
        )}
      </div>
    </div>
  );
}
