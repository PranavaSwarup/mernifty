import crypto from 'crypto';
import { pathToFileURL } from 'url';
import {
  destroyHttpAgents,
  extractPersistedCount,
  fetchServerMetrics,
  httpRequestJson,
  makeBatchPayload,
  parseCliArgs,
  sleep,
  summarizeLatencySamples,
} from './common.js';

export async function runIngestScenario({
  baseUrl,
  apiKey,
  concurrency,
  batchSize,
  durationSec = 15,
  drainTimeoutMs = 6000,
}) {
  const headers = { 'X-API-Key': apiKey };
  const runTag = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  let seqCounter = Math.floor(Date.now() % 1000000);

  const beforeSnap = await fetchServerMetrics(baseUrl);
  const startPersisted = extractPersistedCount(beforeSnap);
  const startTotalIngested = beforeSnap.metrics?.totalIngested || 0;
  const startTotalDropped = beforeSnap.metrics?.totalDropped || 0;
  const startTotalDuplicates = beforeSnap.metrics?.totalDuplicates || 0;
  const startTotalLoadShed = beforeSnap.metrics?.totalLoadShed || 0;

  const rtts = [];
  let acceptedEvents = 0;
  let http202Count = 0;
  let http429Count = 0;
  let http503Count = 0;
  let httpOtherErrorCount = 0;
  let requestsSent = 0;

  const stopAt = performance.now() + durationSec * 1000;
  const sendStartMs = performance.now();

  async function worker() {
    while (performance.now() < stopAt) {
      const startSeq = seqCounter;
      seqCounter += batchSize;
      const batch = makeBatchPayload({ batchSize, runTag, startSeq });
      try {
        const res = await httpRequestJson(`${baseUrl}/api/telemetry/batch`, {
          method: 'POST',
          headers,
          body: batch,
          timeoutMs: 20000,
        });
        requestsSent += 1;
        rtts.push(res.rttMs);
        if (res.status === 202 || res.status === 200) {
          http202Count += 1;
          acceptedEvents += res.json?.acceptedCount ?? batch.length;
        } else if (res.status === 429) {
          http429Count += 1;
        } else if (res.status === 503) {
          http503Count += 1;
        } else {
          httpOtherErrorCount += 1;
        }
      } catch {
        requestsSent += 1;
        httpOtherErrorCount += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const sendElapsedSec = Math.max(0.001, (performance.now() - sendStartMs) / 1000);

  // Measure database persistence separately by draining queued events
  let afterSnap = await fetchServerMetrics(baseUrl);
  let lastPersisted = extractPersistedCount(afterSnap);
  let stablePolls = 0;
  const drainDeadline = performance.now() + drainTimeoutMs;

  while (performance.now() < drainDeadline) {
    const queueDepth = afterSnap.metrics?.bufferSize || 0;
    if (queueDepth === 0 && stablePolls >= 2) break;
    await sleep(300);
    afterSnap = await fetchServerMetrics(baseUrl);
    const curPersisted = extractPersistedCount(afterSnap);
    if (curPersisted === lastPersisted && queueDepth === 0) {
      stablePolls += 1;
    } else {
      stablePolls = 0;
      lastPersisted = curPersisted;
    }
  }

  const totalElapsedWithDrainSec = Math.max(
    sendElapsedSec,
    (performance.now() - sendStartMs) / 1000
  );

  const endPersisted = extractPersistedCount(afterSnap);
  const persistedDelta = Math.max(0, endPersisted - startPersisted);
  const ingestedDelta = Math.max(0, (afterSnap.metrics?.totalIngested || 0) - startTotalIngested);
  const droppedDelta = Math.max(0, (afterSnap.metrics?.totalDropped || 0) - startTotalDropped);
  const duplicatesDelta = Math.max(0, (afterSnap.metrics?.totalDuplicates || 0) - startTotalDuplicates);
  const loadShedDelta = Math.max(0, (afterSnap.metrics?.totalLoadShed || 0) - startTotalLoadShed);

  const acceptedEventsPerSec = Number((acceptedEvents / sendElapsedSec).toFixed(1));
  const persistedEventsPerSec = Number((persistedDelta / totalElapsedWithDrainSec).toFixed(1));

  return {
    concurrency,
    batchSize,
    durationSec: Number(sendElapsedSec.toFixed(2)),
    totalWithDrainSec: Number(totalElapsedWithDrainSec.toFixed(2)),
    requestsSent,
    http202Count,
    http429Count,
    http503Count,
    httpOtherErrorCount,
    acceptedEvents,
    acceptedEventsPerSec,
    persistedDelta,
    persistedEventsPerSec,
    ingestedDelta,
    droppedDelta,
    duplicatesDelta,
    loadShedDelta,
    endBufferSize: afterSnap.metrics?.bufferSize || 0,
    rttMs: summarizeLatencySamples(rtts),
    serverRssMb: afterSnap.process?.memoryUsage?.rssMb || 0,
    eventLoopLagMs: afterSnap.process?.eventLoopLagMs ?? afterSnap.metrics?.eventLoopLagMs ?? 0,
  };
}

export async function runIngestBench({
  baseUrl = 'http://localhost:5000',
  apiKey = process.env.METROPULSE_API_KEY,
  concurrencies = [1, 4, 16],
  batchSizes = [100, 500],
  durationSec = 15,
} = {}) {
  if (!apiKey) {
    throw new Error('METROPULSE_API_KEY env var (or apiKey option) is required for ingest-bench');
  }

  const scenarios = [];
  for (const concurrency of concurrencies) {
    for (const batchSize of batchSizes) {
      const result = await runIngestScenario({
        baseUrl,
        apiKey,
        concurrency,
        batchSize,
        durationSec,
      });
      scenarios.push(result);
      console.error(
        `[ingest-bench] c=${concurrency} b=${batchSize} -> accepted=${result.acceptedEventsPerSec}/s, persisted=${result.persistedEventsPerSec}/s (429=${result.http429Count}, 503=${result.http503Count}, p95=${result.rttMs.p95}ms)`
      );
      await sleep(500);
    }
  }

  return scenarios;
}

const isMain = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
);
if (isMain) {
  const args = parseCliArgs();
  const baseUrl = (args.url || process.env.TARGET_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const durationSec = Number(args.duration || process.env.BENCH_DURATION_SEC || 15);
  const concurrencies = args.concurrency
    ? String(args.concurrency).split(',').map((n) => Number(n.trim()))
    : [1, 4, 16];
  const batchSizes = args['batch-sizes']
    ? String(args['batch-sizes']).split(',').map((n) => Number(n.trim()))
    : [100, 500];

  try {
    const results = await runIngestBench({
      baseUrl,
      concurrencies,
      batchSizes,
      durationSec,
    });
    console.log(JSON.stringify({ baseUrl, durationSec, scenarios: results }, null, 2));
  } finally {
    destroyHttpAgents();
  }
}
