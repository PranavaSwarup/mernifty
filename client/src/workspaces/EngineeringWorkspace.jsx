import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  WifiOff,
  Play,
  Square,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Search,
} from 'lucide-react';
import { api } from '../services/api';
import { useSocket, useRecentFrames, useSocketStats } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  controllerLabel,
  zoneLabel,
  fmtNum,
  fmtInt,
  fmtSigned,
  fmtClockTime,
  useTheme,
} from '../utils/semantics';

function formatBenchLabel(run) {
  if (run.otelComparisonScenario) {
    const mode = run.metadata?.otelEnabled ? 'OTel ON (5%)' : 'OTel OFF';
    const stamp = run.generatedAt ? run.generatedAt.replace(/\.\d{3}Z$/, 'Z') : '';
    return stamp ? `${stamp} · ${mode}` : mode;
  }
  return String(run.filename || '')
    .replace(/LAPTOP-[A-Z0-9]+-/gi, '')
    .replace(/\.json$/i, '') || 'benchmark-run';
}

function histogramUnit(metricName) {
  if (metricName.endsWith('Ms')) return 'ms';
  if (metricName.includes('Bytes')) return 'bytes';
  if (metricName.includes('Size')) return 'docs';
  return 'unit';
}

function isHistogramTailHigh(metricName, p99Val) {
  const n = Number(p99Val);
  if (!Number.isFinite(n)) return false;
  if (metricName === 'simStepMs') return n >= 20;
  if (metricName === 'flushDurationMs') return n >= 250;
  if (metricName === 'ingestToEmitMs') return n >= 200;
  return false;
}

