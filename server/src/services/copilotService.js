import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import { simulatorService } from './simulatorService.js';
import { socketService } from './socketService.js';

class CopilotService {
  constructor() {
    this.runbooks = {
      'traffic:maxQueueLengthM': {
        title: 'Adaptive Dynamic Green Split Optimization',
        action: 'adaptive_green_split',
        description: 'Dynamically reallocate +25s of green phase split to the saturated approach and synchronize downstream signals.',
        recoveryMetric: { maxQueueLengthM: 45, avgSpeedKmph: 24, congestionScore: 28 },
      },
      'traffic:stalledVehicle': {
        title: 'BTP Rapid Incident Tow Crane Dispatch',
        action: 'dispatch_tow_incident',
        description: 'Dispatch nearest Bengaluru Traffic Police (BTP) towing unit and post Lane 1 Obstacle Warning on upstream electronic VMS boards.',
        recoveryMetric: { stalledVehicleDetected: false, maxQueueLengthM: 55, avgSpeedKmph: 22 },
      },
      'traffic:ambulancePreemption': {
        title: 'Automated Emergency Green Wave Corridor',
        action: 'emergency_green_corridor',
        description: 'Force all intersecting cross-arterials to RED and trigger an uninterrupted green corridor wave for the emergency responder.',
        recoveryMetric: { ambulanceDetected: false, avgSpeedKmph: 28, maxQueueLengthM: 50 },
      },
      'traffic:avgSpeedKmph': {
        title: 'Upstream Electronic Signage Diversion (VMS)',
        action: 'upstream_diversion',
        description: 'Publish arterial diversion advisory on electronic display boards 1km upstream to siphon 35% of traffic onto outer bypass corridors.',
        recoveryMetric: { avgSpeedKmph: 22, maxQueueLengthM: 60, congestionScore: 35 },
      },
    };
  }

  async analyzeDevice(deviceId) {
    const device = await Device.findOne({ deviceId }).lean();
    if (!device) return null;

    const activeAlerts = await Alert.find({ deviceId, resolved: false }).sort({ timestamp: -1 }).lean();
    const metrics = device.lastMetrics || {};
    const data = device.lastData || {};

    const findings = [];

    // 1. Stalled Vehicle Finding
    if (metrics.stalledVehicleDetected || data.stalledVehicleDetected || activeAlerts.some((a) => a.metric === 'stalledVehicle')) {
      findings.push({
        id: 'FIND-TRF-STALL',
        rule: 'Vision Obstacle Detection: Stalled Vehicle on Arterial',
        severity: 'critical',
        confidence: 98,
        rootCause: 'Camera optical flow and YOLO vision stream identified an immobilized vehicle blocking travel lanes.',
        impact: 'Loss of 50% corridor capacity; rapid upstream queue shockwave building at 80m/min.',
        runbook: this.runbooks['traffic:stalledVehicle'],
      });
    }

    // 2. Emergency Preemption Finding
    if (metrics.ambulanceDetected || data.ambulanceDetected || activeAlerts.some((a) => a.metric === 'ambulancePreemption')) {
      findings.push({
        id: 'FIND-TRF-AMB',
        rule: 'Emergency Responder Inbound: Green Wave Preemption Required',
        severity: 'critical',
        confidence: 99,
        rootCause: 'Ambulance acoustic/beacon sensor triggered corridor alert approaching junction.',
        impact: 'Emergency transit delay without preemptive signal priority clearance.',
        runbook: this.runbooks['traffic:ambulancePreemption'],
      });
    }

    // 3. Gridlock / High Queue Finding
    if (metrics.maxQueueLengthM > 120 || activeAlerts.some((a) => a.metric === 'maxQueueLengthM')) {
      findings.push({
        id: 'FIND-TRF-QUEUE',
        rule: 'Arterial Saturation & Green Time Starvation',
        severity: metrics.maxQueueLengthM > 160 ? 'critical' : 'warning',
        confidence: 94,
        rootCause: `Heavy volume spillover on critical approach with fixed timer green split insufficient for peak demand.`,
        impact: `Spillback will choke upstream feeder corridors within 4 minutes.`,
        runbook: this.runbooks['traffic:maxQueueLengthM'],
      });
    }

    // 4. Low Speed / Congestion
    if (metrics.avgSpeedKmph < 10 || activeAlerts.some((a) => a.metric === 'avgSpeedKmph')) {
      findings.push({
        id: 'FIND-TRF-SPEED',
        rule: 'Severe Corridor Velocity Degradation',
        severity: 'warning',
        confidence: 89,
        rootCause: 'Corridor density exceeding critical threshold ($K > K_{crit}$), triggering stop-and-go bottleneck wave.',
        impact: 'Commuter transit time inflated by 350%; localized idling emissions surge.',
        runbook: this.runbooks['traffic:avgSpeedKmph'],
      });
    }

    return {
      deviceId,
      deviceName: device.name,
      zoneId: device.zoneId,
      status: device.status,
      healthScore: device.healthScore,
      activeAlertsCount: activeAlerts.length,
      findings,
      timestamp: new Date(),
    };
  }

  async executeRemediation(deviceId, action) {
    const device = await Device.findOne({ deviceId });
    if (!device) throw new Error('Junction node not found');

    // Find runbook
    const runbookEntry = Object.values(this.runbooks).find((r) => r.action === action);
    if (!runbookEntry) throw new Error(`Unknown runbook action: ${action}`);

    // Clear active chaos on simulator
    simulatorService.clearChaos(deviceId);

    // Apply recovered metrics to device
    const recoveryMetrics = {
      ...(device.lastMetrics || {}),
      ...runbookEntry.recoveryMetric,
    };

    const recoveryData = {
      ...(device.lastData || {}),
      ...runbookEntry.recoveryMetric,
      stalledVehicleDetected: false,
      ambulanceDetected: false,
    };

    // If approaches exist, normalize them
    if (Array.isArray(device.approaches)) {
      device.approaches = device.approaches.map((app) => ({
        ...app,
        queueLengthM: Math.min(app.queueLengthM, 45),
        avgSpeedKmph: Math.max(app.avgSpeedKmph, 22),
      }));
      recoveryData.approaches = device.approaches;
    }

    // Update Device document
    device.status = 'online';
    device.healthScore = Math.min(100, (device.healthScore || 80) + 30);
    device.lastMetrics = recoveryMetrics;
    device.lastData = recoveryData;
    device.stalledVehicleDetected = false;
    device.ambulanceDetected = false;
    device.adaptiveSignalMode = action === 'emergency_green_corridor' ? 'emergency-corridor' : 'dynamic-ai';
    await device.save();

    // Mark active alerts for this device as resolved
    await Alert.updateMany(
      { deviceId, resolved: false },
      {
        $set: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: 'AI Traffic Copilot (Autonomous Runbook)',
          remediationAction: runbookEntry.title,
        },
      }
    );

    // Broadcast device status update
    socketService.broadcastDeviceStatus({
      junctionId: deviceId,
      deviceId,
      name: device.name,
      status: 'online',
      healthScore: device.healthScore,
      lastMetrics: recoveryMetrics,
      lastData: recoveryData,
    });

    console.log(`[Copilot] Remediated traffic junction ${deviceId} with action: ${action}`);

    return {
      success: true,
      action,
      runbook: runbookEntry.title,
      message: `Successfully executed: ${runbookEntry.title}. Junction traffic normalized.`,
      recoveredMetrics: recoveryMetrics,
    };
  }
}

export const copilotService = new CopilotService();
