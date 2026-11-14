# MetroPulse BLR: System Architecture & Technical Design

> **High-Throughput Optical Traffic Telemetry, Gridlock Detection & Emergency Green Corridor Engine**  
> MERNIFY Hackathon 2026 • Track: High-Throughput Streams & Telemetry

---

## 1. End-to-End System Architecture

```mermaid
graph TD
    subgraph Data Sources & Telemetry Emitters
        SIM["Virtual Traffic Simulator<br/>(12 Bengaluru Arterial Junctions)"]
        PROD["External Producer / Stress Test<br/>(HTTP Ingestion / API Key Auth)"]
        AMB["Ambulance GPS Telemetry<br/>(2 Hz GPS Position Emitter)"]
        CITIZEN["Citizen Incident Reports<br/>(Accident / Blockage / Waterlogging)"]
    end

    subgraph Node.js & Express Ingestion Pipeline
        API["REST Ingestion & Reporting Routes<br/>POST /api/telemetry/ingest<br/>POST /api/telemetry/batch<br/>POST /api/reports"]
        VAL["Strict Schema Validator<br/>Validates approach bounds & timestamp window"]
        DEDUP["Bounded Event ID Set<br/>Capacity 50,000 FIFO Deduplication"]
        RL["Per-Source Rate Limiter<br/>35 events/sec per junction limit"]
        ENRICH["Server Enrichment Layer<br/>Assigns true zone, junction name, computed score"]
    end

    subgraph Real-Time Processing & Anomaly Engine
        BUFFER["Write-Behind Buffer<br/>Flushes 200 events / 500ms via bulkWrite()"]
        ANOMALY["Incident Detection Engine<br/>sudden_blockage | jam | congestion_building"]
        SPREAD["1-Hop Jam Spreading Model<br/>Propagates pressure to graph neighbours"]
        REMED["1-Second Deadline Scanner<br/>Auto-remediation loop (extend_green, divert)"]
        CORRIDOR["Ambulance Corridor Service<br/>Lookahead preemption & arrival green hold"]
    end

    subgraph Storage Layer: MongoDB
        C_TEL[("Telemetry Collection<br/>Compound Time-Series Indexes")]
        C_DEV[("Device / Junction Matrix<br/>Signal states, adaptive modes")]
        C_ALT[("Alerts Collection<br/>Incident type, cause, actionApplied")]
        C_LOG[("ActionLog Collection<br/>Accountability audit trail")]
        C_REP[("Report Collection<br/>Grouped citizen reports")]
        C_TRIP[("CorridorTrip Collection<br/>Saved trip summaries & GPS path")]
        C_BASE[("Baseline Collection<br/>Hourly normal traffic baselines")]
    end

    subgraph Real-Time Delivery: Socket.IO
        SOCK["Socket.IO Server Engine<br/>80ms Micro-Batching & Chained Emits"]
        R_CITY["Room: city<br/>(Slim 1 Hz City Map Feed)"]
        R_ZONE["Room: zone:ID<br/>(Zonal Desks Full Stream)"]
        R_JUNC["Room: junction:ID<br/>(Junction Detail Modal)"]
        R_CORR["Room: corridor<br/>(Ambulance GPS Position)"]
        R_SYS["Room: system<br/>(Admin System Health)"]
        R_USER["Room: user:userId<br/>(Private Citizen Feedback)"]
    end

    SIM --> ENRICH
    PROD --> API
    CITIZEN --> API
    AMB --> CORRIDOR

    API --> VAL --> DEDUP --> RL --> ENRICH

    ENRICH --> BUFFER
    ENRICH --> ANOMALY
    ENRICH --> SOCK

    ANOMALY --> SPREAD
    ANOMALY --> REMED
    ANOMALY --> C_ALT

    BUFFER --> C_TEL
    BUFFER --> C_DEV
    REMED --> C_LOG
    API --> C_REP
    CORRIDOR --> C_TRIP

    SOCK --> R_CITY
    SOCK --> R_ZONE
    SOCK --> R_JUNC
    SOCK --> R_CORR
    SOCK --> R_SYS
    SOCK --> R_USER
```

---

