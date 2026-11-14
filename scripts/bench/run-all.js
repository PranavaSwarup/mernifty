import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  collectHostMetadata,
  destroyHttpAgents,
  fetchServerTracesMeta,
  parseCliArgs,
} from './common.js';
import { runIngestBench } from './ingest-bench.js';
import { runFanoutBench } from './fanout-bench.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_DIR = path.resolve(__dirname, '../../benchmarks/results');

// Baseline comparison from T06 batched OTel overhead micro-benchmark (300 x 100 events = 30,000 events)
export const T06_OTEL_MICROBENCH = {
  description: 'In-process Express + MongoMemoryServer batch ingest (300 requests x 100 events = 30,000 events)',
  otelDisabled: {
    eventsPerSec: 7689.8,
    elapsedMs: 3901.26,
    meanReqMs: 12.788,
    p95ReqMs: 21.759,
  },
  otelSample5Pct: {
    eventsPerSec: 7667.1,
    elapsedMs: 3912.82,
    meanReqMs: 12.875,
    p95ReqMs: 20.214,
  },
  latencyOverheadPct: 0.3,
};

function summarizeRun(ingestScenarios, fanoutScenarios) {
  let peakAcceptedScenario = null;
  let peakPersistedScenario = null;
  for (const s of ingestScenarios) {
    if (!peakAcceptedScenario || s.acceptedEventsPerSec > peakAcceptedScenario.acceptedEventsPerSec) {
      peakAcceptedScenario = s;
    }
    if (!peakPersistedScenario || s.persistedEventsPerSec > peakPersistedScenario.persistedEventsPerSec) {
      peakPersistedScenario = s;
    }
  }

  const fanout200 =
    fanoutScenarios.find((f) => f.clientCount === 200) ||
    fanoutScenarios[fanoutScenarios.length - 1] ||
    null;
  const fanout500 = fanoutScenarios.find((f) => f.clientCount === 500) || null;

  return {
    peakAcceptedEventsPerSec: peakAcceptedScenario?.acceptedEventsPerSec || 0,
    peakAcceptedConfig: peakAcceptedScenario
      ? `c=${peakAcceptedScenario.concurrency}, b=${peakAcceptedScenario.batchSize}`
      : null,
    peakAcceptedRttP95Ms: peakAcceptedScenario?.rttMs?.p95 || 0,
    peakPersistedEventsPerSec: peakPersistedScenario?.persistedEventsPerSec || 0,
    peakPersistedConfig: peakPersistedScenario
      ? `c=${peakPersistedScenario.concurrency}, b=${peakPersistedScenario.batchSize}`
      : null,
    fanout200FramesPerSec: fanout200?.deliveredFramesPerSec || 0,
    fanout200PerClientBytesPerSec: fanout200?.perClientBytesPerSec || 0,
    fanout200LatencyP50Ms: fanout200?.latencyMs?.p50 || 0,
    fanout200LatencyP95Ms: fanout200?.latencyMs?.p95 || 0,
    fanout200LatencyP99Ms: fanout200?.latencyMs?.p99 || 0,
    fanout500FramesPerSec: fanout500?.deliveredFramesPerSec || null,
    fanout500LatencyP95Ms: fanout500?.latencyMs?.p95 ?? null,
    fanout500ServerCpuPct: fanout500?.serverProcess?.cpuPct ?? null,
    fanout500ServerRssMb: fanout500?.serverProcess?.rssMb ?? null,
  };
}

