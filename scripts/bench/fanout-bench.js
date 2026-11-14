import { pathToFileURL } from 'url';
import { io as ioClient } from 'socket.io-client';
import {
  JUNCTIONS,
  ZONES,
  destroyHttpAgents,
  fetchServerMetrics,
  httpRequestJson,
  parseCliArgs,
  sleep,
  summarizeLatencySamples,
} from './common.js';

async function getViewerAuthToken(baseUrl) {
  try {
    const res = await httpRequestJson(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      body: { persona: 'viewer' },
    });
    if (res.status === 200 && res.json?.token) {
      return res.json.token;
    }
  } catch {
    // Fallback to anonymous viewer handshake
  }
  return null;
}

export async function runFanoutScenario({
  baseUrl,
  clientCount = 200,
  durationSec = 15,
  viewerToken = null,
}) {
  const token = viewerToken !== undefined ? viewerToken : await getViewerAuthToken(baseUrl);
  const sockets = [];
  const clockOffsets = [];
  const latencySamplesMs = [];
  let deliveredMessages = 0;
  let deliveredFrames = 0;
  let receivedBytes = 0;
  let measuring = false;

  const zoneQuota = Math.round(clientCount * 0.8);

  const connectOne = (idx) =>
    new Promise((resolve, reject) => {
      const sock = ioClient(baseUrl, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        timeout: 20000,
        auth: token ? { token } : {},
      });

      const onErr = (err) => {
        sock.off('connect', onConnect);
        try {
          sock.disconnect();
        } catch {
          // ignore
        }
        reject(err);
      };

      // Prevent unhandled manager/transport errors from aborting the process
      if (sock.io && typeof sock.io.on === 'function') {
        sock.io.on('error', () => {});
      }

      const onConnect = () => {
        sock.off('connect_error', onErr);
        const isZoneClient = idx < zoneQuota;
        const subReq = isZoneClient
          ? { city: false, zones: [ZONES[idx % ZONES.length]], junctions: [], alerts: [] }
          : {
              city: false,
              zones: [],
              junctions: [JUNCTIONS[idx % JUNCTIONS.length].junctionId],
              alerts: [],
            };

        sock.on('telemetry:zone', (pkt) => {
          if (!measuring || !pkt) return;
          deliveredMessages += 1;
          deliveredFrames += Array.isArray(pkt.rows) ? pkt.rows.length : 1;
          receivedBytes += Buffer.byteLength(JSON.stringify(['telemetry:zone', pkt]));
          const emitTs = Number(pkt.et || pkt.t0);
          if (Number.isFinite(emitTs) && emitTs > 0 && latencySamplesMs.length < 50000) {
            const avgOffset =
              clockOffsets.length > 0
                ? clockOffsets[Math.floor(clockOffsets.length / 2)]
                : 0;
            const lat = Math.max(0, Date.now() - (emitTs - avgOffset));
            if (lat < 30000) latencySamplesMs.push(lat);
          }
        });

        sock.on('telemetry:junction', (pkt) => {
          if (!measuring || !pkt) return;
          deliveredMessages += 1;
          deliveredFrames += Array.isArray(pkt.rows) ? pkt.rows.length : 1;
          receivedBytes += Buffer.byteLength(JSON.stringify(['telemetry:junction', pkt]));
          const emitTs = Number(pkt.et || pkt.t0);
          if (Number.isFinite(emitTs) && emitTs > 0 && latencySamplesMs.length < 50000) {
            const avgOffset =
              clockOffsets.length > 0
                ? clockOffsets[Math.floor(clockOffsets.length / 2)]
                : 0;
            const lat = Math.max(0, Date.now() - (emitTs - avgOffset));
            if (lat < 30000) latencySamplesMs.push(lat);
          }
        });

        sock.on('telemetry:pong', (pong = {}) => {
          const t3 = Date.now();
          const t0 = Number(pong.clientTimestamp);
          const t1 = Number(pong.serverRecvTimestamp ?? pong.serverTimestamp);
          const t2 = Number(pong.serverSendTimestamp ?? t1);
          if (Number.isFinite(t0) && Number.isFinite(t1) && Number.isFinite(t2)) {
            const offset = (t1 - t0 + (t2 - t3)) / 2;
            clockOffsets.push(offset);
            clockOffsets.sort((a, b) => a - b);
            if (clockOffsets.length > 100) clockOffsets.shift();
          }
        });

        sock.emit('subscribe', subReq);
        if (idx < 20) {
          sock.emit('telemetry:ping', Date.now());
        }
        resolve(sock);
      };

      sock.once('connect_error', onErr);
      sock.once('connect', onConnect);
    });

  try {
    // Connect in chunks of 15 sockets with brief pacing to avoid local TCP backlog exhaustion
    for (let start = 0; start < clientCount; start += 15) {
      const end = Math.min(clientCount, start + 15);
      const batch = [];
      for (let i = start; i < end; i++) {
        batch.push(connectOne(i));
      }
      const connected = await Promise.all(batch);
      sockets.push(...connected);
      if (end < clientCount) {
        await sleep(40);
      }
    }

    // Allow initial subscribed rooms & NTP ping calibration to settle
    await sleep(500);
    for (let i = 0; i < Math.min(20, sockets.length); i++) {
      sockets[i].emit('telemetry:ping', Date.now());
    }
    await sleep(200);

    const beforeMetrics = await fetchServerMetrics(baseUrl);
    const startWallMs = performance.now();
    const startCpu = beforeMetrics.process?.cpuUsageMicros || { user: 0, system: 0 };
    const startCoalesced = beforeMetrics.metrics?.socketCoalescedCount || 0;
    const startDropped = beforeMetrics.metrics?.socketDroppedCount || 0;
    const startServerBytes = beforeMetrics.metrics?.totalSocketBytes || 0;

    measuring = true;
    const pingTimer = setInterval(() => {
      for (let i = 0; i < Math.min(10, sockets.length); i++) {
        if (sockets[i].connected) sockets[i].emit('telemetry:ping', Date.now());
      }
    }, 3000);

    await sleep(durationSec * 1000);
    clearInterval(pingTimer);
    measuring = false;

    const elapsedSec = Math.max(0.001, (performance.now() - startWallMs) / 1000);
    const afterMetrics = await fetchServerMetrics(baseUrl);
    const endCpu = afterMetrics.process?.cpuUsageMicros || { user: 0, system: 0 };
    const cpuDeltaUs =
      (endCpu.user || 0) - (startCpu.user || 0) + ((endCpu.system || 0) - (startCpu.system || 0));
    const serverCpuPct = Number(((cpuDeltaUs / (elapsedSec * 1e6)) * 100).toFixed(2));

    const calibratedOffsetMs =
      clockOffsets.length > 0
        ? Number(clockOffsets[Math.floor(clockOffsets.length / 2)].toFixed(2))
        : 0;

    return {
      clientCount: sockets.length,
      zoneClients: zoneQuota,
      junctionClients: Math.max(0, sockets.length - zoneQuota),
      durationSec: Number(elapsedSec.toFixed(2)),
      deliveredMessages,
      deliveredFrames,
      deliveredFramesPerSec: Number((deliveredFrames / elapsedSec).toFixed(1)),
      receivedBytes,
      perClientBytesPerSec: Number((receivedBytes / Math.max(1, sockets.length) / elapsedSec).toFixed(1)),
      totalClientBytesPerSec: Number((receivedBytes / elapsedSec).toFixed(1)),
      serverSocketBytesDelta: Math.max(0, (afterMetrics.metrics?.totalSocketBytes || 0) - startServerBytes),
      coalescedDelta: Math.max(0, (afterMetrics.metrics?.socketCoalescedCount || 0) - startCoalesced),
      droppedDelta: Math.max(0, (afterMetrics.metrics?.socketDroppedCount || 0) - startDropped),
      calibratedClockOffsetMs: calibratedOffsetMs,
      latencyMs: summarizeLatencySamples(latencySamplesMs),
      serverProcess: {
        cpuPct: serverCpuPct,
        rssMb: afterMetrics.process?.memoryUsage?.rssMb || 0,
        heapUsedMb: afterMetrics.process?.memoryUsage?.heapUsedMb || 0,
        eventLoopLagMs:
          afterMetrics.process?.eventLoopLagMs ?? afterMetrics.metrics?.eventLoopLagMs ?? 0,
        eventLoopLagP99Ms:
          afterMetrics.process?.eventLoopLagP99Ms ?? afterMetrics.metrics?.eventLoopLagP99Ms ?? 0,
      },
    };
  } finally {
    for (const s of sockets) {
      try {
        s.disconnect();
      } catch {
        // ignore
      }
    }
    await sleep(300);
  }
}

