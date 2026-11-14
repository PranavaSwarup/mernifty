import React, { useState, useEffect } from 'react';
import { Play, Pause, Zap, Flame, Siren, Car, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';

export function SimulatorControls() {
  const { stats, activeCorridorTrip } = useSocket();
  const [isRunning, setIsRunning] = useState(true);
  const [targetRate, setTargetRate] = useState(12);
  const [clockSpeed, setClockSpeedState] = useState(1);
  const [scenarioMessage, setScenarioMessage] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    api.getSimulatorStatus()
      .then((res) => {
        if (res.status) {
          setIsRunning(res.status.isRunning);
          setTargetRate(res.status.targetRate);
          if (res.status.clockSpeed) {
            setClockSpeedState(res.status.clockSpeed);
          }
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

  // 1. Scenario: Ambulance Green Corridor (Section 5.2)
  const handleStartAmbulanceCorridor = async () => {
    try {
      setScenarioMessage('Dispatching Ambulance Corridor from Hebbal to Jayadeva...');
      const res = await api.startCorridor({
        vehicleId: 'AMB-BLR-01',
        startJunctionId: 'JNC-BLR-008',
        destinationJunctionId: 'JNC-BLR-004',
        durationSeconds: 70,
      });
      setScenarioMessage(`🚑 Corridor active! Trip ID: ${res.tripId}. Signals preempting along route.`);
      setTimeout(() => setScenarioMessage(''), 8000);
    } catch (err) {
      setScenarioMessage(`Error: ${err.message}`);
    }
  };

  const handleCancelCorridor = async () => {
    if (!activeCorridorTrip?.tripId) return;
    try {
      await api.cancelCorridor(activeCorridorTrip.tripId);
      setScenarioMessage('Ambulance corridor cancelled. Signals restored to dynamic AI.');
      setTimeout(() => setScenarioMessage(''), 5000);
    } catch (err) {
      setScenarioMessage(`Error: ${err.message}`);
    }
  };

  // 2. Scenario: Sudden Arterial Blockage (Section 5.6)
  const handleSuddenBlockage = async () => {
    try {
      setScenarioMessage('Triggering Sudden Blockage on Silk Board Hosur Rd...');
      const res = await api.triggerBlockage({
        junctionId: 'JNC-BLR-001',
        road: 'Hosur Rd (from south)',
        durationSec: 35,
      });
      setScenarioMessage(res.message || '⚠️ Sudden blockage active on Silk Board Hosur Rd! Velocity collapsed to 2 km/h.');
      setTimeout(() => setScenarioMessage(''), 8000);
    } catch (err) {
      setScenarioMessage(`Error: ${err.message}`);
    }
  };

  // 3. Scenario: Rush Hour Volume Surge (Section 5.6)
  const handleRushHourSurge = async () => {
    try {
      setScenarioMessage('Triggering Peak Rush Hour Volume Surge across South Zone...');
      const res = await api.triggerRushHour({
        zoneId: 'south-bangalore',
        multiplier: 2.0,
        durationSec: 45,
      });
      setScenarioMessage(res.message || '🚗 Rush hour surge active: 2.0x volume injected across South Zone junctions.');
      setTimeout(() => setScenarioMessage(''), 8000);
    } catch (err) {
      setScenarioMessage(`Error: ${err.message}`);
    }
  };

  // 4. Demo Setting: Toggle 20s Auto-Remediation Countdown (Section 5.10)
  const handleSetDemoDeadline = async (seconds) => {
    try {
      const res = await api.setRemediationDeadline(seconds);
      setScenarioMessage(`⏱️ Auto-remediation deadline set to ${seconds}s (${seconds === 20 ? 'Fast Demo Mode' : 'Standard 3m Mode'})`);
      setTimeout(() => setScenarioMessage(''), 6000);
    } catch (err) {
      setScenarioMessage(`Error: ${err.message}`);
    }
  };

  // 5. Simulation Clock Speed (Section 5.13)
  const handleSetClockSpeed = async (speed) => {
    try {
      await api.setClockSpeed(speed);
      setClockSpeedState(speed);
      setScenarioMessage(`⏳ Simulation clock speed set to ${speed}x (${speed === 144 ? 'Fast 10m 24h Cycle' : speed + 'x realtime'})`);
      setTimeout(() => setScenarioMessage(''), 6000);
    } catch (err) {
      setScenarioMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B101D] p-5 shadow-xl">
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

      {/* Section 5.6: Named Demo Scenarios */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Flame className="w-4 h-4" />
              <span>Hackathon Evaluation Scenarios (1-Click Triggers)</span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Named scenarios matching the evaluation script and judge demonstrations
            </p>
          </div>
        </div>

        {scenarioMessage && (
          <div className="mb-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-200 text-xs font-mono animate-fadeIn flex items-center gap-2">
            <span>✨</span>
            <span>{scenarioMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Scenario 1: Ambulance Green Corridor */}
          <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Centrepiece Demo</span>
                <span className="text-[10px] font-mono text-blue-300">Hebbal ➔ Jayadeva</span>
              </div>
              <h5 className="font-bold text-sm text-white mt-1">Ambulance Green Corridor</h5>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Emergency vehicle traverses North to South zones across 6 junctions. Signals turn green ahead and restore behind.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400">Duration: ~70s</span>
              {!activeCorridorTrip ? (
                <button
                  onClick={handleStartAmbulanceCorridor}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-blue-500/30"
                >
                  <Siren className="w-3.5 h-3.5" />
                  <span>Send Ambulance</span>
                </button>
              ) : (
                <button
                  onClick={handleCancelCorridor}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors"
                >
                  <span>Cancel Trip</span>
                </button>
              )}
            </div>
          </div>

          {/* Scenario 2: Sudden Arterial Blockage */}
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Incident Detection</span>
                <span className="text-[10px] font-mono text-rose-300">Silk Board (Hosur Rd)</span>
              </div>
              <h5 className="font-bold text-sm text-white mt-1">Sudden Arterial Blockage</h5>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Sudden breakdown collapses road speed to 4 km/h while signal is green. Raises alert with countdown for automatic remediation.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400">Duration: 30s</span>
              <button
                onClick={handleSuddenBlockage}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-rose-500/30"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Trigger Blockage</span>
              </button>
            </div>
          </div>

          {/* Scenario 3: Rush Hour Volume Surge */}
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Zone-wide Surge</span>
                <span className="text-[10px] font-mono text-amber-300">ORR IT Corridor</span>
              </div>
              <h5 className="font-bold text-sm text-white mt-1">Rush Hour Volume Surge</h5>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                2.2x vehicle inflow surge injected across Bellandur EcoSpace and Silk Board, simulating evening tech corridor commute.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400">Duration: 35s</span>
              <button
                onClick={handleRushHourSurge}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-amber-500/30"
              >
                <Car className="w-3.5 h-3.5" />
                <span>Trigger Surge</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 5.10 Demo Countdown Configuration */}
        <div className="mt-4 p-3 rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-slate-200">Auto-Remediation Countdown Setting:</span>
            <span className="text-slate-400 ml-2">Controls alert countdown loop before system applies automated signal fix</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSetDemoDeadline(20)}
              className="px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-mono font-bold"
            >
              20s (Demo Video Mode)
            </button>
            <button
              onClick={() => handleSetDemoDeadline(180)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono"
            >
              180s (Standard 3m)
            </button>
          </div>
        </div>

        {/* Section 5.13: Accelerated Simulation Clock */}
        <div className="mt-3 p-3 rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-slate-200">Simulation Clock Speed (Section 5.13):</span>
            <span className="text-slate-400 ml-2">Accelerates time-of-day traffic volume cycle (144x = 24h in 10 mins)</span>
          </div>
          <div className="flex items-center gap-2">
            {[1, 60, 144].map((speed) => (
              <button
                key={speed}
                onClick={() => handleSetClockSpeed(speed)}
                className={`px-3 py-1 rounded font-mono font-bold border transition-colors ${
                  clockSpeed === speed
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
