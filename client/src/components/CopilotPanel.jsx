import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtNum, fmtSigned, fmtClockTime, zoneLabel } from '../utils/semantics';

export function CopilotPanel({ junctionId, zoneId = '', onActionDispatched }) {
  const { user } = useAuth();
  const canOperate =
    user?.role === 'admin' ||
    (user?.role === 'operator' &&
      (!zoneId || !Array.isArray(user.zones) || user.zones.includes(zoneId)));
  const [diagnosis, setDiagnosis] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!junctionId) return;
    setLoading(true);
    setError('');
    try {
      const [diagRes, actRes] = await Promise.all([
        api.diagnose(junctionId),
        api.getActions({ junctionId, limit: 10 }),
      ]);
      if (diagRes?.diagnosis) setDiagnosis(diagRes.diagnosis);
      if (Array.isArray(actRes?.actions)) setActions(actRes.actions);
    } catch (err) {
      setError(err?.message || 'Copilot diagnostics failed');
    } finally {
      setLoading(false);
    }
  }, [junctionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDispatchRunbook = async (finding) => {
    const rb = finding?.runbook;
    if (!rb) return;
    setRunningId(finding.id);
    setNotice(null);
    setError('');
    try {
      const res = await api.remediate({
        deviceId: junctionId,
        action: rb.action,
        params: rb.params || {},
        findingId: finding.id,
      });
      setNotice({
        type: 'success',
        text: res?.message || `Executed ${rb.title}; 300s verification scheduled.`,
      });
      await loadData();
      if (onActionDispatched) onActionDispatched();
    } catch (err) {
      setError(
        err?.status === 401 || err?.status === 403
          ? `${err.message} Switch to Supervisor or the zone Demo persona in the header.`
          : err?.message || 'Failed to dispatch remediation'
      );
    } finally {
      setRunningId(null);
    }
  };

  const findings = diagnosis?.findings || [];
  const cs = diagnosis?.currentState || {};
  const timing = diagnosis?.diagnosticsTiming || {};

  return (
    <div className="space-y-3">
      {/* Copilot Header & Current Signal Assessment */}
      <div className="console-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-ink-primary">
              Copilot Rollout Diagnosis &amp; Runbooks
            </h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Evaluates look-ahead counterfactual outcomes across deterministic and seeded perturbation rollouts.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-hairline bg-inset hover:border-hairlineStrong text-[11px] text-ink-secondary hover:text-ink-primary transition-colors shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-run</span>
          </button>
        </div>

        {/* Snapshot Context Row */}
        {diagnosis && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-hairline text-[11px]">
            <div className="console-inset px-2.5 py-1.5">
              <div className="text-ink-muted text-[10px]">Flow ratio Y</div>
              <div className="font-mono tabular-nums font-semibold text-ink-primary">
                {fmtNum(cs.flowRatioY, 3)}
              </div>
            </div>
            <div className="console-inset px-2.5 py-1.5">
              <div className="text-ink-muted text-[10px]">Queue trend</div>
              <div className="font-mono tabular-nums font-semibold text-ink-primary">
                {cs.queueTrend ? `${fmtSigned(cs.queueTrend.slopeMPerMin, 1)} m/m` : '—'}
              </div>
            </div>
            <div className="console-inset px-2.5 py-1.5">
              <div className="text-ink-muted text-[10px]">Trend fit (R²)</div>
              <div className="font-mono tabular-nums font-semibold text-ink-primary">
                {cs.queueTrend ? fmtNum(cs.queueTrend.r2, 2) : '—'}
              </div>
            </div>
            <div className="console-inset px-2.5 py-1.5">
              <div className="text-ink-muted text-[10px]">Eval budget</div>
              <div className="font-mono tabular-nums font-semibold text-ink-primary">
                {timing.totalMs !== undefined ? `${fmtNum(timing.totalMs, 1)} ms (K=${timing.rolloutsK || 0} rollouts)` : '—'}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-3 px-2.5 py-2 rounded border border-signal-gridlock/40 bg-signal-gridlock/10 text-[11px] text-signal-gridlock flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div aria-live="polite" className="mt-3 px-2.5 py-2 rounded border border-signal-flow/40 bg-signal-flow/10 text-[11px] text-signal-flow flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{notice.text}</span>
          </div>
        )}

        {/* Findings List */}
        <div className="mt-3 space-y-2.5">
          {loading && findings.length === 0 ? (
            <div className="py-6 text-center text-xs text-ink-muted">
              Running chunked look-ahead rollouts...
            </div>
          ) : findings.length === 0 ? (
            <div className="py-5 text-center text-xs text-ink-muted console-inset">
              No deteriorating anomaly rules matched this junction.
            </div>
          ) : (
            findings.map((f) => {
              const pe = f.predictedEffect || {};
              const interval = f.interval90;
              return (
                <div key={f.id} className="console-inset p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase ${
                            f.severity === 'critical'
                              ? 'border-signal-gridlock/40 bg-signal-gridlock/15 text-signal-gridlock'
                              : f.severity === 'warning'
                                ? 'border-signal-heavy/40 bg-signal-heavy/15 text-signal-heavy'
                                : 'border-hairline bg-surface text-ink-secondary'
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span className="text-xs font-semibold text-ink-primary">{f.rule}</span>
                      </div>
                      <p className="text-[11px] text-ink-secondary mt-1 leading-relaxed">
                        {f.rootCause}
                      </p>
                    </div>
                  </div>

                  {/* Required Honesty Confidence Representation: X/K Rollouts + 90% Interval */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="px-2 py-1.5 rounded border border-hairline bg-surface">
                      <div className="text-[10px] text-ink-muted">Rollout verification</div>
                      <div className="font-mono tabular-nums font-semibold text-ink-primary mt-0.5">
                        {f.rolloutsSummary || `${f.improvedRollouts ?? 0}/${f.rolloutsCount ?? 0} look-ahead rollouts improved delay`}
                      </div>
                      {interval && (
                        <div className="font-mono tabular-nums text-[10px] text-ink-secondary mt-0.5">
                          90% [{fmtSigned(interval.low, 1)}, {fmtSigned(interval.high, 1)}] veh·s delay delta (300s CRN)
                        </div>
                      )}
                    </div>

                    <div className="px-2 py-1.5 rounded border border-hairline bg-surface">
                      <div className="text-[10px] text-ink-muted">
                        Predicted {pe.horizonSec || 300}s delta vs baseline
                      </div>
                      <div className="font-mono tabular-nums text-ink-primary mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="whitespace-nowrap">Delay {fmtSigned(pe.delayDeltaVehSec, 1, 'veh·s')}</span>
                        <span className="whitespace-nowrap">Speed {fmtSigned(pe.speedDeltaKmph, 1, 'km/h')}</span>
                        <span className="whitespace-nowrap">Queue {fmtSigned(pe.maxQueueDeltaM, 1, 'm')}</span>
                      </div>
                    </div>
                  </div>

                  {Array.isArray(f.evidence) && f.evidence.length > 0 ? (
                    <ul className="text-[11px] font-mono text-ink-muted space-y-0.5 pl-3 list-disc">
                      {f.evidence.slice(0, 4).map((ev, i) => (
                        <li key={i}>{typeof ev === 'string' ? ev : JSON.stringify(ev)}</li>
                      ))}
                    </ul>
                  ) : f.evidence && typeof f.evidence === 'object' && Object.keys(f.evidence).length > 0 ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-ink-muted">
                      {Object.entries(f.evidence)
                        .slice(0, 6)
                        .map(([k, v]) => (
                          <span key={k}>
                            {k}:{' '}
                            <strong className="text-ink-secondary font-medium">
                              {typeof v === 'number' ? fmtNum(v, 2) : String(v)}
                            </strong>
                          </span>
                        ))}
                    </div>
                  ) : null}

                  {f.runbook && (
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-hairline">
                      <div className="text-[11px] text-ink-secondary">
                        <span className="font-medium text-ink-primary">{f.runbook.title}:</span>{' '}
                        {f.runbook.description}
                      </div>
                      <button
                        type="button"
                        disabled={runningId === f.id || !canOperate}
                        title={
                          !canOperate
                            ? `Switch Demo persona to Supervisor${zoneId ? ` or ${zoneLabel(zoneId)} Desk` : ''} to apply runbooks`
                            : undefined
                        }
                        onClick={() => handleDispatchRunbook(f)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent text-accent-contrast text-[11px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
                      >
                        <Play className="w-3 h-3" />
                        <span>{runningId === f.id ? 'Applying...' : 'Apply runbook'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Operator Action Verification Ledger (/api/actions predicted vs realised after 300s) */}
      <div className="console-panel p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h3 className="text-xs font-semibold text-ink-primary">
              Action Ledger: Predicted vs Realised (300s Horizon)
            </h3>
            <p className="text-[11px] text-ink-muted">
              Compares rollout prediction at dispatch against baseline-paired twin delta after 300 sim-seconds
            </p>
          </div>
          <span className="font-mono text-[11px] text-ink-muted tabular-nums whitespace-nowrap shrink-0">
            {actions.length} recent
          </span>
        </div>

        {actions.length === 0 ? (
          <div className="py-4 text-center text-xs text-ink-muted console-inset">
            No controller switches or runbooks dispatched yet for this junction.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-hairline text-ink-muted font-medium">
                  <th scope="col" className="py-1.5 pr-2">Time</th>
                  <th scope="col" className="py-1.5 pr-2">Action / Actor</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Predicted</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Realised (300s)</th>
                  <th scope="col" className="py-1.5">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline font-mono tabular-nums">
                {actions.map((act) => {
                  const pred = act.predictedEffect || {};
                  const real = act.realisedEffect || {};
                  const isMeasured = act.status === 'measured';
                  return (
                    <tr key={act.actionId}>
                      <td className="py-1.5 pr-2 text-ink-muted whitespace-nowrap">
                        {fmtClockTime(act.createdAt || act.simTimeAtAction)}
                      </td>
                      <td className="py-1.5 pr-2 font-sans text-ink-primary">
                        <div>{act.params?.controller ? `${act.actionType}: ${act.params.controller}` : act.actionType}</div>
                        <div className="text-[10px] text-ink-muted">{act.actor} ({act.actorRole})</div>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-ink-secondary whitespace-nowrap">
                        {pred.delayDeltaVehSec !== undefined
                          ? `${fmtSigned(pred.delayDeltaVehSec, 1)} veh·s`
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-ink-primary whitespace-nowrap">
                        {isMeasured && real.actualDelaySavedVsBaselineDeltaVehSec !== undefined
                          ? `${fmtSigned(real.actualDelaySavedVsBaselineDeltaVehSec, 1)} veh·s saved`
                          : 'Pending 300s'}
                      </td>
                      <td className="py-1.5">
                        {isMeasured ? (
                          <span className="inline-flex items-center gap-1 text-signal-flow">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>
                              {real.predictionAccuracyPct !== undefined
                                ? `${fmtNum(real.predictionAccuracyPct, 0)}% match`
                                : 'Measured'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-signal-heavy">
                            <Clock className="w-3 h-3" />
                            <span>Tracking</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