function ArchitectureSvg({ isDark }) {
  const boxFill = isDark ? '#141922' : '#ffffff';
  const insetFill = isDark ? '#1b222e' : '#e8ecf2';
  const border = isDark ? '#364257' : '#aebacb';
  const ink = isDark ? '#edf1f7' : '#111824';
  const muted = isDark ? '#8a98ad' : '#526075';
  const accentStroke = isDark ? '#3b82f6' : '#1d4ed8';
  const accentText = isDark ? '#60a5fa' : '#1d4ed8';
  const flow = isDark ? '#10b981' : '#047857';

  return (
    <svg
      viewBox="0 0 920 235"
      className="w-full h-auto"
      role="img"
      aria-label="MetroPulse BLR implemented system architecture schematic"
    >
      <defs>
        <marker id="hp-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill={accentStroke} />
        </marker>
        <marker id="hp-link-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <polygon points="0 0, 6 3, 0 6" fill={border} />
        </marker>
      </defs>

      {/* Node 1: Physics + Baseline Twin */}
      <rect x="16" y="24" width="195" height="106" rx="6" fill={boxFill} stroke={border} strokeWidth="1.25" />
      <text x="28" y="45" fontSize="11.5" fontWeight="600" fill={ink}>Traffic Twin Engine</text>
      <text x="28" y="63" fontSize="10" fill={muted}>12 Bengaluru junctions (LTM)</text>
      <text x="28" y="79" fontSize="10" fill={muted}>Live adaptive vs Webster base</text>
      <text x="28" y="95" fontSize="10" fill={muted}>Common Random Numbers</text>
      <text x="28" y="113" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill={accentText}>server/src/sim/twin.js</text>

      {/* Arrow 1 -> 2 */}
      <line x1="211" y1="77" x2="251" y2="77" stroke={accentStroke} strokeWidth="1.5" markerEnd="url(#hp-arrow)" />

      {/* Node 2: Ingestion Buffer */}
      <rect x="255" y="24" width="195" height="106" rx="6" fill={boxFill} stroke={border} strokeWidth="1.25" />
      <text x="267" y="45" fontSize="11.5" fontWeight="600" fill={ink}>Ingestion &amp; Integrity</text>
      <text x="267" y="63" fontSize="10" fill={muted}>REST / Sim event enqueue</text>
      <text x="267" y="79" fontSize="10" fill={muted}>LRU eventId dedup + seq gaps</text>
      <text x="267" y="95" fontSize="10" fill={muted}>500 ms batched Atlas flush</text>
      <text x="267" y="113" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill={accentText}>ingestionBuffer.js</text>

      {/* Arrow 2 -> 3 */}
      <line x1="450" y1="77" x2="490" y2="77" stroke={accentStroke} strokeWidth="1.5" markerEnd="url(#hp-arrow)" />

      {/* Node 3: Room Socket.IO + Wire v1 */}
      <rect x="494" y="24" width="200" height="106" rx="6" fill={boxFill} stroke={border} strokeWidth="1.25" />
      <text x="506" y="45" fontSize="11.5" fontWeight="600" fill={ink}>Room Socket.IO Fan-Out</text>
      <text x="506" y="63" fontSize="10" fill={muted}>Wire v1 numeric tuples</text>
      <text x="506" y="79" fontSize="10" fill={muted}>Rooms: city, zone:*, jnc:*, eng</text>
      <text x="506" y="95" fontSize="10" fill={muted}>JWT scope + cursor replay</text>
      <text x="506" y="113" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill={accentText}>socketService.js</text>

      {/* Arrow 3 -> 4 */}
      <line x1="694" y1="77" x2="734" y2="77" stroke={accentStroke} strokeWidth="1.5" markerEnd="url(#hp-arrow)" />

      {/* Node 4: React Console */}
      <rect x="738" y="24" width="166" height="106" rx="6" fill={boxFill} stroke={border} strokeWidth="1.25" />
      <text x="750" y="45" fontSize="11.5" fontWeight="600" fill={ink}>Operator Console</text>
      <text x="750" y="63" fontSize="10" fill={muted}>Leaflet / ArcGIS map + SVG</text>
      <text x="750" y="79" fontSize="10" fill={muted}>External hot store (10 Hz)</text>
      <text x="750" y="95" fontSize="10" fill={muted}>History/Live cursor seam</text>
      <text x="750" y="113" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill={accentText}>useSyncExternalStore</text>

      {/* Bottom Row: MongoDB + Copilot + OTel */}
      <rect x="255" y="156" width="195" height="62" rx="6" fill={insetFill} stroke={border} strokeWidth="1" />
      <text x="267" y="176" fontSize="11" fontWeight="600" fill={ink}>MongoDB Regular Collection</text>
      <text x="267" y="193" fontSize="9.5" fill={muted}>Telemetry, alerts &amp; action records</text>
      <text x="267" y="208" fontSize="9" fontFamily="JetBrains Mono, monospace" fill={flow}>insertMany + unique eventId + TTL</text>
      <line x1="352" y1="130" x2="352" y2="152" stroke={border} strokeWidth="1.25" markerEnd="url(#hp-link-arrow)" />

      <rect x="16" y="156" width="195" height="62" rx="6" fill={insetFill} stroke={border} strokeWidth="1" />
      <text x="28" y="176" fontSize="11" fontWeight="600" fill={ink}>Copilot &amp; 300s Verifier</text>
      <text x="28" y="193" fontSize="9.5" fill={muted}>Chunked K-rollouts + outcome log</text>
      <text x="28" y="208" fontSize="9" fontFamily="JetBrains Mono, monospace" fill={flow}>copilotService.js</text>
      <line x1="113" y1="156" x2="113" y2="134" stroke={border} strokeWidth="1.25" markerEnd="url(#hp-link-arrow)" />

      <rect x="494" y="156" width="410" height="62" rx="6" fill={insetFill} stroke={border} strokeWidth="1" />
      <text x="506" y="176" fontSize="11" fontWeight="600" fill={ink}>OpenTelemetry Pipeline &amp; Offline Benchmark Harness</text>
      <text x="506" y="193" fontSize="9.5" fill={muted}>OperatorAwareSampler, linked spans (rollout / verifier), event-loop p99, 30-cell control study</text>
      <text x="506" y="208" fontSize="9" fontFamily="JetBrains Mono, monospace" fill={flow}>otel.js · /api/observability/* · /api/benchmarks</text>
      <line x1="594" y1="130" x2="594" y2="152" stroke={border} strokeWidth="1.25" markerEnd="url(#hp-link-arrow)" />
    </svg>
  );
}

const WireStreamTap = React.memo(function WireStreamTap({ wireComp, isPaused, togglePause }) {
  const recentEvents = useRecentFrames();
  const [streamFilter, setStreamFilter] = useState('');
  const [wireMode, setWireMode] = useState('decoded');

  const filteredStream = useMemo(() => {
    const q = streamFilter.trim().toLowerCase();
    if (!q) return recentEvents.slice(0, 30);
    return recentEvents
      .filter((e) => {
        const jId = (e.junctionId || e.deviceId || '').toLowerCase();
        const st = (e.status || '').toLowerCase();
        const ctrl = (e.controller || e.data?.control?.controller || '').toLowerCase();
        const zId = (e.zoneId || '').toLowerCase();
        return jId.includes(q) || st.includes(q) || ctrl.includes(q) || zId.includes(q);
      })
      .slice(0, 30);
  }, [recentEvents, streamFilter]);

  return (
    <div className="xl:col-span-7 min-w-0 console-panel p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-ink-primary">
            Wire v1 Stream Tap ({recentEvents.length} frames buffered)
          </h2>
          <p className="text-[11px] text-ink-muted">
            Inspect compact numeric tuples emitted on the wire vs decoded UI structures
          </p>
        </div>
        {wireComp && (
          <div className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded border border-hairline bg-inset text-ink-secondary max-w-full">
            Zone wire {fmtInt(wireComp.zoneWireBytesPerEvent)} B/ev vs JSON {fmtInt(wireComp.fullBytesPerEvent)} B/ev ({fmtNum(wireComp.zoneSavingsPct, 1)}% smaller)
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-ink-muted" aria-hidden="true" />
          <input
            type="text"
            aria-label="Filter wire frames"
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            placeholder="Filter by junctionId, zone, status, controller..."
            className="w-full pl-8 pr-2.5 py-1 rounded border border-hairline bg-inset text-xs text-ink-primary focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setWireMode('decoded')}
            className={`px-2 py-1 rounded border ${wireMode === 'decoded' ? 'bg-accent text-accent-contrast border-accent' : 'bg-inset border-hairline text-ink-secondary'}`}
          >
            Decoded
          </button>
          <button
            type="button"
            onClick={() => setWireMode('tuple')}
            className={`px-2 py-1 rounded border ${wireMode === 'tuple' ? 'bg-accent text-accent-contrast border-accent' : 'bg-inset border-hairline text-ink-secondary'}`}
          >
            Raw Tuple
          </button>
          <button
            type="button"
            onClick={togglePause}
            className="px-2 py-1 rounded border border-hairline bg-inset text-ink-primary"
          >
            {isPaused ? 'Resume Tap' : 'Pause Tap'}
          </button>
        </div>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-label="Wire stream buffer"
        className="console-inset p-2.5 h-[260px] overflow-y-auto font-mono text-[11px] space-y-1.5"
      >
        {filteredStream.length === 0 ? (
          <div className="py-10 text-center font-sans text-xs text-ink-muted">
            No matching frames in local buffer.
          </div>
        ) : (
          filteredStream.map((evt, idx) => (
            <div key={`${evt.eventId || idx}-${idx}`} className="p-2 rounded border border-hairline bg-surface">
              <div className="flex items-center justify-between text-[10px] text-ink-muted mb-1">
                <span className="text-ink-primary font-semibold">
                  {evt.junctionId || evt.deviceId} · seq #{evt.sequence}
                </span>
                <span>{fmtClockTime(evt.timestamp)}</span>
              </div>
              <pre className="text-[10px] text-ink-secondary whitespace-pre-wrap break-all">
                {wireMode === 'tuple'
                  ? JSON.stringify(evt._wire || evt)
                  : JSON.stringify({
                      status: evt.status,
                      controller: evt.controller,
                      metrics: evt.metrics,
                    })}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export function EngineeringWorkspace({ devices = [] }) {
  const {
    isPaused,
    togglePause,
    obsUpdate,
    benchProgress,
    lastReplayStats,
    disconnectCountdownSec,
    simulateDisconnect,
    setSimMeta,
  } = useSocket();
  const stats = useSocketStats();
  const { user } = useAuth();
  const { isDark } = useTheme();

  // Observability state
  const [tracesData, setTracesData] = useState({ traces: [], totalSpansBuffered: 0, availableSpanNames: [], capacity: 500 });
  const [traceSpanFilter, setTraceSpanFilter] = useState('');
  const [tracePriority, setTracePriority] = useState('informative');
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const [obsMetrics, setObsMetrics] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [benchmarks, setBenchmarks] = useState([]);
  const [simState, setSimState] = useState(null);
  const [simStatus, setSimStatus] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [scenarioBusy, setScenarioBusy] = useState(false);

  // Interactive UI controls state
  const [showLostOnly, setShowLostOnly] = useState(false);
  const [benchBusy, setBenchBusy] = useState(false);
  const [benchNotice, setBenchNotice] = useState(null);
  const [chaosTarget, setChaosTarget] = useState('JNC-BLR-001');
  const [chaosNotice, setChaosNotice] = useState('');
  const [chaosError, setChaosError] = useState('');

  const loadStaticBenchmarks = useCallback(async () => {
    try {
      const [ben, scRes] = await Promise.all([
        api.getBenchmarks().catch(() => null),
        api.getScenarios().catch(() => null),
      ]);
      if (Array.isArray(ben?.runs)) setBenchmarks(ben.runs);
      if (Array.isArray(scRes?.scenarios)) setScenarios(scRes.scenarios);
    } catch {
      // Safe no-op on transient error
    }
  }, []);

  const loadEngineeringData = useCallback(async () => {
    try {
      const [tr, met, integ, sSt, sSta] = await Promise.all([
        api.getTraces(30, { span: traceSpanFilter, priority: tracePriority }).catch(() => null),
        api.getObservabilityMetrics().catch(() => null),
        api.getIntegrity().catch(() => null),
        api.getSimState().catch(() => null),
        api.getSimulatorStatus().catch(() => null),
      ]);
      if (tr?.traces) {
        setTracesData(tr);
        setSelectedTraceId((prev) =>
          prev && tr.traces.some((x) => x.traceId === prev)
            ? prev
            : tr.traces[0]?.traceId || null
        );
      }
      if (met) setObsMetrics(met);
      if (integ?.integrity) setIntegrity(integ.integrity);
      if (sSt) setSimState(sSt);
      if (sSta?.status) setSimStatus(sSta.status);
    } catch {
      // Safe no-op on transient error
    }
  }, [traceSpanFilter, tracePriority]);

  useEffect(() => {
    loadStaticBenchmarks();
  }, [loadStaticBenchmarks]);

  useEffect(() => {
    loadEngineeringData();
    const t = setInterval(loadEngineeringData, 4000);
    return () => clearInterval(t);
  }, [loadEngineeringData]);

  const canAdmin = user?.role === 'admin';
  const canOperateAny = user?.role === 'admin' || user?.role === 'operator';
  const targetDevice = (devices || []).find(
    (d) => (d.deviceId || d.junctionId) === chaosTarget
  );
  const targetZone = targetDevice?.zoneId || '';
  const canOperateChaosTarget =
    canAdmin ||
    (user?.role === 'operator' &&
      (!targetZone || !Array.isArray(user.zones) || user.zones.includes(targetZone)));

  // Merge live obsUpdate push if present
  const liveMetrics = obsUpdate?.metrics || obsMetrics?.metrics || stats;
  const percentiles = obsMetrics?.percentiles || obsMetrics?.metrics?.otel?.histograms || {};
  const procStats = obsMetrics?.process || {};

  const selectedTrace = useMemo(
    () => tracesData.traces.find((t) => t.traceId === selectedTraceId) || tracesData.traces[0] || null,
    [tracesData, selectedTraceId]
  );

  // Extract latest control-study (30 cells) and load-benchmark runs
  const controlStudyRun = useMemo(
    () => benchmarks.find((r) => r.kind === 'control-study') || null,
    [benchmarks]
  );
  const loadBenchRuns = useMemo(
    () => benchmarks.filter((r) => r.kind === 'load-benchmark' || r.otelComparisonScenario || r.ingestScenarios),
    [benchmarks]
  );

  const isCellWorse = (cmp) =>
    Boolean(cmp && (cmp.significant === 'worse' || Number(cmp.pctVsBaseline) > 0.1));

  const losingCells = useMemo(() => {
    const cells = controlStudyRun?.cells || [];
    const losses = [];
    for (const c of cells) {
      for (const ctrl of ['webster', 'max-pressure', 'max-pressure-ca']) {
        const cmp = c?.pairedVsFixedTod?.[ctrl]?.avgDelayPerVehSec;
        if (isCellWorse(cmp)) {
          losses.push({
            condition: `${c.scenarioId} / ${c.windowId} @ ${fmtNum(c.demandScale, 2)}x`,
            controller: ctrl,
            pct: Number(cmp.pctVsBaseline),
            significant: cmp.significant,
          });
        }
      }
    }
    losses.sort((a, b) => b.pct - a.pct);
    return losses;
  }, [controlStudyRun]);

  const visibleStudyCells = useMemo(() => {
    const cells = controlStudyRun?.cells || [];
    if (!showLostOnly) return cells;
    return cells.filter((c) =>
      ['webster', 'max-pressure', 'max-pressure-ca'].some((k) =>
        isCellWorse(c.pairedVsFixedTod?.[k]?.avgDelayPerVehSec)
      )
    );
  }, [controlStudyRun, showLostOnly]);

  const handleRunLiveBenchmark = async () => {
    setBenchBusy(true);
    setBenchNotice(null);
    try {
      const res = await api.runLiveBenchmark({ durationSec: 10 });
      const r = res?.result || {};
      setBenchNotice({
        isError: false,
        text: `10s live probe complete: accepted ${fmtNum(r.acceptedEventsPerSec, 1)} ev/s · persisted ${fmtNum(r.persistedEventsPerSec, 1)} docs/s · delivered ${fmtNum(r.deliveredFramesPerSec, 1)} frames/s · RTT p95 ${fmtNum(r.rttP95Ms, 1)} ms (${fmtInt(r.clientCount)} sockets).`,
      });
      await Promise.all([loadEngineeringData(), loadStaticBenchmarks()]);
    } catch (err) {
      setBenchNotice({
        isError: true,
        text:
          err?.status === 401 || err?.status === 403
            ? `${err.message} Switch Demo persona to Supervisor in the header.`
            : err?.message || 'Benchmark failed',
      });
    } finally {
      setBenchBusy(false);
    }
  };

  const handleChaos = async (metric, multiplier, durationSec, flags, label) => {
    setChaosError('');
    setChaosNotice('');
    try {
      const res = await api.injectChaos(chaosTarget, metric, multiplier, durationSec, flags);
      setChaosNotice(res?.message || `${label} triggered.`);
      loadEngineeringData();
    } catch (err) {
      setChaosError(
        err?.status === 401 || err?.status === 403
          ? `${err.message} Switch Demo persona to Supervisor or zone operator.`
          : err?.message || 'Chaos injection failed'
      );
    }
  };

  const handleToggleSim = async () => {
    setChaosError('');
    setChaosNotice('');
    try {
      if (simStatus?.isRunning) {
        await api.stopSimulator();
        setChaosNotice('Traffic simulator paused.');
      } else {
        await api.startSimulator(simStatus?.targetRate || 24);
        setChaosNotice('Traffic simulator resumed.');
      }
      await loadEngineeringData();
    } catch (err) {
      setChaosError(err?.message || 'Failed to change simulator run state');
    }
  };

  const handleApplyScenario = async (preset) => {
    setChaosError('');
    setChaosNotice('');
    setScenarioBusy(true);
    try {
      const res = await api.applyScenario(preset.id);
      if (res?.meta) setSimMeta(res.meta);
      if (res?.state) setSimState(res.state);
      setChaosNotice(
        `Scenario "${preset.title}" active at ${res?.meta?.simClockIst || preset.istClock} across both CRN twins.`
      );
      await loadEngineeringData();
    } catch (err) {
      setChaosError(
        err?.status === 401 || err?.status === 403
          ? `${err.message} Switch Demo persona to Operator or Supervisor in the header.`
          : err?.message || 'Failed to switch scenario'
      );
    } finally {
      setScenarioBusy(false);
    }
  };

  const handleSpeedChange = async (nextSpeed) => {
    setChaosError('');
    setChaosNotice('');
    try {
      const res = await api.setSimSpeed(nextSpeed);
      setSimMeta((prev) => ({ ...(prev || {}), simSpeed: res.simSpeed || nextSpeed }));
      setChaosNotice(`Simulation clock speed set to ${res.simSpeed || nextSpeed}x.`);
      await loadEngineeringData();
    } catch (err) {
      setChaosError(
        err?.status === 401 || err?.status === 403
          ? `${err.message} Supervisor persona required to change SIM_SPEED.`
          : err?.message || 'Failed to update simulation speed'
      );
    }
  };

  const wireComp = stats?.wireComparison;

  const benchProgressText = benchProgress
    ? benchProgress.status === 'error'
      ? `Live probe error: ${benchProgress.error || 'Unknown error'}`
      : `Probe ${benchProgress.status || 'running'} (${fmtNum(benchProgress.elapsedSec, 1)}/${fmtInt(benchProgress.totalSec)}s · ${fmtInt(benchProgress.clientCount)} sockets): accepted ${fmtNum(benchProgress.acceptedEventsPerSec, 1)} ev/s · persisted ${fmtNum(benchProgress.persistedEventsPerSec, 1)} docs/s · delivered ${fmtNum(benchProgress.deliveredFramesPerSec, 1)} frames/s · p95 ${fmtNum(benchProgress.rttP95Ms, 1)} ms`
    : null;

  return (
    <div className="max-w-[1680px] mx-auto px-3 sm:px-4 py-4 space-y-5">
      {/* Page Title */}
      <div className="console-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-ink-primary">
            Systems Engineering Workbench
          </h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Live OpenTelemetry spans &amp; histograms, Wire v1 inspection, sequence integrity, 30-cell control study, load accounting, and chaos injection.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            loadEngineeringData();
            loadStaticBenchmarks();
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-hairline bg-inset hover:border-hairlineStrong text-xs text-ink-primary shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Sticky Section Anchor Navigation */}
      <nav
        aria-label="Engineering sections"
        className="sticky top-[52px] z-30 console-panel px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {[
            ['#eng-otel', 'OTel Traces'],
            ['#eng-wire', 'Wire & Resume'],
            ['#eng-study', '30-Cell Study'],
            ['#eng-bench', 'Load Accounting'],
            ['#eng-chaos', 'Scenarios & Chaos'],
            ['#eng-arch', 'Architecture'],
          ].map(([href, text]) => (
            <a
              key={href}
              href={href}
              className="px-2.5 py-1 rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-secondary hover:text-ink-primary font-medium transition-colors"
            >
              {text}
            </a>
          ))}
        </div>
        <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-ink-muted">
          {simState?.simClockIst ? `Sim ${simState.simClockIst}` : ''}
          {simStatus?.simSpeed > 1 ? ` · ${simStatus.simSpeed}x` : ''}
        </span>
      </nav>

      {/* SECTION 1: OpenTelemetry Trace Waterfall & Histogram Percentiles */}
      <section id="eng-otel" className="scroll-mt-[104px] console-panel p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-hairline">
          <div>
            <h2 className="text-xs font-semibold text-ink-primary">
              OpenTelemetry Traces, Span Links &amp; Histogram Percentiles
            </h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Operator-aware sampling ensures operator mutations &amp; rollout/verifier traces capture linked child spans without blocking hot loops.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-ink-secondary">
            <span className="px-2 py-0.5 rounded border border-hairline bg-inset">
              Spans {fmtInt(tracesData.totalSpansBuffered)}/{fmtInt(tracesData.capacity)}
            </span>
            <span className="px-2 py-0.5 rounded border border-hairline bg-inset">
              Loop lag mean {fmtNum(procStats.eventLoopLagMs ?? liveMetrics?.eventLoopLagMs, 2)} ms · p99 {fmtNum(procStats.eventLoopLagP99Ms ?? liveMetrics?.eventLoopLagP99Ms, 2)} ms
            </span>
            {procStats.memoryUsage?.heapUsedMb !== undefined && (
              <span className="px-2 py-0.5 rounded border border-hairline bg-inset">
                Heap {fmtNum(procStats.memoryUsage.heapUsedMb, 1)} MB
              </span>
            )}
          </div>
        </div>

        {/* Histogram Percentiles Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-hairline text-ink-muted">
                <th scope="col" className="py-1.5 pr-3">OTel Histogram Metric</th>
                <th scope="col" className="py-1.5 pr-3">Unit</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Count</th>
                <th scope="col" className="py-1.5 pr-3 text-right">p50</th>
                <th scope="col" className="py-1.5 pr-3 text-right">p95</th>
                <th scope="col" className="py-1.5 pr-3 text-right">p99</th>
                <th scope="col" className="py-1.5 text-right">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline font-mono tabular-nums">
              {Object.keys(percentiles).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-ink-muted font-sans">
                    Collecting histogram observations...
                  </td>
                </tr>
              ) : (
                Object.entries(percentiles).map(([name, h]) => (
                  <tr key={name}>
                    <td className="py-1.5 pr-3 text-ink-primary">{name}</td>
                    <td className="py-1.5 pr-3 text-ink-muted font-sans">{histogramUnit(name)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-secondary">{fmtInt(h.count)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-primary">{fmtNum(h.p50, 2)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-primary">{fmtNum(h.p95, 2)}</td>
                    <td
                      className={`py-1.5 pr-3 text-right ${
                        isHistogramTailHigh(name, h.p99)
                          ? 'text-signal-heavy font-semibold'
                          : 'text-ink-primary'
                      }`}
                    >
                      {fmtNum(h.p99, 2)}
                    </td>
                    <td className="py-1.5 text-right text-ink-muted">{fmtNum(h.max, 2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Live Trace Selector + Waterfall */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-ink-secondary">
              <span>Span filter:</span>
              <select
                aria-label="Filter traces by span name"
                value={traceSpanFilter}
                onChange={(e) => setTraceSpanFilter(e.target.value)}
                className="px-2 py-1 rounded border border-hairline bg-inset text-ink-primary font-mono text-[11px]"
              >
                <option value="">All spans (priority-sorted)</option>
                {(tracesData.availableSpanNames || []).map((spName) => (
                  <option key={spName} value={spName}>
                    {spName}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-ink-secondary">
              <span>Order:</span>
              <select
                aria-label="Trace priority order"
                value={tracePriority}
                onChange={(e) => setTracePriority(e.target.value)}
                className="px-2 py-1 rounded border border-hairline bg-inset text-ink-primary text-[11px]"
              >
                <option value="informative">Informative first (copilot / flush links)</option>
                <option value="chronological">Strict chronological (raw)</option>
              </select>
            </label>
          </div>
          <span className="font-mono tabular-nums text-ink-muted">
            Showing {fmtInt(tracesData.traces.length)} of {fmtInt(tracesData.totalTracesBuffered || tracesData.traces.length)} buffered traces
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4 min-w-0 console-inset p-2 max-h-[260px] overflow-y-auto space-y-1">
            {tracesData.traces.length === 0 ? (
              <div className="py-6 text-center text-xs text-ink-muted">
                No matching traces exported in buffer yet. Trigger an action, scenario, or clear filter.
              </div>
            ) : (
              tracesData.traces.map((tr) => {
                const active = selectedTrace?.traceId === tr.traceId;
                const linkTotal = tr.linkCount ?? (tr.spans || []).reduce((acc, s) => acc + (s.links?.length || 0), 0);
                return (
                  <button
                    key={tr.traceId}
                    type="button"
                    onClick={() => setSelectedTraceId(tr.traceId)}
                    className={`w-full text-left p-2 rounded border transition-colors ${
                      active
                        ? 'border-accent bg-accent-tint'
                        : 'border-transparent hover:border-hairline hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-medium text-ink-primary truncate">{tr.rootName}</span>
                      <span className="font-mono tabular-nums text-ink-secondary shrink-0">
                        {fmtNum(tr.durationMs, 2)} ms
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-ink-muted">
                      <span>{tr.traceId.slice(0, 12)} · {tr.spanCount} spans</span>
                      {(tr.hasLinks || linkTotal > 0) && (
                        <span className="inline-flex items-center gap-0.5 text-signal-emergency">
                          <Link2 className="w-2.5 h-2.5" /> {linkTotal || 1} link{linkTotal === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-8 min-w-0 console-inset p-3 overflow-x-auto">
            {!selectedTrace ? (
              <div className="py-6 text-center text-xs text-ink-muted">
                Select a trace to inspect span waterfall &amp; span links.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-hairline text-[11px] font-mono">
                  <span className="text-ink-primary">
                    traceId: {selectedTrace.traceId}
                  </span>
                  <span className="text-ink-secondary tabular-nums">
                    Total {fmtNum(selectedTrace.durationMs, 2)} ms · {selectedTrace.spans.length} spans
                  </span>
                </div>
                <div className="hidden sm:grid grid-cols-12 gap-2 text-[9.5px] font-mono text-ink-muted pb-1 border-b border-hairline">
                  <div className="col-span-5">Span</div>
                  <div className="col-span-5 flex justify-between">
                    <span>0 ms</span>
                    <span>{fmtNum(selectedTrace.durationMs, 1)} ms</span>
                  </div>
                  <div className="col-span-2 text-right">Duration</div>
                </div>
                <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                  {selectedTrace.spans.slice(0, 32).map((sp) => {
                    const totalDur = Math.max(0.1, selectedTrace.durationMs || 0.1);
                    const relStart = Math.max(0, sp.startTimeMs - selectedTrace.startTimeMs);
                    const leftPct = Math.min(95, (relStart / totalDur) * 100);
                    const widthPct = Math.max(2, Math.min(100 - leftPct, (sp.durationMs / totalDur) * 100));
                    const isChild = Boolean(sp.parentSpanId);
                    return (
                      <div key={sp.spanId} className="space-y-1">
                        <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-1.5 sm:gap-2 text-[11px]">
                          <div className={`sm:col-span-5 truncate font-mono ${isChild ? 'pl-4 text-ink-secondary' : 'font-semibold text-ink-primary'}`}>
                            {sp.name}
                          </div>
                          <div className="sm:col-span-5 h-3.5 rounded bg-surface border border-hairline relative overflow-hidden">
                            <div
                              className="h-full bg-accent"
                              style={{ marginLeft: `${leftPct}%`, width: `${widthPct}%` }}
                            />
                          </div>
                          <div className="sm:col-span-2 text-right font-mono tabular-nums text-ink-secondary">
                            {fmtNum(sp.durationMs, 2)} ms
                          </div>
                        </div>
                        {Array.isArray(sp.links) && sp.links.length > 0 && (
                          <div className="pl-4 flex flex-wrap gap-1.5 text-[10px] font-mono text-signal-emergency">
                            {sp.links.map((lk, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-signal-emergency/30 bg-signal-emergency/10">
                                <Link2 className="w-2.5 h-2.5" />
                                <span>link → trace {lk.traceId?.slice(0, 12)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {selectedTrace.spans.length > 32 && (
                    <div className="pt-1 text-[10px] font-mono text-ink-muted">
                      Showing first 32 of {fmtInt(selectedTrace.spans.length)} child spans in this trace.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 2: Wire v1 Inspector + Integrity & Cursor Resume */}
      <section id="eng-wire" className="scroll-mt-16 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <WireStreamTap wireComp={wireComp} isPaused={isPaused} togglePause={togglePause} />

        {/* Integrity & 10s Disconnect Resume Demo */}
        <div className="xl:col-span-5 min-w-0 console-panel p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold text-ink-primary">
                Sequence Integrity &amp; Cursor Resume
              </h2>
              <p className="text-[11px] text-ink-muted">
                Drop socket for 10s and reconnect using per-junction sequence cursors without duplicate chart points
              </p>
            </div>
            <button
              type="button"
              disabled={disconnectCountdownSec > 0}
              onClick={() => simulateDisconnect(10000)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent text-accent-contrast text-[11px] font-medium disabled:opacity-50 shrink-0"
            >
              <WifiOff className="w-3 h-3" />
              <span>
                {disconnectCountdownSec > 0
                  ? `Reconnecting in ${disconnectCountdownSec}s`
                  : 'Simulate 10s Disconnect'}
              </span>
            </button>
          </div>

          {lastReplayStats && (
            <div className="px-2.5 py-2 rounded border border-signal-flow/40 bg-signal-flow/10 text-[11px] font-mono tabular-nums text-signal-flow">
              Last resume @ {fmtClockTime(lastReplayStats.receivedAt)}: replayed {lastReplayStats.replayed} frames ({lastReplayStats.fromMemory} memory, {lastReplayStats.fromDb} Atlas{lastReplayStats.clipped ? ', clipped' : ''})
            </div>
          )}

          {integrity && (
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="console-inset px-2 py-1.5">
                <div className="text-ink-muted text-[10px]">In-Order / Dup</div>
                <div className="font-mono tabular-nums font-semibold text-ink-primary">
                  {fmtInt(integrity.totals?.inOrder)} / {fmtInt(integrity.totals?.duplicate)}
                </div>
              </div>
              <div className="console-inset px-2 py-1.5">
                <div className="text-ink-muted text-[10px]">Late / Gaps</div>
                <div className="font-mono tabular-nums font-semibold text-ink-primary">
                  {fmtInt(integrity.totals?.late)} / {fmtInt(integrity.totals?.gapEvents)}
                </div>
              </div>
              <div className="console-inset px-2 py-1.5">
                <div className="text-ink-muted text-[10px]">Buffer Depth</div>
                <div className="font-mono tabular-nums font-semibold text-ink-primary">
                  {fmtInt(integrity.bufferDepth)}/{fmtInt(integrity.bufferCapacity)}
                </div>
              </div>
            </div>
          )}

          <div
            tabIndex={0}
            role="region"
            aria-label="Sequence integrity by junction"
            className="console-inset p-2 max-h-[205px] overflow-y-auto"
          >
            <table className="w-full text-left border-collapse text-[10px] font-mono tabular-nums">
              <thead>
                <tr className="border-b border-hairline text-ink-muted font-sans">
                  <th scope="col" className="py-1 pr-2">Junction</th>
                  <th scope="col" className="py-1 pr-2 text-right">Last Seq</th>
                  <th scope="col" className="py-1 pr-2 text-right">In-Order</th>
                  <th scope="col" className="py-1 pr-2 text-right">Dup</th>
                  <th scope="col" className="py-1 text-right">Gaps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {!integrity?.byJunction || Object.keys(integrity.byJunction).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-ink-muted font-sans">
                      Waiting for ingested sequences...
                    </td>
                  </tr>
                ) : (
                  Object.entries(integrity.byJunction).map(([jId, t]) => {
                    const hasGap = Number(t.gapEvents) > 0;
                    return (
                      <tr key={jId}>
                        <td className="py-1 pr-2 text-ink-primary">{jId}</td>
                        <td className="py-1 pr-2 text-right text-ink-secondary">{fmtInt(t.lastSequence ?? t.lastSeq)}</td>
                        <td className="py-1 pr-2 text-right text-signal-flow">{fmtInt(t.inOrder)}</td>
                        <td className="py-1 pr-2 text-right text-ink-muted">{fmtInt(t.duplicate)}</td>
                        <td className={`py-1 text-right ${hasGap ? 'text-signal-heavy font-semibold' : 'text-ink-muted'}`}>
                          {fmtInt(t.gapEvents)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 3: 30-Cell Controlled Study Matrix (Honesty rule #4) */}
      <section id="eng-study" className="scroll-mt-16 console-panel p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold text-ink-primary">
              Controlled Signal Study — 30-Cell Experimental Matrix (6 Scenarios/Windows x 5 Demand Scales)
            </h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Same Common-Random-Number seeds across Fixed-TOD, Webster, Max-Pressure, and Max-Pressure-CA. Explicitly reports both gains and regimes where Fixed-TOD wins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {losingCells.length > 0 && (
              <button
                type="button"
                aria-pressed={showLostOnly}
                onClick={() => setShowLostOnly((prev) => !prev)}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                  showLostOnly
                    ? 'bg-signal-heavy text-white border-signal-heavy'
                    : 'bg-inset text-signal-heavy border-signal-heavy/40 hover:border-signal-heavy'
                }`}
              >
                {showLostOnly ? 'Show all 30 cells' : `Adaptive lost (${losingCells.length} pairs)`}
              </button>
            )}
            {simState?.supervisoryPolicy?.thresholds && (
              <div className="px-2.5 py-1 rounded border border-hairline bg-inset text-[11px] font-mono text-ink-secondary">
                Auto thresholds: Y &gt;= {fmtNum(simState.supervisoryPolicy.thresholds.heavyFlowRatioY, 2)} (heavy), Y &gt;= {fmtNum(simState.supervisoryPolicy.thresholds.severeSaturationY, 2)} (severe)
              </div>
            )}
          </div>
        </div>

        {losingCells.length > 0 && (
          <div className="px-3 py-2 rounded border border-signal-heavy/40 bg-signal-heavy/10 text-[11px] text-ink-primary">
            <span className="font-semibold text-signal-heavy">
              Fixed-TOD beat adaptive ({losingCells.length} controller-cell comparisons; worst first):{' '}
            </span>
            <span className="font-mono tabular-nums text-ink-secondary">
              {losingCells
                .slice(0, 3)
                .map(
                  (l) =>
                    `${l.condition} [${controllerLabel(l.controller)} ${fmtSigned(l.pct, 1, '%')}]`
                )
                .join(' · ')}
              {losingCells.length > 3 ? ` (+${losingCells.length - 3} more below)` : ''}
            </span>
          </div>
        )}

        <div
          tabIndex={0}
          role="region"
          aria-label="30-cell control study results"
          className="overflow-x-auto max-h-[380px]"
        >
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-hairline text-ink-muted">
                <th scope="col" className="py-1.5 pr-3">Scenario / Window</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Scale (max Y)</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Fixed-TOD (s/veh)</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Webster vs Fixed</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Max-Pressure vs Fixed</th>
                <th scope="col" className="py-1.5 text-right">MP-CA vs Fixed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline font-mono tabular-nums">
              {!controlStudyRun?.cells ? (
                <tr>
                  <td colSpan={6} className="py-5 text-center text-ink-muted font-sans">
                    No control-study benchmark JSON found in benchmarks/results.
                  </td>
                </tr>
              ) : (
                visibleStudyCells.map((c, idx) => {
                  const baseMean = c.controllers?.['fixed-tod']?.avgDelayPerVehSec?.mean;
                  const renderCtrlCell = (ctrlKey) => {
                    const statsObj = c.controllers?.[ctrlKey]?.avgDelayPerVehSec;
                    const cmp = c.pairedVsFixedTod?.[ctrlKey]?.avgDelayPerVehSec;
                    if (!statsObj || !cmp) return <span className="text-ink-muted">—</span>;
                    const pct = Number(cmp.pctVsBaseline);
                    const cls = isCellWorse(cmp)
                      ? 'text-signal-heavy font-semibold'
                      : cmp.significant === 'better' || pct < -0.1
                        ? 'text-signal-flow'
                        : 'text-ink-secondary';
                    return (
                      <div>
                        <span className="text-ink-primary">{fmtNum(statsObj.mean, 1)}s </span>
                        <span className={cls}>({fmtSigned(pct, 1, '%')})</span>
                      </div>
                    );
                  };
                  const hasAnyWorse = ['webster', 'max-pressure', 'max-pressure-ca'].some(
                    (k) => isCellWorse(c.pairedVsFixedTod?.[k]?.avgDelayPerVehSec)
                  );
                  return (
                    <tr
                      key={`${c.scenarioId}-${c.windowId}-${c.demandScale}-${idx}`}
                      className={hasAnyWorse ? 'bg-signal-heavy/5' : ''}
                    >
                      <td className="py-1.5 pr-3 font-sans text-ink-primary">
                        {c.scenarioId} · {c.windowLabel || c.windowId}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ink-secondary whitespace-nowrap">
                        {fmtNum(c.demandScale, 2)}x ({fmtNum(c.criticalFlowProfile?.maxRawY, 2)})
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ink-primary">{fmtNum(baseMean, 1)}s</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">{renderCtrlCell('webster')}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">{renderCtrlCell('max-pressure')}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">{renderCtrlCell('max-pressure-ca')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4: Load Benchmark Accounting + 10s Live Probe */}
      <section id="eng-bench" className="scroll-mt-16 console-panel p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-ink-primary">
              Pipeline Throughput Accounting &amp; OTel Overhead Benchmark
            </h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Separate pipeline stage counters: HTTP-accepted/s vs persisted-to-Atlas/s vs delivered-to-sockets/s
              {!canAdmin && ' · Switch Demo persona to Supervisor to run the 10s live probe.'}
            </p>
          </div>
          <button
            type="button"
            disabled={benchBusy || !canAdmin}
            title={!canAdmin ? 'Supervisor persona required for 10s live loopback probe' : undefined}
            onClick={handleRunLiveBenchmark}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-accent-contrast text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-3 h-3" />
            <span>{benchBusy ? 'Probing 10s...' : 'Run 10s Live Probe'}</span>
          </button>
        </div>

        {/* Live 3-Stage Rates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="console-inset px-3 py-2">
            <div className="text-[11px] text-ink-muted">1. HTTP / Sim Accepted</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-ink-primary mt-0.5">
              {fmtInt(liveMetrics?.ingestRate)} events/s
            </div>
          </div>
          <div className="console-inset px-3 py-2">
            <div className="text-[11px] text-ink-muted">2. Persisted to Atlas</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-ink-primary mt-0.5">
              {fmtInt(liveMetrics?.persistRate)} docs/s
            </div>
          </div>
          <div className="console-inset px-3 py-2">
            <div className="text-[11px] text-ink-muted">3. Delivered to Sockets</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-ink-primary mt-0.5">
              {fmtInt(liveMetrics?.broadcastRate ?? stats?.broadcastRate)} frames/s
            </div>
            <div className="font-mono tabular-nums text-[10px] text-ink-muted mt-0.5">
              {fmtInt(liveMetrics?.connectedSockets ?? stats?.connectedSockets ?? 0)} sockets ·{' '}
              {fmtNum(((liveMetrics?.socketBytesPerSec ?? stats?.socketBytesPerSec) || 0) / 1024, 1)} KB/s ·{' '}
              {fmtInt(liveMetrics?.totalSocketFramesDelivered ?? stats?.totalSocketFramesDelivered ?? 0)} total
            </div>
          </div>
        </div>

        {benchProgressText && (
          <div aria-live="polite" className="px-2.5 py-2 rounded border border-accent/40 bg-accent/10 text-[11px] font-mono text-ink-primary">
            {benchProgressText}
          </div>
        )}
        {benchNotice && (
          <div
            role={benchNotice.isError ? 'alert' : 'status'}
            aria-live="polite"
            className={`px-2.5 py-2 rounded border text-[11px] font-mono ${
              benchNotice.isError
                ? 'border-signal-gridlock/40 bg-signal-gridlock/10 text-signal-gridlock'
                : 'border-signal-flow/40 bg-signal-flow/10 text-signal-flow'
            }`}
          >
            {benchNotice.text}
          </div>
        )}

        {loadBenchRuns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
              <thead>
                <tr className="border-b border-hairline text-ink-muted font-sans">
                  <th scope="col" className="py-1.5 pr-3">Benchmark Artifact</th>
                  <th scope="col" className="py-1.5 pr-3 text-right">Peak HTTP Accepted</th>
                  <th scope="col" className="py-1.5 pr-3 text-right">Peak Persisted</th>
                  <th scope="col" className="py-1.5 pr-3">Fanout Benchmark</th>
                  <th scope="col" className="py-1.5">OTel Overhead Comparison</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loadBenchRuns.map((run) => {
                  const otel = run.otelComparisonScenario;
                  const summary = run.summary || {};
                  return (
                    <tr key={run.filename}>
                      <td className="py-1.5 pr-3 text-ink-primary" title={run.filename}>
                        {formatBenchLabel(run)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ink-secondary whitespace-nowrap">
                        {summary.peakAcceptedEventsPerSec !== undefined
                          ? `${fmtNum(summary.peakAcceptedEventsPerSec, 1)} ev/s`
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ink-secondary whitespace-nowrap">
                        {summary.peakPersistedEventsPerSec !== undefined
                          ? `${fmtNum(summary.peakPersistedEventsPerSec, 1)} doc/s`
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-ink-secondary whitespace-nowrap">
                        {summary.fanout200FramesPerSec !== undefined ? (
                          <div>
                            <div>
                              200c: {fmtNum(summary.fanout200FramesPerSec, 0)} fr/s (p95{' '}
                              {fmtNum(summary.fanout200LatencyP95Ms, 1)} ms)
                            </div>
                            {summary.fanout500FramesPerSec !== undefined && (
                              <div className="text-[10px] text-ink-muted">
                                500c: {fmtNum(summary.fanout500FramesPerSec, 0)} fr/s (p95{' '}
                                {fmtNum(summary.fanout500LatencyP95Ms, 1)} ms)
                              </div>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-1.5 text-ink-muted font-sans">
                        {otel
                          ? `OTel OFF ${fmtInt(otel.otelDisabled?.eventsPerSec)}/s vs Sampled ${fmtInt(otel.otelSample5Pct?.eventsPerSec)}/s (latency delta ${fmtSigned(otel.latencyOverheadPct, 1, '%')})`
                          : run.generatedAt
                            ? fmtClockTime(run.generatedAt)
                            : 'Recorded'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 5: Scenario Presets, Chaos Lab & Simulator Controls */}
      <section id="eng-chaos" className="scroll-mt-[104px] console-panel p-4 space-y-4">
        {/* Realistic Bengaluru Scenario Presets + Admin Speed Controls */}
        <div className="pb-3 border-b border-hairline space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold text-ink-primary">
                Scenario Presets &amp; Twin Clock Controls
              </h2>
              <p className="text-[11px] text-ink-muted">
                Reset BOTH CRN twins to an authentic Bengaluru demand peak or compound incident, and optionally accelerate demo clock speed (Supervisor).
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" role="group" aria-label="Simulation speed">
              <span className="text-ink-muted mr-0.5">Sim speed:</span>
              {[1, 2, 5].map((spd) => {
                const activeSpd = Number(simStatus?.simSpeed || 1) === spd;
                return (
                  <button
                    key={spd}
                    type="button"
                    disabled={!canAdmin}
                    title={!canAdmin ? 'Supervisor persona required to adjust sim clock speed' : `Run physics clock at ${spd}x`}
                    onClick={() => handleSpeedChange(spd)}
                    className={`px-2 py-1 rounded border font-mono tabular-nums transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      activeSpd
                        ? 'bg-accent text-accent-contrast border-accent font-semibold'
                        : 'bg-inset border-hairline hover:border-hairlineStrong text-ink-primary'
                    }`}
                  >
                    {spd}x
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {(scenarios.length > 0
              ? scenarios
              : [
                  { id: 'pm-peak', title: 'PM Peak (18:30 IST)' },
                  { id: 'am-peak', title: 'AM Peak (09:00 IST)' },
                  { id: 'pm-stalled-silkboard', title: 'PM Peak + Silk Board Stall' },
                  { id: 'monsoon-pm-peak', title: 'Monsoon + PM Peak' },
                  { id: 'ambulance-corridor', title: 'Ambulance Corridor' },
                ]
            ).map((preset) => {
              const isActive = simState?.scenario === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!canOperateAny || scenarioBusy}
                  title={!canOperateAny ? 'Operator or Supervisor persona required' : preset.description || preset.title}
                  onClick={() => handleApplyScenario(preset)}
                  className={`px-3 py-1.5 rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isActive
                      ? 'bg-accent text-accent-contrast border-accent font-medium'
                      : 'bg-inset border-hairline hover:border-hairlineStrong text-ink-primary'
                  }`}
                >
                  {preset.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-ink-primary">Chaos Injection &amp; Simulator Run State</h3>
            <p className="text-[11px] text-ink-muted">
              Faults inject into BOTH Live &amp; Baseline twins (CRN parity); signal preemption acts strictly on Live twin.
              {!canOperateChaosTarget &&
                ` Switch Demo persona to Supervisor${targetZone ? ` or ${zoneLabel(targetZone)} Desk` : ''} to inject faults on ${chaosTarget}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
            <select
              aria-label="Chaos target junction"
              value={chaosTarget}
              onChange={(e) => setChaosTarget(e.target.value)}
              className="max-w-full min-w-0 truncate px-2 py-1 rounded border border-hairline bg-inset text-xs text-ink-primary"
            >
              {(devices || []).map((d) => (
                <option key={d.deviceId || d.junctionId} value={d.deviceId || d.junctionId}>
                  {d.name || d.deviceId} ({d.deviceId || d.junctionId})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!canOperateAny}
              title={!canOperateAny ? 'Operator or Supervisor persona required' : undefined}
              onClick={handleToggleSim}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-hairlineStrong bg-inset text-xs text-ink-primary disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {simStatus?.isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{simStatus?.isRunning ? 'Stop Sim' : 'Start Sim'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            disabled={!canOperateChaosTarget}
            onClick={() => handleChaos('stalledVehicle', 3.0, 25, { stalled: true }, 'Stalled Truck')}
            className="px-3 py-1.5 rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Inject Stalled Truck (25s)
          </button>
          <button
            type="button"
            disabled={!canOperateChaosTarget}
            onClick={() => handleChaos('ambulancePreemption', 1.0, 30, { ambulance: true }, 'Emergency Corridor')}
            className="px-3 py-1.5 rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Dispatch Emergency Responder
          </button>
          <button
            type="button"
            disabled={!canAdmin}
            title={!canAdmin ? 'Supervisor persona required for city-wide monsoon' : undefined}
            onClick={() => handleChaos('monsoon', 1.5, 35, { monsoon: true, capacityFactor: 0.7, speedFactor: 0.75 }, 'Monsoon Rain')}
            className="px-3 py-1.5 rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Trigger Network Monsoon (35s)
          </button>
          <button
            type="button"
            disabled={!canOperateChaosTarget}
            onClick={() => handleChaos('totalFlowVehiclesPerMin', 2.0, 25, {}, 'Demand Surge')}
            className="px-3 py-1.5 rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Inject 2x Demand Surge
          </button>
        </div>

        {chaosError && (
          <div role="alert" className="px-2.5 py-1.5 rounded border border-signal-gridlock/40 bg-signal-gridlock/10 text-[11px] text-signal-gridlock flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{chaosError}</span>
          </div>
        )}
        {chaosNotice && (
          <div aria-live="polite" className="px-2.5 py-1.5 rounded border border-signal-flow/40 bg-signal-flow/10 text-[11px] text-signal-flow flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{chaosNotice}</span>
          </div>
        )}
      </section>

      {/* SECTION 6: System Architecture Diagram */}
      <section id="eng-arch" className="scroll-mt-[104px] console-panel p-4 space-y-2">
        <h2 className="text-xs font-semibold text-ink-primary">
          Implemented System Architecture
        </h2>
        <ArchitectureSvg isDark={isDark} />
      </section>
    </div>
  );
}
