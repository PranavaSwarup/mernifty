import React, { useState } from 'react';
import { Server, Globe, Activity, ArrowUpRight, Wifi, ShieldAlert, Cpu, Camera, Navigation, Layers } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function NetworkTopologyView({ devices = [] }) {
  const { latestByDevice, stats } = useSocket();

  const hubs = [
    {
      id: 'dc-central-gpu',
      name: 'Bengaluru Centralized Traffic GPU Cluster',
      type: 'Central Data Center',
      location: 'Electronics City IT Campus',
      role: 'Heavy vision AI processing: YOLO vehicle tracking, queue estimation, ANPR',
      specs: '32x NVIDIA H100 GPU Nodes • 100 Gbps Dark Fiber Backbone',
      status: 'active',
      throughput: `${stats.ingestRate} e/s`,
      latency: `${stats.avgLatencyMs || 12} ms`,
    },
    {
      id: 'btp-hq-command',
      name: 'BTP Traffic Command & Operations Center',
      type: 'Command Operations HQ',
      location: 'Infantry Road, Central Bengaluru',
      role: 'Real-time adaptive signal overrides, emergency corridors, towing dispatch',
      specs: 'Central Video Wall • High-Availability Dispatch Desks',
      status: 'active',
      throughput: `${stats.broadcastRate} e/s`,
      latency: '2 ms',
    },
    {
      id: 'hub-south',
      name: 'South Bengaluru Optic Concentrator',
      type: 'Zonal Edge Hub',
      location: 'Koramangala 100ft Rd Hub',
      role: 'Camera RTSP aggregator for Silk Board, Sony World, Dairy Circle, Jayadeva',
      specs: '10 Gbps Metro Ethernet Ring',
      status: 'active',
      throughput: '4 Junctions Feed',
      latency: '3 ms',
    },
    {
      id: 'hub-east',
      name: 'East Bengaluru Optic Concentrator',
      type: 'Zonal Edge Hub',
      location: 'Mahadevapura Interchange',
      role: 'Camera RTSP aggregator for Bellandur EcoSpace, Tin Factory, Marathahalli',
      specs: '10 Gbps Metro Ethernet Ring',
      status: 'active',
      throughput: '3 Junctions Feed',
      latency: '4 ms',
    },
  ];

  const [selectedHubId, setSelectedHubId] = useState('dc-central-gpu');
  const selectedHub = hubs.find((h) => h.id === selectedHubId) || hubs[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Smart City Distributed Ingestion Architecture
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              Centralized Camera Vision Data Center & Zonal Hubs
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          <span>Centralized Processing Active (Rugged Junction Optimization)</span>
        </div>
      </div>

      {/* Architectural Callout Banner */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-300 leading-relaxed flex items-start gap-3">
        <Layers className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-white block mb-0.5">
            Architectural Design: Why Cameras Stream to Central Data Center
          </span>
          Roadside camera boxes at Bangalore traffic junctions face harsh monsoon downpours, dust, and power instability. Placing delicate multi-thousand-dollar GPU AI clusters on traffic poles is economically and operationally prohibitive. Instead, ruggedized IP/CCTV cameras stream RTSP video over high-speed municipal optical fiber to the <strong>Centralized Data Center</strong>, where scalable GPU clusters compute vehicle counts, queue lengths, and emit high-throughput telemetry JSON.
        </div>
      </div>

      {/* Hub Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {hubs.map((hub) => {
          const isSelected = hub.id === selectedHubId;

          return (
            <div
              key={hub.id}
              onClick={() => setSelectedHubId(hub.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-cyan-950/20 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-slate-800 text-cyan-400">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-100">{hub.name.split(' ')[0]}</h4>
                    <span className="text-[10px] font-mono text-slate-400">{hub.type}</span>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              <div className="mt-3 text-[11px] text-slate-400">
                <span>{hub.location}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">THROUGHPUT</span>
                  <span className="text-emerald-400 font-bold">{hub.throughput}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">LATENCY</span>
                  <span className="text-cyan-400 font-bold">{hub.latency}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Hub Deep-Dive Details */}
      {selectedHub && (
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                Infrastructure Node Focus
              </span>
              <h3 className="font-bold text-base text-slate-100">{selectedHub.name}</h3>
              <p className="text-xs text-slate-400">{selectedHub.location}</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Operational Nominal
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                Operational Role & Capabilities
              </span>
              <p className="text-slate-300 leading-relaxed">{selectedHub.role}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                Hardware & Connectivity Specifications
              </span>
              <p className="text-slate-300 leading-relaxed">{selectedHub.specs}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
