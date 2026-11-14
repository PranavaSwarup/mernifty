/**
 * Pure history + live Socket.IO frame reconciliation utilities.
 * Ensures zero duplicate points during overlap between REST /api/telemetry/history
 * and streaming Socket.IO frames, while tracking exact seam & suppression counters.
 */

export function formatChartPoint(evt, sourceType = 'HISTORICAL_MONGODB') {
  const m = evt?.metrics || evt?.data || {};
  const tsRaw = evt?.timestamp || Date.now();
  const tsDate = new Date(tsRaw);
  const tsMs = Number.isFinite(tsDate.getTime()) ? tsDate.getTime() : Date.now();
  const timeLabel = tsDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return {
    eventId: evt?.eventId || `${evt?.junctionId || evt?.deviceId || 'j'}:${evt?.sequence ?? tsMs}`,
    sequence: typeof evt?.sequence === 'number' ? evt.sequence : Number(evt?.sequence) || 0,
    timestamp: timeLabel,
    formattedTime: timeLabel,
    rawTimestamp: tsMs,
    maxQueueLengthM: m.maxQueueLengthM ?? 0,
    avgSpeedKmph: m.avgSpeedKmph ?? 0,
    totalFlowVehiclesPerMin: m.totalFlowVehiclesPerMin ?? 0,
    congestionScore: m.congestionScore ?? 0,
    status: evt?.status || 'healthy',
    sourceType,
  };
}

export function createHistoryLiveState(records = [], serverCursor = 0, maxPoints = 1200) {
  const seenKeys = new Set();
  const points = [];
  let maxSeq = Number(serverCursor) || 0;

  const sorted = [...(records || [])].sort((a, b) => {
    const sa = Number(a?.sequence) || 0;
    const sb = Number(b?.sequence) || 0;
    if (sa !== sb) return sa - sb;
    return new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime();
  });

  for (const rec of sorted) {
    const seq = Number(rec?.sequence) || 0;
    const key = seq > 0 ? `seq:${seq}` : `id:${rec?.eventId}`;
    if (seenKeys.has(key) || (rec?.eventId && seenKeys.has(`id:${rec.eventId}`))) {
      continue;
    }
    seenKeys.add(key);
    if (rec?.eventId) seenKeys.add(`id:${rec.eventId}`);
    if (seq > maxSeq) maxSeq = seq;
    points.push(formatChartPoint(rec, 'HISTORICAL_MONGODB'));
  }

  const trimmed = points.slice(-maxPoints);
  return {
    points: trimmed,
    cursor: maxSeq,
    seenKeys,
    maxPoints,
    historicalCount: trimmed.length,
    liveCount: 0,
    duplicateSuppressed: 0,
    liveSinceTime: null,
    seamLabel: null,
  };
}

export function mergeLiveFrame(state, frame) {
  if (!state || !frame) return state;
  const seq = Number(frame?.sequence) || 0;
  const seqKey = seq > 0 ? `seq:${seq}` : null;
  const idKey = frame?.eventId ? `id:${frame.eventId}` : null;

  const isDuplicate =
    (seq > 0 && seq <= state.cursor) ||
    (seqKey && state.seenKeys.has(seqKey)) ||
    (idKey && state.seenKeys.has(idKey));

  if (isDuplicate) {
    return {
      ...state,
      duplicateSuppressed: state.duplicateSuppressed + 1,
    };
  }

  const nextSeen = new Set(state.seenKeys);
  if (seqKey) nextSeen.add(seqKey);
  if (idKey) nextSeen.add(idKey);

  const pt = formatChartPoint(frame, 'LIVE_SOCKET_IO');
  const nextPoints = [...state.points, pt].slice(-state.maxPoints);
  const seamLabel = state.seamLabel || pt.formattedTime;
  const liveSinceTime = state.liveSinceTime || new Date(pt.rawTimestamp).toISOString();

  return {
    ...state,
    points: nextPoints,
    cursor: seq > state.cursor ? seq : state.cursor,
    seenKeys: nextSeen,
    liveCount: state.liveCount + 1,
    seamLabel,
    liveSinceTime,
  };
}
