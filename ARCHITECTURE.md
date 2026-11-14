# MetroPulse BLR: Smart City Traffic Architecture & Design Document

> **Centralized Camera Telemetry Ingestion, Gridlock Detection & Adaptive Signal Control**  
> MERNIFY Hackathon 2026 • Track: High-Throughput Streams & Telemetry

---

## 1. System Architecture Diagram

```mermaid
graph TD
    subgraph Bengaluru Roadside Infrastructure
        CAM1["Silk Board (Hosur Rd / ORR)<br/>4x Optical CCTV / ANPR"]
        CAM2["Tin Factory (Old Madras Rd)<br/>4x Optical CCTV / ANPR"]
        CAM3["Hebbal Flyover (Bellary Rd)<br/>4x Optical CCTV / ANPR"]
        CAM4["Bellandur EcoSpace (ORR)<br/>4x Optical CCTV / ANPR"]
    end

    subgraph Central Traffic Data Center GPU Cluster
        RTSP["High-Speed Municipal Dark Fiber Ring<br/>RTSP / H.264 Video Stream Concentrator"]
        YOLO["GPU Vision Worker Cluster<br/>Optical Flow & YOLO-v9 Vehicle Tracking<br/>Vehicle Classification: 2W, Car, Bus, Truck<br/>Queue Length (m) & Velocity (km/h) Extraction"]
    end

    subgraph Node.js & Express High-Throughput Ingestion
        API["HTTP REST Ingestion Endpoints<br/>POST /api/telemetry/ingest<br/>POST /api/telemetry/batch"]
        VAL["Traffic Schema Normalizer & Validator<br/>Validates junctionId, zoneId, approaches"]
        RL["Sliding-Window Rate Limiter<br/>Backpressure Guard (10,000 capacity)"]
        DEDUP["Frame Deduplicator<br/>Drops duplicate sequence / camera frames"]
    end

    subgraph Real-Time Processing & Anomaly Pipeline
        BUFFER["Write-Behind Batch Buffer<br/>Flushes 200 events / 500ms via bulkWrite()"]
        ANOMALY["Traffic Anomaly & Gridlock Engine<br/>Z-Score Surge Detector (|Z| >= 3.0)<br/>Stalled Vehicle & Ambulance Preemption"]
        SOCKET_SRV["Socket.IO Zonal Broadcast Engine<br/>80ms Micro-Batching window"]
    end

    subgraph Database Layer
        MONGO[("MongoDB Database<br/>Compound Time-Series Indexes")]
        COLL_TEL["Telemetry Collection<br/>junctionId + zoneId + timestamp"]
        COLL_DEV["Junction Matrix<br/>status, healthScore, lastData, approaches"]
        COLL_ALT["Incident Alerts Store<br/>gridlock, stalledVehicle, ambulance"]
    end

    subgraph Command Operations & Dispatch
        CLIENT1["City-Wide Operations HQ<br/>Room: global + alerts"]
        CLIENT2["South Zone Traffic Desk<br/>Room: zone:south-bangalore"]
        CLIENT3["East Zone Traffic Desk<br/>Room: zone:east-bangalore"]
        COPILOT["AI Traffic Copilot<br/>Autonomous Adaptive Green Wave & Tow Dispatch"]
    end

    CAM1 --> RTSP
    CAM2 --> RTSP
    CAM3 --> RTSP
    CAM4 --> RTSP

    RTSP --> YOLO
    YOLO -->|Structured JSON Stream| API

    API --> VAL --> RL --> DEDUP

    DEDUP --> BUFFER
    DEDUP --> ANOMALY
    DEDUP --> SOCKET_SRV

    BUFFER --> COLL_TEL
    BUFFER --> COLL_DEV
    ANOMALY --> COLL_ALT

    SOCKET_SRV --> CLIENT1
    SOCKET_SRV --> CLIENT2
    SOCKET_SRV --> CLIENT3
    COLL_ALT --> COPILOT
```

---

## 2. Core Architectural Decisions

### A. Centralized Data Center Processing vs. Edge Junction Compute
- **The Challenge:** Roadside controller cabinets on Bangalore roads endure extreme humidity, monsoonal flooding, 40°C summer dust, and unstable grid power. Deploying high-power GPU accelerators on every junction pole would incur catastrophic failure rates and enormous replacement costs.
- **The Solution:** Roadside cameras act purely as ruggedized RTSP optical emitters streaming video over municipal fiber to the **Centralized City Data Center**. Scalable GPU vision clusters perform object detection, optical flow queue calculation, and vehicle classification in an air-conditioned, redundant environment, emitting structured JSON telemetry into the ingestion pipeline.

