import React, { useState, useEffect } from 'react';
import { Play, Pause, Zap, Flame, ShieldAlert, Cpu, Battery, Wind, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';

export function SimulatorControls() {
  const { stats } = useSocket();
  const [isRunning, setIsRunning] = useState(true);
  const [targetRate, setTargetRate] = useState(15);
  const [chaosMessage, setChaosMessage] = useState('');
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
    try {
      if (isRunning) {
        await api.stopSimulator();
        setIsRunning(false);
      } else {
        await api.startSimulator(targetRate);
        setIsRunning(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRateChange = async (rate) => {
    setTargetRate(rate);
    try {
      await api.setSimulatorRate(rate);
      setIsRunning(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInjectChaos = async (deviceId, metric, multiplier, durationSec, label) => {
    try {
      setChaosMessage(`Injecting: ${label}...`);
      const res = await api.injectChaos(deviceId, metric, multiplier, durationSec);
      setChaosMessage(res.message);
      setTimeout(() => setChaosMessage(''), 5000);
    } catch (err) {
      setChaosMessage(`Error: ${err.message}`);
    }
  };

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
              Virtual Telemetry Generator & Chaos Engine
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
            </h3>
            <p className="text-xs text-slate-400">
              Multi-source synthetic sensor emitter, stress load generator, and anomaly injector
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
          <span>{isRunning ? 'STOP EMISSION' : 'RESUME EMISSION'}</span>
        </button>
      </div>

      {/* Throughput Slider & Presets */}
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300">Throughput Generation Rate</span>
          <span className="font-mono font-extrabold text-emerald-400 text-sm">
            {targetRate} <span className="text-slate-500 text-xs font-normal">events/second</span>
          </span>
        </div>

        {/* Preset Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { rate: 10, label: '10 e/s (Baseline)' },
            { rate: 50, label: '50 e/s (Moderate)' },
            { rate: 100, label: '100 e/s (High)' },
            { rate: 500, label: '500 e/s (Stress)' },
            { rate: 1000, label: '1000 e/s (Burst)' },
          ].map((preset) => (
            <button
              key={preset.rate}
              onClick={() => handleRateChange(preset.rate)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                targetRate === preset.rate
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chaos Injection Panel */}
      <div className="mt-6 pt-5 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Chaos Injection Lab (Simulate Anomaly Scenarios)
          </h4>
        </div>

        {chaosMessage && (
          <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{chaosMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() =>
              handleInjectChaos(
                'srv-eu-west-db',
                'cpuPercent',
                1.6,
                20,
                'EU Database CPU Spike to 98%'
              )
            }
            className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-rose-500/40 text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <Cpu className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                CRITICAL
              </span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-200">Inject Server CPU Spike</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Surges `srv-eu-west-db` CPU to 98% to test Z-score anomaly alert
            </p>
          </button>

          <button
            onClick={() =>
              handleInjectChaos(
                'fleet-ev-01',
                'batteryLevel',
                0.12,
                25,
                'Carrier #101 Battery Critical Drop'
              )
            }
            className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-amber-500/40 text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <Battery className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                WARNING
              </span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-200">Simulate Battery Critical</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Drains `fleet-ev-01` battery to 9% to trigger logistics warning
            </p>
          </button>

          <button
            onClick={() =>
              handleInjectChaos(
                'turbine-wind-01',
                'vibrationMmS',
                2.8,
                20,
                'Wind Turbine #1 Bearing Vibration'
              )
            }
            className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-pink-500/40 text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <Wind className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-300 border border-pink-500/20">
                CRITICAL
              </span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-200">Turbine Bearing Overload</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Triples mechanical vibration on Unit A1 to trigger turbine shutdown alert
            </p>
          </button>

          <button
            onClick={() =>
              handleInjectChaos(
                'srv-us-east-prod',
                'latencyMs',
                8.0,
                15,
                'US-East Network Latency Spike'
              )
            }
            className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-cyan-500/40 text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <ShieldAlert className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                ANOMALY
              </span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-200">Network Latency Spike</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Spikes gateway API response latency to 600ms+
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
