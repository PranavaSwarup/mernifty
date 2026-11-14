import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Activity,
  HardDrive,
  CheckCircle2,
  AlertOctagon,
  Play,
  WifiOff,
  RotateCcw,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';

export function PerformanceBenchmark() {
  const {
    stats,
    clientLatency,
    clientE2eStats,
    obsUpdate,
    benchProgress,
    isConnected,
    lastReplayStats,
    disconnectCountdownSec,
    simulateDisconnect,
  } = useSocket();
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [recordedRuns, setRecordedRuns] = useState([]);
  const [benchError, setBenchError] = useState(null);
  const [isProbingLive, setIsProbingLive] = useState(false);
  const [fps, setFps] = useState(60);

  // Client-side FPS measurement to verify zero UI degradation
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  useEffect(() => {
    let animId;
    const loop = (time) => {
      frameCountRef.current++;
      if (time - lastFpsTimeRef.current >= 1000) {
        const computedFps = Math.round(
          (frameCountRef.current * 1000) / (time - lastFpsTimeRef.current)
        );
        setFps(computedFps);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = time;
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const loadRecordedBenchmarks = async () => {
    try {
      const data = await api.getBenchmarks();
      if (Array.isArray(data?.runs)) {
        setRecordedRuns(data.runs.filter((r) => r.kind === 'load-benchmark'));
      }
    } catch {
      // Ignore if endpoint unavailable
    }
  };

  useEffect(() => {
    loadRecordedBenchmarks();
  }, []);

  const runLiveEngineeringProbe = async () => {
    setIsProbingLive(true);
    setBenchError(null);
    try {
      await api.runLiveBenchmark({ durationSec: 10 });
    } catch (err) {
      setBenchError(err.message);
    } finally {
      setIsProbingLive(false);
    }
  };

  const runBrowserStressTest = async (count = 500) => {
    setIsStressTesting(true);
    setTestResult(null);

    const startTime = performance.now();
    const now = Date.now();
    const events = [];

    for (let i = 0; i < count; i++) {
      events.push({
        eventId: `BENCH-${now}-${i}`,
        junctionId: 'JNC-BLR-001',
        deviceId: 'JNC-BLR-001',
        zoneId: 'south-bangalore',
        category: 'south-bangalore',
        timestamp: new Date(now + i).toISOString(),
        sequence: now + i,
        status: 'healthy',
        data: {
          approaches: [
            {
              road: 'Hosur Rd (from south)',
              dir: 'S',
              lanes: 3,
              vehiclesPerMin: 52,
              queueLengthM: 48,
              avgSpeedKmph: 24.5,
              signal: 'green',
            },
            {
              road: 'ORR (from east)',
              dir: 'E',
              lanes: 3,
              vehiclesPerMin: 44,
              queueLengthM: 62,
              avgSpeedKmph: 19.2,
              signal: 'red',
            },
          ],
          vehicleMix: { twoWheeler: 0.55, car: 0.3, bus: 0.05, truck: 0.1 },
          totalFlowVehiclesPerMin: 96,
          maxQueueLengthM: 62,
          avgSpeedKmph: 21.8,
          congestionScore: 34,
        },
      });
    }

    try {
      let totalAccepted = 0;
      let totalAnomalies = 0;
      let serverLatencyMs = 0;
      const chunkSize = 1000;

      for (let offset = 0; offset < events.length; offset += chunkSize) {
        const chunk = events.slice(offset, offset + chunkSize);
        const res = await api.ingestBatch(chunk);
        totalAccepted += res.accepted ?? chunk.length;
        totalAnomalies += res.anomaliesCount || 0;
        serverLatencyMs += res.batchProcessingLatencyMs || 0;
      }

      const totalTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      const throughput = Math.round((totalAccepted / totalTimeMs) * 1000);

      setTestResult({
        count: totalAccepted,
        totalTimeMs,
        throughput,
        serverLatencyMs,
        anomaliesCount: totalAnomalies,
      });
    } catch (err) {
      setTestResult({ error: err.message });
    } finally {
      setIsStressTesting(false);
    }
  };

  const bufferPercentage = Math.min(100, Math.round(((stats.bufferSize || 0) / 10000) * 100));
  const roomEntries = Object.entries(stats.socketBytesByRoom || {}).sort((a, b) => b[1] - a[1]);
  const wireComp = stats.wireComparison;
  const otelHists = stats.otel?.histograms || {};
  const recentTraces = obsUpdate?.recentTraces || [];

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Client Render FPS</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white flex items-baseline gap-2">
            <span>{fps}</span>
            <span className="text-xs text-emerald-400 font-semibold">60 FPS External Store</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            useSyncExternalStore isolates hot 100ms ticks per junction
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Ingestion Queue Load</span>
            <HardDrive className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white flex items-baseline gap-2">
            <span>{stats.bufferSize || 0}</span>
            <span className="text-xs text-slate-400 font-normal">/ 10,000 max</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all"
              style={{ width: `${Math.max(2, bufferPercentage)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>WebSocket RTT Latency</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white flex items-baseline gap-2">
            <span>{clientLatency || 1} ms</span>
            <span className="text-xs text-emerald-400 font-semibold">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {(stats.socketBytesPerSec || 0).toLocaleString()} B/s server egress
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Backpressure / Dropped</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white flex items-baseline gap-2">
            <span>{stats.socketCoalescedCount || 0}</span>
            <span className="text-xs text-amber-400 font-semibold">coalesced</span>
            <span className="text-xs text-slate-400 font-mono">
              / {stats.socketDroppedCount || 0} dropped
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Queue dropped: {stats.totalDropped || 0} • Bounded per-socket coalesce
          </p>
        </div>
      </div>

      {/* OpenTelemetry Latency Percentiles & Event Loop Strip */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-100">
            OpenTelemetry Pipeline Percentiles (p50 / p95 / p99)
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            Loop lag: {(stats.eventLoopLagMs || 0).toFixed(2)} ms (p99 {(stats.eventLoopLagP99Ms || 0).toFixed(2)} ms)
            {' · '}Clock offset: {clientE2eStats?.clockOffsetMs || 0} ms
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 font-mono text-xs">
          {[
            ['Ingest → Persist', otelHists.ingestToPersistMs],
            ['Ingest → Emit', otelHists.ingestToEmitMs],
            ['DB Flush', otelHists.flushDurationMs],
            ['Sim Step', otelHists.simStepMs],
            ['Client E2E Render', otelHists.clientE2eMs?.count ? otelHists.clientE2eMs : clientE2eStats],
          ].map(([label, h]) => (
            <div key={label} className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">{label}</span>
              <span className="text-cyan-300 font-semibold">
                {h?.p50 || 0} / {h?.p95 || 0} / {h?.p99 || 0} ms
              </span>
            </div>
          ))}
        </div>
        {recentTraces.length > 0 && (
          <div className="text-[11px] font-mono text-slate-400 pt-1">
            Recent OTel traces buffered ({recentTraces.length}):{' '}
            {recentTraces.slice(0, 4).map((t) => `${t.rootName}(${t.durationMs}ms)`).join(' · ')}
          </div>
        )}
      </div>

      {/* Wire v1 Egress & Resume Lab */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-100">
              Wire v1 Bandwidth & Per-Room Egress
            </h3>
            {wireComp && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                -{wireComp.zoneSavingsPct}% vs JSON
              </span>
            )}
          </div>

          {wireComp && (
            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">FULL JSON / EVT</span>
                <span className="text-rose-300 font-bold">{wireComp.fullBytesPerEvent} B</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">ZONE TUPLE / EVT</span>
                <span className="text-emerald-400 font-bold">{wireComp.zoneWireBytesPerEvent} B</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">JUNCTION WIRE / EVT</span>
                <span className="text-cyan-400 font-bold">{wireComp.junctionWireBytesPerEvent} B</span>
              </div>
            </div>
          )}

          <div className="space-y-1 font-mono text-[11px]">
            <span className="text-[10px] text-slate-500 uppercase block">
              Egress Bytes by Room (latest 1s window: {(stats.socketBytesPerSec || 0).toLocaleString()} B/s)
            </span>
            {roomEntries.length === 0 ? (
              <div className="text-slate-500 py-2">Awaiting room traffic...</div>
            ) : (
              roomEntries.slice(0, 6).map(([room, bytes]) => (
                <div key={room} className="flex items-center justify-between text-slate-300 py-0.5 border-b border-slate-900">
                  <span>{room}</span>
                  <span className="text-cyan-400 font-semibold">{bytes.toLocaleString()} B</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Disconnect & Gapless Resume Control */}
        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4 flex flex-col justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-100">
              Disconnect & Cursor Resume Verification
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Closes the client WebSocket for 10 seconds, then auto-resumes via sequence cursor ring + MongoDB fallback with zero dropped live frames.
            </p>
          </div>

          {lastReplayStats && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
              <RotateCcw className="w-4 h-4 flex-shrink-0" />
              <span>
                replayed {lastReplayStats.replayed} frames, {lastReplayStats.fromMemory} from memory,{' '}
                {lastReplayStats.fromDb} from DB, gap {lastReplayStats.gap}
                {lastReplayStats.clipped ? ' (clipped)' : ''}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-mono text-slate-400">
              Socket state: <strong className={isConnected ? 'text-emerald-400' : 'text-rose-400'}>{isConnected ? 'ONLINE' : 'OFFLINE'}</strong>
            </span>
            <button
              onClick={() => simulateDisconnect(10000)}
              disabled={disconnectCountdownSec > 0}
              className="px-3.5 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60"
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>
                {disconnectCountdownSec > 0
                  ? `Reconnecting in ${disconnectCountdownSec}s...`
                  : 'Simulate disconnect 10 s'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Stress Benchmark Rig */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
              Automated High-Throughput Stress Rig
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                BENCHMARK
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Injects dense synthetic Bengaluru junction batches (requires City Admin role) to measure ingestion & Socket.IO fanout
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => runBrowserStressTest(500)}
              disabled={isStressTesting}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors"
            >
              500 Events
            </button>
            <button
              onClick={() => runBrowserStressTest(2000)}
              disabled={isStressTesting}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isStressTesting ? 'Firing Batch...' : '2,000 Burst Test'}</span>
            </button>
          </div>
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 font-mono text-xs">
            {testResult.error ? (
              <div className="text-rose-400">Test failed: {testResult.error}</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Stress Test Succeeded: {testResult.count} events ingested</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">INGESTION RATE</span>
                    <span className="text-base font-bold text-emerald-400">
                      {testResult.throughput.toLocaleString()} e/s
                    </span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">CLIENT WALL CLOCK</span>
                    <span className="text-base font-bold text-cyan-400">
                      {testResult.totalTimeMs} ms
                    </span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">SERVER PROCESSING</span>
                    <span className="text-base font-bold text-amber-400">
                      {testResult.serverLatencyMs} ms
                    </span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">ANOMALIES CAUGHT</span>
                    <span className="text-base font-bold text-purple-400">
                      {testResult.anomaliesCount}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recorded Reproducible Benchmark Runs & Live 10s Engineering Probe */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-base text-slate-100">
              Recorded Reproducible Benchmark Suites
            </h3>
            <p className="text-xs text-slate-400">
              Distinguishes HTTP-accepted/s, async persisted-to-DB/s, and Socket.IO fan-out delivered frames/s
            </p>
          </div>
          <button
            onClick={runLiveEngineeringProbe}
            disabled={isProbingLive}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-xs font-bold text-slate-950 transition-colors disabled:opacity-60"
          >
            {isProbingLive ? 'Probing 10s (Engineering)...' : 'Run 10s Live Probe'}
          </button>
        </div>

        {benchError && (
          <div className="p-2.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs font-mono">
            {benchError}
          </div>
        )}

        {benchProgress && (
          <div className="p-3 rounded-lg bg-slate-950/80 border border-cyan-500/30 font-mono text-xs space-y-1">
            <div className="flex items-center justify-between text-cyan-300 font-semibold">
              <span>Live Engineering Probe ({benchProgress.status})</span>
              <span>{benchProgress.elapsedSec}s / {benchProgress.totalSec}s</span>
            </div>
            <div className="text-slate-300">
              Accepted: {benchProgress.acceptedEventsPerSec || 0}/s ({benchProgress.acceptedEvents || 0}) ·
              Persisted: {benchProgress.persistedEventsPerSec || 0}/s ({benchProgress.persistedDelta || 0}) ·
              Delivered ({benchProgress.clientCount || 0} clients): {benchProgress.deliveredFramesPerSec || 0} frames/s ·
              RTT p95: {benchProgress.rttP95Ms || 0} ms
            </div>
          </div>
        )}

        {recordedRuns.length === 0 ? (
          <div className="text-xs text-slate-500 font-mono">
            No load benchmark JSON files found in benchmarks/results/ yet.
          </div>
        ) : (
          <div className="space-y-2">
            {recordedRuns.map((run) => (
              <div
                key={run.filename}
                className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 font-mono text-xs flex flex-col gap-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-200 font-semibold">{run.filename}</span>
                  <span className="text-slate-400">
                    {run.metadata?.target} · {run.metadata?.mongoTarget} ·{' '}
                    {run.metadata?.otelEnabled ? `OTel (${run.metadata?.otelSampleRatio})` : 'OTel Off'}
                  </span>
                </div>
                <div className="text-slate-300">
                  Peak Accepted: <span className="text-emerald-400 font-semibold">{(run.summary?.peakAcceptedEventsPerSec || 0).toLocaleString()}/s</span> ({run.summary?.peakAcceptedConfig}) ·
                  Peak Persisted: <span className="text-amber-300 font-semibold">{(run.summary?.peakPersistedEventsPerSec || 0).toLocaleString()}/s</span> ·
                  Fan-out 200: <span className="text-cyan-300 font-semibold">{(run.summary?.fanout200FramesPerSec || 0).toLocaleString()} frames/s</span> (p95 {run.summary?.fanout200LatencyP95Ms || 0} ms)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