## 2. Ingestion, Processing, Storage & Broadcasting Data-Flow

```mermaid
sequenceDiagram
    autonumber
    participant Source as Camera / Producer / Simulator
    participant Ingest as Express Ingestion & Validator
    participant Buffer as Write-Behind Buffer
    participant Anomaly as Anomaly Engine
    participant DB as MongoDB Database
    participant Sockets as Socket.IO Zonal Engine
    participant Client as React Dashboard Client

    Source->>Ingest: HTTP POST /api/telemetry/batch (Raw Approach Records)
    Ingest->>Ingest: Validate bounds, parse timestamps, drop FIFO duplicates
    Ingest->>Ingest: Enrich zoneId, junctionName, congestionScore
    
    par Asynchronous Ingestion & Detection
        Ingest->>Buffer: Enqueue into in-memory ring buffer (<1ms)
        Ingest->>Anomaly: Evaluate road speeds & queues against baselines
        Ingest->>Sockets: Queue into zonal micro-batch buffers
    end

    opt Threshold Crossed (Sudden Blockage / Jam / Unusual)
        Anomaly->>DB: Persist Alert document with suggestedAction & deadline
        Anomaly->>Sockets: Emit alert:new to zone and junction rooms
    end

    critical Database Write-Behind Flush (Every 500ms or 200 items)
        Buffer->>DB: bulkWrite({ insertOne: event }) with ordered: false
    end

    critical WebSocket Micro-Batch Flush (Every 80ms)
        Sockets->>Client: Emit telemetry:batch to subscribed rooms (zone / junction)
        Sockets->>Client: Emit city slim summary to city room (1 Hz)
    end
```

---

## 3. MongoDB Collections, Schemas & Indexes

The persistence layer is structured into 8 collections designed for high write throughput and indexed lookups:

### 1. `Telemetry` (`Telemetry.js`)
Stores raw time-stamped junction frames for historical charting and baseline calculation.
- **Fields**: `eventId` (String, unique), `junctionId` (String), `zoneId` (String), `timestamp` (Date), `sequence` (Number), `data` (Object with approaches, speeds, queues, congestionScore), `status` (String), `seeded` (Boolean).
- **Indexes**:
  - `{ junctionId: 1, timestamp: -1 }` (powers junction history modal)
  - `{ zoneId: 1, timestamp: -1 }` (powers zonal analytics)
  - `{ eventId: 1 }` (unique deduplication index)
  - `{ timestamp: -1 }` (powers aggregate time queries)

### 2. `Device` (`Device.js`)
Maintains the latest operational state for each of the 12 monitored junctions.
- **Fields**: `deviceId` (String, unique), `name` (String), `zoneId` (String), `location` (GeoJSON / lat-lon), `status` (online, degraded, offline), `adaptiveSignalMode` (dynamic-ai, emergency-corridor, manual-override), `lastMetrics` (Object).
- **Index**: `{ deviceId: 1 }` (unique).

### 3. `Alert` (`Alert.js`)
Tracks operational traffic incidents, suggested remedies, human causes, and resolution status.
- **Fields**: `alertId` (String, unique), `junctionId` (String), `zoneId` (String), `severity` (info, warning, critical), `type` (jam, sudden_blockage, congestion_building, unusual_for_this_hour, congestion_spillover), `cause` (accident, road_blocked, waterlogging, etc., default 'unknown'), `causeSource` (citizen_report, officer, system), `status` (open, acknowledged, action_applied, auto_applied, overridden, resolved), `suggestedAction` (Object with action and deadline), `actionApplied` (String), `timestamp` (Date).
- **Indexes**:
  - `{ junctionId: 1, status: 1 }`
  - `{ status: 1, timestamp: -1 }`

### 4. `ActionLog` (`ActionLog.js`)
Provides an immutable accountability audit trail for all automatic system fixes and officer overrides.
- **Fields**: `logId` (String), `alertId` (String), `junctionId` (String), `action` (extend_green, divert, hold_upstream, manual_override), `actor` (system or User ID), `actorRole` (system, admin, officer), `previousState` (String), `newState` (String), `timestamp` (Date).
- **Index**: `{ junctionId: 1, timestamp: -1 }`.

