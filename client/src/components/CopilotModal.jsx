import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertTriangle, ShieldCheck, Wrench, CheckCircle2, Play, RefreshCw, Navigation } from 'lucide-react';
import { api } from '../services/api';

export function CopilotModal({ device, onClose, onRemediated }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [remediationResult, setRemediationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchDiagnosis = async () => {
    if (!device) return;
    setIsLoading(true);
    setErrorMsg('');
    setRemediationResult(null);
    try {
      const res = await api.diagnose(device.deviceId);
      if (res.diagnosis) {
        setDiagnosis(res.diagnosis);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load traffic diagnosis');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnosis();
  }, [device]);

  const handleExecuteRunbook = async (runbookOrAction) => {
    const action = typeof runbookOrAction === 'string' ? runbookOrAction : runbookOrAction?.action;
    const params = typeof runbookOrAction === 'object' ? runbookOrAction?.params : undefined;
    setIsExecuting(true);
    setErrorMsg('');
    try {
      const res = await api.remediate({
        deviceId: device.deviceId,
        action,
        ...(params ? { params } : {}),
      });
      setRemediationResult(res);
      if (onRemediated) onRemediated(res);
      setTimeout(() => fetchDiagnosis(), 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to execute remediation runbook');
    } finally {
      setIsExecuting(false);
    }
  };

  if (!device) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#0B101D] border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-100">AI Traffic Diagnostics Copilot</h3>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Adaptive Signal Optimization
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Junction: <span className="text-slate-200 font-semibold">{device.name}</span> ({device.deviceId})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[75vh] space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono">
              {errorMsg}
            </div>
          )}
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
              <span>Analyzing cross-approach queue correlation matrix...</span>
            </div>
          ) : !diagnosis ? (
            <div className="text-slate-400 text-xs py-8 text-center">Unable to load traffic diagnosis.</div>
          ) : (
            <>
              {/* Remediation Success Banner */}
              {remediationResult && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                  <div>
                    <div className="font-bold">Autonomous Traffic Runbook Dispatched!</div>
                    <div className="text-[11px] text-slate-300">{remediationResult.message}</div>
                  </div>
                </div>
              )}

              {/* Status & Health Header */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400">Junction Status:</span>
                  <span className="ml-1.5 font-bold uppercase text-slate-200">{diagnosis.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Flow Efficiency Score:</span>
                  <span
                    className={`font-mono font-bold ${
                      diagnosis.healthScore > 80
                        ? 'text-emerald-400'
                        : diagnosis.healthScore > 50
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {diagnosis.healthScore}/100
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Active Alerts:</span>
                  <span className="ml-1.5 font-mono font-bold text-slate-200">
                    {diagnosis.activeAlertsCount}
                  </span>
                </div>
              </div>

              {/* Findings & Recommended Actions */}
              {diagnosis.findings.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-slate-900/30 border border-slate-800/80">
                  <ShieldCheck className="w-8 h-8 mx-auto text-emerald-400 mb-2 opacity-80" />
                  <h4 className="font-bold text-sm text-slate-200">Optimal Traffic Flow</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    All approach queues are balanced within target green split windows. No vehicle stalls or emergency preemption requests detected.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Identified Bottlenecks & Automated Runbooks ({diagnosis.findings.length})</span>
                  </div>

                  {diagnosis.findings.map((f) => (
                    <div
                      key={f.id}
                      className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-slate-100">{f.rule}</h4>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                                f.severity === 'critical'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {f.severity}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                            Confidence: {f.confidence}% ({f.rolloutsRatio || `${f.improvedRollouts ?? 0}/${f.rolloutsCount ?? 8}`} rollouts improved) • Evidence: {f.evidenceScore ?? f.confidence}/100
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-[10px] text-slate-500 font-bold block uppercase mb-1">
                            Root Cause
                          </span>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{f.rootCause}</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-[10px] text-slate-500 font-bold block uppercase mb-1">
                            Corridor Impact
                          </span>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{f.impact}</p>
                        </div>
                      </div>

                      {/* Remediation Runbook Action Box */}
                      {f.runbook && (
                        <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                              <Wrench className="w-3.5 h-3.5 text-purple-400" />
                              <span>{f.runbook.title}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 max-w-md">
                              {f.runbook.description}
                            </p>
                          </div>

                          <button
                            onClick={() => handleExecuteRunbook(f.runbook)}
                            disabled={isExecuting}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors shadow-md shadow-purple-600/30 disabled:opacity-50 whitespace-nowrap self-start sm:self-auto"
                          >
                            {isExecuting ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            <span>Deploy Runbook</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
