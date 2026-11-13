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

  // Devices
  getDevices: (category) => {
    const q = category ? `?category=${category}` : '';
    return fetchJson(`/api/devices${q}`);
  },
  getDeviceById: (deviceId) => fetchJson(`/api/devices/${deviceId}`),

  // Alerts
  getAlerts: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/api/alerts?${q}`);
  },
  resolveAlert: (alertId, resolvedBy = 'operator') =>
    fetchJson(`/api/alerts/${alertId}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ resolvedBy }),
    }),
  clearResolvedAlerts: () => fetchJson('/api/alerts/clear', { method: 'DELETE' }),

  // Simulator
  getSimulatorStatus: () => fetchJson('/api/simulator/status'),
  startSimulator: (rate = 10) =>
    fetchJson('/api/simulator/start', { method: 'POST', body: JSON.stringify({ rate }) }),
  stopSimulator: () => fetchJson('/api/simulator/stop', { method: 'POST' }),
  setSimulatorRate: (rate) =>
    fetchJson('/api/simulator/rate', { method: 'POST', body: JSON.stringify({ rate }) }),
  injectChaos: (deviceId, metric, multiplier = 2.5, durationSec = 15) =>
    fetchJson('/api/simulator/chaos', {
      method: 'POST',
      body: JSON.stringify({ deviceId, metric, multiplier, durationSec }),
    }),

  // Auth
  login: (email, password) =>
    fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getMe: () => fetchJson('/api/auth/me'),
};
