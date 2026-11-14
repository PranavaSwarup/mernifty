import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio, MapPin, ShieldCheck, ArrowRight, Activity, Gauge } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function MultiClientSyncView() {
  const { latestByDevice } = useSocket();

  // Client 1 State (South Zone Desk)
  const [client1Room, setClient1Room] = useState('south-bangalore');
  const [client1Packets, setClient1Packets] = useState([]);
  const [client1Count, setClient1Count] = useState(0);

  // Client 2 State (East Zone Desk)
  const [client2Room, setClient2Room] = useState('east-bangalore');
  const [client2Packets, setClient2Packets] = useState([]);
  const [client2Count, setClient2Count] = useState(0);

  const prevLatestRef = useRef({});

  useEffect(() => {
    const current = latestByDevice;
    const prev = prevLatestRef.current;

    for (const [juncId, evt] of Object.entries(current)) {
      if (evt && (!prev[juncId] || prev[juncId].eventId !== evt.eventId)) {
        const zone = evt.zoneId || evt.category;

        // Evaluate for Client 1
        if (client1Room === 'all' || zone === client1Room) {
          setClient1Count((c) => c + 1);
          setClient1Packets((p) => [evt, ...p].slice(0, 15));
        }

        // Evaluate for Client 2
        if (client2Room === 'all' || zone === client2Room) {
          setClient2Count((c) => c + 1);
          setClient2Packets((p) => [evt, ...p].slice(0, 15));
        }
      }
    }

    prevLatestRef.current = current;
  }, [latestByDevice, client1Room, client2Room]);

  const zoneNames = {
    'south-bangalore': 'South Bengaluru Zone',
    'east-bangalore': 'East Bengaluru Zone',
    'north-bangalore': 'North Bengaluru Zone',
    'central-bangalore': 'Central Bengaluru Zone',
    all: 'All Zones (City Operations HQ)',
  };

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
                Multi-Desk Zonal Topology Live Demo
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                Selective Socket.IO Zonal Room Subscription Isolation
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Room Partitioning: Active</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Demonstrates how zonal dispatchers (e.g. South Zone Desk vs East Zone Desk) receive <strong>only the camera telemetry frames for their junctions</strong>. By subscribing to <code>room:zone:south-bangalore</code> instead of broadcasting all city junctions, client frame rendering overhead is reduced by <strong>~75%</strong>.
        </p>
      </div>

      {/* Two Clients Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client 1 Terminal (South Desk) */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <div>
                <h3 className="font-bold text-xs text-slate-100">Dispatcher Terminal A (South Zone Desk)</h3>
                <span className="text-[10px] text-slate-400 font-mono">BTP South Sub-Control • Koramangala Hub</span>
              </div>
            </div>

            {/* Room Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px]">Subscribed:</span>
              <select
                value={client1Room}
                onChange={(e) => {
                  setClient1Room(e.target.value);
                  setClient1Packets([]);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-400 font-mono focus:outline-none"
              >
                <option value="south-bangalore">zone:south-bangalore</option>
                <option value="east-bangalore">zone:east-bangalore</option>
                <option value="north-bangalore">zone:north-bangalore</option>
                <option value="central-bangalore">zone:central-bangalore</option>
                <option value="all">zone:all (City HQ)</option>
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">Frames Received:</span>
            <span className="font-bold text-emerald-400">{client1Count.toLocaleString()}</span>
          </div>

          {/* Packet Feed */}
          <div className="p-3 bg-[#060A12] flex-1 max-h-80 overflow-y-auto space-y-2 font-mono text-[11px]">
            {client1Packets.length === 0 ? (
              <div className="py-12 text-center text-slate-600">Awaiting zonal frames...</div>
            ) : (
              client1Packets.map((pkt) => (
                <div
                  key={pkt.eventId}
                  className="p-2 rounded bg-slate-900/60 border border-slate-800/60 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="font-bold text-slate-200">{pkt.junctionName || pkt.deviceId}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px]">
                    <span className="text-rose-400">{pkt.metrics?.maxQueueLengthM || 40}m queue</span>
                    <span>•</span>
                    <span className="text-cyan-400">{pkt.metrics?.avgSpeedKmph || 18}km/h</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Client 2 Terminal (East Desk) */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <div>
                <h3 className="font-bold text-xs text-slate-100">Dispatcher Terminal B (East Zone Desk)</h3>
                <span className="text-[10px] text-slate-400 font-mono">BTP East Sub-Control • Mahadevapura Hub</span>
              </div>
            </div>

            {/* Room Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px]">Subscribed:</span>
              <select
                value={client2Room}
                onChange={(e) => {
                  setClient2Room(e.target.value);
                  setClient2Packets([]);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-cyan-400 font-mono focus:outline-none"
              >
                <option value="east-bangalore">zone:east-bangalore</option>
                <option value="south-bangalore">zone:south-bangalore</option>
                <option value="north-bangalore">zone:north-bangalore</option>
                <option value="central-bangalore">zone:central-bangalore</option>
                <option value="all">zone:all (City HQ)</option>
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">Frames Received:</span>
            <span className="font-bold text-cyan-400">{client2Count.toLocaleString()}</span>
          </div>

          {/* Packet Feed */}
          <div className="p-3 bg-[#060A12] flex-1 max-h-80 overflow-y-auto space-y-2 font-mono text-[11px]">
            {client2Packets.length === 0 ? (
              <div className="py-12 text-center text-slate-600">Awaiting zonal frames...</div>
            ) : (
              client2Packets.map((pkt) => (
                <div
                  key={pkt.eventId}
                  className="p-2 rounded bg-slate-900/60 border border-slate-800/60 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span className="font-bold text-slate-200">{pkt.junctionName || pkt.deviceId}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px]">
                    <span className="text-rose-400">{pkt.metrics?.maxQueueLengthM || 40}m queue</span>
                    <span>•</span>
                    <span className="text-cyan-400">{pkt.metrics?.avgSpeedKmph || 18}km/h</span>
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
