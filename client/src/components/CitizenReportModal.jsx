import React, { useState } from 'react';
import { X, Send, AlertTriangle, MapPin, CheckCircle, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export function CitizenReportModal({ isOpen, onClose, defaultJunctionId = null }) {
  const { user } = useAuth();
  const [category, setCategory] = useState('accident');
  const [junctionId, setJunctionId] = useState(defaultJunctionId || 'JNC-BLR-001');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const junctions = [
    { id: 'JNC-BLR-001', name: 'Silk Board Junction (Hosur Rd & ORR)' },
    { id: 'JNC-BLR-002', name: 'Sony World Signal (Koramangala)' },
    { id: 'JNC-BLR-003', name: 'Dairy Circle (Bannerghatta)' },
    { id: 'JNC-BLR-004', name: 'Jayadeva Underpass (Bannerghatta & ORR)' },
    { id: 'JNC-BLR-005', name: 'Bellandur EcoSpace Junction (ORR)' },
    { id: 'JNC-BLR-006', name: 'Tin Factory / KR Puram' },
    { id: 'JNC-BLR-007', name: 'Marathahalli Bridge Junction' },
    { id: 'JNC-BLR-008', name: 'Hebbal Flyover Junction' },
    { id: 'JNC-BLR-009', name: 'Goraguntepalya Junction' },
    { id: 'JNC-BLR-010', name: 'Mekhri Circle Underpass' },
    { id: 'JNC-BLR-011', name: 'Richmond Circle Flyover' },
    { id: 'JNC-BLR-012', name: 'Town Hall / Corporation Circle' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await api.submitReport({
        category,
        junctionId,
        note: note.trim(),
      });

      setSubmitSuccess(res.report);
      setTimeout(() => {
        setSubmitSuccess(null);
        setNote('');
        onClose();
      }, 2500);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit incident report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0B101D] border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">Report Traffic Incident</h3>
              <p className="text-[11px] text-slate-400">
                Sensors detect what; Bengaluru citizens tell us why.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-white">Incident Report Filed!</h4>
            <p className="text-xs text-slate-400">
              Dispatched live to zone officers. Status: <span className="font-mono text-emerald-400 font-bold">{submitSuccess.status}</span>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Incident Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="accident">Accident / Collision</option>
                <option value="road_blocked">Road Blocked / Stalled Obstacle</option>
                <option value="waterlogging">Waterlogging</option>
                <option value="signal_not_working">Traffic Signal Malfunction</option>
                <option value="construction">Construction / Roadworks</option>
                <option value="other">Other Arterial Delay</option>
              </select>
            </div>

            {/* Junction */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                Nearest Monitored Junction
              </label>
              <select
                value={junctionId}
                onChange={(e) => setJunctionId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {junctions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Note <span className="text-[10px] text-slate-500 font-normal">(optional, max 200 chars)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="e.g. Broken down bus blocking middle arterial lane near Hosur road flyover entry..."
                rows={3}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
              <div className="text-right text-[10px] text-slate-500 mt-0.5">
                {note.length} / 200 chars
              </div>
            </div>

            {/* Privacy Guarantee Note */}
            <p className="text-[10px] text-slate-500 italic">
              🔒 Privacy Protected: Your personal identity and email are never broadcast or shared with other citizens or officers.
            </p>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Filing Incident...' : 'Submit Citizen Report'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
