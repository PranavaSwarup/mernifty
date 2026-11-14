import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { JunctionDetailView } from '../components/JunctionDetailView';
import { StatusGlyph } from '../components/StatusPill';
import {
  classifyJunctionStatus,
  controllerLabel,
  zoneLabel,
  useTheme,
  fmtInt,
  fmtNum,
} from '../utils/semantics';

export function JunctionWorkspace({
  devices,
  selectedJunctionId,
  onSelectJunction,
}) {
  const { latestByDevice } = useSocket();
  const { isDark } = useTheme();
  const [simJunctions, setSimJunctions] = useState([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      api
        .getSimState()
        .then((res) => {
          if (active && Array.isArray(res?.junctions)) {
            setSimJunctions(res.junctions);
          }
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const junctions = useMemo(() => {
    const byId = new Map();
    for (const d of devices || []) {
      const id = d.junctionId || d.deviceId;
      if (id) byId.set(id, { ...d, junctionId: id });
    }
    for (const s of simJunctions) {
      byId.set(s.junctionId, { ...(byId.get(s.junctionId) || {}), ...s });
    }
    for (const [id, live] of Object.entries(latestByDevice || {})) {
      const prev = byId.get(id) || {};
      byId.set(id, {
        ...prev,
        ...live,
        junctionId: id,
        name: live.junctionName || prev.name || id,
        metrics: live.metrics || prev.metrics,
        data: { ...(prev.data || {}), ...(live.data || {}) },
      });
    }
    return Array.from(byId.values());
  }, [devices, simJunctions, latestByDevice]);

  const activeId =
    selectedJunctionId && junctions.some((j) => j.junctionId === selectedJunctionId)
      ? selectedJunctionId
      : junctions[0]?.junctionId || 'JNC-BLR-001';

  const activeJunction = junctions.find((j) => j.junctionId === activeId) || null;

  return (
    <div className="max-w-[1680px] mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* 12-Junction Selector Strip */}
      <section className="console-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <h1 className="text-base font-semibold text-ink-primary">
            Select Signalised Junction ({junctions.length})
          </h1>
          <span className="text-[11px] font-mono text-ink-muted">
            Subscribes cleanly to <span className="text-ink-secondary">junction:{activeId}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {junctions.map((j) => {
            const selected = j.junctionId === activeId;
            const info = classifyJunctionStatus(j, isDark);
            const qM = j.metrics?.maxQueueLengthM ?? j.maxQueueLengthM;
            const spd = j.metrics?.avgSpeedKmph ?? j.avgSpeedKmph;
            const ctrl = j.describe?.activeController || j.data?.control?.activeController || j.controller;
            const rawName = String(j.name || j.junctionId);
            const parenMatch = rawName.match(/^([^(]+)\(([^)]+)\)$/);
            const titleText = parenMatch ? parenMatch[1].trim() : rawName;
            const subCorridor = parenMatch ? parenMatch[2].trim() : null;
            return (
              <button
                key={j.junctionId}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectJunction(j.junctionId)}
                className={`text-left p-2.5 rounded border transition-colors ${
                  selected
                    ? 'border-accent bg-accent-tint'
                    : 'border-hairline bg-inset hover:border-hairlineStrong'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink-primary leading-snug">
                      {titleText}
                    </div>
                    {subCorridor && (
                      <div className="text-[10px] text-ink-muted truncate">{subCorridor}</div>
                    )}
                  </div>
                  <StatusGlyph shape={info.shape} color={info.hex} size={9} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-ink-muted">
                  <span>{zoneLabel(j.zoneId)} · {controllerLabel(ctrl)}</span>
                  <span className="text-ink-secondary whitespace-nowrap">
                    {fmtInt(qM)} m · {fmtNum(spd, 0)} km/h
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <JunctionDetailView
        junctionId={activeId}
        initialSimJunction={activeJunction}
      />
    </div>
  );
}
