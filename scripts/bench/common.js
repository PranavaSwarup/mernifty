import http from 'http';
import https from 'https';
import os from 'os';
import { execSync } from 'child_process';

export const ZONES = [
  'south-bangalore',
  'east-bangalore',
  'north-bangalore',
  'central-bangalore',
];

export const JUNCTIONS = [
  { junctionId: 'JNC-BLR-001', zoneId: 'south-bangalore' },
  { junctionId: 'JNC-BLR-002', zoneId: 'south-bangalore' },
  { junctionId: 'JNC-BLR-003', zoneId: 'south-bangalore' },
  { junctionId: 'JNC-BLR-004', zoneId: 'south-bangalore' },
  { junctionId: 'JNC-BLR-005', zoneId: 'east-bangalore' },
  { junctionId: 'JNC-BLR-006', zoneId: 'east-bangalore' },
  { junctionId: 'JNC-BLR-007', zoneId: 'east-bangalore' },
  { junctionId: 'JNC-BLR-008', zoneId: 'north-bangalore' },
  { junctionId: 'JNC-BLR-009', zoneId: 'north-bangalore' },
  { junctionId: 'JNC-BLR-010', zoneId: 'north-bangalore' },
  { junctionId: 'JNC-BLR-011', zoneId: 'central-bangalore' },
  { junctionId: 'JNC-BLR-012', zoneId: 'central-bangalore' },
];

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 128 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 128 });

export function destroyHttpAgents() {
  httpAgent.destroy();
  httpsAgent.destroy();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function percentile(sortedValues, q) {
  if (!sortedValues || sortedValues.length === 0) return 0;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor(q * (sortedValues.length - 1)))
  );
  return Number(sortedValues[idx].toFixed(2));
}

export function summarizeLatencySamples(samples) {
  if (!samples || samples.length === 0) {
    return { count: 0, min: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(2)),
    mean: Number((sum / sorted.length).toFixed(2)),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

export function httpRequestJson(fullUrl, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const payloadStr =
      body === null || body === undefined
        ? null
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);

    const reqHeaders = { ...headers };
    if (payloadStr !== null) {
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payloadStr);
    }

    const t0 = performance.now();
    const req = transport.request(
      parsed,
      {
        method,
        headers: reqHeaders,
        agent: isHttps ? httpsAgent : httpAgent,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rttMs = performance.now() - t0;
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json, raw, rttMs });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`HTTP timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (payloadStr !== null) {
      req.write(payloadStr);
    }
    req.end();
  });
}

export async function fetchServerMetrics(baseUrl) {
  const res = await httpRequestJson(`${baseUrl}/api/observability/metrics`);
  if (res.status !== 200 || !res.json?.success) {
    throw new Error(`Failed to fetch /api/observability/metrics: HTTP ${res.status}`);
  }
  return res.json;
}

export async function fetchServerTracesMeta(baseUrl) {
  const res = await httpRequestJson(`${baseUrl}/api/observability/traces?limit=1`);
  if (res.status !== 200 || !res.json?.success) {
    return { enabled: false, sampleRatio: 0, serviceName: 'unknown', serviceVersion: 'unknown' };
  }
  return {
    enabled: Boolean(res.json.enabled),
    sampleRatio: Number(res.json.sampleRatio ?? 0),
    serviceName: res.json.serviceName || 'metropulse-ingest',
    serviceVersion: res.json.serviceVersion || '1.0.0',
  };
}

export function extractPersistedCount(metricsPayload) {
  const otelPersisted = metricsPayload?.counters?.['events.persisted'];
  if (typeof otelPersisted === 'number') return otelPersisted;
  return metricsPayload?.metrics?.totalPersisted || 0;
}

export function makeBatchPayload({ batchSize, runTag, startSeq }) {
  const nowIso = new Date().toISOString();
  const events = new Array(batchSize);
  for (let i = 0; i < batchSize; i++) {
    const seq = startSeq + i;
    const target = JUNCTIONS[seq % JUNCTIONS.length];
    events[i] = {
      eventId: `EVT-BENCH-${runTag}-${seq}`,
      junctionId: target.junctionId,
      zoneId: target.zoneId,
      timestamp: nowIso,
      sequence: seq,
      source: 'bench',
      data: {
        approaches: [
          {
            road: 'Primary Arterial',
            dir: 'S',
            lanes: 3,
            vehiclesPerMin: 42,
            queueLengthM: 68,
            avgSpeedKmph: 21.5,
            signal: 'green',
          },
          {
            road: 'Cross Arterial',
            dir: 'E',
            lanes: 3,
            vehiclesPerMin: 36,
            queueLengthM: 84,
            avgSpeedKmph: 16.2,
            signal: 'red',
          },
        ],
        vehicleMix: { twoWheeler: 0.55, car: 0.3, bus: 0.05, truck: 0.1 },
      },
    };
  }
  return events;
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eqIdx = a.indexOf('=');
    if (eqIdx !== -1) {
      opts[a.slice(2, eqIdx)] = a.slice(eqIdx + 1);
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i += 1;
      } else {
        opts[key] = true;
      }
    }
  }
  return opts;
}

export function collectHostMetadata() {
  let gitCommitSha = 'unknown';
  try {
    gitCommitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // ignore
  }
  const cpus = os.cpus() || [];
  return {
    hostname: os.hostname(),
    gitCommitSha,
    nodeVersion: process.version,
    os: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpuModel: cpus[0]?.model?.trim() || 'unknown',
    cpuCores: cpus.length,
    totalRamGb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
  };
}
