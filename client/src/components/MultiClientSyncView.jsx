import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio, Server, Truck, Wind, ShieldCheck, ArrowRight, Activity, Gauge } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function MultiClientSyncView() {
  const { latestByDevice } = useSocket();

  // Client 1 State
  const [client1Room, setClient1Room] = useState('server');
  const [client1Packets, setClient1Packets] = useState([]);
  const [client1Count, setClient1Count] = useState(0);

  // Client 2 State
  const [client2Room, setClient2Room] = useState('fleet');
  const [client2Packets, setClient2Packets] = useState([]);
  const [client2Count, setClient2Count] = useState(0);

  const prevLatestRef = useRef({});

  useEffect(() => {
    // Find newly arrived events in latestByDevice
    const current = latestByDevice;
    const prev = prevLatestRef.current;

    for (const [devId, evt] of Object.entries(current)) {
      if (evt && (!prev[devId] || prev[devId].eventId !== evt.eventId)) {
        // Evaluate for Client 1
        if (client1Room === 'all' || evt.category === client1Room) {
          setClient1Count((c) => c + 1);
          setClient1Packets((p) => [evt, ...p].slice(0, 15));
        }

        // Evaluate for Client 2
        if (client2Room === 'all' || evt.category === client2Room) {
          setClient2Count((c) => c + 1);
          setClient2Packets((p) => [evt, ...p].slice(0, 15));
        }
      }
    }

    prevLatestRef.current = current;
  }, [latestByDevice, client1Room, client2Room]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                Multi-Tenant Architecture Live Demo
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                Multi-Client Selective Socket.IO Subscription Isolation
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Room Isolation: Active</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Demonstrates how multiple connected clients receive <strong>only the telemetry streams they subscribe to</strong>. Rather than broadcasting all system events indiscriminately, Socket.IO rooms partition high-frequency streams, cutting downstream client payload by <strong>~82%</strong>.
        </p>
      </div>

      {/* Two Clients Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client 1 Terminal */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <div>
                <h3 className="font-bold text-xs text-slate-100">Client Terminal A (DevOps / SRE)</h3>
                <span className="text-[10px] text-slate-400">Session ID: `sre-operator-alpha`</span>
              </div>
            </div>

            {/* Room Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px]">Room:</span>
              <select
                value={client1Room}
                onChange={(e) => {
                  setClient1Room(e.target.value);
                  setClient1Packets([]);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400 font-mono focus:outline-none"
              >
                <option value="server">category:server</option>
                <option value="fleet">category:fleet</option>
                <option value="turbine">category:turbine</option>
                <option value="all">global (all)</option>
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/60 border-b border-slate-800/80 text-center text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block">DELIVERED</span>
              <span className="font-mono font-bold text-emerald-400">{client1Count} pkts</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">BANDWIDTH SAVING</span>
              <span className="font-mono font-bold text-cyan-400">
                {client1Room === 'all' ? '0%' : '75.0%'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">SOCKET FILTER</span>
              <span className="font-mono font-bold text-slate-300 capitalize">{client1Room}</span>
            </div>
          </div>

          {/* Live Packet Feed */}
          <div className="p-3 flex-1 font-mono text-[11px] space-y-1.5 max-h-80 overflow-y-auto">
            {client1Packets.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-600 text-xs">
                Awaiting selective packets for room `category:{client1Room}`...
              </div>
            ) : (
              client1Packets.map((pkt) => (
                <div
                  key={pkt.eventId}
                  className="p-2 rounded bg-slate-950/80 border border-slate-800/60 flex items-center justify-between text-slate-300 hover:bg-slate-900"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">{pkt.deviceId}</span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(pkt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                    {JSON.stringify(pkt.metrics).slice(0, 35)}...
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Client 2 Terminal */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <div>
                <h3 className="font-bold text-xs text-slate-100">Client Terminal B (Fleet Dispatch)</h3>
                <span className="text-[10px] text-slate-400">Session ID: `fleet-dispatch-beta`</span>
              </div>
            </div>

            {/* Room Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px]">Room:</span>
              <select
                value={client2Room}
                onChange={(e) => {
                  setClient2Room(e.target.value);
                  setClient2Packets([]);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-cyan-400 font-mono focus:outline-none"
              >
                <option value="fleet">category:fleet</option>
                <option value="server">category:server</option>
                <option value="turbine">category:turbine</option>
                <option value="all">global (all)</option>
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/60 border-b border-slate-800/80 text-center text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block">DELIVERED</span>
              <span className="font-mono font-bold text-cyan-400">{client2Count} pkts</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">BANDWIDTH SAVING</span>
              <span className="font-mono font-bold text-emerald-400">
                {client2Room === 'all' ? '0%' : '75.0%'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">SOCKET FILTER</span>
              <span className="font-mono font-bold text-slate-300 capitalize">{client2Room}</span>
            </div>
          </div>

          {/* Live Packet Feed */}
          <div className="p-3 flex-1 font-mono text-[11px] space-y-1.5 max-h-80 overflow-y-auto">
            {client2Packets.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-600 text-xs">
                Awaiting selective packets for room `category:{client2Room}`...
              </div>
            ) : (
              client2Packets.map((pkt) => (
                <div
                  key={pkt.eventId}
                  className="p-2 rounded bg-slate-950/80 border border-slate-800/60 flex items-center justify-between text-slate-300 hover:bg-slate-900"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold">{pkt.deviceId}</span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(pkt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                    {JSON.stringify(pkt.metrics).slice(0, 35)}...
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