export async function runFanoutBench({
  baseUrl = 'http://localhost:5000',
  clientCounts = [200],
  durationSec = 15,
} = {}) {
  const token = await getViewerAuthToken(baseUrl);
  const scenarios = [];
  for (const count of clientCounts) {
    const res = await runFanoutScenario({
      baseUrl,
      clientCount: count,
      durationSec,
      viewerToken: token,
    });
    scenarios.push(res);
    console.error(
      `[fanout-bench] clients=${res.clientCount} -> frames/s=${res.deliveredFramesPerSec}, perClient=${res.perClientBytesPerSec} B/s, latP95=${res.latencyMs.p95}ms, coalesced=${res.coalescedDelta}, dropped=${res.droppedDelta}, cpu=${res.serverProcess.cpuPct}%, rss=${res.serverProcess.rssMb}MB`
    );
    await sleep(600);
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
  const clientCounts = args.sweep
    ? [50, 200, 500]
    : args.clients
      ? String(args.clients).split(',').map((n) => Number(n.trim()))
      : [200];

  try {
    const scenarios = await runFanoutBench({ baseUrl, clientCounts, durationSec });
    console.log(JSON.stringify({ baseUrl, durationSec, scenarios }, null, 2));
  } finally {
    destroyHttpAgents();
  }
}
