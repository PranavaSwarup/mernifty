const BASE_URL = '';

export async function fetchJson(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = localStorage.getItem('hp_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export const api = {
  fetchJson,
  // Telemetry
  getStats: () => fetchJson('/api/telemetry/stats'),
  getHistory: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/api/telemetry/history?${q}`);
  },
  getAggregate: (deviceId, minutes = 15, bucketSeconds = 10) =>
    fetchJson(`/api/telemetry/aggregate?deviceId=${deviceId}&minutes=${minutes}&bucketSeconds=${bucketSeconds}`),
  ingestEvent: (event) =>
    fetchJson('/api/telemetry/ingest', { method: 'POST', body: JSON.stringify(event) }),
  ingestBatch: (events) =>
    fetchJson('/api/telemetry/batch', { method: 'POST', body: JSON.stringify(events) }),

  // Devices / Junctions
  getDevices: (category) => {
    const q = category ? `?category=${category}` : '';
    return fetchJson(`/api/devices${q}`);
  },
  getDeviceById: (deviceId) => fetchJson(`/api/devices/${deviceId}`),

  // Alerts & Incident Actions
  getAlerts: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/api/alerts?${q}`);
  },
  tagAlertCause: (alertId, cause, note) =>
    fetchJson(`/api/alerts/${alertId}/cause`, { method: 'PATCH', body: JSON.stringify({ cause, note }) }),
  acknowledgeAlert: (alertId) =>
    fetchJson(`/api/alerts/${alertId}/acknowledge`, { method: 'PATCH' }),
  applyAlertAction: (alertId, action, note) =>
    fetchJson(`/api/alerts/${alertId}/action`, { method: 'PATCH', body: JSON.stringify({ action, note }) }),
  overrideAlertAction: (alertId, note) =>
    fetchJson(`/api/alerts/${alertId}/override`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  resolveAlert: (alertId, cause = null, note = '') =>
    fetchJson(`/api/alerts/${alertId}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ cause, note }),
    }),
  clearResolvedAlerts: () => fetchJson('/api/alerts/clear', { method: 'DELETE' }),
  getActionLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/api/alerts/actions/logs?${q}`);
  },

  // Simulator & Scenarios
  getSimulatorStatus: () => fetchJson('/api/simulator/status'),
  startSimulator: (rate = 12) =>
    fetchJson('/api/simulator/start', { method: 'POST', body: JSON.stringify({ rate }) }),
  stopSimulator: () => fetchJson('/api/simulator/stop', { method: 'POST' }),
  setSimulatorRate: (rate) =>
    fetchJson('/api/simulator/rate', { method: 'POST', body: JSON.stringify({ rate }) }),
  triggerBlockage: (params = {}) =>
    fetchJson('/api/simulator/scenario/blockage', { method: 'POST', body: JSON.stringify(params) }),
  triggerRushHour: (params = {}) =>
    fetchJson('/api/simulator/scenario/rush-hour', { method: 'POST', body: JSON.stringify(params) }),
  clearScenarios: (junctionId) =>
    fetchJson('/api/simulator/scenario/clear', { method: 'POST', body: JSON.stringify({ junctionId }) }),
  setRemediationDeadline: (seconds) =>
    fetchJson('/api/simulator/remediation-deadline', { method: 'POST', body: JSON.stringify({ seconds }) }),
  injectChaos: (deviceId, metric, multiplier = 2.5, durationSec = 15) =>
    fetchJson('/api/simulator/chaos', {
      method: 'POST',
      body: JSON.stringify({ deviceId, metric, multiplier, durationSec }),
    }),

  // Auth
  getConfig: () => fetchJson('/api/config'),
  login: (email, password) =>
    fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  demoLogin: (roleKey) =>
    fetchJson('/api/auth/demo-login', { method: 'POST', body: JSON.stringify({ roleKey }) }),
  register: (name, email, password) =>
    fetchJson('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  getMe: () => fetchJson('/api/auth/me'),

  // Corridor (Ambulance Emergency Green Corridor)
  startCorridor: (params = {}) =>
    fetchJson('/api/corridor/start', { method: 'POST', body: JSON.stringify(params) }),
  cancelCorridor: (tripId) =>
    fetchJson('/api/corridor/cancel', { method: 'POST', body: JSON.stringify({ tripId }) }),
  getActiveCorridors: () => fetchJson('/api/corridor/active'),
  getCorridorHistory: () => fetchJson('/api/corridor/history'),

  // Citizen Incident Reports (Section 5.11)
  submitReport: (report) =>
    fetchJson('/api/reports', { method: 'POST', body: JSON.stringify(report) }),
  getReports: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/api/reports?${q}`);
  },
  verifyReport: (reportId) =>
    fetchJson(`/api/reports/${reportId}/verify`, { method: 'PATCH' }),
  dismissReport: (reportId) =>
    fetchJson(`/api/reports/${reportId}/dismiss`, { method: 'PATCH' }),

  // Phase 4: Extras (Clock, Baseline & Replay)
  setClockSpeed: (speed) =>
    fetchJson('/api/simulator/clock-speed', { method: 'POST', body: JSON.stringify({ speed }) }),
  getJunctionBaseline: (junctionId) => fetchJson(`/api/baseline/${junctionId}`),
  getCityDeviations: () => fetchJson('/api/baseline/city/deviations'),
  getReplayableIncidents: () => fetchJson('/api/replay/recent'),
  getAlertReplay: (alertId) => fetchJson(`/api/replay/alert/${alertId}`),
  getCorridorReplay: (tripId) => fetchJson(`/api/replay/corridor/${tripId}`),
};
