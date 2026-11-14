import React from 'react';
import {
  Pause,
  Play,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  WORKSPACES,
  PERSONA_OPTIONS,
  useTheme,
  zoneLabel,
} from '../utils/semantics';

export function Navbar({ activeWorkspace, onChangeWorkspace }) {
  const {
    isConnected,
    isPaused,
    togglePause,
    clientLatency,
    soundEnabled,
    setSoundEnabled,
    socketError,
  } = useSocket();
  const { user, switchPersona, isLoading: authLoading, authError } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const currentPersona = !user
    ? 'anonymous'
    : user.role === 'admin'
      ? 'admin'
      : user.role === 'viewer'
        ? 'viewer'
        : Array.isArray(user.zones) &&
            user.zones.includes('east-bangalore') &&
            !user.zones.includes('south-bangalore')
          ? 'east-operator'
          : 'south-operator';

  const handlePersonaChange = async (e) => {
    const next = e.target.value;
    try {
      await switchPersona(next);
    } catch {
      // AuthContext surfaces authError cleanly
    }
  };

  const connLabel = !isConnected ? 'Offline' : isPaused ? 'Paused' : 'Live';
  const connDotColor = !isConnected
    ? 'bg-signal-gridlock'
    : isPaused
      ? 'bg-signal-heavy'
      : 'bg-signal-flow';

  const handleTabKeyDown = (e) => {
    const idx = WORKSPACES.findIndex((ws) => ws.id === activeWorkspace);
    if (idx < 0) return;
    let nextIdx = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % WORKSPACES.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + WORKSPACES.length) % WORKSPACES.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = WORKSPACES.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextId = WORKSPACES[nextIdx].id;
    onChangeWorkspace(nextId);
    const parent = e.currentTarget.parentElement;
    parent?.querySelector(`[data-workspace="${nextId}"]`)?.focus();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      <div className="min-h-[52px] max-w-[1920px] mx-auto px-2 sm:px-4 py-1 sm:py-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-3">
        {/* Left: Brand & Required Model Honesty Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" className="text-hairlineStrong" />
            <circle cx="12" cy="7.5" r="2.2" className="fill-signal-gridlock" />
            <circle cx="12" cy="12" r="2.2" className="fill-signal-heavy" />
            <circle cx="12" cy="16.5" r="2.2" className="fill-signal-flow" />
          </svg>
          <span className="font-semibold text-xs sm:text-sm tracking-tight text-ink-primary whitespace-nowrap">
            MetroPulse BLR
          </span>
          <span
            className="hidden min-[380px]:inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded border border-hairline bg-inset text-[10px] sm:text-[11px] font-mono text-ink-secondary whitespace-nowrap"
            title="All corridor physics, queues, delays, and responder trajectories run inside a discrete-time traffic model paired against a fixed-time baseline."
          >
            <span className="hidden md:inline">Simulated (physics model)</span>
            <span className="md:hidden">Sim</span>
          </span>
        </div>

        {/* Center: 4 Primary Workspaces */}
        <nav
          aria-label="Workspaces"
          role="tablist"
          className="hidden sm:flex items-stretch h-full gap-1 sm:gap-2 overflow-x-auto no-scrollbar"
        >
          {WORKSPACES.map((ws) => {
            const active = activeWorkspace === ws.id;
            return (
              <button
                key={ws.id}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                data-workspace={ws.id}
                onKeyDown={handleTabKeyDown}
                onClick={() => onChangeWorkspace(ws.id)}
                className={`px-2.5 sm:px-3.5 h-full flex items-center text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-accent text-ink-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {ws.label}
              </button>
            );
          })}
        </nav>

        {/* Right: Demo Personas, Live Status/Pause, Sound, Theme */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {(authError || socketError) && (
            <span
              role="alert"
              className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded border border-signal-gridlock/40 bg-signal-gridlock/10 text-[11px] text-signal-gridlock max-w-[200px] truncate"
              title={authError || socketError}
            >
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{authError || socketError}</span>
            </span>
          )}

          {/* Demo Personas Switcher */}
          <label className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded border border-hairline bg-inset text-xs">
            <UserCheck className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
            <span className="text-[11px] text-ink-muted">Demo personas</span>
            <select
              aria-label="Demo personas"
              value={currentPersona}
              disabled={authLoading}
              onChange={handlePersonaChange}
              className="bg-transparent text-xs font-medium text-ink-primary cursor-pointer rounded"
            >
              {PERSONA_OPTIONS.map((p) => (
                <option key={p.id} value={p.id} className="bg-surface text-ink-primary">
                  {p.label} ({p.roleLabel})
                </option>
              ))}
            </select>
            {user?.zones?.length > 0 && user.role === 'operator' && (
              <span className="text-[10px] font-mono text-ink-muted pl-1 border-l border-hairline">
                {user.zones.map(zoneLabel).join(',')}
              </span>
            )}
          </label>

          {/* Compact persona selector on smaller viewports */}
          <label className="lg:hidden flex items-center gap-1 px-1.5 py-1 rounded border border-hairline bg-inset text-xs">
            <UserCheck className="w-3 h-3 text-ink-muted shrink-0" aria-hidden="true" />
            <select
              aria-label="Demo personas"
              value={currentPersona}
              disabled={authLoading}
              onChange={handlePersonaChange}
              className="max-w-[66px] sm:max-w-[112px] bg-transparent text-[11px] sm:text-xs font-medium text-ink-primary truncate rounded"
            >
              {PERSONA_OPTIONS.map((p) => (
                <option key={p.id} value={p.id} className="bg-surface text-ink-primary">
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          {/* Connection + Pause/Resume + RTT */}
          <button
            type="button"
            onClick={togglePause}
            title={isPaused ? 'Resume live stream' : 'Pause UI stream'}
            aria-label={isPaused ? 'Resume stream' : 'Pause stream'}
            className="inline-flex items-center gap-1 sm:gap-1.5 min-h-[30px] sm:min-h-[34px] px-1.5 sm:px-2 py-1 rounded border border-hairline bg-inset hover:border-hairlineStrong text-[11px] sm:text-xs text-ink-primary transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${connDotColor}`} aria-hidden="true" />
            <span className="font-medium">{connLabel}</span>
            {isConnected && (
              <span className="hidden sm:inline font-mono tabular-nums text-[11px] text-ink-muted">
                {clientLatency} ms
              </span>
            )}
            {isPaused ? (
              <Play className="w-3 h-3 text-ink-secondary" aria-hidden="true" />
            ) : (
              <Pause className="w-3 h-3 text-ink-secondary" aria-hidden="true" />
            )}
          </button>

          {/* Alert Audio Mute */}
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={soundEnabled ? 'Mute alert audio' : 'Enable alert audio'}
            aria-label={soundEnabled ? 'Mute alert audio' : 'Enable alert audio'}
            className="min-w-[30px] min-h-[30px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-secondary hover:text-ink-primary transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Dark / Light Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            data-theme-toggle="true"
            className="min-w-[30px] min-h-[30px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-secondary hover:text-ink-primary transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Mobile workspace tabs bar (<640px) */}
      <nav
        aria-label="Mobile workspaces"
        role="tablist"
        className="sm:hidden flex items-center border-t border-hairline bg-surface px-2 gap-1 overflow-x-auto no-scrollbar"
      >
        {WORKSPACES.map((ws) => {
          const active = activeWorkspace === ws.id;
          return (
            <button
              key={`mob-${ws.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-workspace={ws.id}
              onKeyDown={handleTabKeyDown}
              onClick={() => onChangeWorkspace(ws.id)}
              className={`flex-1 py-2 text-center text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-accent text-ink-primary'
                  : 'border-transparent text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {ws.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
