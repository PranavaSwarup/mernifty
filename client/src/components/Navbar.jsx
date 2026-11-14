import React, { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  UserCheck,
  AlertCircle,
  SlidersHorizontal,
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
    simMeta,
  } = useSocket();
  const { user, switchPersona, isLoading: authLoading, authError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsMenuRef = useRef(null);

  useEffect(() => {
    if (!controlsOpen) return undefined;
    const handlePointerDown = (e) => {
      if (controlsMenuRef.current && !controlsMenuRef.current.contains(e.target)) {
        setControlsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setControlsOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [controlsOpen]);

  const currentPersona = !user
    ? 'anonymous'
    : user.persona === 'supervisor'
      ? 'supervisor'
      : user.role === 'admin'
        ? 'admin'
        : user.role === 'viewer'
          ? 'viewer'
          : Array.isArray(user.zones) &&
              user.zones.includes('east-bangalore') &&
              !user.zones.includes('south-bangalore')
            ? 'east-operator'
            : 'south-operator';

  const isPrivileged = currentPersona === 'admin' || currentPersona === 'supervisor' || user?.role === 'admin';

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
      {/* Row 1: Brand, Primary Navigation Tabs, Persona, Live RTT, Theme, Controls Menu */}
      <div className="h-[50px] max-w-[1920px] mx-auto px-2 sm:px-3 flex items-center justify-between gap-2">
        {/* Left: Brand */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
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
            className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded border border-hairline bg-inset text-[10px] font-mono text-ink-secondary whitespace-nowrap"
            title="All corridor physics, queues, delays, and responder trajectories run inside a discrete-time traffic model paired against a fixed-time baseline."
          >
            Simulated
          </span>
        </div>

        {/* Center: 4 Primary Workspaces (always unclipped on >= sm, 1280+) */}
        <nav
          aria-label="Workspaces"
          role="tablist"
          className="hidden sm:flex items-stretch h-full gap-1 shrink-0"
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
                className={`px-2.5 lg:px-3.5 h-full flex items-center text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
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

        {/* Right: Persona, Live Status, Theme Toggle, Secondary Controls Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {(authError || socketError) && (
            <span
              role="alert"
              className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded border border-signal-gridlock/40 bg-signal-gridlock/10 text-[11px] text-signal-gridlock max-w-[160px] truncate"
              title={authError || socketError}
            >
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{authError || socketError}</span>
            </span>
          )}

          {/* Persona Selector (with distinct Admin/Supervisor indicator & 1-click switch) */}
          <div className="flex items-center gap-1.5">
            <label
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors ${
                isPrivileged
                  ? 'border-purple-500/50 bg-purple-500/10 text-purple-200'
                  : 'border-hairline bg-inset text-ink-primary'
              }`}
              title={`Active Persona: ${currentPersona}. Switch demo persona.`}
            >
              <UserCheck className={`w-3.5 h-3.5 ${isPrivileged ? 'text-purple-400' : 'text-ink-muted'} shrink-0`} aria-hidden="true" />
              <select
                aria-label="Demo personas"
                value={currentPersona}
                disabled={authLoading}
                onChange={handlePersonaChange}
                className="max-w-[82px] sm:max-w-[110px] bg-transparent text-xs font-semibold cursor-pointer rounded truncate focus:outline-none"
              >
                {PERSONA_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-surface text-ink-primary" title={`${p.label} (${p.roleLabel})`}>
                    {p.shortLabel}
                  </option>
                ))}
              </select>
              {isPrivileged && (
                <span className="hidden md:inline px-1 py-0.2 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                  FULL ACCESS
                </span>
              )}
            </label>

            {!isPrivileged && (
              <button
                type="button"
                onClick={() => switchPersona('admin')}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-colors"
                title="Switch to Admin for full control (Chaos, Scenarios, Speed Multipliers, Runbooks)"
              >
                Switch to Admin
              </button>
            )}
          </div>

          {/* Live / RTT Status Pill */}
          <button
            type="button"
            onClick={togglePause}
            title={isPaused ? 'Resume live telemetry stream' : 'Pause live telemetry stream'}
            aria-label={isPaused ? 'Resume stream' : 'Pause stream'}
            className="inline-flex items-center gap-1 sm:gap-1.5 min-h-[30px] sm:min-h-[34px] px-2 py-1 rounded border border-hairline bg-inset hover:border-hairlineStrong text-[11px] sm:text-xs text-ink-primary transition-colors whitespace-nowrap"
          >
            <span className={`w-2 h-2 rounded-full ${connDotColor}`} aria-hidden="true" />
            <span className="font-medium">{connLabel}</span>
            {isConnected && (
              <span className="hidden sm:inline font-mono tabular-nums text-[11px] text-ink-muted">
                {clientLatency} ms
              </span>
            )}
          </button>

          {/* Direct Dark / Light Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            data-theme-toggle="true"
            className="min-w-[30px] min-h-[30px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-secondary hover:text-ink-primary transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          {/* Secondary Controls Popover (Pause/Resume, Alert Audio, Model Disclosure) */}
          <div ref={controlsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setControlsOpen((prev) => !prev)}
              aria-expanded={controlsOpen}
              aria-haspopup="menu"
              aria-label="Stream & audio controls"
              title="Stream, audio & model controls"
              className="min-w-[30px] min-h-[30px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-secondary hover:text-ink-primary transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            {controlsOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-60 rounded border border-hairlineStrong bg-surface shadow-lg p-2 space-y-1.5 z-50 text-xs"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    togglePause();
                    setControlsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-primary transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    <span>{isPaused ? 'Resume live stream' : 'Pause UI stream'}</span>
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">{isPaused ? 'Paused' : 'Live'}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setSoundEnabled((prev) => !prev)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-primary transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>Alert audio</span>
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">{soundEnabled ? 'On' : 'Muted'}</span>
                </button>

                <div className="px-2 py-1.5 rounded bg-inset/70 border border-hairline text-[11px] text-ink-muted leading-snug">
                  <strong className="text-ink-secondary block">Simulated (physics model)</strong>
                  Store-and-forward queues paired against an untouched shadow Fixed-TOD baseline.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Persistent Sim Clock + Active Scenario Strip across all breakpoints */}
      {simMeta?.simClockIst && (
        <div
          data-testid="sim-clock-readout"
          className="h-[26px] border-t border-hairline bg-inset px-3 flex items-center justify-between gap-3 text-[11px] font-mono tabular-nums text-ink-secondary"
        >
          <span className="truncate">
            Sim clock <strong className="text-ink-primary">{simMeta.simClockIst}</strong> · scenario:{' '}
            <strong className="text-ink-primary">{simMeta.scenarioLabel || simMeta.scenario || 'PM peak'}</strong>
            {simMeta.simStartNote ? ` (${simMeta.simStartNote})` : ''}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline text-[10px] text-ink-muted">
              Simulated physics · paired shadow Fixed-TOD baseline
            </span>
            {Number(simMeta.simSpeed) > 1 && (
              <span className="px-1.5 rounded bg-accent/15 text-accent font-semibold">
                {simMeta.simSpeed}x
              </span>
            )}
          </div>
        </div>
      )}

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
