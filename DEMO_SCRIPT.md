# MetroPulse BLR: 5-Minute Evaluator Demo Script

> **MERNIFY Hackathon 2026 • Track: High-Throughput Streams & Telemetry**  
> Complete timed presentation script for our 3-student team across 7 scenes. Total duration: ~4 minutes 50 seconds.

---

## ⏱️ Video Overview & Scene Schedule

| Scene | Timestamp | Duration | Scene Title | Key Features Demonstrated |
| :---: | :---: | :---: | :--- | :--- |
| **1** | 0:00 – 0:20 | 20s | **What MetroPulse BLR Is & Who Uses It** | Domain context (Bengaluru Smart Traffic), open viewing principle, 4 protected roles |
| **2** | 0:20 – 1:00 | 40s | **Live City Map & Junction Optical Detail** | Leaflet city map, 12 junctions, CCTV camera simulation, 4-approach lane queues & signals |
| **3** | 1:00 – 1:50 | 50s | **Side-by-Side Selective Room Filtering** | 2 browser windows side-by-side: Officer on South Zone vs Citizen on single junction |
| **4** | 1:50 – 3:00 | 70s | **Ambulance Green Corridor (Centrepiece)** | Hebbal to Jayadeva emergency trip, 2 Hz GPS tracking, signal preemption & give-way alert |
| **5** | 3:00 – 3:50 | 50s | **Sudden Blockage, Citizen Report & Remediation** | Velocity collapse alert, countdown, 1-hop jam spread, citizen report cause, officer override |
| **6** | 3:50 – 4:20 | 30s | **History & Live Data Merge + Reconnect** | Subscribe-then-fetch order, no duplicate points, visual join dots, 10s disconnect gap fill |
| **7** | 4:20 – 4:50 | 30s | **Real Health Panel & Measured Stress Test** | 5,807 evt/s sustained throughput, 40ms batch RTT, 3 distinct latencies, action log audit |

---

## 🎙️ Detailed Scene Narration & Visual Actions

### Scene 1: Introduction & The Problem (0:00 – 0:20)
- **On Screen**: Browser open at `http://localhost:5173` showing the MetroPulse BLR top header with live indicators and the 12-junction map.
- **Speaker 1 (Student A)**:
  > *"Hello judges! Welcome to MetroPulse BLR, a real-time traffic telemetry and adaptive signal monitoring platform built for Bengaluru's major arterial bottlenecks on MongoDB, Express, React, Node.js, and Socket.IO.*  
  > *In MetroPulse BLR, traffic data is completely public so anyone can view live congestion across the city. However, actions have consequences, so our four roles protect operations: Citizens can submit incident reports; Ambulance drivers initiate emergency corridors; Officers manage their assigned zones; and Admins supervise city-wide system health."*

---

### Scene 2: Live City Map & Junction Optical Queues (0:20 – 1:00)
- **On Screen**: Click on **"Bengaluru Traffic Map"** tab. Hover over Silk Board and Bellandur EcoSpace. Click on **Central Silk Board (JNC-BLR-001)** to open the deep-dive modal.
- **Speaker 2 (Student B)**:
  > *"Here on our interactive Leaflet map, you see twelve monitored Bengaluru interchanges connected by our road network graph. The simulator models the structured output of municipal GPU vision cameras processing optical video at the city data center.*  
  > *Opening Silk Board Junction, our detail view exposes individual approach lanes: Hosur Road from south, Outer Ring Road from east, Hosur Road from north, and BTM Road from west. You see live vehicle classification breakdown across two-wheelers, cars, buses, and trucks, dynamic signal phase states, and optical queue lengths updating in real time."*

---

### Scene 3: Two Windows Side-by-Side — Selective Room Filtering (1:00 – 1:50)
- **On Screen**: Resize windows side by side.
  - **Window 1 (Left)**: Logged in as `officer.south@metropulse.blr` viewing South Bengaluru Zone.
  - **Window 2 (Right)**: Anonymous Citizen viewing only Silk Board Junction (`JNC-BLR-001`).
- **Speaker 3 (Student C)**:
  > *"The hackathon guidelines explicitly reward selective broadcasting over sending whole states. Notice the Room and Rate indicators in the navbar of both windows:*  
  > *On the left, our South Zone officer is subscribed strictly to `zone:south-bangalore`, receiving micro-batches at ~12 events per second for southern junctions.*  
  > *On the right, our citizen is viewing only Silk Board, joined only to `city` and `junction:JNC-BLR-001` receiving ~1 event per second.*  
  > *Neither client receives the full city firehose. In addition, Socket.IO chained emits deliver alerts exactly once per client, cutting client bandwidth consumption by over 75%."*

---

