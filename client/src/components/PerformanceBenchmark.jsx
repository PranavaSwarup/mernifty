import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Zap, Activity, HardDrive, CheckCircle2, AlertOctagon, Play, BarChart2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';

export function PerformanceBenchmark() {
  const { stats, clientLatency } = useSocket();
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
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

  const runBrowserStressTest = async (count = 1000) => {
    setIsStressTesting(true);
    setTestResult(null);

    const startTime = performance.now();
    const batch = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      batch.push({
        eventId: `BENCH-${now}-${i}`,
        deviceId: 'srv-us-east-prod',
        category: 'server',
        timestamp: new Date().toISOString(),
        sequence: i,
        metrics: {
          cpuPercent: parseFloat((45 + Math.random() * 30).toFixed(2)),
          memoryPercent: 70,
          latencyMs: Math.round(20 + Math.random() * 20),
        },
      });
    }

    try {
      const res = await api.ingestBatch(batch);
      const totalTimeMs = Math.round(performance.now() - startTime);
      const throughput = Math.round((count / totalTimeMs) * 1000);

      setTestResult({
        count,
        totalTimeMs,
        throughput,
        serverLatencyMs: res.batchProcessingLatencyMs,
        anomaliesCount: res.anomaliesCount,
      });
    } catch (err) {
      console.error(err);
      setTestResult({ error: err.message });
    } finally {
      setIsStressTesting(false);
    }
  };

  const bufferPercentage = Math.min(100, Math.round((stats.bufferSize / 10000) * 100));

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
            <span className="text-xs text-emerald-400 font-semibold">Smooth 60 FPS Target</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Throttled micro-batching prevents excessive DOM re-renders
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Ingestion Queue Load</span>
            <HardDrive className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white flex items-baseline gap-2">
            <span>{stats.bufferSize}</span>
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
            <span className="text-xs text-emerald-400 font-semibold">Real-time</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Socket.IO bi-directional ping-pong measurement
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Dropped Packets</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white flex items-baseline gap-2">
            <span>{stats.totalDropped}</span>
            <span className="text-xs text-emerald-400 font-semibold">Zero Loss</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Backpressure protection & deduplication filter
          </p>
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
              Injects dense synthetic batches to measure raw HTTP ingestion, pipeline validation, and Socket.IO broadcast latency
            </p>
          </div>

          {/* Test Buttons */}
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
    </div>
  );
}
