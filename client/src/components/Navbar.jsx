import React, { useState } from 'react';
import {
  Activity,
  MapPin,
  Database,
  Zap,
  BookOpen,
  Users,
  Terminal,
  Globe,
  Volume2,
  VolumeX,
  Gauge,
  Navigation,
  Shield,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export function Navbar({ activeTab, setActiveTab }) {
  const { isConnected, isPaused, togglePause, clientLatency, soundEnabled, setSoundEnabled, socketError } =
    useSocket();
  const { user, switchPersona, isLoading, authError, clearAuthError } = useAuth();
  const [localError, setLocalError] = useState(null);

  const tabs = [
    { id: 'dashboard', label: 'Junction Operations', icon: Activity },
    { id: 'map', label: 'Bengaluru Traffic Map', icon: MapPin },
    { id: 'topology', label: 'Central DC Topology', icon: Globe },
    { id: 'multiclient', label: 'Zonal Multi-Desk', icon: Users },
    { id: 'inspector', label: 'Camera Stream Tap', icon: Terminal },
    { id: 'historical', label: 'Congestion Analytics', icon: Database },
    { id: 'simulator', label: 'Camera & Chaos Lab', icon: Zap },
    { id: 'benchmarks', label: 'Throughput Engine', icon: Gauge },
    { id: 'architecture', label: 'Architecture & Design', icon: BookOpen },
  ];

  const handlePersonaChange = async (e) => {
    const val = e.target.value;
    setLocalError(null);
    clearAuthError();
    try {
      await switchPersona(val);
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const activePersonaValue = user?.anonymous ? 'anonymous' : user?.persona || user?.role || 'viewer';
  const bannerError = localError || authError || socketError;

  return (
    <header className="sticky top-0 z-50 bg-[#0B101D]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-6 py-2.5">
      <div className="flex items-center justify-between gap-4">
        {/* Brand & Connection Status */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Navigation className="w-5 h-5 animate-pulse" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-[#0B101D] animate-ping-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                MetroPulse BLR
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                SMART TRAFFIC
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Bengaluru Centralized Camera Telemetry & Adaptive Control
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden xl:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Persona Switcher, Live Metrics & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Functional Role Persona Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <select
              aria-label="Active Persona"
              disabled={isLoading}
              value={activePersonaValue}
              onChange={handlePersonaChange}
              className="bg-transparent text-[11px] font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="anonymous" className="bg-slate-900">
                Viewer (Anon Read-Only)
              </option>
              <option value="viewer" className="bg-slate-900">
                Viewer (Signed JWT)
              </option>
              <option value="south-operator" className="bg-slate-900">
                South Operator (south-bangalore)
              </option>
              <option value="east-operator" className="bg-slate-900">
                East Operator (east-bangalore)
              </option>
              <option value="admin" className="bg-slate-900">
                Admin (All Zones)
              </option>
            </select>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={soundEnabled ? 'Mute anomaly alarms' : 'Enable audio alarms'}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              soundEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-500'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Pause / Resume Live Stream */}
          <button
            onClick={togglePause}
            title={isPaused ? 'Resume live frame processing' : 'Pause live frame processing'}
            className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors ${
              isPaused
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isPaused ? 'PAUSED' : 'LIVE'}
          </button>

          {/* WebSocket Latency Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-400">RTT:</span>
            <span className="text-emerald-400 font-bold">{clientLatency || 2}ms</span>
          </div>
        </div>
      </div>

      {bannerError && (
        <div className="mt-2 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
          <span>{bannerError}</span>
          <button
            onClick={() => {
              setLocalError(null);
              clearAuthError();
            }}
            className="text-[11px] underline ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mobile Nav Scroller */}
      <div className="xl:hidden flex items-center gap-1 overflow-x-auto pt-2 pb-1 border-t border-slate-800/60 mt-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
