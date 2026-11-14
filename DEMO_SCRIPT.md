# MetroPulse BLR Telemetry Platform — Demo Video Script (3–5 Minutes)

> **Official Walkthrough & Presentation Guide for Hackathon Evaluators**  
> **Topic**: High-Throughput Streams & Telemetry Monitoring (MERN + Socket.IO)

---

## 🎬 Video Overview & Timeline

| Segment | Duration | Title | Key Demo Highlights |
| :---: | :---: | :--- | :--- |
| **1** | 0:00 – 0:45 | **System Architecture & Problem Context** | Problem statement, high-throughput bottlenecks, MERN + Socket.IO solution |
| **2** | 0:45 – 1:30 | **Live Dashboard & Multi-Source Streams** | KPI cards (e/s, latency), Recharts waveforms, hardware device matrix |
| **3** | 1:30 – 2:15 | **Geospatial Fleet Tracking & Edge Mesh** | Leaflet GPS movement, vehicle telematics, global edge network topology |
| **4** | 2:15 – 3:00 | **Multi-Client Selective Socket.IO Sync** | Side-by-side client rooms (`category:server` vs `category:fleet`), 75% bandwidth reduction |
| **5** | 3:00 – 3:45 | **Historical Reconciliation & Analytics** | Deep-dive modal, blending MongoDB history + live Socket.IO with deduplication, CSV export |
| **6** | 3:45 – 4:30 | **Chaos Injection & AI Copilot Remediation** | Z-score anomaly alarm, sound chime, automated runbook 1-click execution |
| **7** | 4:30 – 5:00 | **High-Throughput Benchmark & Conclusion** | 7,320 events/sec stress test, 60 FPS client rendering, wrap-up |

---

## 🎙️ Step-by-Step Script & Narration

### Segment 1: Introduction (0:00 – 0:45)
- **On Screen**: Show the MetroPulse BLR Operations Dashboard at `http://localhost:5173` with live indicators ticking.
- **Narrator**:
  > *"Hello judges! Welcome to MetroPulse BLR, an enterprise real-time telemetry and observability platform engineered for the MERNIFY Hackathon. In modern distributed systems, whether it is high-density cloud data centers, autonomous transport logistics, or renewable energy grids, telemetry data arrives at frequencies exceeding thousands of events per second. Direct database writes lock up storage, while broadcasting full states saturates network links.*  
  > *MetroPulse BLR solves this using a write-behind buffering pipeline in Node.js, selective Socket.IO room distribution, in-memory deduplication, and an online statistical anomaly detection engine."*

---

### Segment 2: Live Operations & Multi-Domain Ingestion (0:45 – 1:30)
- **Action**: Hover over the KPI cards at the top and the live telemetry charts.
- **Narrator**:
  > *"Here on the Live Operations Command Center, our ingestion pipeline is actively processing and persisting data from 12 edge devices across three critical domains:*
  > *1. Edge Servers tracking CPU, Memory, Latency, and Error rates.*
  > *2. Autonomous Logistics Trucks tracking GPS coordinates, ground speed, battery charge, and motor temperatures.*
  > *3. Renewable Energy Turbines tracking power output in megawatts, rotor RPM, and bearing vibration.*
  > *Notice our live Recharts waveform: it streams with sub-second sliding windows, zero jitter, and zero DOM freezing because our client decouples socket frame arrival from rendering through a 100ms micro-window throttle."*

---

### Segment 3: Fleet Geo-Tracker & Global Edge Mesh (1:30 – 2:15)
- **Action**: Click the **"Fleet Geo-Tracker"** tab. Click on `Freightliner eCascadia #101`.
- **Narrator**:
  > *"Under the Fleet Geo-Tracker tab, we utilize an interactive dark-mode Leaflet map. As GPS transponder coordinates stream in via Socket.IO, autonomous carrier trucks glide along their transit corridors in real time. Clicking on any transponder reveals live ground speed, battery state of charge, and motor temperatures.*  
  > *Switching to the **Global Edge Mesh** tab, we visualize our distributed cloud regions across Ashburn, Dublin, Mumbai, and São Paulo with live ingress and egress bandwidth telemetry."*

---

### Segment 4: Multi-Client Selective Socket.IO Sync (2:15 – 3:00)
- **Action**: Click the **"Multi-Client Sync"** tab. Show Client A and Client B receiving data simultaneously.
- **Narrator**:
  > *"One of the core requirements of this hackathon is proving that multiple connected clients receive relevant updates efficiently. In our Multi-Client Sync view, we demonstrate this live. On the left, Client A is an SRE engineer subscribed only to `category:server`. On the right, Client B is a Fleet Dispatcher subscribed only to `category:fleet`.*  
  > *By leveraging Socket.IO room segmentation, neither client receives the other's heavy traffic. This delivers over 75% bandwidth reduction compared to naive state re-broadcasting."*

---

### Segment 5: Historical Retrieval & Gapless Reconciliation (3:00 – 3:45)
- **Action**: Return to the **"Live Operations"** tab, scroll down to the Device Grid, and click **"Inspect Stream"** on any device to open the Deep-Dive Modal.
- **Narrator**:
  > *"A common pitfall in real-time dashboards is data duplication when switching from historical storage to live streaming. When opening our Deep-Dive Waveform modal, MetroPulse BLR fetches the last 50 records from MongoDB, and immediately hooks into the live Socket.IO stream.*  
  > *Notice the badges: our client-side reconciliation engine uses eventId deduplication to blend `[HISTORICAL_MONGODB]` records with `[LIVE_SOCKET_IO]` packets into one continuous, gapless waveform.*  
  > *Furthermore, under the **Historical Analytics** tab, operators can aggregate millions of data points into 5-second or 1-minute time buckets and export audit reports directly as CSV or JSON."*

---

### Segment 6: Chaos Engine & AI Telemetry Copilot (3:45 – 4:30)
- **Action**: Go to the **"Chaos & Stress Lab"** tab. Click **"Inject Server CPU Spike"**.
- **Narrator**:
  > *"To test resilience, we built a Chaos & Anomaly Injection Lab. Let's trigger a severe CPU spike on our European Database cluster.*  
  > *(Alert chime sounds in browser, red toast appears)*  
  > *Our backend sliding window instantly computes a Z-score outlier (|Z| >= 3.2), creates an alert, and dispatches a critical notification.*  
  > *Now, let's open our **AI Diagnostics Copilot** on this device. The Copilot correlates the CPU spike with thread pool backlog, identifies the root cause with 96% confidence, and provides an actionable runbook. Let's click **'Execute Runbook'** — the backend sheds background load, normalizes the simulated device, and resolves the incident in real time across all clients."*

---

### Segment 7: High-Throughput Benchmark & Conclusion (4:30 – 5:00)
- **Action**: Switch to the **"Engine Telemetry"** tab. Click **"2,000 Burst Test"**.
- **Narrator**:
  > *"Finally, let's verify system throughput under load. We fire a 2,000-event burst through our HTTP batch endpoint. Our write-behind buffer flushes via MongoDB bulkWrite, achieving **over 7,000 events per second** with **zero packet drops**, while the client maintains a locked **60 FPS**.*  
  > *MetroPulse BLR provides a full automated test suite with `npm test`, Docker containerization with `docker-compose`, and full architectural documentation.*  
  > *Thank you for reviewing MetroPulse BLR!"*
