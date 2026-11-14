import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import crypto from 'crypto';
import mongoose from 'mongoose';

// Configurable deadline for automatic remediation (3 minutes = 180s default; 20s for demo)
let autoRemediationDeadlineSec = 180;

export function setAutoRemediationDeadline(seconds) {
  autoRemediationDeadlineSec = Math.max(5, Math.min(600, parseInt(seconds, 10)));
  console.log(`[AnomalyEngine] Auto-remediation deadline set to ${autoRemediationDeadlineSec}s`);
  return autoRemediationDeadlineSec;
}

export function getAutoRemediationDeadline() {
  return autoRemediationDeadlineSec;
}

class AnomalyEngine {
  constructor() {
    // Sliding window of recent values: junctionId:metric -> array of numbers
    this.history = new Map();
    this.approachHistory = new Map(); // `${junctionId}:${road}` -> array of { speed, queue, signal }
    this.maxHistory = 30;
    this.alertCooldowns = new Map(); // key: `${junctionId}:${alertType}` -> timestamp
    this.cooldownMs = 25000; // 25s cooldown per alert type to avoid alert fatigue in normal running
    this.socketBroadcastCallback = null;
  }

  setBroadcastCallback(fn) {
    this.socketBroadcastCallback = fn;
  }

  clearHistory() {
    this.history.clear();
    this.approachHistory.clear();
    this.alertCooldowns.clear();
  }

