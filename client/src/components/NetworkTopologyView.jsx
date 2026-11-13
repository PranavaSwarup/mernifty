import React, { useState } from 'react';
import { Server, Globe, Activity, ArrowUpRight, Wifi, ShieldAlert } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function NetworkTopologyView({ devices = [] }) {
  const { latestByDevice } = useSocket();
  const serverDevices = devices.filter((d) => d.category === 'server');
  const [selectedNode, setSelectedNode] = useState(serverDevices[0]?.deviceId || 'srv-us-east-prod');

  const selectedDev = serverDevices.find((d) => d.deviceId === selectedNode) || serverDevices[0];
  const live = selectedDev ? latestByDevice[selectedDev.deviceId] : null;
  const metrics = live?.metrics || selectedDev?.lastMetrics || selectedDev?.baseMetrics || {};

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
              Distributed Infrastructure Observability
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              Global Edge Data Center Topology & Mesh
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          <span>4 Edge Points of Presence Active</span>
        </div>
      </div>

      {/* Network Mesh Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {serverDevices.map((srv) => {
          const srvLive = latestByDevice[srv.deviceId];
          const m = srvLive?.metrics || srv.lastMetrics || srv.baseMetrics || {};
          const isSelected = srv.deviceId === selectedNode;

          return (
            <div
              key={srv.deviceId}
              onClick={() => setSelectedNode(srv.deviceId)}
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
                    <h4 className="font-bold text-xs text-slate-100">{srv.name}</h4>
                    <span className="text-[10px] font-mono text-slate-400">{srv.deviceId}</span>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              <div className="mt-3 text-[11px] text-slate-400">
                <span>{srv.region}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">CPU LOAD</span>
                  <span className="text-emerald-400 font-bold">{m.cpuPercent ? Math.round(m.cpuPercent) : 0}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">LATENCY</span>
                  <span className="text-cyan-400 font-bold">{m.latencyMs ? Math.round(m.latencyMs) : 0} ms</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Edge Node Deep-Dive */}
      {selectedDev && (
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                Telemetry Focus Node
              </span>
              <h3 className="font-bold text-base text-slate-100">{selectedDev.name}</h3>
              <p className="text-xs text-slate-400">{selectedDev.region}</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Operational Nominal
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Network Ingress (Rx)</span>
              <span className="text-lg font-bold font-mono text-white mt-1 block">
                {metrics.networkRxMbps || 0} <span className="text-xs text-slate-500">Mbps</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Network Egress (Tx)</span>
              <span className="text-lg font-bold font-mono text-white mt-1 block">
                {metrics.networkTxMbps || 0} <span className="text-xs text-slate-500">Mbps</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Core Package Temp</span>
              <span className="text-lg font-bold font-mono text-rose-400 mt-1 block">
                {metrics.temperatureC || 0}°C
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Error Rate</span>
              <span className="text-lg font-bold font-mono text-amber-400 mt-1 block">
                {metrics.errorRate || 0}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
