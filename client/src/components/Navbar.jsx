import React from 'react';
import {
  Activity,
  Radio,
  Shield,
  Pause,
  Play,
  Cpu,
  MapPin,
  Database,
  Zap,
  BookOpen,
  Users,
  Terminal,
  Globe,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export function Navbar({ activeTab, setActiveTab }) {
  const { isConnected, stats, isPaused, togglePause, clientLatency, soundEnabled, setSoundEnabled } = useSocket();
  const { user } = useAuth();

  const tabs = [
    { id: 'dashboard', label: 'Live Operations', icon: Activity },
    { id: 'map', label: 'Fleet Geo-Tracker', icon: MapPin },
    { id: 'topology', label: 'Global Edge Mesh', icon: Globe },
    { id: 'multiclient', label: 'Multi-Client Sync', icon: Users },
    { id: 'inspector', label: 'Stream Inspector', icon: Terminal },
    { id: 'historical', label: 'Historical Analytics', icon: Database },
    { id: 'simulator', label: 'Chaos & Stress Lab', icon: Zap },
    { id: 'benchmarks', label: 'Engine Telemetry', icon: Cpu },
    { id: 'architecture', label: 'Architecture & Docs', icon: BookOpen },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0B101D]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-6 py-2.5">
      <div className="flex items-center justify-between gap-4">
        {/* Brand & Connection Status */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Radio className="w-5 h-5 animate-pulse" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-[#0B101D] animate-ping-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                HyperPulse
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                v1.2 PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              High-Throughput Streams & Telemetry Platform
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

        {/* Live Metrics & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
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
            title={isPaused ? 'Resume live socket feed' : 'Pause live socket feed'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              isPaused
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            <span className="hidden sm:inline">{isPaused ? 'RESUME' : 'PAUSE'}</span>
          </button>

          {/* Ingest Rate Ticker */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">INGEST:</span>
            <span className="text-emerald-400 font-bold">{stats.ingestRate}</span>
            <span className="text-slate-500 text-[10px]">e/s</span>
          </div>

          {/* Socket RTT Latency Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            <span className="text-slate-300">{isConnected ? `${clientLatency || 1}ms` : 'DISCONNECTED'}</span>
          </div>

          {/* User Role Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/40 border border-slate-700/50 text-xs">
            <Shield className="w-3 h-3 text-cyan-400" />
            <span className="text-slate-300 capitalize">{user.role}</span>
          </div>
        </div>
      </div>

      {/* Overflow / Mobile Tab Bar */}
      <div className="flex xl:hidden items-center gap-1 overflow-x-auto pt-2 pb-1 border-t border-slate-800/50 mt-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
