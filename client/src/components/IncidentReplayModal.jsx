import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  X as CloseIcon,
  AlertTriangle,
  Flame,
  CheckCircle,
  Siren,
  Clock,
  Activity,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';

export function IncidentReplayModal({ alertId, tripId, onClose }) {
  const [replayData, setReplayData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Playback state
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 4x

  const timerRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const fetchPromise = alertId
      ? api.getAlertReplay(alertId)
      : tripId
      ? api.getCorridorReplay(tripId)
      : Promise.reject(new Error('No incident ID provided'));

    fetchPromise
      .then((res) => {
        if (res.telemetry && res.telemetry.length > 0) {
          setReplayData(res);
          setCurrentFrameIndex(0);
        } else {
          setError('No telemetry records found for this incident window.');
        }
      })
      .catch((err) => setError(err.message || 'Failed to load replay data.'))
      .finally(() => setLoading(false));
  }, [alertId, tripId]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !replayData?.telemetry?.length) return;

    const intervalMs = Math.max(100, Math.round(500 / playbackSpeed));
    timerRef.current = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        if (prev >= replayData.telemetry.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, replayData]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="bg-[#0B101D] border border-slate-800 rounded-2xl p-6 text-center text-slate-300 font-mono text-sm max-w-md w-full">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span>Fetching incident window telemetry from MongoDB...</span>
        </div>
      </div>
    );
  }

  if (error || !replayData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="bg-[#0B101D] border border-rose-500/40 rounded-2xl p-6 text-center text-slate-200 font-mono text-sm max-w-md w-full">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
          <h4 className="font-bold text-white mb-1">Replay Notice</h4>
          <p className="text-slate-400 text-xs mb-4">{error || 'Incident telemetry unavailable.'}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const frames = replayData.telemetry || [];
  const totalFrames = frames.length;
  const currentFrame = frames[currentFrameIndex] || frames[0];
  const progressPct = totalFrames > 1 ? Math.round((currentFrameIndex / (totalFrames - 1)) * 100) : 0;

  const incidentTitle = replayData.alert?.title || replayData.trip?.tripId || 'Traffic Incident';
  const incidentRoad = replayData.alert?.affectedRoad || replayData.alert?.junctionId;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070A12]/95 backdrop-blur-lg overflow-hidden">
      {/* 1. Mandatory Distinct Replay Header Banner (Section 5.15) */}
      <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-b border-amber-500/40 px-4 sm:px-6 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <RotateCcw className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-400/50 text-[10px] font-bold font-mono tracking-wider uppercase">
                ⏮ INCIDENT REPLAY MODE
              </span>
              <span className="text-xs font-mono text-slate-400">(Live feed disconnected)</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
              {incidentTitle} • {incidentRoad}
            </h3>
          </div>
        </div>

        {/* Return to Live Button */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs font-mono transition-all shadow-lg shadow-emerald-500/30"
        >
          <CloseIcon className="w-4 h-4" />
          <span>Return to Live Feeds</span>
        </button>
      </div>

      {/* 2. Main Playback & Incident Timeline Scrubber */}
      <div className="bg-[#0B101D] border-b border-slate-800 p-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 font-mono text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Frame Timestamp:</span>
            <span className="text-cyan-300 font-bold">
              {currentFrame?.timestamp ? new Date(currentFrame.timestamp).toLocaleTimeString() : '--'}
            </span>
            <span className="text-slate-500">• Frame {currentFrameIndex + 1} of {totalFrames}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              onClick={() => setCurrentFrameIndex(0)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Restart"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-1 rounded font-bold transition-colors ${
                    playbackSpeed === spd ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrubber slider */}
        <div className="relative flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={currentFrameIndex}
            onChange={(e) => {
              setCurrentFrameIndex(parseInt(e.target.value, 10));
              setIsPlaying(false);
            }}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <span className="text-xs font-mono font-bold text-slate-400 min-w-[45px] text-right">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* 3. Replay Content Body */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 max-w-6xl w-full mx-auto">
        {/* Incident Summary Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-slate-800 bg-[#0B101D]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
              Target Junction
            </span>
            <div className="text-base font-bold text-slate-100 mt-1">
              {currentFrame?.junctionName || currentFrame?.deviceName || currentFrame?.junctionId}
            </div>
            <div className="text-xs font-mono text-cyan-400 mt-0.5">
              Zone: {currentFrame?.zoneName || currentFrame?.zoneId}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-[#0B101D]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
              Replayed Metrics Snapshot
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-mono">
              <div>
                <span className="text-slate-500 block text-[10px]">CONGESTION</span>
                <span className="font-bold text-amber-400">
                  {currentFrame?.data?.congestionScore || currentFrame?.metrics?.congestionScore || 40}/100
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">AVG SPEED</span>
                <span className="font-bold text-cyan-400">
                  {currentFrame?.data?.avgSpeedKmph || currentFrame?.metrics?.avgSpeedKmph || 18} km/h
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">MAX QUEUE</span>
                <span className="font-bold text-rose-400">
                  {currentFrame?.data?.maxQueueLengthM || currentFrame?.metrics?.maxQueueLengthM || 50}m
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">SIGNAL MODE</span>
                <span className="font-bold text-slate-200">
                  {currentFrame?.data?.adaptiveSignalMode || 'dynamic-ai'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-[#0B101D]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
              Incident Context & Remediation
            </span>
            <div className="mt-1.5 text-xs text-slate-300 space-y-1">
              <div><b className="text-slate-400">Cause:</b> {replayData.alert?.cause || 'unknown'}</div>
              <div><b className="text-slate-400">Status:</b> {replayData.alert?.status || 'resolved'}</div>
              <div><b className="text-slate-400">Action:</b> {replayData.alert?.actionApplied || replayData.alert?.suggestedAction?.action || 'extend_green'}</div>
            </div>
          </div>
        </div>

        {/* Approaches at this Replay Frame */}
        {currentFrame?.data?.approaches && (
          <div className="p-4 rounded-xl border border-slate-800 bg-[#0B101D]">
            <h4 className="font-bold text-xs text-slate-200 uppercase tracking-wider mb-3 font-mono">
              Approach Lanes State at Replayed Frame
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {currentFrame.data.approaches.map((app, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border ${
                    app.signal === 'green' ? 'bg-emerald-950/20 border-emerald-500/40' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono pb-2 border-b border-slate-800/80">
                    <span className="font-bold text-slate-200 truncate">{app.road}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      app.signal === 'green' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {app.signal}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Queue</span>
                      <span className={`font-bold ${app.queueLengthM > 120 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {app.queueLengthM}m
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Speed</span>
                      <span className="font-bold text-cyan-400">{app.avgSpeedKmph} km/h</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

