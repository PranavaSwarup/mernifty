import crypto from 'crypto';
import { ingestionBuffer } from './ingestionBuffer.js';
import { anomalyEngine } from './anomalyEngine.js';
import { socketService } from './socketService.js';
import { metricsService } from './metricsService.js';

// Predefined device definitions
export const INITIAL_DEVICES = [
  // 1. Edge Servers
  {
    deviceId: 'srv-us-east-prod',
    name: 'US-East Production Gateway',
    category: 'server',
    region: 'us-east-1 (N. Virginia)',
    baseMetrics: { cpuPercent: 52, memoryPercent: 68, latencyMs: 32, networkRxMbps: 450, networkTxMbps: 680, temperatureC: 62, errorRate: 0.2 },
    location: { latitude: 39.0438, longitude: -77.4874, label: 'Ashburn Data Center' },
  },
  {
    deviceId: 'srv-eu-west-db',
    name: 'EU-West Primary Database Cluster',
    category: 'server',
    region: 'eu-west-1 (Ireland)',
    baseMetrics: { cpuPercent: 64, memoryPercent: 82, latencyMs: 45, networkRxMbps: 380, networkTxMbps: 520, temperatureC: 71, errorRate: 0.5 },
    location: { latitude: 53.3498, longitude: -6.2603, label: 'Dublin Cloud Campus' },
  },
  {
    deviceId: 'srv-ap-south-edge',
    name: 'AP-South API Acceleration Edge',
    category: 'server',
    region: 'ap-south-1 (Mumbai)',
    baseMetrics: { cpuPercent: 44, memoryPercent: 58, latencyMs: 58, networkRxMbps: 290, networkTxMbps: 360, temperatureC: 66, errorRate: 0.1 },
    location: { latitude: 19.076, longitude: 72.8777, label: 'Mumbai Edge POP' },
  },
  {
    deviceId: 'srv-sa-east-core',
    name: 'SA-East Telemetry Collector',
    category: 'server',
    region: 'sa-east-1 (São Paulo)',
    baseMetrics: { cpuPercent: 38, memoryPercent: 51, latencyMs: 65, networkRxMbps: 180, networkTxMbps: 240, temperatureC: 59, errorRate: 0.05 },
    location: { latitude: -23.5505, longitude: -46.6333, label: 'São Paulo DC' },
  },

  // 2. Logistics Fleet
  {
    deviceId: 'fleet-ev-01',
    name: 'Freightliner eCascadia #101',
    category: 'fleet',
    region: 'I-5 Pacific Corridor',
    baseMetrics: { speedKmh: 88, batteryLevel: 74, motorTempC: 72, tirePressurePsi: 34, headingDeg: 180, cargoWeightKg: 18500 },
    location: { latitude: 36.7783, longitude: -119.4179, label: 'Fresno Transit' },
    route: [
      { lat: 37.7749, lng: -122.4194 },
      { lat: 36.7783, lng: -119.4179 },
      { lat: 35.3733, lng: -119.0187 },
      { lat: 34.0522, lng: -118.2437 },
    ],
  },
  {
    deviceId: 'fleet-ev-02',
    name: 'Tesla Semi Long-Haul #204',
    category: 'fleet',
    region: 'I-80 Midwest Route',
    baseMetrics: { speedKmh: 95, batteryLevel: 82, motorTempC: 68, tirePressurePsi: 35, headingDeg: 90, cargoWeightKg: 22000 },
    location: { latitude: 41.8781, longitude: -87.6298, label: 'Chicago Express' },
    route: [
      { lat: 41.5868, lng: -93.625 },
      { lat: 41.8781, lng: -87.6298 },
      { lat: 41.4993, lng: -81.6944 },
    ],
  },
  {
    deviceId: 'fleet-ev-03',
    name: 'Volvo VNR Electric #312',
    category: 'fleet',
    region: 'I-95 Northeast Corridor',
    baseMetrics: { speedKmh: 78, batteryLevel: 61, motorTempC: 75, tirePressurePsi: 33, headingDeg: 45, cargoWeightKg: 14200 },
    location: { latitude: 40.7128, longitude: -74.006, label: 'New Jersey Turnpike' },
    route: [
      { lat: 38.9072, lng: -77.0369 },
      { lat: 39.9526, lng: -75.1652 },
      { lat: 40.7128, lng: -74.006 },
      { lat: 42.3601, lng: -71.0589 },
    ],
  },
  {
    deviceId: 'fleet-ev-04',
    name: 'BYD Class 8 Hauler #405',
    category: 'fleet',
    region: 'Texas Triangle Route',
    baseMetrics: { speedKmh: 92, batteryLevel: 69, motorTempC: 76, tirePressurePsi: 35, headingDeg: 120, cargoWeightKg: 19800 },
    location: { latitude: 30.2672, longitude: -97.7431, label: 'Austin Metro' },
    route: [
      { lat: 32.7767, lng: -96.797 },
      { lat: 30.2672, lng: -97.7431 },
      { lat: 29.7604, lng: -95.3698 },
    ],
  },

  // 3. Renewable Turbines & Energy
  {
    deviceId: 'turbine-wind-01',
    name: 'Vestas V164 Offshore Unit A1',
    category: 'turbine',
    region: 'North Sea Wind Array',
    baseMetrics: { powerOutputMw: 4.2, vibrationMmS: 2.8, rotorRpm: 15.4, oilTempC: 68, windSpeedMs: 12.4, gridFrequencyHz: 50.01, voltageKv: 33.1 },
    location: { latitude: 54.0, longitude: 2.5, label: 'North Sea Field Alpha' },
  },
  {
    deviceId: 'turbine-wind-02',
    name: 'Vestas V164 Offshore Unit A2',
    category: 'turbine',
    region: 'North Sea Wind Array',
    baseMetrics: { powerOutputMw: 4.6, vibrationMmS: 3.2, rotorRpm: 16.1, oilTempC: 72, windSpeedMs: 13.1, gridFrequencyHz: 49.99, voltageKv: 33.0 },
    location: { latitude: 54.05, longitude: 2.55, label: 'North Sea Field Beta' },
  },
  {
    deviceId: 'turbine-hydro-03',
    name: 'Francis Turbine Generator #3',
    category: 'turbine',
    region: 'Columbia River Basin',
    baseMetrics: { powerOutputMw: 7.8, vibrationMmS: 1.9, rotorRpm: 180.0, oilTempC: 56, windSpeedMs: 0, gridFrequencyHz: 60.01, voltageKv: 13.8 },
    location: { latitude: 45.6453, longitude: -121.9525, label: 'Bonneville Hydro Power' },
  },
  {
    deviceId: 'turbine-solar-04',
    name: 'Mojave Concentrated Solar Gen-2',
    category: 'turbine',
    region: 'Mojave Desert Facility',
    baseMetrics: { powerOutputMw: 5.1, vibrationMmS: 0.8, rotorRpm: 0, oilTempC: 62, windSpeedMs: 4.2, gridFrequencyHz: 60.0, voltageKv: 24.5 },
    location: { latitude: 35.3128, longitude: -115.4735, label: 'Ivanpah Solar Complex' },
  },
];