function buildLatestMarkdown(allRunReports) {
  const sorted = [...allRunReports].sort((a, b) =>
    String(b.generatedAt).localeCompare(String(a.generatedAt))
  );
  const latest = sorted[0];
  const otelOnRun = sorted.find((r) => r.metadata?.otelEnabled === true);
  const otelOffRun = sorted.find((r) => r.metadata?.otelEnabled === false);

  const lines = [
    '# MetroPulse Benchmark Results (Latest)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '> **Honest Accounting Note:** HTTP ingestion writes telemetry into the in-memory `IngestionBuffer` (`events.accepted`), while asynchronous background flushes write micro-batches to MongoDB (`events.persisted`), and the Socket.IO broadcast loop delivers compact Wire v1 frames to subscribed clients (`deliveredFramesPerSec`). **HTTP-accepted/s != persisted-to-Atlas/s != delivered-to-sockets/s.**',
    '',
    '## Host & Target Environment (Latest Run)',
    '',
    `- **Git Commit:** \`${latest.metadata.gitCommitSha}\``,
    `- **Node Version:** \`${latest.metadata.nodeVersion}\``,
    `- **OS / CPU / RAM:** ${latest.metadata.os} | ${latest.metadata.cpuModel} (${latest.metadata.cpuCores} cores) | ${latest.metadata.totalRamGb} GB RAM`,
    `- **Server Target:** ${latest.metadata.target} (\`${latest.metadata.targetUrl}\`)`,
    `- **Mongo Target:** ${latest.metadata.mongoTarget}`,
    `- **OpenTelemetry:** enabled=${latest.metadata.otelEnabled}, sampleRatio=${latest.metadata.otelSampleRatio}`,
    '',
    '## 1. HTTP Batch Ingestion Throughput & Mongo Persistence',
    '',
    '| Run Label | Concurrency | Batch Size | Accepted/s (HTTP 202) | Persisted/s (DB Flush) | HTTP RTT p50 / p95 / p99 (ms) | 429 | 503 | Dropped | Server RSS (MB) |',
    '| :--- | ---: | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: |',
  ];

  for (const run of sorted.slice(0, 2)) {
    const label = run.metadata.otelEnabled
      ? `OTel On (${run.metadata.otelSampleRatio})`
      : 'OTel Disabled';
    for (const s of run.ingestScenarios || []) {
      lines.push(
        `| ${label} | ${s.concurrency} | ${s.batchSize} | **${s.acceptedEventsPerSec.toLocaleString()}** | **${s.persistedEventsPerSec.toLocaleString()}** | ${s.rttMs.p50} / ${s.rttMs.p95} / ${s.rttMs.p99} | ${s.http429Count} | ${s.http503Count} | ${s.droppedDelta} | ${s.serverRssMb} |`
      );
    }
  }

  lines.push(
    '',
    '## 2. Socket.IO Real-Time Fan-Out (Viewer Rooms: 80% Zone / 20% Junction)',
    '',
    '| Run Label | Clients | Delivered Frames/s | Per-Client Egress (B/s) | E2E Emit->Recv p50 / p95 / p99 (ms) | Clock Offset (ms) | Coalesced | Dropped | Server CPU% | Server RSS (MB) | Loop Lag p99 (ms) |',
    '| :--- | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  );

  for (const run of sorted.slice(0, 2)) {
    const label = run.metadata.otelEnabled
      ? `OTel On (${run.metadata.otelSampleRatio})`
      : 'OTel Disabled';
    for (const f of run.fanoutScenarios || []) {
      lines.push(
        `| ${label} | ${f.clientCount} | **${f.deliveredFramesPerSec.toLocaleString()}** | ${f.perClientBytesPerSec.toLocaleString()} | ${f.latencyMs.p50} / ${f.latencyMs.p95} / ${f.latencyMs.p99} | ${f.calibratedClockOffsetMs} | ${f.coalescedDelta} | ${f.droppedDelta} | ${f.serverProcess.cpuPct}% | ${f.serverProcess.rssMb} | ${f.serverProcess.eventLoopLagP99Ms} |`
      );
    }
  }

  lines.push('', '## 3. OpenTelemetry Overhead Comparison (End-to-End & T06 Micro-Benchmark)', '');
  if (otelOnRun && otelOffRun) {
    lines.push(
      `- **Full Benchmark (OTel On @ ${otelOnRun.metadata.otelSampleRatio} vs OTel Disabled):** Peak HTTP-accepted=${otelOnRun.summary.peakAcceptedEventsPerSec.toLocaleString()} ev/s (vs ${otelOffRun.summary.peakAcceptedEventsPerSec.toLocaleString()} ev/s disabled); Peak persisted=${otelOnRun.summary.peakPersistedEventsPerSec.toLocaleString()} ev/s (vs ${otelOffRun.summary.peakPersistedEventsPerSec.toLocaleString()} ev/s disabled); 200-client fan-out p95=${otelOnRun.summary.fanout200LatencyP95Ms} ms (vs ${otelOffRun.summary.fanout200LatencyP95Ms} ms disabled).`
    );
  }
  lines.push(
    `- **T06 Micro-Benchmark (30,000 events, 300 x 100 batches against MongoMemoryServer):** OTel Disabled=${T06_OTEL_MICROBENCH.otelDisabled.eventsPerSec.toLocaleString()} ev/s (${T06_OTEL_MICROBENCH.otelDisabled.elapsedMs} ms) vs OTel 5%=${T06_OTEL_MICROBENCH.otelSample5Pct.eventsPerSec.toLocaleString()} ev/s (${T06_OTEL_MICROBENCH.otelSample5Pct.elapsedMs} ms) -> **+${T06_OTEL_MICROBENCH.latencyOverheadPct}%** latency overhead.`,
    '',
    '## 4. Persistence Bottleneck & Atlas M0 Analysis',
    ''
  );

  const checkAtlasLimit =
    latest.summary.peakPersistedEventsPerSec > 0 &&
    latest.summary.peakAcceptedEventsPerSec > latest.summary.peakPersistedEventsPerSec * 1.15;
  if (checkAtlasLimit) {
    lines.push(
      `Persisted throughput (**${latest.summary.peakPersistedEventsPerSec.toLocaleString()} events/s** peak) is lower than peak HTTP-accepted ingestion (**${latest.summary.peakAcceptedEventsPerSec.toLocaleString()} events/s**) because shared MongoDB ${latest.metadata.mongoTarget} IOPS, network RTT to cloud Atlas, and compound telemetry index writes limit sustained \`insertMany\` + \`Device.bulkWrite\` commit speed. The write-behind \`IngestionBuffer\` absorbs bursts cleanly in RAM up to capacity before applying explicit HTTP \`503\` backpressure.`
    );
  } else {
    lines.push(
      `In this run against ${latest.metadata.mongoTarget}, peak persisted throughput (**${latest.summary.peakPersistedEventsPerSec.toLocaleString()} events/s**) closely tracked HTTP-accepted throughput (**${latest.summary.peakAcceptedEventsPerSec.toLocaleString()} events/s**) under the configured rate/duration window; any higher sustained bursts exceeding Atlas write IOPS accumulate in \`IngestionBuffer\` until drained or backpressured (\`503\`).`
    );
  }

  lines.push('');
  return lines.join('\n');
}

export async function runAllBenchmarks({
  baseUrl = 'http://localhost:5000',
  apiKey = process.env.METROPULSE_API_KEY,
  ingestDurationSec = 15,
  fanoutDurationSec = 15,
  concurrencies = [1, 4, 16],
  batchSizes = [100, 500],
  fanoutCounts = [50, 200, 500],
  target = process.env.BENCH_TARGET || 'local',
  mongoTarget = process.env.MONGO_TARGET_LABEL || 'Atlas M0 (remote cluster)',
  outTag = '',
} = {}) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const hostMeta = collectHostMetadata();
  const otelMeta = await fetchServerTracesMeta(baseUrl);

  console.error(
    `[run-all] Target=${baseUrl} (${target}), Mongo=${mongoTarget}, OTel=${otelMeta.enabled} (ratio=${otelMeta.sampleRatio})`
  );

  const ingestScenarios = await runIngestBench({
    baseUrl,
    apiKey,
    concurrencies,
    batchSizes,
    durationSec: ingestDurationSec,
  });

  const fanoutScenarios = await runFanoutBench({
    baseUrl,
    clientCounts: fanoutCounts,
    durationSec: fanoutDurationSec,
  });

  const summary = summarizeRun(ingestScenarios, fanoutScenarios);
  const generatedAt = new Date().toISOString();
  const safeIso = generatedAt.replace(/[:.]/g, '-');
  const tagSuffix = outTag
    ? `-${outTag.replace(/[^A-Za-z0-9_-]/g, '')}`
    : otelMeta.enabled
      ? '-otel-on'
      : '-otel-off';
  const fileName = `${safeIso}-${hostMeta.hostname}${tagSuffix}.json`;
  const outPath = path.join(RESULTS_DIR, fileName);

  const report = {
    kind: 'load-benchmark',
    generatedAt,
    metadata: {
      ...hostMeta,
      target,
      targetUrl: baseUrl,
      mongoTarget,
      otelEnabled: otelMeta.enabled,
      otelSampleRatio: otelMeta.sampleRatio,
      serviceName: otelMeta.serviceName,
      serviceVersion: otelMeta.serviceVersion,
    },
    summary,
    otelComparisonScenario: T06_OTEL_MICROBENCH,
    ingestScenarios,
    fanoutScenarios,
  };

  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // Re-generate latest.md from all recorded load-benchmark JSONs
  const existingReports = [];
  for (const name of fs.readdirSync(RESULTS_DIR)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, name), 'utf8'));
      if (parsed.kind === 'load-benchmark') {
        existingReports.push(parsed);
      }
    } catch {
      // ignore invalid json
    }
  }
  const latestMdPath = path.join(RESULTS_DIR, 'latest.md');
  fs.writeFileSync(latestMdPath, buildLatestMarkdown(existingReports), 'utf8');

  return { report, outPath, latestMdPath };
}

