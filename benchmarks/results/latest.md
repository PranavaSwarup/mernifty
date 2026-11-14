# MetroPulse Benchmark Results (Latest)

Generated: 2026-11-14T16:00:19.086Z

> **Honest Accounting Note:** HTTP ingestion writes telemetry into the in-memory `IngestionBuffer` (`events.accepted`), while asynchronous background flushes write micro-batches to MongoDB (`events.persisted`), and the Socket.IO broadcast loop delivers compact Wire v1 frames to subscribed clients (`deliveredFramesPerSec`). **HTTP-accepted/s != persisted-to-Atlas/s != delivered-to-sockets/s.**

## Host & Target Environment (Latest Run)

- **Git Commit:** `7a7eab6`
- **Node Version:** `v26.13.1`
- **OS / CPU / RAM:** win32 10.0.26300 (x64) | AMD Ryzen 7 7840HS w/ Radeon 780M Graphics (16 cores) | 15.29 GB RAM
- **Server Target:** local (`http://127.0.0.1:5055`)
- **Mongo Target:** Atlas M0 (remote cluster)
- **OpenTelemetry:** enabled=false, sampleRatio=0

## 1. HTTP Batch Ingestion Throughput & Mongo Persistence

| Run Label | Concurrency | Batch Size | Accepted/s (HTTP 202) | Persisted/s (DB Flush) | HTTP RTT p50 / p95 / p99 (ms) | 429 | 503 | Dropped | Server RSS (MB) |
| :--- | ---: | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: |
| OTel Disabled | 1 | 100 | **1,572.4** | **1,132.3** | 25.13 / 55.33 / 269.54 | 0 | 199 | 19900 | 224.33 |
| OTel Disabled | 1 | 500 | **1,930.8** | **1,373.7** | 24.57 / 46.15 / 268.81 | 0 | 385 | 192501 | 292.91 |
| OTel Disabled | 4 | 100 | **1,217.6** | **902.8** | 25.75 / 680.44 / 713.64 | 0 | 597 | 59700 | 328.63 |
| OTel Disabled | 4 | 500 | **1,396.4** | **1,001.2** | 27.76 / 565.6 / 673.78 | 0 | 689 | 344500 | 329.03 |
| OTel Disabled | 16 | 100 | **832.9** | **629.1** | 48.1 / 923.34 / 1047.13 | 0 | 730 | 73000 | 394.97 |
| OTel Disabled | 16 | 500 | **796.6** | **589.2** | 53.21 / 901.69 / 955.46 | 0 | 811 | 405500 | 365.52 |
| OTel On (0.05) | 1 | 100 | **1,576** | **1,075.6** | 27.84 / 64.78 / 278.77 | 0 | 134 | 13400 | 227.09 |
| OTel On (0.05) | 1 | 500 | **1,897** | **1,359.5** | 26.69 / 47.18 / 99.59 | 0 | 389 | 194500 | 379.41 |
| OTel On (0.05) | 4 | 100 | **1,332.1** | **997.2** | 29.86 / 635.47 / 682.78 | 0 | 570 | 57000 | 342.77 |
| OTel On (0.05) | 4 | 500 | **1,298.3** | **879.8** | 30.75 / 592.79 / 651.39 | 0 | 693 | 346500 | 372.44 |
| OTel On (0.05) | 16 | 100 | **807.7** | **631.6** | 47.45 / 915.44 / 1066.01 | 0 | 724 | 72400 | 403.86 |
| OTel On (0.05) | 16 | 500 | **758.2** | **569.4** | 60.57 / 897.58 / 935.29 | 0 | 865 | 432500 | 302.09 |

## 2. Socket.IO Real-Time Fan-Out (Viewer Rooms: 80% Zone / 20% Junction)

| Run Label | Clients | Delivered Frames/s | Per-Client Egress (B/s) | E2E Emit->Recv p50 / p95 / p99 (ms) | Clock Offset (ms) | Coalesced | Dropped | Server CPU% | Server RSS (MB) | Loop Lag p99 (ms) |
| :--- | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: |
| OTel Disabled | 50 | **259.9** | 379.2 | 1 / 1.5 / 2 | 0 | 0 | 0 | 2.71% | 231.26 | 0 |
| OTel Disabled | 200 | **1,039.2** | 379.1 | 1 / 2.5 / 3 | 0 | 0 | 0 | 3.54% | 231.36 | 0 |
| OTel Disabled | 500 | **2,599.9** | 379.9 | 1.5 / 3.5 / 5 | 0 | 0 | 0 | 7.08% | 224.92 | 0 |
| OTel On (0.05) | 50 | **259.9** | 379.5 | 0.5 / 1.5 / 1.5 | 0.5 | 0 | 0 | 3.65% | 266.01 | 43.84 |
| OTel On (0.05) | 200 | **1,039.3** | 379 | 1.5 / 2.5 / 2.5 | 0.5 | 0 | 0 | 3.74% | 225.39 | 43.29 |
| OTel On (0.05) | 500 | **2,597.7** | 379.7 | 3 / 10 / 12 | 0.5 | 0 | 0 | 7.28% | 231.07 | 43.68 |

## 3. OpenTelemetry Overhead Comparison (End-to-End & T06 Micro-Benchmark)

- **Full Benchmark (OTel On @ 0.05 vs OTel Disabled):** Peak HTTP-accepted=1,897 ev/s (vs 1,930.8 ev/s disabled); Peak persisted=1,359.5 ev/s (vs 1,373.7 ev/s disabled); 200-client fan-out p95=2.5 ms (vs 2.5 ms disabled).
- **T06 Micro-Benchmark (30,000 events, 300 x 100 batches against MongoMemoryServer):** OTel Disabled=7,689.8 ev/s (3901.26 ms) vs OTel 5%=7,667.1 ev/s (3912.82 ms) -> **+0.3%** latency overhead.

## 4. Persistence Bottleneck & Atlas M0 Analysis

Persisted throughput (**1,373.7 events/s** peak) is lower than peak HTTP-accepted ingestion (**1,930.8 events/s**) because shared MongoDB Atlas M0 (remote cluster) IOPS, network RTT to cloud Atlas, and compound telemetry index writes limit sustained `insertMany` + `Device.bulkWrite` commit speed. The write-behind `IngestionBuffer` absorbs bursts cleanly in RAM up to capacity before applying explicit HTTP `503` backpressure.