class SimulatorService {
  constructor() {
    this.devices = JSON.parse(JSON.stringify(INITIAL_DEVICES));
    this.isRunning = false;
    this.intervalId = null;
    this.targetRate = 10; // events per second
    this.sequenceMap = new Map();
    this.chaosSpikes = new Map(); // deviceId -> { metric, multiplier, expiresAt }
  }

  start(rate = 10) {
    if (this.isRunning) {
      this.stop();
    }
    this.targetRate = Math.max(1, Math.min(2000, rate));
    this.isRunning = true;

    // Determine interval in ms between ticks
    // If targetRate is 20, tick every 50ms with 1 event.
    // If targetRate is 200, tick every 50ms with 10 events.
    const tickMs = 100;
    const eventsPerTick = Math.max(1, Math.round((this.targetRate * tickMs) / 1000));

    this.intervalId = setInterval(() => {
      this.generateTick(eventsPerTick);
    }, tickMs);

    console.log(`[Simulator] Started with target rate: ${this.targetRate} events/sec (${eventsPerTick} events every ${tickMs}ms).`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Simulator] Stopped.');
  }

  setRate(rate) {
    this.start(rate);
  }

  injectChaos(deviceId, metric, multiplier = 2.5, durationSec = 15) {
    this.chaosSpikes.set(deviceId, {
      metric,
      multiplier,
      expiresAt: Date.now() + durationSec * 1000,
    });
    console.log(`[Simulator] Injected chaos on ${deviceId}: ${metric} x${multiplier} for ${durationSec}s`);
    return { success: true, message: `Chaos injected: ${metric} spike on ${deviceId} for ${durationSec}s` };
  }

