import React, { useState, useEffect } from 'react';
import { Play, Pause, Zap, Flame, ShieldAlert, AlertCircle, Sparkles, Navigation, Bus, Truck, Car } from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';

export function SimulatorControls() {
  const { stats } = useSocket();
  const [isRunning, setIsRunning] = useState(true);
  const [targetRate, setTargetRate] = useState(12);
  const [chaosMessage, setChaosMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  // Sync simulator status on mount
  useEffect(() => {
    api.getSimulatorStatus()
      .then((res) => {
        if (res.status) {
          setIsRunning(res.status.isRunning);
          setTargetRate(res.status.targetRate);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const handleToggleSimulator = async () => {
    setLoadingAction(true);
    setActionError('');
    try {
      if (isRunning) {
        await api.stopSimulator();
        setIsRunning(false);
      } else {
        await api.startSimulator(targetRate);
        setIsRunning(true);
      }
    } catch (err) {
      setActionError(err.message || 'Simulator action denied');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRateChange = async (rate) => {
    setActionError('');
    try {
      await api.setSimulatorRate(rate);
      setTargetRate(rate);
      setIsRunning(true);
    } catch (err) {
      setActionError(err.message || 'Rate update denied');
    }
  };

  const handleInjectChaos = async (junctionId, metric, multiplier, durationSec, label, flags = {}) => {
    try {
      setChaosMessage(`Injecting incident: ${label}...`);
      const res = await api.fetchJson('/api/simulator/chaos', {
        method: 'POST',
        body: JSON.stringify({
          junctionId,
          deviceId: junctionId,
          metric,
          multiplier,
          durationSec,
          flags,
        }),
      });
      setChaosMessage(res.message);
      setTimeout(() => setChaosMessage(''), 5000);
    } catch (err) {
      setChaosMessage(`Error: ${err.message}`);
    }
  };

  const chaosScenarios = [
    {
      id: 'silk-board-surge',
      name: 'Silk Board Peak-Hour Surge',
      description: 'Simulates evening rush hour spillover from Hosur Rd flyover. Queue surges +160m with speeds dropping below 5 km/h.',
      junctionId: 'JNC-BLR-001',
      metric: 'queueLengthM',
      multiplier: 2.6,
      duration: 25,
      flags: {},
      accent: 'rose',
    },
    {
      id: 'bellandur-stalled-bus',
      name: 'Stalled BMTC Bus on Bellandur ORR',
      description: 'Breakdown in lane 2 on Outer Ring Rd blocking throughway. Optical flow detects zero vehicle motion in feeder lanes.',
      junctionId: 'JNC-BLR-005',
      metric: 'stalledVehicle',
      multiplier: 2.2,
      duration: 30,
      flags: { stalled: true },
      accent: 'amber',
    },
    {
      id: 'hebbal-ambulance-preemption',
      name: 'Inbound Ambulance at Hebbal Flyover',
      description: 'Emergency siren/camera transponder detection approaching from Airport Expressway. Triggers Green Corridor preemption.',
      junctionId: 'JNC-BLR-008',
      metric: 'ambulancePreemption',
      multiplier: 1.0,
      duration: 20,
      flags: { ambulance: true },
      accent: 'cyan',
    },
    {
      id: 'tin-factory-choke',
      name: 'Tin Factory Hanging Bridge Bottleneck',
      description: 'Massive surge on Old Madras Rd causing critical multi-arterial gridlock across KR Puram interchange.',
      junctionId: 'JNC-BLR-006',
      metric: 'congestion',
      multiplier: 2.4,
      duration: 25,
      flags: {},
      accent: 'purple',
    },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5">
      {/* Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
              Central Camera Feed Generator & Stress Lab
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
            </h3>
            <p className="text-xs text-slate-400">
              Simulates high-throughput JSON emitted by Centralized GPU vision processing cluster
            </p>
          </div>
        </div>

        {/* Master Power Toggle */}
        <button
          onClick={handleToggleSimulator}
          disabled={loadingAction}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
            isRunning
              ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
              : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
          }`}
        >
          {isRunning ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{isRunning ? 'HALT EMISSION' : 'START EMISSION'}</span>
        </button>
      </div>

      {actionError && (
        <div className="mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError('')}
            className="text-rose-200 hover:text-white underline text-[10px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Target Throughput Rate Controls */}
      <div className="py-4 border-b border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <span className="text-xs font-bold text-slate-200">
              Target Vision Frame Emission Rate
            </span>
            <p className="text-[11px] text-slate-400">
              Adjust frames per second emitted across all 12 monitored Bengaluru junctions
            </p>
          </div>
          <div className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
            Current: {targetRate} events/sec
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[12, 50, 100, 300, 1000].map((rate) => (
            <button
              key={rate}
              onClick={() => handleRateChange(rate)}
              className={`p-2.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                targetRate === rate
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-md shadow-emerald-500/10'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {rate} e/s
            </button>
          ))}
        </div>
      </div>

      {/* Chaos & Incident Injection Scenarios */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <Flame className="w-4 h-4" />
              <span>1-Click Live Incident Injection</span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Trigger real-world bottlenecks, stalled buses, or emergency priority preemption
            </p>
          </div>
        </div>

        {chaosMessage && (
          <div
            className={`mb-3 p-3 rounded-xl text-xs font-mono animate-fadeIn flex items-center gap-2 ${
              chaosMessage.startsWith('Error:')
                ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300'
                : 'bg-purple-500/15 border border-purple-500/30 text-purple-300'
            }`}
          >
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span>{chaosMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {chaosScenarios.map((sc) => (
            <div
              key={sc.id}
              className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-xs text-slate-100">{sc.name}</h5>
                  <span className="text-[10px] font-mono text-slate-400">{sc.junctionId}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {sc.description}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500">
                  Duration: {sc.duration}s
                </span>
                <button
                  onClick={() =>
                    handleInjectChaos(sc.junctionId, sc.metric, sc.multiplier, sc.duration, sc.name, sc.flags)
                  }
                  className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Trigger Incident</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
