const BASE_URL = '';

export class ApiError extends Error {
  constructor(message, { status = 500, code = null, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

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
    const rawMsg = errorData.error || errorData.message || `${response.status} ${response.statusText}`;

    let friendlyMsg = rawMsg;
    if (response.status === 401) {
      friendlyMsg = `401 Unauthorized: ${rawMsg}`;
    } else if (response.status === 403) {
      friendlyMsg = `403 Forbidden: ${rawMsg}`;
    }

    throw new ApiError(friendlyMsg, {
      status: response.status,
      code: errorData.code || null,
      details: errorData.details || null,
    });
  }
  return response.json();
}

export const api = {
  fetchJson,
  // Telemetry
  getStats: () => fetchJson('/api/telemetry/stats'),
  getIntegrity: () => fetchJson('/api/telemetry/integrity'),
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

  // Simulator & Twin Control
  getSimulatorStatus: () => fetchJson('/api/simulator/status'),
  getSimState: () => fetchJson('/api/sim/state'),
  startSimulator: (rate = 24) =>
    fetchJson('/api/simulator/start', { method: 'POST', body: JSON.stringify({ rate }) }),
  stopSimulator: () => fetchJson('/api/simulator/stop', { method: 'POST' }),
  setSimulatorRate: (rate) =>
    fetchJson('/api/simulator/rate', { method: 'POST', body: JSON.stringify({ rate }) }),
  setController: (junctionId, controller) =>
    fetchJson('/api/sim/controller', {
      method: 'POST',
      body: JSON.stringify({ junctionId, controller }),
    }),
  injectChaos: (junctionId, metric, multiplier = 2.5, durationSec = 15, flags = {}) =>
    fetchJson('/api/simulator/chaos', {
      method: 'POST',
      body: JSON.stringify({ junctionId, deviceId: junctionId, metric, multiplier, durationSec, flags }),
    }),

  // Copilot
  diagnose: (deviceId) => fetchJson(`/api/copilot/diagnose/${deviceId}`),
  remediate: (payload) =>
    fetchJson('/api/copilot/remediate', { method: 'POST', body: JSON.stringify(payload) }),

  // Auth
  login: (email, password) =>
    fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  demoLogin: (persona) =>
    fetchJson('/api/auth/demo-login', { method: 'POST', body: JSON.stringify({ persona }) }),
  getMe: () => fetchJson('/api/auth/me'),
};
