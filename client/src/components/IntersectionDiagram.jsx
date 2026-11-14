import React from 'react';
import { useTheme, fmtNum, fmtInt } from '../utils/semantics';

const ARM_BY_DIR = { N: 0, E: 1, S: 2, W: 3 };
const FALLBACK_DIRS = ['N', 'E', 'S', 'W'];

function signalColor(signal, isDark) {
  if (signal === 'green') return isDark ? '#10b981' : '#047857';
  if (signal === 'amber') return isDark ? '#f59e0b' : '#92400e';
  return isDark ? '#f97316' : '#9a3412';
}

function signalCode(signal) {
  if (signal === 'green') return 'G';
  if (signal === 'amber') return 'A';
  return 'R';
}

function formatRoadShort(road) {
  if (!road) return 'Approach';
  return String(road).replace(/\s*\(from [^)]+\)/i, '');
}

const VEHICLE_LABELS = [
  [['twoWheelers', 'twoWheeler'], '2W'],
  [['cars', 'car'], 'Car'],
  [['autos', 'auto'], 'Auto'],
  [['buses', 'bus'], 'Bus'],
  [['trucks', 'truck'], 'Truck'],
];

export const IntersectionDiagram = React.memo(function IntersectionDiagram({ junction }) {
  const { isDark } = useTheme();
  const data = junction?.data || junction || {};
  const approaches = Array.isArray(data.approaches) ? data.approaches : [];
  const control = data.control || {};
  const vehicleMix = data.vehicleMix || null;

  if (approaches.length === 0) {
    return (
      <div className="console-panel p-4">
        <div className="text-xs font-semibold text-ink-primary mb-1">Signal Phases &amp; Approach Queues</div>
        <p className="text-xs text-ink-muted">
          Waiting for per-junction approach frame on room <span className="font-mono">junction:{junction?.junctionId || junction?.deviceId || '—'}</span>.
        </p>
      </div>
    );
  }

  // Place each approach cleanly on its cardinal arm (N=0, E=1, S=2, W=3)
  const arms = [null, null, null, null];
  approaches.forEach((app, idx) => {
    const slot = ARM_BY_DIR[app.dir] ?? idx % 4;
    if (!arms[slot]) {
      arms[slot] = { ...app, idx, dirLabel: app.dir || FALLBACK_DIRS[slot] };
    } else {
      const empty = arms.findIndex((a) => !a);
      if (empty >= 0) arms[empty] = { ...app, idx, dirLabel: app.dir || FALLBACK_DIRS[empty] };
    }
  });

  const roadBg = isDark ? '#1a2230' : '#dde3ec';
  const roadStroke = isDark ? '#334155' : '#94a3b8';
  const labelColor = isDark ? '#e2e8f0' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#475569';
  const queueTrack = isDark ? '#0e1116' : '#f2f4f7';

  const rawPhaseIdx = control.phaseIndex ?? control.currentPhaseIdx;
  const activePhase = Number.isInteger(rawPhaseIdx) ? rawPhaseIdx + 1 : null;
  const rawRemSec = control.greenRemainingSec ?? control.phaseRemainingSec;
  const remainingSec =
    rawRemSec !== undefined && rawRemSec !== null
      ? Math.max(0, Math.round(Number(rawRemSec)))
      : null;

  // Coordinates centered around (250, 155) in 500x310 viewBox
  const sigTextFill = isDark ? '#0b0f14' : '#ffffff';
  const renderArm = (arm, slot) => {
    if (!arm) return null;
    const fillRatio = Math.min(1, Math.max(0, Number(arm.storageRatio ?? (arm.queueLengthM || 0) / 260)));
    const sigHex = signalColor(arm.signal, isDark);
    const barHex = fillRatio >= 0.78 ? (isDark ? '#f97316' : '#9a3412') : fillRatio >= 0.48 ? (isDark ? '#f59e0b' : '#92400e') : (isDark ? '#3b82f6' : '#1d4ed8');
    const roadTitle = `${arm.dirLabel}: ${formatRoadShort(arm.road)}`;

    if (slot === 0) {
      // North arm (approaching from top toward box top y=120)
      const qH = Math.round(fillRatio * 74);
      return (
        <g key={arm.idx}>
          <rect x="216" y="38" width="68" height="82" fill={roadBg} stroke={roadStroke} strokeWidth="1" />
          <line x1="250" y1="40" x2="250" y2="118" stroke={roadStroke} strokeDasharray="4 4" strokeWidth="1" />
          <rect x="223" y="42" width="18" height="72" rx="2" fill={queueTrack} stroke={roadStroke} strokeWidth="0.75" />
          {qH > 0 && <rect x="223" y={114 - qH} width="18" height={qH} rx="2" fill={barHex} fillOpacity="0.88" />}
          <circle cx="250" cy="110" r="8" fill={sigHex} />
          <text x="250" y="113.5" textAnchor="middle" fontSize="9" fontWeight="700" fill={sigTextFill} fontFamily="JetBrains Mono, monospace">
            {signalCode(arm.signal)}
          </text>
          <text x="250" y="24" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={labelColor}>
            {roadTitle}
          </text>
          <text x="208" y="66" textAnchor="end" fontSize="10" fill={labelColor} fontFamily="JetBrains Mono, monospace">
            {fmtInt(arm.queueLengthM)} m ({fmtNum(arm.queueVeh, 0)}v)
          </text>
          <text x="208" y="80" textAnchor="end" fontSize="9.5" fill={mutedColor} fontFamily="JetBrains Mono, monospace">
            v/c {fmtNum(arm.vOverC, 2)} · {fmtInt(arm.vehiclesPerMin)}/m
          </text>
        </g>
      );
    }

    if (slot === 2) {
      // South arm (approaching from bottom toward box bottom y=190)
      const qH = Math.round(fillRatio * 74);
      return (
        <g key={arm.idx}>
          <rect x="216" y="190" width="68" height="82" fill={roadBg} stroke={roadStroke} strokeWidth="1" />
          <line x1="250" y1="192" x2="250" y2="270" stroke={roadStroke} strokeDasharray="4 4" strokeWidth="1" />
          <rect x="259" y="196" width="18" height="72" rx="2" fill={queueTrack} stroke={roadStroke} strokeWidth="0.75" />
          {qH > 0 && <rect x="259" y="196" width="18" height={qH} rx="2" fill={barHex} fillOpacity="0.88" />}
          <circle cx="250" cy="200" r="8" fill={sigHex} />
          <text x="250" y="203.5" textAnchor="middle" fontSize="9" fontWeight="700" fill={sigTextFill} fontFamily="JetBrains Mono, monospace">
            {signalCode(arm.signal)}
          </text>
          <text x="250" y="290" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={labelColor}>
            {roadTitle}
          </text>
          <text x="292" y="230" textAnchor="start" fontSize="10" fill={labelColor} fontFamily="JetBrains Mono, monospace">
            {fmtInt(arm.queueLengthM)} m ({fmtNum(arm.queueVeh, 0)}v)
          </text>
          <text x="292" y="244" textAnchor="start" fontSize="9.5" fill={mutedColor} fontFamily="JetBrains Mono, monospace">
            v/c {fmtNum(arm.vOverC, 2)} · {fmtInt(arm.vehiclesPerMin)}/m
          </text>
        </g>
      );
    }

    if (slot === 1) {
      // East arm (approaching from right toward box right x=284)
      const qW = Math.round(fillRatio * 84);
      return (
        <g key={arm.idx}>
          <rect x="284" y="120" width="112" height="70" fill={roadBg} stroke={roadStroke} strokeWidth="1" />
          <line x1="286" y1="155" x2="394" y2="155" stroke={roadStroke} strokeDasharray="4 4" strokeWidth="1" />
          <rect x="292" y="128" width="90" height="16" rx="2" fill={queueTrack} stroke={roadStroke} strokeWidth="0.75" />
          {qW > 0 && <rect x="292" y="128" width={qW} height="16" rx="2" fill={barHex} fillOpacity="0.88" />}
          <circle cx="296" cy="155" r="8" fill={sigHex} />
          <text x="296" y="158.5" textAnchor="middle" fontSize="9" fontWeight="700" fill={sigTextFill} fontFamily="JetBrains Mono, monospace">
            {signalCode(arm.signal)}
          </text>
          <text x="292" y="84" textAnchor="start" fontSize="10.5" fontWeight="600" fill={labelColor}>
            {roadTitle}
          </text>
          <text x="292" y="98" textAnchor="start" fontSize="10" fill={labelColor} fontFamily="JetBrains Mono, monospace">
            {fmtInt(arm.queueLengthM)} m ({fmtNum(arm.queueVeh, 0)}v)
          </text>
          <text x="292" y="112" textAnchor="start" fontSize="9.5" fill={mutedColor} fontFamily="JetBrains Mono, monospace">
            v/c {fmtNum(arm.vOverC, 2)} · {fmtInt(arm.vehiclesPerMin)}/m
          </text>
        </g>
      );
    }

    // West arm (slot === 3, approaching from left toward box left x=216)
    const qW = Math.round(fillRatio * 84);
    return (
      <g key={arm.idx}>
        <rect x="104" y="120" width="112" height="70" fill={roadBg} stroke={roadStroke} strokeWidth="1" />
        <line x1="106" y1="155" x2="214" y2="155" stroke={roadStroke} strokeDasharray="4 4" strokeWidth="1" />
        <rect x="118" y="166" width="90" height="16" rx="2" fill={queueTrack} stroke={roadStroke} strokeWidth="0.75" />
        {qW > 0 && <rect x={208 - qW} y="166" width={qW} height="16" rx="2" fill={barHex} fillOpacity="0.88" />}
        <circle cx="204" cy="155" r="8" fill={sigHex} />
        <text x="204" y="158.5" textAnchor="middle" fontSize="9" fontWeight="700" fill={sigTextFill} fontFamily="JetBrains Mono, monospace">
          {signalCode(arm.signal)}
        </text>
        <text x="208" y="206" textAnchor="end" fontSize="10.5" fontWeight="600" fill={labelColor}>
          {roadTitle}
        </text>
        <text x="208" y="220" textAnchor="end" fontSize="10" fill={labelColor} fontFamily="JetBrains Mono, monospace">
          {fmtInt(arm.queueLengthM)} m ({fmtNum(arm.queueVeh, 0)}v)
        </text>
        <text x="208" y="234" textAnchor="end" fontSize="9.5" fill={mutedColor} fontFamily="JetBrains Mono, monospace">
          v/c {fmtNum(arm.vOverC, 2)} · {fmtInt(arm.vehiclesPerMin)}/m
        </text>
      </g>
    );
  };

  const schematicSummary = `${control.inIntergreen ? 'All-red intergreen' : activePhase ? `Phase ${activePhase}` : 'Synced'}, ${
    remainingSec !== null ? `${remainingSec}s remaining` : 'dynamic timing'
  }; ${arms
    .filter(Boolean)
    .map((a) => `${a.dirLabel} ${a.signal || 'red'} queue ${fmtInt(a.queueLengthM)}m`)
    .join(', ')}`;

  return (
    <div className="console-panel p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-semibold text-ink-primary">
          4-Approach Signal Box &amp; Queue Occupancy
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-ink-secondary">
          <span>
            {control.cycleSec > 0 ? `Cycle ${Math.round(control.cycleSec)} s` : 'Dynamic phase'}
          </span>
          {control.inIntergreen ? (
            <span className="text-signal-heavy font-semibold">Intergreen</span>
          ) : activePhase !== null ? (
            <span>
              Phase {activePhase}/{approaches.length} · {remainingSec !== null ? `${remainingSec}s rem` : '—'}
            </span>
          ) : null}
        </div>
      </div>

      <svg
        viewBox="0 0 500 310"
        className="w-full h-auto max-h-[260px] select-none"
        role="img"
        aria-label={schematicSummary}
      >
        {arms.map((arm, slot) => renderArm(arm, slot))}

        {/* Center intersection box */}
        <rect
          x="216"
          y="120"
          width="68"
          height="70"
          fill={isDark ? '#141922' : '#ffffff'}
          stroke={roadStroke}
          strokeWidth="1.25"
        />
        <text
          x="250"
          y="148"
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={control.inIntergreen ? signalColor('amber', isDark) : labelColor}
          fontFamily="JetBrains Mono, monospace"
        >
          {control.inIntergreen ? 'ALL-RED' : activePhase ? `P${activePhase}` : 'SYNC'}
        </text>
        <text
          x="250"
          y="167"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill={isDark ? '#60a5fa' : '#1d4ed8'}
          fontFamily="JetBrains Mono, monospace"
        >
          {remainingSec !== null ? `${remainingSec}s` : '—'}
        </text>
      </svg>

      {/* Vehicle Mix Strip derived purely from telemetry.data.vehicleMix */}
      {vehicleMix && (
        <div className="mt-2 pt-2 border-t border-hairline flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-ink-muted">Vehicle mix (PCU shares)</span>
          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-ink-secondary">
            {VEHICLE_LABELS.map(([keys, short]) => {
              const raw = keys.map((k) => vehicleMix[k]).find((v) => v !== undefined && v !== null);
              if (raw === undefined || raw === null) return null;
              const pct = raw <= 1 ? raw * 100 : raw;
              return (
                <span key={short}>
                  {short} <strong className="text-ink-primary">{Math.round(pct)}%</strong>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
