# MetroPulse BLR: Smart City Traffic Platform

> **High-Throughput Camera Vision Telemetry, Real-Time Gridlock Detection & Adaptive Signal Command Center**  
> Built for the **MERNIFY Hackathon 2026** (Track: High-Throughput Streams & Telemetry).
>
> **Live demo: https://metropulse-blr.onrender.com** · use the persona switcher in the header to try each role. Hosted on Render's free plan, so the first visit after a quiet period can take about a minute to wake up.

![MetroPulse Architecture](https://img.shields.io/badge/Stack-MERN%20+%20Socket.IO-emerald)
![License](https://img.shields.io/badge/License-MIT-blue)
![Focus](https://img.shields.io/badge/Focus-Bengaluru%20Smart%20Traffic-orange)

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
- **One Problem, Done Properly**: Air quality and noise monitoring were considered and left out. The reason is focus: we chose to solve traffic telemetry completely instead of covering two domains thinly.
- **High-Throughput Write-Behind Ingestion**: Accumulates junction frames in an in-memory ring queue and flushes micro-batches via `bulkWrite()` / `insertMany()` with `ordered: false` without event-loop blocking. - **Selective Zonal Socket.IO Partitioning**: Emits frames into partitioned rooms (`zone:south-bangalore`, `zone:east-bangalore`, `junction:ID`) using compact Wire v1 tuples to cut client network payload. - **Real-Time Anomaly Engine & AI Copilot**: Flags sustained one-sided queue surges and low-speed gridlocks (robust MAD/EWMA + practical effect + persistence), stalled vehicles, and approaching ambulances with **1-click automated runbook remediation** (Adaptive Green Wave, Tow Dispatch, Emergency Corridor Preemption).

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
| **Validation & Security**| **Zod**, **Bcrypt.js**, **JWT**, hashed device API keys | Strict schema validation (bad events are rejected, not repaired), token-bucket rate limiting, load shedding, role and zone checks |
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
- **Multi-Desk Zonal Sync View**: Demonstrates two independent dispatchers (South Zone Desk vs East Zone Desk) receiving only their subscribed room frames. - **Camera Stream Tap / Terminal Inspector**: Live packet stream showing formatted JSON frames with regex filtering and clipboard copying.
- **Chaos & Stress Lab**: 1-click incident injection (Silk Board Surge, Stalled BMTC Bus on ORR, Hebbal Ambulance Corridor, Monsoonal Slowdown).
- **Ambulance Green Corridor**: An ambulance trip is routed across the junction graph (by default Hebbal to Jayadeva, through Mekhri Circle, Town Hall, Richmond Circle and Dairy Circle). The ambulance streams its position twice a second; each junction is preempted shortly before it arrives (its incoming road is given green) and released after it passes. Clients watching a junction or zone on the route receive an officer alert and a give-way notice for it, clients watching other junctions receive neither, and the finished trip is stored in MongoDB. If a junction on the shortest route is gridlocked, the trip is routed around it. The corridor works through the signals and does not depend on drivers reacting to a notice.

> **A note on originality.** Bengaluru already operates an adaptive signal control system with priority for emergency vehicles. MetroPulse BLR does not claim to invent that. It is a monitoring and coordination layer of the kind such a system needs, built so the whole pipeline can be watched working in real time.

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

### 3. Configure (optional for local development)
Copy `server/.env.example` to `server/.env`. Every variable the server reads is listed there with its default. Nothing needs changing to run locally: if no MongoDB is reachable, development mode starts an embedded in-memory MongoDB (data is lost on restart).

### 4. Signing in for the demo
Outside production the header shows a **Demo persona** switcher with one-click logins:

| Persona | Role | What it can do |
| :--- | :--- | :--- |
| Supervisor / Admin | `admin` | Everything, in all four zones: start and stop the simulator, trigger scenarios, dispatch an ambulance corridor, run benchmarks |
| South operator, East operator | `operator` | View and act only inside the assigned zone |
| Viewer | `viewer` | Read-only |
| Anonymous | (not signed in) | Read-only public view |

Seeded account passwords are generated randomly at first start and printed once in the server log; they are never stored in the client. Self-registration always creates a `viewer`. In production the persona switcher is off unless `DEMO_PERSONAS=true` is set.

### 5. Run the tests
```bash
npm test --prefix server
```
60 tests in 8 files cover: the traffic physics engine and signal controllers (`sim.test.js`), validation, idempotent persistence, ordering, rate limiting, load shedding and role checks (`integrity-auth.test.js`), room filtering, the compact wire format, per-socket backpressure and gap-free resume (`realtime.test.js`), the ambulance corridor (`corridor.test.js`), OpenTelemetry instrumentation (`otel.test.js`), the benchmark harness (`benchmarks.test.js`), ingestion basics (`telemetry.test.js`), and the production configuration check (`config.test.js`).

### 6. Send external data and run the benchmarks
```bash
# A device API key is generated at first start and saved to server/.env.local-keys
export METROPULSE_API_KEY=<key from server/.env.local-keys>

node scripts/standalone-producer.js --rate 15 --junction JNC-BLR-001   # one external camera feed
node scripts/bench/run-all.js                                          # ingest + Socket.IO fan-out benchmarks
```
Ingestion without a valid device key or an admin token is refused with HTTP 401.

---

## 🧪 Data Generation & Ingestion

Two kinds of source feed the same pipeline:

1. **Built-in simulator** (`server/src/sim/`). A deterministic traffic model, not random numbers. Each road entering a junction keeps a vehicle queue that grows with arrivals and drains while its signal is green (`queue(t+dt) = queue(t) + arrivals - departures`), with demand that varies by time of day and junctions linked so vehicles leaving one arrive at the next. Speeds, queue lengths and the congestion score are derived from those queues. Signal timing is chosen by interchangeable controllers (fixed-time, Webster, max-pressure). A fixed seed (`SIM_SEED`) reproduces the same run. By default it emits 2 frames per second per junction, 24 events per second across the city.
2. **External producers** (`scripts/standalone-producer.js`, `scripts/bench/`). These post JSON over HTTP to `/api/telemetry/ingest` and `/api/telemetry/batch` with a device API key, the way a city data centre's camera-analytics output would.

Every event carries `eventId`, `junctionId`, `sequence` and `timestamp`. The server validates each event against a strict schema and rejects bad ones, looks up the zone from its own junction registry, drops duplicate `eventId`s, tracks gaps and out-of-order sequences per junction, applies token-bucket rate limits (HTTP 429), and sheds load with HTTP 503 when the write buffer passes 80% full. Accepted events are queued in memory and written to MongoDB in unordered bulk batches.

---

## 🔌 Real-Time Communication (Socket.IO)

Socket.IO is the only path live data takes to the browser. There is no global firehose: a client receives a stream only after subscribing to its room.

| Room | Joined when | What is sent |
| :--- | :--- | :--- |
| `city` | The city overview is open | A 1 Hz metrics snapshot; no raw frames |
| `zone:<zoneId>` | A zone is selected | Compact per-junction summary rows for that zone |
| `junction:<junctionId>` | A junction's detail view is open | Full per-road frames and signal state for that junction |
| `alerts:<zoneId>` / `alerts:all` | Alerts are shown | Alerts for that scope |
| `corridor` | Joined together with `city` | Ambulance trip start, position (2 Hz) and end, so the map can follow a trip in any zone |
| `engineering` | The engineering workspace is open | Wire and backpressure statistics |

- **Compact frames.** Zone and junction frames are sent as numeric tuples against a dictionary delivered once at connection (`wire:schema`), instead of repeating field names in every message. The format is specified in [`shared/wire.md`](shared/wire.md).
- **Zone checks on subscribe.** An operator may subscribe only to zones assigned to the account; other requests are answered with `FORBIDDEN_ZONE`.
- **History joined to live without gaps or duplicates.** The client records the last `sequence` it has seen for each junction. On connect or reconnect it sends those cursors in a `resume` request; the server replays every missed frame (from an in-memory ring, falling back to MongoDB), then joins the live rooms. The client applies a frame only if its sequence is newer than its cursor, which removes duplicates and late arrivals.
- **Slow clients.** If a socket's send buffer backs up, the server keeps only the newest frame per junction for that socket until it drains, so one slow viewer cannot hold up the others.
- **Client rendering.** Incoming frames are collected and applied to React state on a timer instead of once per message, and charts keep a fixed window of points.

---

## 📈 Measured Performance

The numbers below are copied from [`benchmarks/results/latest.md`](benchmarks/results/latest.md), recorded on 14 November 2026 at commit `7a7eab6` on a laptop (AMD Ryzen 7 7840HS, 15 GB RAM) with the server running locally and MongoDB on a remote Atlas M0 free-tier cluster. Reproduce them with `node scripts/bench/run-all.js`.

| Measurement | Result |
| :--- | :--- |
| Peak HTTP ingestion accepted (1 connection, batches of 500) | 1,930.8 events/s |
| Peak persisted to MongoDB Atlas M0 in the same run | 1,373.7 events/s |
| Socket.IO fan-out, 500 clients (80% zone rooms, 20% junction rooms) | 2,599.9 frames/s delivered, p95 emit-to-receive 3.5 ms |
| Per-client egress in that run | about 380 bytes/s |
| OpenTelemetry at 5% sampling, 500 clients | p95 emit-to-receive 10 ms |

Accepted and persisted rates differ on purpose: HTTP requests are acknowledged once events are in the write buffer, and the database is written in batches afterwards. When the remote free-tier database cannot keep up, the server answers HTTP 503 instead of growing without limit; the results file records those refusals for every run.

---

## ☁️ Deployment

`render.yaml` and the `Dockerfile` build the client and serve it from the Node server. In production the server **refuses to start** unless both of these are set, so a hosted demo cannot run on a forgeable login secret or a database that forgets everything on restart:

- `MONGODB_URI`: a MongoDB Atlas connection string.
- `JWT_SECRET`: a private value of at least 24 characters (Render generates one from `render.yaml`).

Set `DEMO_PERSONAS=true` to show the persona switcher on the hosted app (the provided `render.yaml` does), or `false` to require real logins. `GET /api/health` reports which database is in use and whether demo personas are enabled.

---

## ⚠️ Limitations

- All traffic data is simulated. No real cameras or signals are connected, and no video is processed.
- The road network is a simplified model of 12 junctions; links and distances approximate Bengaluru's main roads.
- The ambulance trip is simulated and time-compressed so it completes in about a minute.
- Anomaly detection is statistical (robust baselines and thresholds). The "copilot" compares candidate actions by running the traffic model forward; it is not a machine-learning model.
- "Stalled vehicle" and "ambulance detected" flags come from scenarios injected into the simulator, standing in for what a camera-analytics system would report.
- Telemetry is kept for a limited time (`TELEMETRY_TTL_SEC`, 1 hour by default). Each stored reading is about 2.6 KB and the simulator stores 24 per second, so one hour levels off near 230 MB, which fits the 512 MB MongoDB Atlas free tier. The server applies a changed value to the existing database at startup.

---

## 📡 7. Ingestion API Endpoints

- `POST /api/telemetry/ingest`: Ingest a single junction traffic event (JSON).
- `POST /api/telemetry/batch`: Ingest high-throughput batch of traffic events.
- `GET /api/telemetry/history`: Fetch historical records with filtering by `junctionId` and `zoneId`.
- `GET /api/telemetry/aggregate`: Fetch time-bucketed aggregation queries.
- `GET /api/devices`: Retrieve all monitored traffic junctions and current signal states.
- `POST /api/copilot/remediate`: Apply a recommended remediation action (operator or admin, within the caller's zones).
- `POST /api/corridor/start`, `POST /api/corridor/cancel`: Start or cancel an ambulance green corridor trip (admin or operator).
- `GET /api/corridor/active`, `GET /api/corridor/history`: Current and past corridor trips.
- `GET /api/observability/traces`: Retrieve recent OpenTelemetry trace groups (including `buffer.flush` span links) from the in-process ring buffer.
- `GET /api/observability/metrics`: Retrieve OpenTelemetry counters, event-loop lag, and bucket-interpolated histogram percentiles (`p50`/`p95`/`p99`).

---

## 🙌 Attribution

- Telemetry tracing and metrics instrumentation powered by **[OpenTelemetry](https://opentelemetry.io/)** (`@opentelemetry/sdk-node`, `@opentelemetry/sdk-trace`, `@opentelemetry/sdk-metrics`, OTLP HTTP exporters, and Node.js auto-instrumentations), with optional trace visualization via **Jaeger** (`docker-compose.yml`).