### Scene 4: Ambulance Emergency Green Corridor — Centrepiece Demo (1:50 – 3:00)
- **On Screen**: In Window 1 (Admin/Officer), navigate to Bengaluru Traffic Map. Click **"🚑 Send Ambulance (Hebbal ➔ Jayadeva)"** (with "Avoid Jams" enabled).
- **Speaker 1 (Student A)**:
  > *"Now for our evaluation centrepiece: the Ambulance Green Corridor. Pitch in one line: 'When an ambulance starts a trip, our system clears its path one junction at a time and warns the people ahead, and you can watch it happen live.'*  
  > *An emergency cardiac ambulance departs Hebbal Flyover heading to Jayadeva Hospital across 6 connected junctions: Hebbal ➔ Mekhri ➔ Town Hall ➔ Richmond ➔ Dairy Circle ➔ Jayadeva.*  
  > *Watch the live map: as the ambulance moves at 2 Hz GPS updates, our lookahead logic detects junctions ahead. Mekhri Circle and Town Hall preemptively lock green on the incoming corridor approach, holding cross-streets on red to flush the queue before arrival.*  
  > *Here is the critical realism note: We do NOT rely on drivers being considerate or looking at a smartphone in bumper-to-bumper Bengaluru traffic. We clear the queue ahead with the traffic light itself. When the signal turns green, drivers naturally move forward because the light is in their favour, while cross-traffic stops on red.*  
  > *Notice what each persona sees in real time:*  
  > *1. The Ambulance Driver sees their live navigation HUD with locked green signals ahead.*  
  > *2. The Traffic Police Officer stationed at the junction gets an advance tactical alert banner to hold cross-traffic and keep the road shoulder clear.*  
  > *3. Citizens viewing that junction receive a subtle public advisory notice with an arrival ETA.*  
  > *4. Citizens watching off-route junctions receive nothing, maintaining clean room isolation.*  
  > *And if a junction along the corridor is heavily gridlocked, our real-time graph router dynamically reroutes the ambulance around the jam using live telemetry.*  
  > *As the ambulance clears each junction, it returns to dynamic AI timing, and upon arrival at Jayadeva Hospital, the trip summary—including exact preemption and clearance timestamps for each junction—is saved to MongoDB for audit replay."*

---

### Scene 5: Sudden Blockage, Citizen Report & Automated Fix (3:00 – 3:50)
- **On Screen**:
  1. In Simulator Lab, click **"Trigger Blockage"** at Silk Board (Hosur Rd).
  2. Switch Window 2 to Citizen, tap **"📢 Report Incident"**, choose `accident`, select Silk Board, click Submit.
  3. Watch the alert update with cause and countdown.
- **Speaker 2 (Student B)**:
  > *"Now let's simulate an incident. An admin triggers a sudden breakdown on Hosur Road at Silk Board. Velocity collapses to 2 km/h while the signal is green. Our anomaly engine detects this measured effect and raises a `sudden_blockage` alert with cause `unknown` and a 20-second remediation countdown.*  
  > *Over the next 15 seconds, notice 1-hop jam spreading: Dairy Circle and Jayadeva begin to slow down from backlog pressure.*  
  > *A citizen submits a report: 'accident at Silk Board'. The server groups the report, links it to our open alert, and tags the cause: 'Sudden Blockage at Silk Board. Cause: accident via 1 Citizen Report.'*  
  > *When the countdown expires, our 1-second remediation loop automatically applies an `extend_green` fix to drain the backlog, and the action logs to our database audit trail. An officer can also click Override at any moment to take manual control."*

---

### Scene 6: History & Live Data Reconciliation + Reconnect (3:50 – 4:20)
- **On Screen**: Open Silk Board Junction Detail Modal. Point to the Recharts waveform showing `[HISTORICAL_MONGODB]` cyan dots joined seamlessly with `[LIVE_SOCKET_IO]` emerald pulsing dots.
- **Speaker 3 (Student C)**:
  > *"Combining historical records with live streams without duplicate or missing points is a core judging criterion. When this modal opens, our code subscribes to the junction room first, buffers any in-flight events while the MongoDB history query executes, and then merges them sorted by timestamp with sequence numbers as tie-breakers.*  
  > *Notice the visual join dots on the chart. If the client disconnects for 10 seconds and reconnects, our gap-filling handler requests history strictly from the last seen timestamp, restoring a continuous waveform with zero missing sequence numbers."*

---

### Scene 7: Real Measured Benchmarks & Conclusion (4:20 – 4:50)
- **On Screen**: Switch to **"Throughput Engine"** (Performance Benchmark) tab. Show the 3 distinct latency cards, the 3 drop counters, the Action Log audit table, and terminal executing `node scripts/stress-test.js`.
- **Speaker 1 (Student A)**:
  > *"Finally, let's look at real measured performance. We do not use unverified badges. Under our standalone stress test sending 5,000 traffic events over HTTP, our write-behind buffer sustained **5,807 events per second** with a **40.19 millisecond batch round-trip time**.*  
  > *Our health panel honestly separates ingest delay, bulk persistence delay, and browser end-to-end latency, with zero backpressure drops.*  
  > *Every feature demonstrated is verified by our 12 automated unit tests running with Node's built-in test runner.*  
  > *Thank you, judges! We look forward to your questions."*
