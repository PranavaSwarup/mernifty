import React, { useState } from 'react';
import {
  Activity,
  Radio,
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
  UserCheck,
  ChevronDown,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth, DEMO_LOGINS } from '../context/AuthContext';

export function Navbar({ activeTab, setActiveTab }) {
  const { isConnected, isPaused, togglePause, clientLatency, soundEnabled, setSoundEnabled, activeRooms, eventsPerSec, simClock } = useSocket();
  const { user, switchDemoRole, logout, demoMode } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const tabs = [
    { id: 'dashboard', label: 'Junction Operations', icon: Activity },
    { id: 'map', label: 'Bengaluru Traffic Map', icon: MapPin },
    { id: 'multiclient', label: 'Zonal Multi-Desk', icon: Users },
    { id: 'inspector', label: 'Camera Stream Tap', icon: Terminal },
    { id: 'historical', label: 'Congestion Analytics', icon: Database },
    { id: 'simulator', label: 'Camera & Chaos Lab', icon: Zap },
    { id: 'benchmarks', label: 'Throughput Engine', icon: Gauge },
    { id: 'architecture', label: 'Architecture & Design', icon: BookOpen },
  ];

  const getRoleBadge = () => {
    if (!user) return { label: 'Public Citizen (Viewer)', color: 'bg-slate-800 text-slate-300 border-slate-700' };
    if (user.role === 'admin') return { label: 'Admin (City Operations)', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    if (user.role === 'ambulance') return { label: `Ambulance (${user.vehicleId || 'AMB-BLR-01'})`, color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
    if (user.role === 'officer') {
      const area = user.assignedJunctionId ? user.assignedJunctionId : user.assignedZoneId ? user.assignedZoneId.replace('-bangalore', '') : 'All BLR';
      return { label: `Officer (${area})`, color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    }
    return { label: 'Citizen (Logged In)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
  };

  const badge = getRoleBadge();

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

        {/* Live Metrics, Room Indicators & Role Switcher */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Section 5.3: Active Socket.IO Rooms Pill */}
          <div
            title={`Active Socket.IO Rooms: ${activeRooms.join(', ')}`}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px] font-mono text-cyan-300"
          >
            <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span className="text-cyan-400/70 font-semibold">Rooms:</span>
            <span className="font-bold max-w-[150px] truncate">{activeRooms.join(', ')}</span>
          </div>

          {/* Section 5.3: Client-side Received Rate Pill */}
          <div
            title="Real-time events received by this client window"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] font-mono text-emerald-300"
          >
            <span className="text-emerald-400">⚡</span>
            <span className="font-bold">{eventsPerSec}</span>
            <span className="text-emerald-500/70 text-[10px]">evt/s</span>
          </div>

          {/* Section 5.13: Simulated Time & Clock Speed Pill */}
          {simClock?.clockSpeed > 1 && (
            <div
              title={`Accelerated Simulation Clock: ${simClock.simulatedTime || 'Active'}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/50 border border-amber-500/50 text-[11px] font-mono text-amber-300 animate-pulse shadow-sm shadow-amber-500/20"
            >
              <span>⏳</span>
              <span className="font-bold">{simClock.clockSpeed}x</span>
              <span className="text-amber-400/80 hidden lg:inline">
                ({simClock.simulatedTime ? new Date(simClock.simulatedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} BLR)
              </span>
            </div>
          )}

          {/* Evaluator Demo Mode Label */}
          {demoMode && (
            <div
              title="Demo Mode active: 1-click evaluator role switcher enabled"
              className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-950/40 border border-purple-500/30 text-[10px] font-mono text-purple-300 font-semibold"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span>Demo mode</span>
            </div>
          )}

          {/* Section 5.4: Role Badge & Quick Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (demoMode || user) setShowRoleMenu((prev) => !prev);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all shadow-sm ${badge.color}`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{badge.label}</span>
              <span className="sm:hidden">{user?.role || 'Guest'}</span>
              {(demoMode || user) && <ChevronDown className="w-3 h-3 opacity-70" />}
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-1.5 z-50 text-xs font-sans">
                {demoMode ? (
                  <>
                    <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                      <span>Switch Demo Account</span>
                      <span className="text-purple-400 font-mono text-[9px]">DEMO ON</span>
                    </div>
                    <div className="py-1 space-y-0.5">
                      {DEMO_LOGINS.map((item) => (
                        <button
                          key={item.roleKey}
                          onClick={() => {
                            switchDemoRole(item.roleKey);
                            setShowRoleMenu(false);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 transition-colors flex items-center justify-between"
                        >
                          <span className="text-slate-200 font-medium">{item.label}</span>
                          {user?.role === item.role && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="px-2.5 py-1.5 text-[10px] text-slate-400">
                    Logged in as <span className="font-bold text-slate-200">{user?.email}</span>
                  </div>
                )}
                {user && (
                  <div className="pt-1 border-t border-slate-800">
                    <button
                      onClick={() => {
                        logout();
                        setShowRoleMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-1 text-rose-400 hover:bg-rose-950/20 rounded-lg transition-colors text-[11px]"
                    >
                      Sign Out (Return to Anonymous Viewer)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
              </div>
            )}
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

          {/* Pause / Resume */}
          <button
            onClick={togglePause}
            title={isPaused ? 'Resume live frame processing' : 'Pause live frame processing'}
            className={`px-2 py-1 rounded-lg border text-xs font-bold transition-colors ${
              isPaused
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isPaused ? 'PAUSED' : 'LIVE'}
          </button>
        </div>
      </div>

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
