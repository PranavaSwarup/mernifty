import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { api } from '../services/api';
import { createHistoryLiveState, mergeLiveFrame } from '../utils/historyMerge';
import { useTheme, fmtNum, fmtInt } from '../utils/semantics';

export function JunctionHistoryChart({ junctionId, liveFrame }) {
  const { isDark } = useTheme();
  const [mergeState, setMergeState] = useState(() => createHistoryLiveState([], 0, 120));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load initial historical baseline from REST when junction changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setMergeState(createHistoryLiveState([], 0, 120));

    api
      .getHistory({ deviceId: junctionId, limit: 80 })
      .then((res) => {
        if (cancelled) return;
        const records = Array.isArray(res?.records) ? res.records : [];
        const srvCursor =
          typeof res?.cursor === 'number' ? res.cursor : Number(res?.cursor?.[junctionId] || 0);
        setMergeState(createHistoryLiveState(records, srvCursor, 120));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'History unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [junctionId]);

  // Append incoming Socket.IO frame via cursor + eventId deduplication
  useEffect(() => {
    if (!liveFrame) return;
    const fId = liveFrame.junctionId || liveFrame.deviceId;
    if (fId !== junctionId) return;
    setMergeState((prev) => mergeLiveFrame(prev, liveFrame));
  }, [junctionId, liveFrame]);

  const chartColors = useMemo(
    () => ({
      grid: isDark ? '#262f3f' : '#d1d8e3',
      axis: isDark ? '#8a98ad' : '#526075',
      queue: isDark ? '#f59e0b' : '#b45309',
      speed: isDark ? '#3b82f6' : '#1d4ed8',
      seam: isDark ? '#10b981' : '#047857',
      tooltipBg: isDark ? '#141922' : '#ffffff',
      tooltipBorder: isDark ? '#364257' : '#aebacb',
      tooltipText: isDark ? '#edf1f7' : '#111824',
    }),
    [isDark]
  );

  const visiblePoints = useMemo(() => mergeState.points.slice(-80), [mergeState.points]);

  return (
    <div className="console-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xs font-semibold text-ink-primary">
            Queue &amp; Speed Continuity (History -&gt; Live)
          </h3>
          <p className="text-[11px] text-ink-muted">
            Merged MongoDB history and Socket.IO stream using sequence cursor reconciliation
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono tabular-nums text-ink-secondary">
          <span className="px-1.5 py-0.5 rounded border border-hairline bg-inset">
            Hist {fmtInt(mergeState.historicalCount)}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-hairline bg-inset">
            Live {fmtInt(mergeState.liveCount)}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-hairline bg-inset">
            Deduped {fmtInt(mergeState.duplicateSuppressed)}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-hairline bg-inset">
            Cursor #{fmtInt(mergeState.cursor)}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-2 px-2.5 py-1.5 rounded border border-signal-gridlock/40 bg-signal-gridlock/10 text-[11px] text-signal-gridlock">
          {error}
        </div>
      )}

      {loading && visiblePoints.length === 0 ? (
        <div className="h-[190px] flex items-center justify-center text-xs text-ink-muted">
          Loading historical points...
        </div>
      ) : visiblePoints.length === 0 ? (
        <div className="h-[190px] flex items-center justify-center text-xs text-ink-muted">
          Waiting for telemetry points on this junction...
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted px-1">
            <span>Queue (m)</span>
            <span>Avg Speed (km/h)</span>
          </div>
          <div className="h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visiblePoints} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="formattedTime"
                  tick={{ fill: chartColors.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  stroke={chartColors.grid}
                  minTickGap={28}
                />
                <YAxis
                  yAxisId="q"
                  tick={{ fill: chartColors.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  stroke={chartColors.grid}
                  width={38}
                />
                <YAxis
                  yAxisId="s"
                  orientation="right"
                  domain={[0, 50]}
                  tick={{ fill: chartColors.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  stroke={chartColors.grid}
                  width={34}
                />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                  color: chartColors.tooltipText,
                }}
                formatter={(val, name) => {
                  if (name === 'Max Queue (m)') return [`${fmtNum(val, 1)} m`, name];
                  if (name === 'Avg Speed (km/h)') return [`${fmtNum(val, 1)} km/h`, name];
                  return [val, name];
                }}
              />
              {mergeState.seamLabel && (
                <ReferenceLine
                  yAxisId="q"
                  x={mergeState.seamLabel}
                  stroke={chartColors.seam}
                  strokeDasharray="4 2"
                  label={{
                    value: 'LIVE SEAM',
                    position: 'top',
                    fill: chartColors.seam,
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono',
                  }}
                />
              )}
              <Line
                yAxisId="q"
                type="monotone"
                dataKey="maxQueueLengthM"
                name="Max Queue (m)"
                stroke={chartColors.queue}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="s"
                type="monotone"
                dataKey="avgSpeedKmph"
                name="Avg Speed (km/h)"
                stroke={chartColors.speed}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-signal-heavy inline-block" />
            Max queue (m, left)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent inline-block" />
            Avg speed (km/h, right)
          </span>
        </div>
        {mergeState.seamLabel && (
          <span className="font-mono text-[10px] text-signal-flow">
            Seam @ {mergeState.seamLabel}
          </span>
        )}
      </div>
    </div>
  );
}