const isMain = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
);
if (isMain) {
  const args = parseCliArgs();
  const baseUrl = (args.url || process.env.TARGET_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const ingestDurationSec = Number(args['ingest-duration'] || args.duration || 15);
  const fanoutDurationSec = Number(args['fanout-duration'] || args.duration || 15);
  const fanoutCounts = args['fanout-counts']
    ? String(args['fanout-counts']).split(',').map((n) => Number(n.trim()))
    : [50, 200, 500];
  const concurrencies = args.concurrencies
    ? String(args.concurrencies).split(',').map((n) => Number(n.trim()))
    : [1, 4, 16];
  const batchSizes = args['batch-sizes']
    ? String(args['batch-sizes']).split(',').map((n) => Number(n.trim()))
    : [100, 500];

  try {
    const { outPath, latestMdPath, report } = await runAllBenchmarks({
      baseUrl,
      ingestDurationSec,
      fanoutDurationSec,
      concurrencies,
      batchSizes,
      fanoutCounts,
      target: args.target || process.env.BENCH_TARGET || 'local',
      mongoTarget: args['mongo-target'] || process.env.MONGO_TARGET_LABEL || 'Atlas M0 (remote cluster)',
      outTag: args['out-tag'] || '',
    });
    console.log(JSON.stringify({ outPath, latestMdPath, summary: report.summary }, null, 2));
  } finally {
    destroyHttpAgents();
  }
}