### B. Strategic Scope: Focusing Compute Resources on High-Impact Traffic (Air Pollution Omitted)
- **The Challenge:** Air pollution fluctuates across vast multi-kilometer regional zones and is not directly actionable on sub-minute timescales (traffic cannot realistically be diverted onto a 15km detour to avoid a particulate pocket without exacerbating city-wide gridlock).
- **The Solution:** Air pollution monitoring was deliberately omitted to dedicate 100% of GPU compute, network bandwidth, and database I/O to **actionable congestion relief: dynamic adaptive signal splits, incident/stalled vehicle tow dispatch, and emergency ambulance green corridors**.

---

## 3. High-Throughput Write-Behind Ingestion Pattern

Directly persisting 1,000+ camera frames per second into disk causes thread pool exhaustion and write lockups:

1. **In-Memory Ring Queue:** Ingestion calls (`POST /api/telemetry/ingest` and `/batch`) enqueue validated frames into memory with zero disk delay ($< 1\text{ms}$).
2. **Micro-Batch Flushing:** An asynchronous timer drains up to **200 events** every **500ms** (or when the buffer hits the batch ceiling).
3. **Unordered Bulk Write:** Executed via `Telemetry.bulkWrite()` and `Device.bulkWrite()` with `ordered: false`, reducing disk I/O operations by **95%** while sustaining **7,000+ events/sec**.

---

## 4. Canonical Traffic Data Model Specification

Each ingested frame represents one traffic junction cycle emitted by the Centralized Vision Workers:

```json
{
  "eventId": "EVT-1731512400000-abcd",
  "junctionId": "JNC-BLR-001",
  "zoneId": "south-bangalore",
  "timestamp": "2026-11-13T20:40:00.000Z",
  "sequence": 1420,
  "data": {
    "approaches": [
      {
        "road": "Hosur Rd (from south)",
        "vehiclesPerMin": 38,
        "queueLengthM": 180,
        "avgSpeedKmph": 6,
        "signal": "red",
        "greenTimeSec": 45
      },
      {
        "road": "ORR (from east)",
        "vehiclesPerMin": 52,
        "queueLengthM": 60,
        "avgSpeedKmph": 22,
        "signal": "green",
        "greenTimeSec": 50
      },
      {
        "road": "Hosur Rd (from north)",
        "vehiclesPerMin": 30,
        "queueLengthM": 90,
        "avgSpeedKmph": 14,
        "signal": "red",
        "greenTimeSec": 35
      },
      {
        "road": "BTM Rd (from west)",
        "vehiclesPerMin": 21,
        "queueLengthM": 40,
        "avgSpeedKmph": 18,
        "signal": "red",
        "greenTimeSec": 30
      }
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

## 5. Zonal Socket.IO Room Topology

Downstream clients subscribe selectively to eliminate client-side packet congestion:

| Room Pattern | Subscribed Clients | Transmitted Slices | Bandwidth Impact |
| :--- | :--- | :--- | :--- |
| `global` | City Operations Center | City KPI snapshot, emergency alerts | Baseline |
| `zone:south-bangalore` | South Desk (BTM / Silk Board / Koramangala) | Only South corridor junctions | **~75% reduction** |
| `zone:east-bangalore` | East Desk (Bellandur / Tin Factory / KR Puram)| Only East corridor junctions | **~75% reduction** |
| `junction:JNC-BLR-001` | Modal Inspection & Signal Override | Granular single-junction camera feed | **~92% reduction** |

---

## 6. AI Traffic Copilot Runbook Engine

When anomalous bottlenecks occur, the Copilot Engine evaluates root causes and surfaces automated 1-click runbooks:

1. **Dynamic Green Split Optimization:** Reallocates +25s green time to the saturated approach to dissolve queues.
2. **Automated Emergency Green Wave Corridor:** Pre-emptively holds conflicting cross-streets at RED and establishes continuous green wave for ambulances.
3. **BTP Rapid Incident Tow Dispatch:** Dispatches nearest recovery crane and pushes warnings to upstream electronic Variable Message Signs (VMS).
4. **Upstream Arterial Diversion:** Siphons 35% of incoming volume onto peripheral bypass ring roads.
