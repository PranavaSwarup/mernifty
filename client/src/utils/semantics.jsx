import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const THEME_STORAGE_KEY = 'metropulse-theme';

export const ZONE_LIST = [
  'south-bangalore',
  'east-bangalore',
  'north-bangalore',
  'central-bangalore',
];

export const ZONE_LABELS = {
  'south-bangalore': 'South',
  'east-bangalore': 'East',
  'north-bangalore': 'North',
  'central-bangalore': 'Central',
};

export const CONTROLLER_META = {
  auto: { id: 'auto', label: 'Auto', short: 'Auto', desc: 'Study-guided supervisory switching' },
  'fixed-tod': { id: 'fixed-tod', label: 'Fixed-TOD', short: 'Fixed', desc: 'Time-of-day static plan' },
  webster: { id: 'webster', label: 'Webster', short: 'Webster', desc: 'Equisat cycle & split recalculation' },
  'max-pressure': { id: 'max-pressure', label: 'Max-Pressure', short: 'MP', desc: 'Queue-differential backpressure phase' },
  'max-pressure-ca': { id: 'max-pressure-ca', label: 'Max-Pressure-CA', short: 'MP-CA', desc: 'Congestion-aware anti-spillback pressure' },
};

export const CONTROLLER_ORDER = ['auto', 'fixed-tod', 'webster', 'max-pressure', 'max-pressure-ca'];

export const WORKSPACES = [
  { id: 'network', label: 'Network' },
  { id: 'junction', label: 'Junction' },
  { id: 'desks', label: 'Desks' },
  { id: 'engineering', label: 'Engineering' },
];

export const PERSONA_OPTIONS = [
  { id: 'admin', label: 'Admin (Full Access)', shortLabel: 'Admin', roleLabel: 'Network Admin & Full Control' },
  { id: 'supervisor', label: 'Supervisor', shortLabel: 'Supervisor', roleLabel: 'Network Admin' },
  { id: 'south-operator', label: 'South Desk', shortLabel: 'South Op', roleLabel: 'South Zone Op' },
  { id: 'east-operator', label: 'East Desk', shortLabel: 'East Op', roleLabel: 'East Zone Op' },
  { id: 'viewer', label: 'Viewer', shortLabel: 'Viewer', roleLabel: 'City + Alerts' },
  { id: 'anonymous', label: 'Anonymous', shortLabel: 'Anon', roleLabel: 'Read-only' },
];

const ThemeContext = createContext({
  theme: 'dark',
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
});

function readInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage read failure
  }
  return 'dark';
}

function applyThemeToDom(nextTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (nextTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    applyThemeToDom(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write failure
    }
  }, [theme]);

  const setTheme = useCallback((nextTheme) => {
    setThemeState(nextTheme === 'light' ? 'light' : 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Resolve color-blind-safe signal status with matching text label & geometric glyph key.
 */
export function classifyJunctionStatus(junction, isDark = true) {
  const status = junction?.status || 'healthy';
  const metrics = junction?.metrics || junction?.data || junction || {};
  const vOverC = Number(junction?.kpi?.degreeOfSaturation ?? metrics.degreeOfSaturation ?? metrics.vOverC ?? 0);
  const delaySec = Number(junction?.kpi?.avgDelayPerVehSec ?? metrics.avgDelayPerVehSec ?? 0);
  const avgSpeed = Number(metrics.avgSpeedKmph ?? junction?.avgSpeedKmph ?? 40);
  const isEmergency = Boolean(
    metrics.ambulanceDetected || junction?.emergencyMode || status === 'emergency'
  );
  const isStalled = Boolean(metrics.stalledVehicleDetected);

  if (isEmergency) {
    return {
      key: 'emergency',
      label: 'Emergency',
      shape: 'cross',
      hex: isDark ? '#38bdf8' : '#0369a1',
      ringHex: isDark ? '#7dd3fc' : '#0284c7',
      pillClass: 'border-signal-emergency/40 bg-signal-emergency/15 text-signal-emergency',
      textClass: 'text-signal-emergency',
    };
  }

  if (
    isStalled ||
    status === 'critical' ||
    status === 'gridlock' ||
    delaySec >= 65 ||
    avgSpeed < 10
  ) {
    return {
      key: 'gridlock',
      label: isStalled ? 'Incident' : 'Gridlock',
      shape: 'octagon',
      hex: isDark ? '#f97316' : '#9a3412',
      ringHex: isDark ? '#fdba74' : '#c2410c',
      pillClass: 'border-signal-gridlock/40 bg-signal-gridlock/15 text-signal-gridlock',
      textClass: 'text-signal-gridlock',
    };
  }

  if (status === 'congested' || status === 'warning' || vOverC >= 0.85 || delaySec >= 22 || avgSpeed < 20) {
    return {
      key: 'heavy',
      label: 'Heavy',
      shape: 'triangle',
      hex: isDark ? '#f59e0b' : '#92400e',
      ringHex: isDark ? '#fcd34d' : '#b45309',
      pillClass: 'border-signal-heavy/40 bg-signal-heavy/15 text-signal-heavy',
      textClass: 'text-signal-heavy',
    };
  }

  return {
    key: 'flow',
    label: 'Flow',
    shape: 'circle',
    hex: isDark ? '#10b981' : '#047857',
    ringHex: isDark ? '#6ee7b7' : '#059669',
    pillClass: 'border-signal-flow/40 bg-signal-flow/15 text-signal-flow',
    textClass: 'text-signal-flow',
  };
}

export function zoneLabel(zoneId) {
  return ZONE_LABELS[zoneId] || zoneId || '—';
}

export function classifyLinkSpeed(speedKmph, isDark = true) {
  const spd = Number(speedKmph);
  if (!Number.isFinite(spd) || spd >= 30) {
    return {
      band: 'free',
      label: '>=30 km/h',
      hex: isDark ? '#10b981' : '#047857',
      weight: 2.5,
      dashArray: undefined,
      opacity: 0.72,
    };
  }
  if (spd >= 20) {
    return {
      band: 'moderate',
      label: '20-29 km/h',
      hex: isDark ? '#eab308' : '#b45309',
      weight: 3.1,
      dashArray: undefined,
      opacity: 0.8,
    };
  }
  if (spd >= 12) {
    return {
      band: 'slow',
      label: '12-19 km/h',
      hex: isDark ? '#f97316' : '#c2410c',
      weight: 3.9,
      dashArray: undefined,
      opacity: 0.88,
    };
  }
  return {
    band: 'gridlock',
    label: '<12 km/h',
    hex: isDark ? '#ef4444' : '#b91c1c',
    weight: 4.8,
    dashArray: '8 4',
    opacity: 0.94,
  };
}

export function controllerLabel(ctrlId) {
  return CONTROLLER_META[ctrlId]?.label || ctrlId || '—';
}

export function fmtNum(val, decimals = 1) {
  const n = Number(val);
  if (val === null || val === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtInt(val) {
  const n = Number(val);
  if (val === null || val === undefined || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}

export function fmtSigned(val, decimals = 1, unit = '') {
  const n = Number(val);
  if (val === null || val === undefined || !Number.isFinite(n)) return '—';
  const rounded = Number(n.toFixed(decimals));
  const normalized = Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
  const sign = normalized > 0 ? '+' : '';
  const unitStr = unit ? (unit === '%' ? '%' : ` ${unit}`) : '';
  return `${sign}${normalized.toFixed(decimals)}${unitStr}`;
}

export function fmtClockTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtElapsed(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 0) return '—';
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
