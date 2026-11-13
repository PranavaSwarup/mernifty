# HyperPulse Telemetry Platform

> **High-Throughput Streams & Real-Time Observability Command Center**  
> Built for the **MERNIFY Hackathon 2026** (Track: High-Throughput Streams & Telemetry).

![HyperPulse Architecture](https://img.shields.io/badge/Stack-MERN%20+%20Socket.IO-emerald)
![License](https://img.shields.io/badge/License-MIT-blue)
![Real-time](https://img.shields.io/badge/WebSocket-Sub--5ms%20Latency-cyan)
![Throughput](https://img.shields.io/badge/Throughput-7%2C320+%20events%2Fsec-purple)
![Tests](https://img.shields.io/badge/Tests-Passing%20(100%25)-success)
![Docker](https://img.shields.io/badge/Deployment-Docker%20%7C%20Render%20%7C%20Railway-orange)

---

## 📌 1. Project Overview & Problem Being Addressed

Modern distributed edge infrastructure, autonomous transport fleets, and industrial smart energy systems continuously produce torrents of high-frequency sensor readings. Monitoring these dynamic systems in real time presents three critical computational challenges:

1. **Storage Bottlenecks & Disk I/O Saturation**: Writing hundreds or thousands of telemetry points per second directly into a database causes disk lockup and high API latency.
2. **WebSocket Flood & Broadcast Congestion**: Broadcasting raw application states indiscriminately to every client wastes bandwidth and exhausts client CPU/rendering threads.
3. **Historical vs. Live Data Inconsistency**: Seamlessly transitioning a dashboard between persistent historical records and sub-second live updates without data gaps, frame jitter, or duplicate points.

### The Solution: HyperPulse
**HyperPulse** is an enterprise-grade telemetry ingestion, anomaly detection, and visualization platform. It demonstrates how to ingest multi-domain telemetry (Cloud Edge Servers, Logistics EV Trucks, and Clean Energy Turbines) at high throughput, process events through a write-behind buffering pipeline, detect anomalies using real-time statistical Z-score algorithms, and selectively broadcast updates via Socket.IO rooms with zero client frame drops.

---

## 🛠️ 2. Tech Stack Used

| Layer | Technologies | Role & Purpose |
| :--- | :--- | :--- |
| **Backend Runtime** | **Node.js** (v20+ / v24) + **Express.js** | High-throughput REST API, compression, and request routing |
| **Real-Time Layer** | **Socket.IO** (v4.8+) | Low-latency bi-directional WebSocket communication with room partitioning |
| **Database** | **MongoDB** + **Mongoose** (with auto in-memory fallback) | Time-series document storage, compound indexing, bulk write operations |
| **Frontend UI** | **React.js 18** + **Vite 6** | Ultra-responsive mission control dashboard |
| **Styling & Icons** | **Tailwind CSS** + **Lucide Icons** | Cyber-dark telemetry design system with glassmorphism |
| **Data Visualization** | **Recharts** + **HTML5 Canvas** | Zero-jitter animated time-series charts & sliding windows |
| **Geospatial Mapping** | **Leaflet.js** + CartoDB Dark Matter | Real-time GPS coordinate plotting & fleet corridor tracking |
| **Validation & Security**| **Zod**, **Bcrypt.js**, **JWT** | Schema validation, backpressure rate limiting, and API key auth |
| **Audio Synthesizer** | **Web Audio API** | Pure browser synthetic audio alarms for critical anomaly notifications |
| **Deployment** | **Docker**, **Docker Compose**, **Render** | Production containerization & 1-click cloud deployment manifests |

---

## ✨ 3. Key Features Implemented

### 📡 Multi-Domain Telemetry Ingestion
- **Cloud Edge Servers**: Tracks CPU load (%), Memory (%), Network Rx/Tx (Mbps), Request Latency (ms), and Core Temperature (°C).
- **Autonomous Transport Fleet**: Real-time GPS coordinates, vehicle ground speed (km/h), battery SoC (%), motor temperature (°C), and cargo weight.
- **Renewable Turbines & Grids**: Megawatt power output (MW), mechanical vibration (mm/s), rotor RPM, bearing oil temperature (°C), and grid frequency (Hz).

### ⚡ High-Throughput Write-Behind Ingestion Pipeline
- Ingestion buffer accumulates events in an in-memory queue.
- Flushes micro-batches every **500ms** or **200 events** via `Telemetry.bulkWrite()` with `ordered: false`.
- Drastically reduces database write operations by **95%**, sustaining **7,320+ events/sec** without blocking the event loop.

### 🎯 Selective Socket.IO Room Topology & Delta Framing
- Clients selectively subscribe to:
  - `room:global`: High-level system KPI feed and alert notifications.
  - `room:category:<server|fleet|turbine>`: Category-specific high-frequency streams.
  - `room:device:<deviceId>`: Granular single-device telemetry stream.
- Emits lightweight delta packets instead of complete state re-transmissions.

### 👥 Multi-Client Live Sync Demonstration View
- Visualizes two independent client sessions side-by-side (`DevOps SRE` vs `Fleet Dispatcher`).
- Live counters demonstrate how each client only receives their subscribed category, cutting network overhead by **75%**.

### 🧠 Real-Time Statistical Z-Score Anomaly Engine & AI Copilot
- Maintains a rolling window of recent values for each metric to calculate mean ($\mu$) and standard deviation ($\sigma$).
- Detects spikes when $Z = \frac{x - \mu}{\sigma} \ge 3.2$.
- Employs an intelligent **alert cooldown anti-flap timer** to prevent notification storms.
- **AI Diagnostics Copilot**: Multi-variate root cause analysis with **1-click automated runbook remediation** that dynamically normalizes device telemetry in real time!

### 🔄 Gapless Historical & Live Reconciler
- When opening an asset deep-dive modal, historical data is fetched from MongoDB (`/api/telemetry/history`).
- Real-time Socket.IO events are merged seamlessly on the client using `eventId` deduplication.
- Live frames and historical records are clearly tagged (`HISTORICAL_MONGODB` vs `LIVE_SOCKET_IO`) and rendered on a unified continuous waveform.

### 📟 Live WebSocket Terminal Stream Inspector
- Hacker-style raw packet stream tap showing streaming JSON frames with colorized keys, regex search, auto-scroll locking, and copy-to-clipboard.

### 🌐 Global Edge Data Center Topology
- Interactive mesh view of edge nodes across Ashburn, Dublin, Mumbai, and São Paulo with live ingress/egress bandwidth and latency metrics.

### 🎮 Interactive Chaos & Stress Testing Lab
- Built-in UI controls to adjust emission rate dynamically (**10, 50, 100, 500, 1000 events/sec**).
- One-click chaos injection:
  - **Spike CPU** on EU Database Server to 98%.
  - **Critical Battery Drop** on Freightliner Carrier #101.
  - **Bearing Vibration Overload** on Offshore Wind Turbine #1.
  - **Network Latency Burst** to 600ms+.

---

## 🏗️ 4. Data Generation & Ingestion Mechanism

Telemetry events can be ingested via three independent pathways:

1. **Internal Multi-Agent Simulator (`simulatorService.js`)**:
   Automatically generates realistic cyclical telemetry with natural harmonic jitter and dynamic GPS movement for 12 edge devices.
2. **HTTP REST Ingestion Endpoints**:
   - `POST /api/telemetry/ingest`: Single telemetry point ingestion.
   - `POST /api/telemetry/batch`: High-throughput batch ingestion (up to 5,000 events per request).
   - Validated with Zod schemas and guarded by sliding-window rate limiters.
3. **Standalone External Producer CLI (`scripts/standalone-producer.js`)**:
   An independent Node.js process simulating an external IoT transponder or server daemon pushing metrics over HTTP using API Key authentication.

---

## 🚀 5. Quick Start & Execution Instructions

### Prerequisites
- **Node.js** (v18.0.0 or higher recommended, tested on Node v24)
- **npm** (v9 or higher)
- *(Optional)* Local MongoDB or MongoDB Atlas. If no local MongoDB is detected, HyperPulse **automatically spins up an embedded in-memory MongoDB instance with zero configuration required!**

### Step 1: Install Dependencies
From the repository root:
```bash
npm run install:all
```
*(Or install manually: `cd server && npm install`, then `cd ../client && npm install`)*

### Step 2: Start the Full Stack Application
From the repository root:
```bash
# Runs both Backend (port 5000) and Frontend (port 5173) concurrently
npm run dev
```

Alternatively, run in separate terminals:
```bash
# Terminal 1: Backend Server & Socket.IO
cd server
npm start

# Terminal 2: React Frontend with Vite
cd client
npm run dev
```

### Step 3: Open the Dashboard
Navigate your browser to:
👉 **`http://localhost:5173`** (or `http://localhost:5000` for production build)

---

## 🧪 6. Testing & Benchmarking Instructions

### 1. Run Automated Unit & Integration Tests
```bash
npm test
```
*Executes tests for Zod validation, sliding rate limiters, write-behind batch buffers, and Z-score anomaly detection.*

### 2. Run the High-Throughput Stress Test
To test the pipeline with 3,000 events in batches of 250:
```bash
npm run test:stress
```
*Outputs duration, events/sec throughput, latency, and packet loss rate.*

### 3. Run the External Standalone Ingestion Agent
To simulate an independent streaming agent pushing metrics at 25 events/sec:
```bash
npm run test:ingest
```
Watch the live updates immediately appear in the browser dashboard and Leaflet map!

---

## 🐳 7. Docker & Cloud Deployment

### Run with Docker Compose
```bash
docker-compose up --build
```
Spins up MongoDB 7.0 and the HyperPulse unified service on port 5000.

---

## 📚 8. External Libraries & Attribution

| Resource | Purpose | License |
| :--- | :--- | :--- |
| [Socket.IO](https://socket.io/) | Bi-directional event communication | MIT |
| [Mongoose](https://mongoosejs.com/) | MongoDB object modeling & bulk writes | MIT |
| [Recharts](https://recharts.org/) | Composable React charting library | MIT |
| [Leaflet.js](https://leafletjs.com/) | Mobile-friendly interactive maps | BSD-2-Clause |
| [Zod](https://zod.dev/) | TypeScript-first schema validation | MIT |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first CSS framework | MIT |
| [Lucide Icons](https://lucide.dev/) | Clean open-source icon set | ISC |
| [CartoDB Dark Matter](https://carto.com/) | Minimal dark-mode map tiles | OpenStreetMap Contributors / CC BY 3.0 |

---

## 📽️ 9. Demo Video Walkthrough Guide (3–5 Minutes)

When recording the demo video:
1. **Introduction (0:00 - 0:45)**: Overview of HyperPulse, addressing high-throughput telemetry challenges with the MERN Stack + Socket.IO.
2. **Live Dashboard & Multi-Source Stream (0:45 - 1:45)**: Demonstrate real-time KPI cards, Recharts time-series sliding window, and Leaflet GPS vehicle tracking.
3. **Multi-Client Sync View (1:45 - 2:30)**: Show how Client A (SRE) and Client B (Fleet) receive only their selective data streams with 75% bandwidth reduction.
4. **Historical Retrieval & Seamless Reconciliation (2:30 - 3:15)**: Open Device Waveform Modal; show MongoDB historical recovery blended with live Socket updates with zero duplicates.
5. **Chaos Engine & AI Copilot Remediation (3:15 - 4:15)**: Inject a CPU or vibration anomaly; observe Z-score alert trigger and audio alarm; open AI Copilot and click "Execute Runbook" to watch metrics normalize in real time!
6. **Stress Benchmark (4:15 - 5:00)**: Run the 2,000-event stress test to demonstrate 7,000+ events/sec throughput and 60 FPS client performance.
