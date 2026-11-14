import React from 'react';
import { BookOpen, Layers, Network, Database, Shield, Zap, CheckCircle2, ArrowRight, Camera, Navigation, Cpu } from 'lucide-react';

export function ArchitectureView() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero Banner */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-cyan-950/30 p-6 sm:p-8 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              System Design & Architecture Document
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
              MetroPulse BLR: Smart City Central Traffic Platform
            </h2>
          </div>
        </div>
        <p className="text-slate-300 text-sm mt-3 leading-relaxed">
          MetroPulse BLR is an enterprise-grade centralized traffic telemetry ingestion, gridlock detection, and adaptive signal coordination platform engineered with the MERN Stack and Socket.IO for the Bengaluru metropolitan road network.
        </p>
      </div>

      {/* Key Architectural Decisions Highlight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Decision 1: Centralized DC vs Edge Junction Compute */}
        <div className="p-5 rounded-xl border border-cyan-500/30 bg-cyan-950/15">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm mb-2">
            <Cpu className="w-4 h-4" />
            <span>Centralized Vision Ingestion vs Edge Compute</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            <strong>Architecture Decision:</strong> Traffic junctions endure severe monsoonal rain, dust, and electrical surges. Deploying expensive GPU AI cards on roadside poles incurs exorbitant hardware failure and maintenance costs. Instead, ruggedized roadside cameras stream RTSP feeds over municipal optical rings directly to the <strong>Centralized City Data Center</strong>, where scalable GPU workers process computer vision models and output structured JSON telemetry.
          </p>
        </div>

        {/* Decision 2: Focus on High-Impact Traffic Flow (Air Pollution Omitted) */}
        <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-950/15">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-2">
            <Navigation className="w-4 h-4" />
            <span>Resource Focus: High-Impact Congestion vs Air Pollution</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            <strong>Architecture Decision:</strong> Air pollution impacts wide multi-kilometer regional spans, cannot be diverted in real time without causing severe commuter travel penalties, and dilutes compute budgets. The system explicitly focuses 100% of GPU, network, and database resources on <strong>real-time arterial bottleneck reduction, adaptive green split optimization, and emergency ambulance corridors</strong>.
          </p>
        </div>
      </div>

      {/* Data Flow Diagram Card */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-6">
        <h3 className="font-bold text-base text-slate-100 flex items-center gap-2 mb-4">
          <Network className="w-4 h-4 text-emerald-400" />
          End-to-End Central Camera Ingestion Pipeline
        </h3>

        {/* Visual Flow Diagram */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800/80 font-mono text-xs overflow-x-auto text-slate-300 leading-relaxed">
          <pre>{`
 [Roadside Optical Cameras]
  - 12 Bengaluru Junctions (Silk Board, Hebbal, etc.)
  - H.264/RTSP Video Feeds over Optical Ring
            │
            ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Central Data Center GPU Vision Worker Cluster (YOLO & Optical Flow)    │
 │  - Real-time Object Detection & Vehicle Classification (2W/Car/Bus/Trk)│
 │  - Optical Queue Length (m) & Velocity (km/h) Extraction               │
 │  - Emits JSON: { junctionId, zoneId, data: { approaches, vehicleMix } }│
 └──────────┬─────────────────────────────────────────────────────────────┘
            │ HTTP POST /api/telemetry/ingest (or /batch)
            ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Node.js + Express High-Throughput Ingestion Middleware                 │
 │  1. Traffic Schema Normalizer (computes congestion score & flow rate)   │
 │  2. Sliding-Window Rate Limiter & Backpressure Guard (10,000 capacity) │
 │  3. Event Deduplicator (drops duplicate sequence / camera frames)      │
 └──────────┬─────────────────────────────────────────────────────────────┘
            │
      ┌─────┴────────────────────────────┬─────────────────────────────┐
      ▼                                  ▼                             ▼
 ┌───────────────────────────┐ ┌───────────────────────────┐ ┌──────────────────────────┐
 │ Real-Time Gridlock Engine │ │ Write-Behind Batch Buffer │ │ Socket.IO Zonal Router   │
 │  - Z-Score Surge Detector │ │  - In-Memory Ring Buffer  │ │  - Room: global (City HQ)│
 │  - Stalled Vehicle Alert  │ │  - Micro-batch flush:     │ │  - Room: zone:{zoneId}   │
 │  - Ambulance Preemption   │ │    200 events / 500ms     │ │  - Room: junction:{id}   │
 │  - Saturated Queue Alert  │ │  - MongoDB bulkWrite()    │ │  - 75% Bandwidth Savings │
 └──────────┬────────────────┘ └───────────┬───────────────┘ └──────────┬───────────────┘
            │                              │                            │
            ▼                              ▼                            ▼
 ┌───────────────────────────┐ ┌───────────────────────────┐ ┌──────────────────────────┐
 │ MongoDB 'Alerts' Store    │ │ MongoDB 'Telemetry' Coll  │ │ React Operations Console │
 │  - Active Incidents       │ │  - Compound indexes on:   │ │  - Bengaluru Leaflet Map │
 │  - AI Copilot Runbooks    │ │    (junctionId, timestamp)│ │  - 4-Way Approach Queues │
 │  - Auto-Resolution Log    │ │    (zoneId, timestamp)    │ │  - AI Copilot 1-Click Ops│
 └───────────────────────────┘ └───────────────────────────┘ └──────────────────────────┘
          `}</pre>
        </div>
      </div>

      {/* Core Architectural Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1 */}
        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-2">
            <Zap className="w-4 h-4" />
            <span>Write-Behind Batching</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Ingesting thousands of camera frames per second directly into disk locks database connections. An in-memory queue accumulates frames and flushes batches every 500ms via <code>Telemetry.bulkWrite()</code>, reducing disk write ops by <strong>95%</strong>.
          </p>
        </div>

        {/* Pillar 2 */}
        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm mb-2">
            <Network className="w-4 h-4" />
            <span>Zonal Room Partitioning</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Clients subscribe to targeted rooms: <code>zone:south-bangalore</code>, <code>zone:east-bangalore</code>, or <code>junction:JNC-BLR-001</code>. Zonal operators receive only their corridor telemetry, eliminating browser frame drops and slashing network bandwidth by <strong>75%</strong>.
          </p>
        </div>

        {/* Pillar 3 */}
        <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5">
          <div className="flex items-center gap-2 text-purple-400 font-bold text-sm mb-2">
            <Shield className="w-4 h-4" />
            <span>AI Traffic Copilot</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Evaluates cross-approach saturation to detect green starvation, immobilized vehicles, or approaching ambulances. Operators can execute <strong>1-click automated runbooks</strong> to adjust signal timing or clear lanes instantly.
          </p>
        </div>
      </div>
    </div>
  );
}
