# MetroPulse BLR: Smart City Traffic Platform

> **High-Throughput Camera Vision Telemetry, Real-Time Gridlock Detection & Adaptive Signal Command Center**  
> Built for the **MERNIFY Hackathon 2026** (Track: High-Throughput Streams & Telemetry).

![MetroPulse Architecture](https://img.shields.io/badge/Stack-MERN%20+%20Socket.IO-emerald)
![License](https://img.shields.io/badge/License-MIT-blue)
![Focus](https://img.shields.io/badge/Focus-Bengaluru%20Smart%20Traffic-orange)
<!-- TODO(T09): populate verified throughput, latency, fan-out savings, and test count badges from benchmarks/results/latest.md -->

---

## 📌 1. Project Overview & Problem Being Addressed

Metropolitan traffic management in high-density tech hubs like **Bengaluru** requires processing hundreds of high-framerate optical camera streams across critical arterial interchanges (such as Central Silk Board, Tin Factory, Bellandur Outer Ring Road, and Hebbal Flyover).

Deploying a real-time smart traffic telemetry command center introduces three fundamental computational challenges:

1. **Storage Bottlenecks & Disk I/O Thrashing**: Writing thousands of camera-detected vehicle classification and queue measurement frames per second directly into disk locks database connections and induces high ingestion latency.
2. **WebSocket Flood & Broadcast Congestion**: Broadcasting every traffic junction's raw video analysis indiscriminately to all zonal dispatchers wastes bandwidth, exhausts mobile/browser CPU, and drops frames.
3. **Rugged Infrastructure Constraints**: Deploying delicate GPU AI compute boxes on dusty, monsoon-exposed roadside traffic poles leads to frequent hardware failures and maintenance bottlenecks.

### The Solution: MetroPulse BLR
**MetroPulse BLR** is a smart city traffic telemetry ingestion, gridlock detection, and adaptive signal coordination platform:
- **Centralized Video Analytics Architecture**: Roadside CCTV/ANPR cameras stream optical video over municipal dark fiber to the **Centralized City Data Center**, where GPU worker clusters perform vehicle classification (two-wheelers, cars, buses, commercial trucks) and optical queue calculation, emitting structured JSON telemetry.
- **Dedicated Resource Allocation**: Air pollution was deliberately omitted to dedicate 100% of GPU compute, network bandwidth, and database I/O to high-impact traffic bottlenecks, adaptive green split optimization, and emergency ambulance corridors.
- **High-Throughput Write-Behind Ingestion**: Accumulates junction frames in an in-memory ring queue and flushes micro-batches via `bulkWrite()` / `insertMany()` with `ordered: false` without event-loop blocking. <!-- TODO(T09): insert measured Atlas throughput from benchmarks/results/latest.md -->
- **Selective Zonal Socket.IO Partitioning**: Emits frames into partitioned rooms (`zone:south-bangalore`, `zone:east-bangalore`, `junction:ID`) using compact Wire v1 tuples to cut client network payload. <!-- TODO(T09): insert measured egress reduction from benchmarks/results/latest.md -->
- **Real-Time Anomaly Engine & AI Copilot**: Flags sustained one-sided queue surges and low-speed gridlocks (robust MAD/EWMA + practical effect + persistence), stalled vehicles, and approaching ambulances with **1-click automated runbook remediation** (Adaptive Green Wave, Tow Dispatch, Emergency Corridor Preemption).

---

## 🛠️ 2. Tech Stack Used

| Layer | Technologies | Role & Purpose |
| :--- | :--- | :--- |
| **Backend Runtime** | **Node.js** (v20+ / v24) + **Express.js** | High-throughput REST API, traffic normalizer, and request routing |
| **Real-Time Layer** | **Socket.IO** (v4.8+) | Low-latency bi-directional WebSocket communication with zonal room partitioning |
| **Database** | **MongoDB** + **Mongoose** (with auto in-memory fallback) | Regular `Telemetry` collection with unique `eventId`, compound `(junctionId, timestamp/sequence)`, and TTL indexes; unordered bulk writes |
| **Frontend UI** | **React.js 18** + **Vite 6** | Mission control dashboard with real-time approach queue visualizations |
| **Styling & Icons** | **Tailwind CSS** + **Lucide Icons** | Dark-first control room design system with light mode & WCAG AA contrast |
| **Data Visualization** | **Recharts** + **HTML5 Canvas** | Animated time-series waveforms for queue lengths, corridor velocities, and vehicle mix |
| **Geospatial Mapping** | **Leaflet.js** + Esri World Gray Canvas | Real-time Bengaluru map plotting 12 monitored junctions & speed-coded corridor links |
| **Validation & Security**| **Custom Normalizer**, **Bcrypt.js**, **JWT** | Schema validation, backpressure rate limiting, and API key auth |
| **Audio Synthesizer** | **Web Audio API** | Synthetic audio alarms for critical gridlocks and ambulance alerts |
| **Observability** | **[OpenTelemetry](https://opentelemetry.io/) JS SDK** + Jaeger | Distributed spans across ingest/validate/enqueue/flush/broadcast, explicit-bucket histograms & optional OTLP export |

---

## 📊 3. Canonical Traffic Data Model

MetroPulse BLR accepts traffic telemetry matching the exact schema specified for centralized camera ingestion:

```json
{
  "eventId": "EVT-1731512400000-a1b2",
  "junctionId": "JNC-BLR-001",
  "zoneId": "south-bangalore",
  "timestamp": "2026-11-13T20:40:00.000Z",
  "sequence": 104,
  "data": {
    "approaches": [
      { "road": "Hosur Rd (from south)", "vehiclesPerMin": 38, "queueLengthM": 180, "avgSpeedKmph": 6, "signal": "red", "greenTimeSec": 35 },
      { "road": "ORR (from east)", "vehiclesPerMin": 52, "queueLengthM": 60, "avgSpeedKmph": 22, "signal": "green", "greenTimeSec": 45 },
      { "road": "Hosur Rd (from north)", "vehiclesPerMin": 30, "queueLengthM": 90, "avgSpeedKmph": 14, "signal": "red", "greenTimeSec": 30 },
      { "road": "BTM Rd (from west)", "vehiclesPerMin": 21, "queueLengthM": 40, "avgSpeedKmph": 18, "signal": "red", "greenTimeSec": 25 }
    ],
    "vehicleMix": {
      "twoWheeler": 0.55,
      "car": 0.30,
      "bus": 0.05,
      "truck": 0.10
    },
    "stalledVehicleDetected": false,
    "ambulanceDetected": false,
    "totalFlowVehiclesPerMin": 141,
    "maxQueueLengthM": 180,
    "avgSpeedKmph": 15.0,
    "congestionScore": 76,
    "cameraProcessingLatencyMs": 14
  }
}
```

---

## 🚦 4. Monitored Bengaluru Junctions (Predefined & Seeded)

The platform comes pre-configured with 12 authentic, high-traffic Bengaluru junctions across 4 key zones:

### 1. South Bengaluru Zone (`south-bangalore`)
- **`JNC-BLR-001`**: **Silk Board Junction** (Hosur Rd & Outer Ring Rd)
- **`JNC-BLR-002`**: **Sony World Signal** (Koramangala 80ft & 100ft Rd)
- **`JNC-BLR-003`**: **Dairy Circle** (Bannerghatta Rd & Dr. Marigowda Rd)
- **`JNC-BLR-004`**: **Jayadeva Underpass** (Bannerghatta Rd & ORR)

### 2. East Bengaluru Zone (`east-bangalore`)
- **`JNC-BLR-005`**: **Bellandur EcoSpace Junction** (Outer Ring Road)
- **`JNC-BLR-006`**: **Tin Factory / KR Puram Hanging Bridge** (Old Madras Rd & ORR)
- **`JNC-BLR-007`**: **Marathahalli Bridge Junction** (ORR & HAL Airport Rd)

### 3. North Bengaluru Zone (`north-bangalore`)
- **`JNC-BLR-008`**: **Hebbal Flyover Junction** (Bellary Rd & ORR)
- **`JNC-BLR-009`**: **Goraguntepalya Junction** (Tumkur Rd & Ring Rd)
- **`JNC-BLR-010`**: **Mekhri Circle Underpass** (Bellary Rd & CV Raman Rd)

### 4. Central Bengaluru Zone (`central-bangalore`)
- **`JNC-BLR-011`**: **Richmond Circle Flyover** (Hosur Rd & Residency Rd)
- **`JNC-BLR-012`**: **Town Hall / Corporation Circle** (KG Rd & JC Rd)

---

## ✨ 5. Key System Features

- **Bengaluru Live Traffic Map**: Interactive Leaflet map centered on Bengaluru (`12.9716° N, 77.5946° E`) displaying all 12 junctions with color-coded congestion halos (Green = Flow Normal, Amber = Heavy Queue, Red = Gridlock, Blue = Ambulance Priority).
- **Junction Operations Matrix**: Real-time cards showing approach queue bars, speeds, vehicle mix, and signal phase states.
- **Simulated CCTV Optical Feed**: Deep-dive modal showing simulated camera monitor representation with YOLO detection metrics and optical flow queue lengths.
- **AI Traffic Diagnostics Copilot**: Automated root-cause detection with 1-click execution:
  - *Dynamic Green Split Optimization* (+25s green phase to saturated approach)
  - *Automated Emergency Green Wave Corridor* (preemptive green wave for ambulances)
  - *BTP Rapid Incident Tow Dispatch* (clears stalled vehicles)
  - *Upstream Variable Message Sign (VMS) Diversion* (reroutes 35% traffic to bypass corridors)
- **Multi-Desk Zonal Sync View**: Demonstrates two independent dispatchers (South Zone Desk vs East Zone Desk) receiving only their subscribed room frames. <!-- TODO(T09): insert measured zonal reduction from benchmarks/results/latest.md -->
- **Camera Stream Tap / Terminal Inspector**: Live packet stream showing formatted JSON frames with regex filtering and clipboard copying.
- **Chaos & Stress Lab**: 1-click incident injection (Silk Board Surge, Stalled BMTC Bus on ORR, Hebbal Ambulance Corridor, Monsoonal Slowdown).

---

## 🚀 6. Getting Started

### Prerequisites
- **Node.js** v20.x or later
- **npm** or **pnpm**
- **MongoDB** (optional; automatically falls back to an embedded in-memory MongoDB server)

### 1. Install Dependencies
```bash
# Install root, server, and client dependencies
npm run install:all
```

### 2. Start the Development Servers
```bash
# Concurrently runs Node.js server (port 5000) and React Vite client (port 5173)
npm run dev
```

Open your browser at `http://localhost:5173`.

### 3. Run Unit & Ingestion Tests
```bash
npm test --prefix server
```
*All 4 tests verify buffer deduplication, gridlock anomaly detection, metrics calculations, and traffic JSON normalization.*

---

## 📡 7. Ingestion API Endpoints

- `POST /api/telemetry/ingest`: Ingest a single junction traffic event (JSON).
- `POST /api/telemetry/batch`: Ingest high-throughput batch of traffic events.
- `GET /api/telemetry/history`: Fetch historical records with filtering by `junctionId` and `zoneId`.
- `GET /api/telemetry/aggregate`: Fetch time-bucketed aggregation queries.
- `GET /api/devices`: Retrieve all monitored traffic junctions and current signal states.
- `POST /api/copilot/remediate`: Execute an autonomous AI traffic remediation runbook.
- `GET /api/observability/traces`: Retrieve recent OpenTelemetry trace groups (including `buffer.flush` span links) from the in-process ring buffer.
- `GET /api/observability/metrics`: Retrieve OpenTelemetry counters, event-loop lag, and bucket-interpolated histogram percentiles (`p50`/`p95`/`p99`).

---

## 🙌 Attribution

- Telemetry tracing and metrics instrumentation powered by **[OpenTelemetry](https://opentelemetry.io/)** (`@opentelemetry/sdk-node`, `@opentelemetry/sdk-trace`, `@opentelemetry/sdk-metrics`, OTLP HTTP exporters, and Node.js auto-instrumentations), with optional trace visualization via **Jaeger** (`docker-compose.yml`).