### 5. `Report` (`Report.js`)
Records citizen-submitted incident reports grouped by location.
- **Fields**: `reportId` (String, unique), `userId` (String, indexed for rate limiting, never broadcast), `category` (accident, road_blocked, waterlogging, signal_not_working, construction, other), `coordinates` (lat, lon), `nearestJunctionId` (String), `zoneId` (String), `note` (sanitized text, max 200 chars), `status` (received, verified, action_taken, dismissed), `reportCount` (Number, duplicate grouping counter), `linkedAlertId` (String).
- **Indexes**:
  - `{ userId: 1, createdAt: -1 }` (rate limiter: 3 per 10 mins)
  - `{ nearestJunctionId: 1, category: 1, status: 1 }` (duplicate grouping within 10 mins)

### 6. `CorridorTrip` (`CorridorTrip.js`)
Records historical emergency ambulance trips and GPS tracks for replay.
- **Fields**: `tripId` (String, unique), `vehicleId` (String), `startJunctionId` (String), `destinationJunctionId` (String), `routeJunctionIds` (Array of Strings), `status` (active, completed, cancelled), `startTime` (Date), `endTime` (Date), `durationSeconds` (Number), `positions` (Array of GPS coordinate snapshots).
- **Index**: `{ tripId: 1 }` (unique).

### 7. `Baseline` (`Baseline.js`)
Pre-aggregated hourly traffic profiles per junction for baseline deviation comparisons.
- **Fields**: `junctionId` (String), `hour` (Number, 0–23), `avgCongestionScore` (Number), `avgSpeedKmph` (Number), `avgMaxQueueM` (Number), `sampleCount` (Number).
- **Compound Index**: `{ junctionId: 1, hour: 1 }` (unique).

### 8. `User` (`User.js`)
Role-based access accounts with assigned jurisdiction areas.
- **Fields**: `name` (String), `email` (String, unique), `password` (bcrypt hash), `role` (admin, officer, ambulance, citizen), `assignedZoneId` (String, optional), `assignedJunctionId` (String, optional), `vehicleId` (String, optional).

---

## 4. Socket.IO Room Topology & Selective Distribution

To keep client memory bounded and reduce unnecessary network payloads, clients join strictly what is relevant to their open view:

```
[Client App]
   ├── Opens City Map                ──> Joins "city", "corridor"
   ├── Selects South Bangalore Zone  ──> Leaves previous zone, joins "zone:south-bangalore"
   ├── Opens Silk Board Modal        ──> Joins "junction:JNC-BLR-001" (leaves on close)
   ├── Opens Health Desk             ──> Joins "system"
   └── Citizen logs in               ──> Joins private room "user:<userId>"
```

### Room Specifications
- **`city`**: Receives slim whole-city summaries (junctionId, score, speed, max queue) every 1,000ms. Omit approach arrays to keep map traffic lightweight.
- **`zone:<zoneId>`**: Receives full micro-batched events for junctions in that zone every 80ms (~12 Hz).
- **`junction:<junctionId>`**: Dedicated high-frequency stream for the modal camera viewport and approach queues.
- **`corridor`**: Receives 2 Hz ambulance position coordinates (`latitude`, `longitude`, `speedKmph`, `progressPct`) and corridor lifecycle events (`started`, `ended`).
- **`system`**: Receives 1 Hz health snapshots for ingestion rate, persistence rate, latency, and drop counters.

---

## 5. Architectural Optimizations & Rationale

