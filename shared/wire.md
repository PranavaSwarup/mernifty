# MetroPulse Wire Protocol v1 Specification

Canonical codec: [`client/src/shared/wire.js`](../client/src/shared/wire.js) (imported directly by both the Node.js Socket.IO server and the React client to guarantee byte-identical encode/decode).

## 1. Handshake & Schema Dictionary (`wire:schema`)

Immediately after an authenticated Socket.IO connection succeeds, the server emits `wire:schema` once with the static lookup dictionaries:

```json
{
  "v": 1,
  "junctionIds": ["JNC-BLR-001", "..."],
  "junctionNames": ["Silk Board Junction (Hosur Rd & ORR)", "..."],
  "zoneByJunction": { "JNC-BLR-001": "south-bangalore" },
  "statuses": ["healthy", "warning", "congested", "gridlock", "critical", "online", "offline"],
  "controllers": ["auto", "fixed-tod", "fixed-naive", "fixed-time", "webster", "max-pressure", "max-pressure-ca"],
  "signals": ["red", "amber", "green"]
}
```

Sending string enums (`"south-bangalore"`, `"JNC-BLR-001"`, road names, statuses, controller names) as small integers avoids repeating field keys and metadata across 24+ frames/sec.

## 2. Selective Room Topology (No Global Firehose)

Clients no longer receive a city-wide `global` raw frame firehose. Subscriptions use `subscribe`:

```js
socket.emit('subscribe', {
  city: true,                      // -> room "city" (1 Hz metrics:snapshot & cf:update only; NO raw frames)
  zones: ['south-bangalore'],      // -> room "zone:<zoneId>" (compact zone batches at emit rate)
  junctions: ['JNC-BLR-001'],      // -> room "junction:<id>" (full per-approach frames + control state)
  alerts: ['south-bangalore'],     // -> room "alerts:<zoneId>" or "alerts:all"
  engineering: true                // -> room "engineering" (wire/backpressure observability snapshots)
});
```

Zone-scoped operators (`role === 'operator'`) are restricted by `user.zones` on every `subscribe` and `resume` request; unauthorized zones/junctions emit `{ code: "FORBIDDEN_ZONE" }`.

## 3. Zone Summary Frame (`telemetry:zone`)

Emitted per subscribed `zone:<zoneId>` room:

```js
{
  v: 1,
  t0: 1731580000000,               // Epoch ms baseline for this batch
  zone: "south-bangalore",
  rows: [
    // [jIdx, seq, tMsDelta, statusIdx, flow, maxQ, speed10, score, controllerIdx, (optional flags)]
    [0, 1042, 0, 3, 153, 185, 84, 88, 5],
    [1, 1042, 2, 1, 106,  80, 192, 41, 5]
  ]
}
```

- `speed10`: `Math.round(avgSpeedKmph * 10)` (0.1 km/h integer resolution).
- Optional 10th item `flags`: bit 0 (`1`) = `stalledVehicleDetected`, bit 1 (`2`) = `ambulanceDetected` (omitted when `0`).

## 4. Junction Detail Frame (`telemetry:junction`)

Emitted only to subscribers of `junction:<junctionId>` when full approach & signal state are needed (e.g., `DeviceDetailModal`):

```js
{
  v: 1,
  t0: 1731580000000,
  junctionId: "JNC-BLR-001",
  rows: [
    [
      0, 1042, 0, 3, 153, 185, 84, 88, 5, 0,
      // approaches: [[flow, queueM, speed10, signalIdx, greenRemSec, queueVeh10], ...]
      [[42, 185, 70, 0, 0, 184], [55, 70, 210, 2, 24, 62]],
      // vehicleMix percentages: [twoWheeler%, car%, bus%, truck%]
      [55, 30, 5, 10],
      // extra KPI/control tuple: [delayVehSec, throughputVehPerHour, degSat100, phaseIdx, phaseRemSec, cycleSec]
      [4120, 3240, 114, 1, 24, 120]
    ]
  ]
}
```

## 5. Per-Socket Backpressure & Honest Byte Accounting

Before writing to any socket, the server inspects transport buffer state (`ws._socket.bufferedAmount` and `socket.conn.writeBuffer.length`):

- Under threshold: delivers normally and records `frameBytes * deliveredSockets` per room (`metricsSnapshot.socketBytesByRoom`, `socketBytesPerSec`, `totalSocketBytes`).
- Over threshold (`> 64 KB` buffered or congested `writeBuffer`): enters socket coalescing mode—retaining only the latest frame per `junctionId` (incrementing `socketCoalescedCount` / `socketDroppedCount`) and flushing via `socket.volatile.emit(...)` once drained.

## 6. Gap-Free Sequence Resume Protocol (`resume` -> `replay`)

1. Client maintains monotonic `cursors[junctionId] = lastSequence` (initialized from `GET /api/telemetry/history` `cursor` map and updated monotonically on each frame).
2. On (re)connect, client emits:
   `socket.emit('resume', { subscriptions: { city, zones, junctions, alerts, engineering }, cursors })`.
3. Server marks the socket `RESUMING` with an in-memory `pendingLive` queue (without joining live rooms yet), fetches missed frames (`seq > cursor`) from its 600-frame-per-junction ring buffer and falls back to MongoDB (`Telemetry.find({ junctionId, sequence: { $gt: c } }).sort({ sequence: 1 })`) if the ring does not cover `cursor + 1`.
4. Server merges DB + ring + `pendingLive`, deduplicates by `(junctionId, sequence)`, sorts ascending, encodes into compact frames, emits one `replay` packet `{ events, replayed, fromMemory, fromDb, clipped }`, and then atomically joins the live rooms.
5. Client applies any replay or live frame strictly when `frame.sequence > cursor[junctionId]`, suppressing duplicates cleanly.