  evaluate(event) {
    const { junctionId, deviceId, junctionName, deviceName, zoneId, category, metrics, timestamp, data } = event;
    const juncId = junctionId || deviceId;
    const juncName = junctionName || deviceName || juncId;
    const zId = zoneId || category || 'south-bangalore';

    if (!metrics && !data) return null;

    const trafficMetrics = metrics || data || {};
    const approaches = data?.approaches || trafficMetrics.approaches || [];
    const now = Date.now();

    // 1. Update junction metrics history
    const queueVal = typeof trafficMetrics.maxQueueLengthM === 'number' ? trafficMetrics.maxQueueLengthM : 0;
    const speedVal = typeof trafficMetrics.avgSpeedKmph === 'number' ? trafficMetrics.avgSpeedKmph : 20;
    const congestionVal = typeof trafficMetrics.congestionScore === 'number' ? trafficMetrics.congestionScore : 40;

    const queueHistKey = `${juncId}:queue`;
    if (!this.history.has(queueHistKey)) this.history.set(queueHistKey, []);
    const queueHistory = this.history.get(queueHistKey);
    queueHistory.push(queueVal);
    if (queueHistory.length > this.maxHistory) queueHistory.shift();

    const speedHistKey = `${juncId}:speed`;
    if (!this.history.has(speedHistKey)) this.history.set(speedHistKey, []);
    const speedHistory = this.history.get(speedHistKey);
    speedHistory.push(speedVal);
    if (speedHistory.length > this.maxHistory) speedHistory.shift();

    let detectedAnomaly = null;

    // Check 1: Sudden Blockage on an Individual Road (Arterial velocity collapse)
    if (Array.isArray(approaches) && approaches.length > 0) {
      for (const app of approaches) {
        if (!app.road) continue;
        const appKey = `${juncId}:${app.road}`;
        if (!this.approachHistory.has(appKey)) {
          this.approachHistory.set(appKey, []);
        }
        const appHist = this.approachHistory.get(appKey);
        appHist.push({ speed: app.avgSpeedKmph, queue: app.queueLengthM, signal: app.signal });
        if (appHist.length > 15) appHist.shift();

        // Check for sudden drop if previous speed was >= 12 km/h and drops to <= 4 km/h (>= 65% drop)
        // Or if speed <= 3 km/h with queue >= 130m
        if (appHist.length >= 3) {
          const pastSpeeds = appHist.slice(0, -1).map((h) => h.speed);
          const avgPastSpeed = pastSpeeds.reduce((a, b) => a + b, 0) / pastSpeeds.length;

          const isSpeedCollapse = (avgPastSpeed >= 12 && app.avgSpeedKmph <= 4) || (app.avgSpeedKmph <= 3 && app.queueLengthM >= 140);
          const isGreenOrRecentGreen = app.signal === 'green' || appHist.slice(-3).some((h) => h.signal === 'green');

          if (isSpeedCollapse && isGreenOrRecentGreen) {
            detectedAnomaly = {
              type: 'sudden_blockage',
              severity: 'critical',
              affectedRoad: app.road,
              triggerValue: app.avgSpeedKmph,
              thresholdValue: 4,
              unit: 'km/h',
              title: `Sudden Blockage on ${app.road} at ${juncName}`,
              message: `Traffic velocity on ${app.road} collapsed to ${app.avgSpeedKmph} km/h while signal active. Roadway obstruction detected.`,
              suggestedAction: {
                action: 'divert',
                description: `Publish diversion notice for ${app.road} and rebalance cycle green splits.`,
              },
            };
            break;
          }
        }
      }
    }

    // Check 2: Severe Traffic Jam (Critical Queue & Velocity Collapse)
    // Critical jam threshold: queueVal >= 190m AND speedVal <= 5 km/h, OR queueVal >= 210m, OR congestionVal >= 88
    if (!detectedAnomaly) {
      const isCriticalJam =
        queueVal >= 210 ||
        (queueVal >= 180 && speedVal <= 5) ||
        congestionVal >= 88;

      if (isCriticalJam) {
        detectedAnomaly = {
          type: 'jam',
          severity: 'critical',
          affectedRoad: approaches[0]?.road || null,
          triggerValue: queueVal,
          thresholdValue: 190,
          unit: 'm',
          title: `Traffic Gridlock / Jam at ${juncName}`,
          message: `Arterial saturation: Max queue ${queueVal}m, average speed ${speedVal} km/h (Congestion score: ${congestionVal}/100).`,
          suggestedAction: {
            action: 'extend_green',
            description: `Extend green phase by +25s on saturated arterial approach to clear backlog.`,
          },
        };
      }
    }

    // Check 3: Congestion Building (Persistent queue growth across window)
    if (!detectedAnomaly && queueHistory.length >= 8) {
      const firstHalfQueue = queueHistory.slice(0, 4);
      const secondHalfQueue = queueHistory.slice(-4);
      const avgQueueStart = firstHalfQueue.reduce((a, b) => a + b, 0) / firstHalfQueue.length;
      const avgQueueEnd = secondHalfQueue.reduce((a, b) => a + b, 0) / secondHalfQueue.length;

      const queueGrowthPct = avgQueueStart > 0 ? (avgQueueEnd - avgQueueStart) / avgQueueStart : 0;
      if (avgQueueEnd >= 155 && queueGrowthPct >= 0.35 && speedVal <= 10) {
        detectedAnomaly = {
          type: 'congestion_building',
          severity: 'warning',
          affectedRoad: approaches[0]?.road || null,
          triggerValue: queueVal,
          thresholdValue: 155,
          unit: 'm',
          title: `Congestion Building at ${juncName}`,
          message: `Queue has expanded by ${Math.round(queueGrowthPct * 100)}% over recent window, now ${queueVal}m with speed falling to ${speedVal} km/h.`,
          suggestedAction: {
            action: 'extend_green',
            description: `Extend arterial green window by 15s to relieve building queue before gridlock occurs.`,
          },
        };
      }
    }

    if (!detectedAnomaly) return null;

    // Check cooldown for this junction and alert type
    const cooldownKey = `${juncId}:${detectedAnomaly.type}`;
    const lastAlertTime = this.alertCooldowns.get(cooldownKey) || 0;
    if (now - lastAlertTime < this.cooldownMs) {
      return null;
    }

    this.alertCooldowns.set(cooldownKey, now);

    const deadlineDate = new Date(now + autoRemediationDeadlineSec * 1000);

    const alertDoc = {
      alertId: `ALT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      junctionId: juncId,
      deviceId: juncId,
      deviceName: juncName,
      zoneId: zId,
      category: zId,
      severity: detectedAnomaly.severity,
      title: detectedAnomaly.title,
      message: detectedAnomaly.message,
      metric: detectedAnomaly.type, // 'jam' | 'sudden_blockage' | 'congestion_building'
      triggerValue: detectedAnomaly.triggerValue,
      thresholdValue: detectedAnomaly.thresholdValue,
      timestamp: new Date(timestamp || now),
      resolved: false,
      cause: 'unknown',
      causeSource: 'unknown',
      affectedRoad: detectedAnomaly.affectedRoad || null,
      status: 'open',
      suggestedAction: {
        action: detectedAnomaly.suggestedAction.action,
        description: detectedAnomaly.suggestedAction.description,
        deadline: deadlineDate,
      },
    };

    this.persistAndBroadcastAlert(alertDoc);

    return alertDoc;
  }

  async persistAndBroadcastAlert(alertDoc) {
    try {
      if (mongoose.connection?.readyState === 1) {
        await Alert.create(alertDoc);

        const penalty = alertDoc.severity === 'critical' ? 25 : 10;
        await Device.updateOne(
          { deviceId: alertDoc.deviceId },
          {
            $inc: { healthScore: -penalty },
            $set: { status: alertDoc.severity === 'critical' ? 'critical' : 'warning' },
          }
        );
      }

      if (this.socketBroadcastCallback) {
        this.socketBroadcastCallback(alertDoc);
      }
    } catch (err) {
      console.error('[AnomalyEngine] Alert save error:', err.message);
    }
  }
}

export const anomalyEngine = new AnomalyEngine();
