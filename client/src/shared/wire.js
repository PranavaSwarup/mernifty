export const WIRE_VERSION = 1;

export const DEFAULT_STATUSES = [
  'healthy',
  'warning',
  'congested',
  'gridlock',
  'critical',
  'online',
  'offline',
];

export const DEFAULT_CONTROLLERS = [
  'auto',
  'fixed-tod',
  'fixed-naive',
  'fixed-time',
  'webster',
  'max-pressure',
  'max-pressure-ca',
];

export const DEFAULT_SIGNALS = ['red', 'amber', 'green'];

export const ACTIVE_DIR_CODES = ['', 'N', 'E', 'S', 'W'];

export const DEFAULT_JUNCTIONS_META = [
  {
    junctionId: 'JNC-BLR-001',
    name: 'Silk Board Junction (Hosur Rd & ORR)',
    zoneId: 'south-bangalore',
    location: { latitude: 12.9172, longitude: 77.6228, label: 'Central Silk Board Interchange' },
    roads: [
      { road: 'Hosur Rd (from south)', dir: 'S' },
      { road: 'ORR (from east)', dir: 'E' },
      { road: 'Hosur Rd (from north)', dir: 'N' },
      { road: 'BTM Rd (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-002',
    name: 'Sony World Signal (Koramangala 80ft & 100ft)',
    zoneId: 'south-bangalore',
    location: { latitude: 12.9345, longitude: 77.6265, label: 'Sony World Signal, 4th Block' },
    roads: [
      { road: '80ft Rd (from north)', dir: 'N' },
      { road: '100ft Rd (from east)', dir: 'E' },
      { road: '80ft Rd (from south)', dir: 'S' },
      { road: 'Sony World Jn (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-003',
    name: 'Dairy Circle (Bannerghatta & Hosur Rd)',
    zoneId: 'south-bangalore',
    location: { latitude: 12.9372, longitude: 77.5985, label: 'Dairy Circle Flyover' },
    roads: [
      { road: 'Bannerghatta Rd (from south)', dir: 'S' },
      { road: 'Hosur Rd (from east)', dir: 'E' },
      { road: 'Dr. Marigowda Rd (from north)', dir: 'N' },
      { road: 'Wilson Garden (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-004',
    name: 'Jayadeva Underpass (Bannerghatta & ORR)',
    zoneId: 'south-bangalore',
    location: { latitude: 12.9180, longitude: 77.5970, label: 'Jayadeva Multi-Tier Interchange' },
    roads: [
      { road: 'Bannerghatta Rd (from south)', dir: 'S' },
      { road: 'ORR (from east)', dir: 'E' },
      { road: 'Bannerghatta Rd (from north)', dir: 'N' },
      { road: 'ORR (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-005',
    name: 'Bellandur EcoSpace Junction (Outer Ring Rd)',
    zoneId: 'east-bangalore',
    location: { latitude: 12.9260, longitude: 77.6762, label: 'EcoSpace Business Park Service Road' },
    roads: [
      { road: 'ORR (from south)', dir: 'S' },
      { road: 'EcoSpace Campus (from east)', dir: 'E' },
      { road: 'ORR (from north)', dir: 'N' },
      { road: 'Green Glen Rd (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-006',
    name: 'Tin Factory / KR Puram Hanging Bridge',
    zoneId: 'east-bangalore',
    location: { latitude: 12.9982, longitude: 77.6695, label: 'KR Puram Cable Stayed Bridge' },
    roads: [
      { road: 'Old Madras Rd (from east)', dir: 'E' },
      { road: 'Whitefield Rd (from south)', dir: 'S' },
      { road: 'ORR (from north)', dir: 'N' },
      { road: 'Swami Vivekananda Rd (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-007',
    name: 'Marathahalli Bridge Junction (ORR & Airport Rd)',
    zoneId: 'east-bangalore',
    location: { latitude: 12.9562, longitude: 77.7011, label: 'Marathahalli Multiplex Junction' },
    roads: [
      { road: 'Varthur Rd (from east)', dir: 'E' },
      { road: 'ORR (from south)', dir: 'S' },
      { road: 'HAL Airport Rd (from west)', dir: 'W' },
      { road: 'ORR (from north)', dir: 'N' },
    ],
  },
  {
    junctionId: 'JNC-BLR-008',
    name: 'Hebbal Flyover Junction (Bellary Rd & ORR)',
    zoneId: 'north-bangalore',
    location: { latitude: 13.0358, longitude: 77.5970, label: 'Hebbal Lake Rotary' },
    roads: [
      { road: 'Bellary Rd (from north)', dir: 'N' },
      { road: 'ORR (from east)', dir: 'E' },
      { road: 'Bellary Rd (from south)', dir: 'S' },
      { road: 'ORR (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-009',
    name: 'Goraguntepalya Junction (Tumkur Rd & Ring Rd)',
    zoneId: 'north-bangalore',
    location: { latitude: 13.0285, longitude: 77.5408, label: 'Goraguntepalya Metro Interchange' },
    roads: [
      { road: 'Tumkur Rd NH48 (from north)', dir: 'N' },
      { road: 'Ring Rd (from east)', dir: 'E' },
      { road: 'Peenya Industrial (from west)', dir: 'W' },
      { road: 'Subrahmanyanagar (from south)', dir: 'S' },
    ],
  },
  {
    junctionId: 'JNC-BLR-010',
    name: 'Mekhri Circle Underpass (Bellary Rd & CV Raman)',
    zoneId: 'north-bangalore',
    location: { latitude: 13.0076, longitude: 77.5835, label: 'Mekhri Circle Grade Separator' },
    roads: [
      { road: 'Bellary Rd (from north)', dir: 'N' },
      { road: 'Jayamahal Rd (from east)', dir: 'E' },
      { road: 'Sadashivanagar (from south)', dir: 'S' },
      { road: 'CV Raman Rd (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-011',
    name: 'Richmond Circle Flyover (Hosur & Residency Rd)',
    zoneId: 'central-bangalore',
    location: { latitude: 12.9667, longitude: 77.6006, label: 'Richmond Circle Flyover Complex' },
    roads: [
      { road: 'Residency Rd (from north)', dir: 'N' },
      { road: 'Richmond Rd (from east)', dir: 'E' },
      { road: 'Hosur Rd (from south)', dir: 'S' },
      { road: 'Mission Rd (from west)', dir: 'W' },
    ],
  },
  {
    junctionId: 'JNC-BLR-012',
    name: 'Town Hall / Corporation Circle (KG & JC Rd)',
    zoneId: 'central-bangalore',
    location: { latitude: 12.9634, longitude: 77.5855, label: 'Town Hall Traffic Island' },
    roads: [
      { road: 'KG Road (from north)', dir: 'N' },
      { road: 'Kasturba Rd (from east)', dir: 'E' },
      { road: 'JC Road (from south)', dir: 'S' },
      { road: 'NR Road (from west)', dir: 'W' },
    ],
  },
];

export function buildWireSchema(junctionsMeta = DEFAULT_JUNCTIONS_META) {
  const junctionIds = [];
  const junctionNames = [];
  const zoneByJunction = {};
  const locationByJunction = {};
  const approachRoadsByJunction = {};
  const junctionIndexById = {};

  junctionsMeta.forEach((item, idx) => {
    const id = item.junctionId || item.deviceId;
    junctionIds.push(id);
    junctionNames.push(item.name || id);
    zoneByJunction[id] = item.zoneId || item.category || 'unknown';
    if (item.location) locationByJunction[id] = item.location;
    if (Array.isArray(item.roads || item.baseApproaches)) {
      approachRoadsByJunction[id] = (item.roads || item.baseApproaches).map((a) => ({
        road: a.road,
        dir: a.dir || '',
      }));
    }
    junctionIndexById[id] = idx;
  });

  return {
    v: WIRE_VERSION,
    junctionIds,
    junctionNames,
    junctionIndexById,
    zoneByJunction,
    locationByJunction,
    approachRoadsByJunction,
    statuses: [...DEFAULT_STATUSES],
    controllers: [...DEFAULT_CONTROLLERS],
    signals: [...DEFAULT_SIGNALS],
  };
}

export const DEFAULT_WIRE_SCHEMA = buildWireSchema(DEFAULT_JUNCTIONS_META);

function ensureIndexMap(list) {
  const map = new Map();
  for (let i = 0; i < list.length; i++) map.set(list[i], i);
  return map;
}

function resolveJunctionIndex(schema, junctionId) {
  if (schema.junctionIndexById && schema.junctionIndexById[junctionId] !== undefined) {
    return schema.junctionIndexById[junctionId];
  }
  const idx = schema.junctionIds.indexOf(junctionId);
  return idx >= 0 ? idx : junctionId;
}

function resolveJunctionId(schema, jIdxOrId) {
  if (typeof jIdxOrId === 'number' && schema.junctionIds[jIdxOrId]) {
    return schema.junctionIds[jIdxOrId];
  }
  return String(jIdxOrId);
}

function getEventTsMs(evt) {
  const raw = evt?.timestamp;
  const ms = typeof raw === 'number' ? raw : Date.parse(raw);
  return Number.isFinite(ms) ? ms : Date.now();
}

function resolveActiveDirCode(evt, schema, jId) {
  const explicit = evt?.data?.control?.activeDir;
  if (explicit) {
    const idx = ACTIVE_DIR_CODES.indexOf(explicit);
    if (idx > 0) return idx;
  }
  const apps = evt?.data?.approaches;
  if (Array.isArray(apps) && apps.length > 0) {
    const active = apps.find((a) => a.signal === 'green') || apps.find((a) => a.signal === 'amber');
    if (active?.dir) {
      const idx = ACTIVE_DIR_CODES.indexOf(active.dir);
      if (idx > 0) return idx;
    }
  }
  const pIdx = evt?.data?.control?.phaseIndex ?? evt?.data?.control?.currentPhaseIdx;
  if (Number.isInteger(pIdx) && schema?.approachRoadsByJunction?.[jId]?.[pIdx]?.dir) {
    const idx = ACTIVE_DIR_CODES.indexOf(schema.approachRoadsByJunction[jId][pIdx].dir);
    if (idx > 0) return idx;
  }
  return 0;
}

/**
 * Encode a batch of junction events in one zone into Wire v1 compact tuples:
 * Header `{ v: 1, t0, zone, rows }`
 * Each tuple: `[jIdx, seq, tMsDelta, statusIdx, flow, maxQ, speed10, score, controllerIdx]`
 * (with optional 10th element `flags` bitmask for stalled/ambulance/intergreen/activeDir).
 */
export function encodeZoneBatch(events, schema = DEFAULT_WIRE_SCHEMA, zoneId = null) {
  if (!Array.isArray(events) || events.length === 0) {
    return { v: WIRE_VERSION, t0: Date.now(), zone: zoneId || '', rows: [] };
  }

  const statusMap = ensureIndexMap(schema.statuses);
  const ctrlMap = ensureIndexMap(schema.controllers);
  const t0 = getEventTsMs(events[0]);
  const resolvedZone = zoneId || events[0].zoneId || events[0].category || '';

  const rows = events.map((evt) => {
    const jId = evt.junctionId || evt.deviceId;
    const jIdx = resolveJunctionIndex(schema, jId);
    const seq = Number(evt.sequence) || 0;
    const tMsDelta = Math.round(getEventTsMs(evt) - t0);
    const statusIdx = statusMap.has(evt.status) ? statusMap.get(evt.status) : 0;

    const m = evt.metrics || evt.data || {};
    const flow = Math.round(m.totalFlowVehiclesPerMin ?? evt.data?.totalFlowVehiclesPerMin ?? 0);
    const maxQ = Math.round(m.maxQueueLengthM ?? evt.data?.maxQueueLengthM ?? 0);
    const speed10 = Math.round((m.avgSpeedKmph ?? evt.data?.avgSpeedKmph ?? 0) * 10);
    const score = Math.round(m.congestionScore ?? evt.data?.congestionScore ?? 0);

    const ctrlName =
      evt.data?.control?.activeController ||
      evt.data?.control?.controller ||
      evt.controller ||
      'auto';
    const controllerIdx = ctrlMap.has(ctrlName) ? ctrlMap.get(ctrlName) : 0;

    const stalled = Boolean(evt.data?.stalledVehicleDetected ?? m.stalledVehicleDetected);
    const ambulance = Boolean(evt.data?.ambulanceDetected ?? m.ambulanceDetected);
    const inIntergreen = Boolean(evt.data?.control?.inIntergreen);
    const dirCode = resolveActiveDirCode(evt, schema, jId);
    const flags =
      (stalled ? 1 : 0) |
      (ambulance ? 2 : 0) |
      (inIntergreen ? 4 : 0) |
      ((dirCode & 7) << 3);

    const tuple = [jIdx, seq, tMsDelta, statusIdx, flow, maxQ, speed10, score, controllerIdx];
    if (flags !== 0) tuple.push(flags);
    return tuple;
  });

  return { v: WIRE_VERSION, t0, zone: resolvedZone, rows };
}

export function decodeZoneBatch(packet, schema = DEFAULT_WIRE_SCHEMA) {
  if (!packet || !Array.isArray(packet.rows)) return [];
  const t0 = Number(packet.t0) || Date.now();
  const zoneFromHeader = packet.zone || '';

  return packet.rows.map((row) => {
    const [jIdx, seq, tMsDelta, statusIdx, flow, maxQ, speed10, score, controllerIdx, flags = 0] =
      row;
    const jId = resolveJunctionId(schema, jIdx);
    const idxNum = typeof jIdx === 'number' ? jIdx : schema.junctionIds.indexOf(jId);
    const jName = (idxNum >= 0 && schema.junctionNames?.[idxNum]) || jId;
    const zoneId = zoneFromHeader || schema.zoneByJunction?.[jId] || '';
    const status = schema.statuses?.[statusIdx] || 'healthy';
    const controller = schema.controllers?.[controllerIdx] || 'auto';
    const avgSpeedKmph = Number((speed10 / 10).toFixed(1));
    const stalled = Boolean(flags & 1);
    const ambulance = Boolean(flags & 2);
    const inIntergreen = Boolean(flags & 4);
    const activeDir = ACTIVE_DIR_CODES[(flags >> 3) & 7] || null;
    const tsIso = new Date(t0 + (Number(tMsDelta) || 0)).toISOString();

    return {
      eventId: `${jId}:${seq}`,
      junctionId: jId,
      deviceId: jId,
      junctionName: jName,
      deviceName: jName,
      zoneId,
      category: zoneId,
      timestamp: tsIso,
      sequence: seq,
      status,
      controller,
      location: schema.locationByJunction?.[jId] || null,
      metrics: {
        totalFlowVehiclesPerMin: flow,
        maxQueueLengthM: maxQ,
        avgSpeedKmph,
        congestionScore: score,
        stalledVehicleDetected: stalled,
        ambulanceDetected: ambulance,
      },
      data: {
        totalFlowVehiclesPerMin: flow,
        maxQueueLengthM: maxQ,
        avgSpeedKmph,
        congestionScore: score,
        stalledVehicleDetected: stalled,
        ambulanceDetected: ambulance,
        control: { activeController: controller, controller, activeDir, inIntergreen },
      },
      _wire: { v: WIRE_VERSION, kind: 'zone', tuple: row },
    };
  });
}

/**
 * Encode one or more full per-junction events (including nested numeric approach arrays)
 * into Wire v1 junction frame packet `{ v: 1, t0, junctionId, rows }`.
 */
export function encodeJunctionBatch(events, schema = DEFAULT_WIRE_SCHEMA, junctionId = null) {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) {
    return { v: WIRE_VERSION, t0: Date.now(), junctionId: junctionId || '', rows: [] };
  }

  const statusMap = ensureIndexMap(schema.statuses);
  const ctrlMap = ensureIndexMap(schema.controllers);
  const sigMap = ensureIndexMap(schema.signals);
  const t0 = getEventTsMs(list[0]);
  const jIdHeader = junctionId || list[0].junctionId || list[0].deviceId || '';

  const rows = list.map((evt) => {
    const jId = evt.junctionId || evt.deviceId || jIdHeader;
    const jIdx = resolveJunctionIndex(schema, jId);
    const seq = Number(evt.sequence) || 0;
    const tMsDelta = Math.round(getEventTsMs(evt) - t0);
    const statusIdx = statusMap.has(evt.status) ? statusMap.get(evt.status) : 0;

    const m = evt.metrics || evt.data || {};
    const flow = Math.round(m.totalFlowVehiclesPerMin ?? evt.data?.totalFlowVehiclesPerMin ?? 0);
    const maxQ = Math.round(m.maxQueueLengthM ?? evt.data?.maxQueueLengthM ?? 0);
    const speed10 = Math.round((m.avgSpeedKmph ?? evt.data?.avgSpeedKmph ?? 0) * 10);
    const score = Math.round(m.congestionScore ?? evt.data?.congestionScore ?? 0);

    const ctrlName =
      evt.data?.control?.activeController ||
      evt.data?.control?.controller ||
      evt.controller ||
      'auto';
    const controllerIdx = ctrlMap.has(ctrlName) ? ctrlMap.get(ctrlName) : 0;

    const stalled = Boolean(evt.data?.stalledVehicleDetected ?? m.stalledVehicleDetected);
    const ambulance = Boolean(evt.data?.ambulanceDetected ?? m.ambulanceDetected);
    const inIntergreen = Boolean(evt.data?.control?.inIntergreen);
    const dirCode = resolveActiveDirCode(evt, schema, jId);
    const flags =
      (stalled ? 1 : 0) |
      (ambulance ? 2 : 0) |
      (inIntergreen ? 4 : 0) |
      ((dirCode & 7) << 3);

    const approaches = (evt.data?.approaches || []).map((a) => [
      Math.round(a.vehiclesPerMin ?? 0),
      Math.round(a.queueLengthM ?? 0),
      Math.round((a.avgSpeedKmph ?? 0) * 10),
      sigMap.has(a.signal) ? sigMap.get(a.signal) : 0,
      Math.round(a.greenRemainingSec ?? a.greenTimeSec ?? 0),
      Math.round((a.queueVeh ?? 0) * 10),
      Math.round((a.vOverC ?? 0) * 100),
    ]);

    const mix = evt.data?.vehicleMix || {};
    const mix4 = [
      Math.round((mix.twoWheeler ?? 0.55) * 100),
      Math.round((mix.car ?? 0.3) * 100),
      Math.round((mix.bus ?? 0.05) * 100),
      Math.round((mix.truck ?? 0.1) * 100),
    ];

    const ctrl = evt.data?.control || {};
    const kpi = evt.data?.kpi || {};
    const extra = [
      Math.round(kpi.delayVehSec ?? 0),
      Math.round(kpi.throughputVehPerHour ?? 0),
      Math.round((kpi.degreeOfSaturation ?? 0) * 100),
      Number.isFinite(ctrl.currentPhaseIdx ?? ctrl.phaseIndex) ? (ctrl.currentPhaseIdx ?? ctrl.phaseIndex) : 0,
      Math.round(ctrl.phaseRemainingSec ?? ctrl.greenRemainingSec ?? ctrl.elapsedInPhaseSec ?? 0),
      Math.round(ctrl.cycleSec ?? 0),
    ];

    return [
      jIdx,
      seq,
      tMsDelta,
      statusIdx,
      flow,
      maxQ,
      speed10,
      score,
      controllerIdx,
      flags,
      approaches,
      mix4,
      extra,
    ];
  });

  return { v: WIRE_VERSION, t0, junctionId: jIdHeader, rows };
}

export function decodeJunctionBatch(packet, schema = DEFAULT_WIRE_SCHEMA) {
  if (!packet || !Array.isArray(packet.rows)) return [];
  const t0 = Number(packet.t0) || Date.now();

  return packet.rows.map((row) => {
    const [
      jIdx,
      seq,
      tMsDelta,
      statusIdx,
      flow,
      maxQ,
      speed10,
      score,
      controllerIdx,
      flags = 0,
      approachesRaw = [],
      mix4 = [55, 30, 5, 10],
      extra = [],
    ] = row;

    const jId = packet.junctionId || resolveJunctionId(schema, jIdx);
    const idxNum = typeof jIdx === 'number' ? jIdx : schema.junctionIds.indexOf(jId);
    const jName = (idxNum >= 0 && schema.junctionNames?.[idxNum]) || jId;
    const zoneId = schema.zoneByJunction?.[jId] || '';
    const status = schema.statuses?.[statusIdx] || 'healthy';
    const controller = schema.controllers?.[controllerIdx] || 'auto';
    const avgSpeedKmph = Number((speed10 / 10).toFixed(1));
    const stalled = Boolean(flags & 1);
    const ambulance = Boolean(flags & 2);
    const inIntergreen = Boolean(flags & 4);
    const flagDir = ACTIVE_DIR_CODES[(flags >> 3) & 7] || null;
    const tsIso = new Date(t0 + (Number(tMsDelta) || 0)).toISOString();
    const roadDefs = schema.approachRoadsByJunction?.[jId] || [];

    const approaches = approachesRaw.map((arr, aIdx) => ({
      road: roadDefs[aIdx]?.road || `Approach ${aIdx + 1}`,
      dir: roadDefs[aIdx]?.dir || '',
      vehiclesPerMin: arr[0] ?? 0,
      queueLengthM: arr[1] ?? 0,
      avgSpeedKmph: Number(((arr[2] ?? 0) / 10).toFixed(1)),
      signal: schema.signals?.[arr[3]] || 'red',
      greenRemainingSec: arr[4] ?? 0,
      greenTimeSec: arr[4] ?? 0,
      queueVeh: Number(((arr[5] ?? 0) / 10).toFixed(1)),
      vOverC: arr[6] != null ? Number(((arr[6] ?? 0) / 100).toFixed(2)) : null,
    }));

    const activeApp = approaches.find((a) => a.signal === 'green') || approaches.find((a) => a.signal === 'amber');
    const activeDir = activeApp?.dir || flagDir;

    const vehicleMix = {
      twoWheeler: Number((mix4[0] / 100).toFixed(2)),
      car: Number((mix4[1] / 100).toFixed(2)),
      bus: Number((mix4[2] / 100).toFixed(2)),
      truck: Number((mix4[3] / 100).toFixed(2)),
    };

    const kpi = {
      delayVehSec: extra[0] ?? 0,
      throughputVehPerHour: extra[1] ?? 0,
      degreeOfSaturation: Number(((extra[2] ?? 0) / 100).toFixed(2)),
    };
    const control = {
      activeController: controller,
      controller,
      currentPhaseIdx: extra[3] ?? 0,
      phaseIndex: extra[3] ?? 0,
      phaseRemainingSec: extra[4] ?? 0,
      greenRemainingSec: extra[4] ?? 0,
      cycleSec: extra[5] ?? 0,
      activeDir,
      inIntergreen,
    };

    return {
      eventId: `${jId}:${seq}`,
      junctionId: jId,
      deviceId: jId,
      junctionName: jName,
      deviceName: jName,
      zoneId,
      category: zoneId,
      timestamp: tsIso,
      sequence: seq,
      status,
      controller,
      location: schema.locationByJunction?.[jId] || null,
      metrics: {
        totalFlowVehiclesPerMin: flow,
        maxQueueLengthM: maxQ,
        avgSpeedKmph,
        congestionScore: score,
        stalledVehicleDetected: stalled,
        ambulanceDetected: ambulance,
      },
      data: {
        approaches,
        vehicleMix,
        stalledVehicleDetected: stalled,
        ambulanceDetected: ambulance,
        totalFlowVehiclesPerMin: flow,
        maxQueueLengthM: maxQ,
        avgSpeedKmph,
        congestionScore: score,
        control,
        kpi,
      },
      _wire: { v: WIRE_VERSION, kind: 'junction', tuple: row },
    };
  });
}

export function decodeWirePayload(payload, schema = DEFAULT_WIRE_SCHEMA) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload.v === WIRE_VERSION && Array.isArray(payload.rows)) {
    if (payload.junctionId) {
      return decodeJunctionBatch(payload, schema);
    }
    return decodeZoneBatch(payload, schema);
  }
  return [];
}

export function utf8ByteLength(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  return Buffer.byteLength(str, 'utf8');
}

export function measureWireSavings(events, schema = DEFAULT_WIRE_SCHEMA) {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) {
    return { count: 0, fullBytesPerEvent: 0, zoneWireBytesPerEvent: 0, junctionWireBytesPerEvent: 0, zoneSavingsPct: 0 };
  }

  const fullBytes = utf8ByteLength(JSON.stringify(list));
  const zonePkt = encodeZoneBatch(list, schema, list[0].zoneId || list[0].category);
  const zoneBytes = utf8ByteLength(JSON.stringify(zonePkt));

  let juncBytes = 0;
  for (const ev of list) {
    const jp = encodeJunctionBatch([ev], schema, ev.junctionId || ev.deviceId);
    juncBytes += utf8ByteLength(JSON.stringify(jp));
  }

  const count = list.length;
  const fullAvg = Number((fullBytes / count).toFixed(1));
  const zoneAvg = Number((zoneBytes / count).toFixed(1));
  const juncAvg = Number((juncBytes / count).toFixed(1));

  return {
    count,
    fullBytesPerEvent: fullAvg,
    zoneWireBytesPerEvent: zoneAvg,
    junctionWireBytesPerEvent: juncAvg,
    zoneSavingsPct: fullAvg > 0 ? Number((((fullAvg - zoneAvg) / fullAvg) * 100).toFixed(1)) : 0,
    junctionSavingsPct: fullAvg > 0 ? Number((((fullAvg - juncAvg) / fullAvg) * 100).toFixed(1)) : 0,
  };
}
