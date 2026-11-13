import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import { simulatorService } from './simulatorService.js';
import { socketService } from './socketService.js';

class CopilotService {
  constructor() {
    this.runbooks = {
      'server:cpuPercent': {
        title: 'Dynamic Traffic Shedding & Worker Pool Recycle',
        action: 'shed_load',
        description: 'Throttle batch worker concurrency by 40% and flush Redis caches to drop CPU below 50%.',
        recoveryMetric: { cpuPercent: 48, latencyMs: 28 },
      },
      'server:latencyMs': {
        title: 'BGP Route Failover & Edge CDN Bypass',
        action: 'route_failover',
        description: 'Reroute incoming API traffic to secondary tier-1 edge POP to normalize latency to <35ms.',
        recoveryMetric: { latencyMs: 32, cpuPercent: 50 },
      },
      'fleet:batteryLevel': {
        title: 'Autonomous Eco-Cruise & Auxiliary Shutdown',
        action: 'battery_eco_mode',
        description: 'Restrict electric motor torque, disengage cabin HVAC, and redirect to nearest megawatt charger.',
        recoveryMetric: { batteryLevel: 42, motorTempC: 68 },
      },
      'fleet:motorTempC': {
        title: 'Liquid Glycol Coolant Pump Overdrive',
        action: 'coolant_overdrive',
        description: 'Activate secondary radiator fan and reduce electric motor RPM by 15%.',
        recoveryMetric: { motorTempC: 70, speedKmh: 82 },
      },
      'turbine:vibrationMmS': {
        title: 'Aero-Dynamic Blade Feathering & Rotor Dampening',
        action: 'feather_blades',
        description: 'Pitch wind turbine blades to +4.5 degrees to alleviate mechanical resonance and bearing friction.',
        recoveryMetric: { vibrationMmS: 2.4, oilTempC: 66 },
      },
      'turbine:oilTempC': {
        title: 'Gearbox Oil Heat Exchanger Forced Air Flush',
        action: 'oil_cool_flush',
        description: 'Engage auxiliary cooling heat exchanger to prevent bearing lubrication viscosity breakdown.',
        recoveryMetric: { oilTempC: 68, vibrationMmS: 2.8 },
      },
    };
  }

  async analyzeDevice(deviceId) {
    const device = await Device.findOne({ deviceId }).lean();
    if (!device) return null;

    const activeAlerts = await Alert.find({ deviceId, resolved: false }).sort({ timestamp: -1 }).lean();
    const metrics = device.lastMetrics || {};

    const findings = [];

    // Analyze based on category and metrics
    if (device.category === 'server') {
      if ((metrics.cpuPercent > 80 || activeAlerts.some((a) => a.metric === 'cpuPercent'))) {
        findings.push({
          id: 'FIND-SRV-01',
          rule: 'High CPU Saturation & Thermal Correlation',
          severity: 'critical',
          confidence: 96,
          rootCause: 'Continuous ingestion batch spike saturating thread pool event loop.',
          impact: 'Elevated request latency and threat of connection drops.',
          runbook: this.runbooks['server:cpuPercent'],
        });
      }
      if (metrics.latencyMs > 200 || activeAlerts.some((a) => a.metric === 'latencyMs')) {
        findings.push({
          id: 'FIND-SRV-02',
          rule: 'Edge Gateway Latency Degradation',
          severity: 'warning',
          confidence: 88,
          rootCause: 'Trans-Atlantic transit BGP route flapping causing buffer bloat.',
          impact: 'P99 latency exceeding 500ms SLA threshold.',
          runbook: this.runbooks['server:latencyMs'],
        });
      }
    } else if (device.category === 'fleet') {
      if (metrics.batteryLevel < 20 || activeAlerts.some((a) => a.metric === 'batteryLevel')) {
        findings.push({
          id: 'FIND-FLT-01',
          rule: 'Rapid State-of-Charge Depletion Under Heavy Payload',
          severity: 'critical',
          confidence: 94,
          rootCause: 'Steep grade incline with maximum cargo load causing elevated discharge rate.',
          impact: 'Vehicle immobilized if charging station range window missed.',
          runbook: this.runbooks['fleet:batteryLevel'],
        });
      }
      if (metrics.motorTempC > 85 || activeAlerts.some((a) => a.metric === 'motorTempC')) {
        findings.push({
          id: 'FIND-FLT-02',
          rule: 'Inverter Stator Thermal Throttling',
          severity: 'warning',
          confidence: 91,
          rootCause: 'High ambient temperature coupled with continuous high-torque towing.',
          impact: 'Automatic torque derating imminent.',
          runbook: this.runbooks['fleet:motorTempC'],
        });
      }
    } else if (device.category === 'turbine') {
      if (metrics.vibrationMmS > 5.0 || activeAlerts.some((a) => a.metric === 'vibrationMmS')) {
        findings.push({
          id: 'FIND-TRB-01',
          rule: 'Harmonic Resonance & Main Bearing Stress',
          severity: 'critical',
          confidence: 98,
          rootCause: 'Turbulent wind shear matching resonant blade frequency.',
          impact: 'High risk of micro-fracturing in gearbox planetary gears.',
          runbook: this.runbooks['turbine:vibrationMmS'],
        });
      }
    }

    // Default nominal status if no severe anomalies
    if (findings.length === 0) {
      findings.push({
        id: 'FIND-NOM-00',
        rule: 'Continuous Statistical Baseline Nominal',
        severity: 'info',
        confidence: 99,
        rootCause: 'All telemetry variables tracking within +/- 1.8 sigma normal Gaussian distribution.',
        impact: 'Full operational capacity.',
        runbook: null,
      });
    }

    return {
      deviceId,
      deviceName: device.name,
      category: device.category,
      healthScore: device.healthScore,
      activeAlertsCount: activeAlerts.length,
      currentMetrics: metrics,
      findings,
      timestamp: new Date().toISOString(),
    };
  }

  async executeRunbook(deviceId, action) {
    // 1. Reset chaos spikes if any on simulator
    simulatorService.chaosSpikes.delete(deviceId);

    // 2. Resolve active alerts for this device
    await Alert.updateMany(
      { deviceId, resolved: false },
      { $set: { resolved: true, resolvedAt: new Date(), resolvedBy: 'AI Copilot Runbook' } }
    );

    // 3. Restore device health score in DB
    const updatedDevice = await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          status: 'online',
          healthScore: 98,
        },
      },
      { new: true }
    );

    // 4. Update simulated device baseMetrics to nominal
    const simDev = simulatorService.devices.find((d) => d.deviceId === deviceId);
    if (simDev) {
      if (simDev.category === 'server') {
        simDev.baseMetrics.cpuPercent = 48;
        simDev.baseMetrics.latencyMs = 28;
      } else if (simDev.category === 'fleet') {
        simDev.baseMetrics.batteryLevel = 65;
        simDev.baseMetrics.motorTempC = 68;
      } else if (simDev.category === 'turbine') {
        simDev.baseMetrics.vibrationMmS = 2.4;
        simDev.baseMetrics.oilTempC = 66;
      }
    }

    // 5. Broadcast resolution to all clients
    socketService.broadcastDeviceStatus({
      deviceId,
      status: 'online',
      healthScore: 98,
      remediatedBy: action,
    });

    return {
      success: true,
      deviceId,
      action,
      message: `Automated runbook '${action}' executed successfully. Metrics normalized and alerts resolved.`,
      device: updatedDevice,
    };
  }
}

export const copilotService = new CopilotService();
