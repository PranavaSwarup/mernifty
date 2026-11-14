import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import { api } from '../services/api';
import { useJunctionLive } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { IntersectionDiagram } from './IntersectionDiagram';
import { JunctionHistoryChart } from './JunctionHistoryChart';
import { CopilotPanel } from './CopilotPanel';
import { StatusPill } from './StatusPill';
import {
  CONTROLLER_ORDER,
  CONTROLLER_META,
  zoneLabel,
  controllerLabel,
  fmtNum,
  fmtInt,
  fmtElapsed,
} from '../utils/semantics';

export function JunctionDetailView({
  junctionId,
  initialSimJunction = null,
  isDrawer = false,
  onClose = null,
  onControllerUpdated = null,
}) {
  const liveFrame = useJunctionLive(junctionId);
  const { user } = useAuth();
  const [simJunction, setSimJunction] = useState(initialSimJunction);
  const [switchingCtrl, setSwitchingCtrl] = useState(false);
  const [ctrlError, setCtrlError] = useState('');
  const [ctrlNotice, setCtrlNotice] = useState('');
  const [showSwitchHistory, setShowSwitchHistory] = useState(false);

  const refreshSimState = useCallback(async () => {
    if (!junctionId) return;
    try {
      const res = await api.getSimState();
      const found = res?.junctions?.find((j) => j.junctionId === junctionId);
      if (found) setSimJunction(found);
    } catch {
      // Keep current cached state if transient polling fails
    }
  }, [junctionId]);

  useEffect(() => {
    setCtrlError('');
    setCtrlNotice('');
    setShowSwitchHistory(false);
    setSimJunction(null);
    refreshSimState();
    const t = setInterval(refreshSimState, 3000);
    return () => clearInterval(t);
  }, [junctionId, refreshSimState]);

  useEffect(() => {
    if (!initialSimJunction) return;
    if (initialSimJunction.junctionId && initialSimJunction.junctionId !== junctionId) return;
    setSimJunction((prev) => (prev ? { ...prev, ...initialSimJunction } : initialSimJunction));
  }, [junctionId, initialSimJunction]);

  const handleControllerSwitch = async (nextCtrl) => {
    setSwitchingCtrl(true);
    setCtrlError('');
    setCtrlNotice('');
    try {
      const res = await api.setController(junctionId, nextCtrl);
      setCtrlNotice(`Controller set to ${controllerLabel(nextCtrl)} (300s verification queued).`);
      if (res && onControllerUpdated) onControllerUpdated();
      await refreshSimState();
    } catch (err) {
      setCtrlError(
        err?.status === 401 || err?.status === 403
          ? `${err.message} Switch Demo persona in the header to Supervisor or this zone's operator.`
          : err?.message || 'Controller change failed'
      );
    } finally {
      setSwitchingCtrl(false);
    }
  };

  // Merge live Wire frame with richer periodic /api/sim/state snapshot (describe, approaches, v/c, avgDelay)
  const merged = (() => {
    const simApps = Array.isArray(simJunction?.approaches) ? simJunction.approaches : [];
    const liveApps = Array.isArray(liveFrame?.data?.approaches) ? liveFrame.data.approaches : [];
    const mergedApps =
      liveApps.length > 0
        ? liveApps.map((la, i) => ({ ...(simApps[i] || {}), ...la }))
        : simApps;

    const mergedControl = {
      ...(simJunction?.control || {}),
      ...(liveFrame?.data?.control || {}),
    };
    const mergedKpi = {
      ...(simJunction?.kpi || {}),
      ...(liveFrame?.data?.kpi || {}),
    };

    const baseData = {
      ...(simJunction || {}),
      approaches: mergedApps,
      vehicleMix: liveFrame?.data?.vehicleMix || simJunction?.vehicleMix || null,
      control: mergedControl,
      kpi: mergedKpi,
      maxQueueLengthM: liveFrame?.metrics?.maxQueueLengthM ?? simJunction?.maxQueueLengthM,
      avgSpeedKmph: liveFrame?.metrics?.avgSpeedKmph ?? simJunction?.avgSpeedKmph,
      congestionScore: liveFrame?.metrics?.congestionScore ?? simJunction?.congestionScore,
      totalFlowVehiclesPerMin:
        liveFrame?.metrics?.totalFlowVehiclesPerMin ?? simJunction?.totalFlowVehiclesPerMin,
      stalledVehicleDetected:
        liveFrame?.metrics?.stalledVehicleDetected ?? simJunction?.stalledVehicleDetected,
      ambulanceDetected: liveFrame?.metrics?.ambulanceDetected ?? simJunction?.ambulanceDetected,
    };
    return {
      ...(simJunction || {}),
      ...(liveFrame || {}),
      junctionId,
      deviceId: junctionId,
      name: liveFrame?.junctionName || simJunction?.name || junctionId,
      zoneId: liveFrame?.zoneId || simJunction?.zoneId || '',
      status: liveFrame?.status || simJunction?.status || 'healthy',
      data: baseData,
      metrics: liveFrame?.metrics || baseData,
    };
  })();

  const describe = simJunction?.describe || {};
  const control = merged.data.control || {};
  const kpi = merged.data.kpi || {};
  const assignedController =
    simJunction?.controller || control.controller || 'auto';
  const activeMode =
    describe.activeController || control.activeController || assignedController;
  const recentSwitches = Array.isArray(describe.recentSwitches) ? describe.recentSwitches : [];
  const plannedSplits = describe.planned?.splits || control.splits || [];
  const realisedSplits = describe.realised?.splits || [];
  const greenSharePct = describe.realised?.greenSharePct || [];

  const canControlJunction =
    user?.role === 'admin' ||
    (user?.role === 'operator' &&
      (!merged.zoneId || !Array.isArray(user.zones) || user.zones.includes(merged.zoneId)));

  return (
    <div className="space-y-4">
      {/* Junction Header Strip */}
      <div className="console-panel p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink-primary">{merged.name}</h2>
            <span className="font-mono text-xs text-ink-muted">{junctionId}</span>
            <span className="px-2 py-0.5 rounded border border-hairline bg-inset text-[11px] text-ink-secondary">
              {zoneLabel(merged.zoneId)} Zone
            </span>
            <StatusPill junction={merged} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-ink-secondary pt-1">
            <span>
              Queue <strong className="text-ink-primary">{fmtInt(merged.metrics?.maxQueueLengthM)} m</strong>
            </span>
            <span>
              Speed <strong className="text-ink-primary">{fmtNum(merged.metrics?.avgSpeedKmph, 1)} km/h</strong>
            </span>
            <span>
              Saturation v/c <strong className="text-ink-primary">{fmtNum(kpi.degreeOfSaturation, 2)}</strong>
            </span>
            <span>
              Avg Delay <strong className="text-ink-primary">{fmtNum(kpi.avgDelayPerVehSec, 1)} s/veh</strong>
            </span>
            <span>
              Congestion <strong className="text-ink-primary">{fmtInt(merged.metrics?.congestionScore)}/100</strong>
            </span>
          </div>
          <p className="text-[11px] text-ink-muted">
            Live twin telemetry paired against a shadow Fixed-TOD baseline for intervention scoring.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close junction drawer"
            className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded border border-hairline bg-inset hover:border-hairlineStrong text-ink-secondary hover:text-ink-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Signal Controller Selector + Auto Policy Transparency (Honesty rule #4) */}
      <div className="console-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-ink-primary">Signal Controller &amp; Timing Plan</h3>
            <p className="text-[11px] text-ink-muted">
              {CONTROLLER_META[assignedController]?.desc || 'Select controller mode for live traffic twin'}
              {!canControlJunction && (
                <span>
                  {' · '}Switch Demo persona in the header to Supervisor or {zoneLabel(merged.zoneId)} Desk to switch controllers.
                </span>
              )}
            </p>
          </div>
          <div role="group" aria-label="Signal controller selection" className="flex flex-wrap gap-1">
            {CONTROLLER_ORDER.map((ctrlId) => {
              const selected = assignedController === ctrlId;
              return (
                <button
                  key={ctrlId}
                  type="button"
                  aria-pressed={selected}
                  disabled={switchingCtrl || !canControlJunction}
                  title={
                    !canControlJunction
                      ? `Switch Demo persona to Supervisor or ${zoneLabel(merged.zoneId)} Desk to edit controller`
                      : CONTROLLER_META[ctrlId].desc
                  }
                  onClick={() => handleControllerSwitch(ctrlId)}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    selected
                      ? 'bg-accent text-accent-contrast border-accent'
                      : 'bg-inset text-ink-secondary border-hairline hover:text-ink-primary hover:border-hairlineStrong'
                  }`}
                >
                  {CONTROLLER_META[ctrlId].label}
                </button>
              );
            })}
          </div>
        </div>

        {ctrlError && (
          <div role="alert" className="px-2.5 py-1.5 rounded border border-signal-gridlock/40 bg-signal-gridlock/10 text-[11px] text-signal-gridlock">
            {ctrlError}
          </div>
        )}
        {ctrlNotice && (
          <div aria-live="polite" className="px-2.5 py-1.5 rounded border border-signal-flow/40 bg-signal-flow/10 text-[11px] text-signal-flow">
            {ctrlNotice}
          </div>
        )}

        {/* Auto Policy Reasoning Strip */}
        {assignedController === 'auto' && (
          <div className="console-inset p-3 space-y-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-primary">Auto active mode:</span>
                <span className="px-2 py-0.5 rounded border border-accent/40 bg-accent/10 text-accent-ink font-mono font-medium">
                  {controllerLabel(activeMode)}
                </span>
                <span className="font-mono tabular-nums text-ink-secondary">
                  Y = {fmtNum(describe.flowRatioY ?? control.flowRatioY, 3)}
                </span>
                {describe.minHoldCycles !== undefined && (
                  <span className="font-mono tabular-nums text-ink-muted">
                    Hysteresis hold {fmtInt(describe.cyclesSinceSwitch)}/{fmtInt(describe.minHoldCycles)} cycles
                  </span>
                )}
              </div>
              {recentSwitches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSwitchHistory((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  <span>
                    {showSwitchHistory
                      ? 'Hide switches'
                      : `${recentSwitches.length} policy ${recentSwitches.length === 1 ? 'switch' : 'switches'}`}
                  </span>
                </button>
              )}
            </div>
            {describe.lastReason && (
              <div className="text-ink-secondary">
                <span className="text-ink-muted">Switch rationale: </span>
                <span>{describe.lastReason}</span>
              </div>
            )}
            {showSwitchHistory && recentSwitches.length > 0 && (
              <div className="pt-2 border-t border-hairline space-y-1 font-mono text-[10px] text-ink-secondary">
                {recentSwitches
                  .slice()
                  .reverse()
                  .map((sw, idx) => (
                    <div key={idx} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        @ {fmtElapsed(sw.atSec)} · {controllerLabel(sw.from)} → {controllerLabel(sw.to)} (Y={fmtNum(sw.flowRatioY, 3)})
                      </span>
                      <span className="text-ink-muted">{sw.reason}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Planned vs Realised Splits Table */}
        {(plannedSplits.length > 0 || realisedSplits.length > 0) && (
          <div className="overflow-x-auto pt-1">
            <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
              <thead>
                <tr className="border-b border-hairline text-ink-muted font-sans">
                  <th scope="col" className="py-1 pr-3 font-medium">Splits</th>
                  <th scope="col" className="py-1 pr-3 font-medium text-right">Cycle</th>
                  {(plannedSplits.length > 0 ? plannedSplits : realisedSplits).map((_, i) => (
                    <th scope="col" key={i} className="py-1 pr-3 font-medium text-right">Phase {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {plannedSplits.length > 0 && (
                  <tr>
                    <td className="py-1 pr-3 font-sans text-ink-secondary">Planned (s)</td>
                    <td className="py-1 pr-3 text-right text-ink-primary">
                      {(describe.planned?.cycleSec ?? control.cycleSec) > 0
                        ? `${fmtInt(describe.planned?.cycleSec ?? control.cycleSec)}s`
                        : 'Dynamic'}
                    </td>
                    {plannedSplits.map((s, i) => (
                      <td key={i} className="py-1 pr-3 text-right text-ink-primary">{fmtInt(s)}s</td>
                    ))}
                  </tr>
                )}
                {realisedSplits.length > 0 && (
                  <tr>
                    <td className="py-1 pr-3 font-sans text-ink-secondary">Realised 5m avg (s)</td>
                    <td className="py-1 pr-3 text-right text-ink-primary">
                      {describe.realised?.cycleSec > 0 ? `${fmtInt(describe.realised?.cycleSec)}s` : 'Warming'}
                    </td>
                    {realisedSplits.map((s, i) => (
                      <td key={i} className="py-1 pr-3 text-right text-ink-secondary">
                        {fmtInt(s)}s{greenSharePct[i] !== undefined ? ` (${fmtNum(greenSharePct[i], 0)}%)` : ''}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main 2-column detail workspace (or 1-column inside side drawer) */}
      <div className={isDrawer ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 xl:grid-cols-12 gap-4'}>
        <div className={isDrawer ? 'space-y-4' : 'xl:col-span-6 space-y-4'}>
          <IntersectionDiagram junction={merged} />
          <JunctionHistoryChart junctionId={junctionId} liveFrame={liveFrame} />
        </div>
        <div className={isDrawer ? '' : 'xl:col-span-6'}>
          <CopilotPanel junctionId={junctionId} zoneId={merged.zoneId} onActionDispatched={refreshSimState} />
        </div>
      </div>
    </div>
  );
}