| Optimization | Implementation Detail | Architectural Rationale |
| :--- | :--- | :--- |
| **Write-Behind Ring Buffer** | In-memory queue flushes up to 200 items every 500ms using unordered `bulkWrite()` | Decouples incoming network requests from disk write latency; eliminates MongoDB write locks. |
| **Micro-Batched WebSockets** | Server flushes queued room messages every 80ms (~12 FPS) | Prevents flooding the Node.js event loop with thousands of individual socket emits. |
| **Client-Side Throttling** | `SocketContext.jsx` accumulates batches in an in-memory buffer and flushes to React state every 100ms (10 FPS) | Prevents browser re-render thrashing; keeps Chrome DevTools running at a smooth 60 FPS. |
| **Bounded Deduplication** | `BoundedEventIdSet` (capacity 50,000) using FIFO ring eviction | Replaces unbounded Sets that consume arbitrary RAM; sub-millisecond duplicate detection. |
| **Subscribe-Then-Fetch Reconciliation** | Modal subscribes to WebSocket before requesting MongoDB history, buffering in-flight events | Eliminates race-condition gaps between history request return and live socket initialization. |
| **1-Second Deadline Loop** | Single global server timer scans active alerts every 1,000ms | Avoids scheduling thousands of individual Node timers that risk memory leaks and crash on restarts. |
| **Chained Room Broadcasting** | `io.to(zone).to(junction).emit(...)` | Native Socket.IO room chaining guarantees exactly one delivery per physical socket connection. |

---

## 6. Architecture Decisions & Measured Benchmarks

### MongoDB Time-Series Collection Decision
We evaluated whether to keep the MongoDB time-series collection or revert to a standard collection with a unique index. We chose to **retain the native time-series collection** (`timeField: 'timestamp'`, `metaField: 'junctionId'`) for high storage compression and query speed, resolving time-series restrictions as follows:
- **Seed Ingestion**: Replaced invalid `updateOne` with `upsert: true` with unordered `bulkWrite()` using `insertOne` (`{ ordered: false }`).
- **Partial Seed Recovery**: Enforces strict count validation (8,640 records expected for 12 junctions × 24 hours). If interrupted, the collection is cleared safely filtering by `metaField: 'junctionId'` before re-seeding.
- **Deduplication**: Enforced with sub-millisecond latency at the pipeline entry using the 50,000-event FIFO `BoundedEventIdSet`, returning HTTP 409 Conflict.

### Ingestion Authentication & Rate Limiting
- **Dedicated Data-Source Role**: Ingest endpoints (`/api/telemetry/ingest` and `/api/telemetry/batch`) strictly require API keys belonging to a `source` role account (`blr_datasource_producer_key_2026` or `blr_datasource_stress_test_key_2026`). Citizen, officer, and ambulance keys return HTTP 403; missing keys return HTTP 401.
- **Per-Junction Batch Rate Limiting**: The 35 events/second per junction rate limit is evaluated on an event-by-event basis within incoming batches. Excess events are rejected individually and counted in the response without discarding the rest of the batch.

### Incident Detection & Spreading Precedence
- **Relative Blockage Detection**: Evaluates speed collapse relative to the road's recent baseline velocity (>= 50% drop to <= 4 km/h while signal active), avoiding reliance on fixed absolute thresholds.
- **Incident Precedence**: Open `sudden_blockage` alerts suppress `jam` alerts at the same junction.
- **Worst-Road Attribution**: Jam alerts identify the approach with the highest `queueLengthM` and record it on `affectedRoad`.
- **Damped Congestion Spreading**: Congestion requires 15–20 seconds of sustained congestion before propagating across the graph. Spread pressure ramps gradually over 20–30 seconds, never reflects back to the origin, and suppresses critical alerts on neighbours (emitting at most informational `congestion_spillover` notices without automatic remediation).

### Measured Stress Test Results (`scripts/stress-test.js`)
All benchmark numbers were empirically measured against the live server:
- **Total Events Sent**: 3,000 events (15 batches × 200 events across 6 junctions)
- **Accepted by Ingest Buffer**: 2,100 events
- **Rejected by Per-Junction Limiter**: 900 events (enforcing 35 events/sec per junction limit)
- **Duplicates / Schema Invalid / Dropped**: 0 / 0 / 0 (100% data integrity)
- **Batch Ingestion Wall-Clock Time**: 0.23 seconds
- **Ingestion Acceptance Throughput**: **9,291 events/second**
- **Mean Batch Ingestion Round-Trip Time**: **13.95 ms**
- **Buffer Drain Time to MongoDB**: **1.93 seconds**
- **Persisted Storage Throughput**: **1,089 events/second**
- **Automated Test Suite**: **18/18 tests passing cleanly**
