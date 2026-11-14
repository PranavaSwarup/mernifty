import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio, MapPin, ShieldCheck, ArrowRight, Activity, Gauge } from 'lucide-react';
import { io } from 'socket.io-client';

export function MultiClientSyncView() {
  // Client 1 State (South Zone Desk) - Genuine Socket A
  const [client1Room, setClient1Room] = useState('south-bangalore');
  const [client1Packets, setClient1Packets] = useState([]);
  const [client1Count, setClient1Count] = useState(0);
  const [client1Rate, setClient1Rate] = useState(0);

  // Client 2 State (East Zone Desk) - Genuine Socket B
  const [client2Room, setClient2Room] = useState('east-bangalore');
  const [client2Packets, setClient2Packets] = useState([]);
  const [client2Count, setClient2Count] = useState(0);
  const [client2Rate, setClient2Rate] = useState(0);

  const socket1Ref = useRef(null);
  const socket2Ref = useRef(null);
  const counter1Ref = useRef(0);
  const counter2Ref = useRef(0);

  // Calculate live event rates for both sockets every 1 second
  useEffect(() => {
    const timer = setInterval(() => {
      setClient1Rate(counter1Ref.current);
      counter1Ref.current = 0;
      setClient2Rate(counter2Ref.current);
      counter2Ref.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Socket 1: Independent connection for Terminal A
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socket1Ref.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe:zone', client1Room);
    });

    socket.on('telemetry:batch', (batch) => {
      if (Array.isArray(batch)) {
        counter1Ref.current += batch.length;
        setClient1Count((c) => c + batch.length);
        setClient1Packets((prev) => [...batch, ...prev].slice(0, 15));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [client1Room]);

  // Socket 2: Independent connection for Terminal B
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socket2Ref.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe:zone', client2Room);
    });

    socket.on('telemetry:batch', (batch) => {
      if (Array.isArray(batch)) {
        counter2Ref.current += batch.length;
        setClient2Count((c) => c + batch.length);
        setClient2Packets((prev) => [...batch, ...prev].slice(0, 15));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [client2Room]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B101D] p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                Multi-Desk Zonal Topology Live Demo (Section 5.3)
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                Genuine Dual-Socket Selective Room Subscription Isolation
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>2 Independent WebSockets Connected</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Demonstrates how zonal dispatchers (e.g. South Zone Desk vs East Zone Desk) receive <strong>only the camera telemetry frames for their junctions</strong>. Each terminal opens its own physical Socket.IO connection and joins only its selected room.
        </p>
      </div>

      {/* Two Clients Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client 1 Terminal (South Desk) */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col shadow-xl">
          {/* Header */}
          <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <div>
                <h3 className="font-bold text-xs text-slate-100">Dispatcher Terminal A (South Desk)</h3>
                <span className="text-[10px] text-slate-400 font-mono">BTP South Sub-Control • Socket 1</span>
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
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">Total Frames: <strong className="text-emerald-400">{client1Count.toLocaleString()}</strong></span>
            <span className="text-emerald-300 font-bold">⚡ {client1Rate} evt/s</span>
          </div>

          {/* Packet Feed */}
          <div className="p-3 bg-[#060A12] flex-1 max-h-80 overflow-y-auto space-y-2 font-mono text-[11px]">
            {client1Packets.length === 0 ? (
              <div className="py-12 text-center text-slate-600">Awaiting zonal frames for {client1Room}...</div>
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
        <div className="rounded-2xl border border-slate-800 bg-[#0B101D] overflow-hidden flex flex-col shadow-xl">
          {/* Header */}
          <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <div>
                <h3 className="font-bold text-xs text-slate-100">Dispatcher Terminal B (East Desk)</h3>
                <span className="text-[10px] text-slate-400 font-mono">BTP East Sub-Control • Socket 2</span>
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
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">Total Frames: <strong className="text-cyan-400">{client2Count.toLocaleString()}</strong></span>
            <span className="text-cyan-300 font-bold">⚡ {client2Rate} evt/s</span>
          </div>

          {/* Packet Feed */}
          <div className="p-3 bg-[#060A12] flex-1 max-h-80 overflow-y-auto space-y-2 font-mono text-[11px]">
            {client2Packets.length === 0 ? (
              <div className="py-12 text-center text-slate-600">Awaiting zonal frames for {client2Room}...</div>
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
