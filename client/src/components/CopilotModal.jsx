import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertTriangle, ShieldCheck, Wrench, CheckCircle2, Play, RefreshCw, Cpu } from 'lucide-react';
import { api } from '../services/api';

export function CopilotModal({ device, onClose, onRemediated }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [remediationResult, setRemediationResult] = useState(null);

  const fetchDiagnosis = async () => {
    if (!device) return;
    setIsLoading(true);
    setRemediationResult(null);
    try {
      const res = await api.fetchJson(`/api/copilot/diagnose/${device.deviceId}`);
      if (res.diagnosis) {
        setDiagnosis(res.diagnosis);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnosis();
  }, [device]);

  const handleExecuteRunbook = async (action) => {
    setIsExecuting(true);
    try {
      const res = await api.fetchJson('/api/copilot/remediate', {
        method: 'POST',
        body: JSON.stringify({ deviceId: device.deviceId, action }),
      });
      setRemediationResult(res);
      if (onRemediated) onRemediated(res);
      // Re-run diagnosis to show normalized status
      setTimeout(() => fetchDiagnosis(), 1200);
    } catch (err) {
      console.error(err);
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
                <h3 className="font-bold text-base text-slate-100">AI Telemetry Diagnostics Copilot</h3>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Automated Root Cause
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Asset: <span className="text-slate-200 font-semibold">{device.name}</span> ({device.deviceId})
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
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
              <span>Analyzing cross-metric correlation matrix...</span>
            </div>
          ) : !diagnosis ? (
            <div className="text-slate-400 text-xs py-8 text-center">Unable to load diagnosis.</div>
          ) : (
            <>
              {/* Remediation Success Banner */}
              {remediationResult && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                  <div>
                    <div className="font-bold">Runbook Execution Successful!</div>
                    <div className="text-[11px] text-slate-300">{remediationResult.message}</div>
                  </div>
                </div>
              )}

              {/* Status Overview Card */}
              <div className="grid grid-cols-3 gap-2.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">ASSET HEALTH</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {diagnosis.healthScore}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">ACTIVE ANOMALIES</span>
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    {diagnosis.activeAlertsCount}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">CONFIDENCE</span>
                  <span className="font-mono font-bold text-purple-400 text-sm">
                    {diagnosis.findings[0]?.confidence || 95}%
                  </span>
                </div>
              </div>

              {/* Findings */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Root Cause Diagnostics
                </span>

                {diagnosis.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <AlertTriangle
                          className={`w-4 h-4 ${
                            finding.severity === 'critical'
                              ? 'text-rose-400'
                              : finding.severity === 'warning'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        />
                        {finding.rule}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                        Confidence: {finding.confidence}%
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-slate-400">Probable Root Cause:</strong>{' '}
                      {finding.rootCause}
                    </p>

                    <p className="text-[11px] text-slate-400">
                      <strong className="text-slate-500">System Impact:</strong> {finding.impact}
                    </p>

                    {/* Runbook Action */}
                    {finding.runbook && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-950/20 p-3 rounded-lg border border-purple-900/30">
                        <div>
                          <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-purple-400" />
                            {finding.runbook.title}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {finding.runbook.description}
                          </p>
                        </div>

                        <button
                          onClick={() => handleExecuteRunbook(finding.runbook.action)}
                          disabled={isExecuting}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors shadow-sm flex-shrink-0"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{isExecuting ? 'Executing...' : 'Execute Runbook'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