  generateTick(count = 1) {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      // Pick random or round-robin device
      const devIndex = Math.floor(Math.random() * this.devices.length);
      const dev = this.devices[devIndex];

      const seq = (this.sequenceMap.get(dev.deviceId) || 0) + 1;
      this.sequenceMap.set(dev.deviceId, seq);

      // Generate fluctuating metrics
      const metrics = this.computeNextMetrics(dev, now);

      // Jitter location slightly for fleet vehicles to show live movement
      if (dev.category === 'fleet' && dev.location) {
        dev.location.latitude += (Math.random() - 0.495) * 0.003;
        dev.location.longitude += (Math.random() - 0.495) * 0.003;
      }

      const event = {
        eventId: `EVT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        deviceId: dev.deviceId,
        deviceName: dev.name,
        category: dev.category,
        timestamp: new Date().toISOString(),
        sequence: seq,
        metrics,
        status: this.determineStatus(dev, metrics),
        location: dev.location,
      };

      // Measure processing latency
      const startT = Date.now();

      // 1. Pass to write-behind ingestion buffer
      ingestionBuffer.enqueue(event);

      // 2. Pass to anomaly detection engine
      anomalyEngine.evaluate(event);

      // 3. Broadcast to Socket.IO clients
      socketService.broadcastTelemetry(event);

      const latency = Date.now() - startT;
      metricsService.recordIngest(1, latency);
    }
  }

  computeNextMetrics(dev, now) {
    const next = {};
    const base = dev.baseMetrics;
    const chaos = this.chaosSpikes.get(dev.deviceId);
    const hasActiveChaos = chaos && chaos.expiresAt > now;

    for (const [key, val] of Object.entries(base)) {
      // Natural harmonic variation (-3% to +3%)
      let jitter = (Math.random() - 0.5) * 0.06 * val;
      if (Math.abs(jitter) < 0.1) jitter = (Math.random() - 0.5) * 0.5;

      let computed = parseFloat((val + jitter).toFixed(2));

      // Apply chaos spike if active
      if (hasActiveChaos && chaos.metric === key) {
        computed = parseFloat((computed * chaos.multiplier).toFixed(2));
      }

      // Keep within bounds
      if (key.includes('Percent')) {
        computed = Math.min(100, Math.max(0, computed));
      } else if (key === 'batteryLevel') {
        // Slowly drain battery
        base.batteryLevel = Math.max(8, base.batteryLevel - 0.002);
        computed = parseFloat(base.batteryLevel.toFixed(1));
        if (hasActiveChaos && chaos.metric === 'batteryLevel') {
          computed = 9.5; // Critical low battery
        }
      }

      next[key] = computed;
    }

    return next;
  }

  determineStatus(dev, metrics) {
    if (dev.category === 'server') {
      if (metrics.cpuPercent > 92 || metrics.memoryPercent > 94 || metrics.latencyMs > 500) return 'critical';
      if (metrics.cpuPercent > 80 || metrics.memoryPercent > 85) return 'warning';
    } else if (dev.category === 'fleet') {
      if (metrics.speedKmh > 125 || metrics.batteryLevel < 12) return 'critical';
      if (metrics.speedKmh > 105 || metrics.batteryLevel < 22) return 'warning';
    } else if (dev.category === 'turbine') {
      if (metrics.vibrationMmS > 7.0 || metrics.oilTempC > 90) return 'critical';
      if (metrics.vibrationMmS > 5.0 || metrics.oilTempC > 80) return 'warning';
    }
    return 'healthy';
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      targetRate: this.targetRate,
      deviceCount: this.devices.length,
      activeChaosCount: Array.from(this.chaosSpikes.values()).filter((c) => c.expiresAt > Date.now()).length,
    };
  }
}

export const simulatorService = new SimulatorService();
