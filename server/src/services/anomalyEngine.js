import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import { Report } from '../models/Report.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { baselineService } from './baselineService.js';

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
    this.openBlockages = new Map(); // junctionId -> { alertId, road, expiresAt }
    this.openIncidents = new Map(); // junctionId -> alertDoc
    this.socketBroadcastCallback = null;
  }

  setBroadcastCallback(fn) {
    this.socketBroadcastCallback = fn;
  }

  clearHistory() {
    this.history.clear();
    this.approachHistory.clear();
    this.alertCooldowns.clear();
    this.openBlockages.clear();
    this.openIncidents.clear();
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

    // Check 1: Sudden Blockage on an Individual Road (Arterial velocity collapse relative to road baseline)
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

        // Check for sudden drop relative to road's recent baseline velocity
        const pastSpeeds = appHist.slice(0, -1).map((h) => h.speed);
        if (pastSpeeds.length >= 1) {
          const baselineSpeed = pastSpeeds.reduce((a, b) => a + b, 0) / pastSpeeds.length;

          // Relative drop: speed fell by >= 50% compared to baseline and is <= 4 km/h while signal active
          const isRelativeDrop = app.avgSpeedKmph <= baselineSpeed * 0.5 && app.avgSpeedKmph <= 4;
          const isGreenOrRecentGreen = app.signal === 'green' || appHist.slice(-3).some((h) => h.signal === 'green');

          if (isRelativeDrop && isGreenOrRecentGreen) {
            detectedAnomaly = {
              type: 'sudden_blockage',
              severity: 'critical',
              affectedRoad: app.road,
              triggerValue: app.avgSpeedKmph,
              thresholdValue: 4,
              unit: 'km/h',
              title: `Sudden Blockage on ${app.road} at ${juncName}`,
              message: `Traffic velocity on ${app.road} collapsed to ${app.avgSpeedKmph} km/h (baseline: ${baselineSpeed.toFixed(1)} km/h) while signal active. Roadway obstruction detected.`,
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

    // Clean expired open blockages
    for (const [id, blk] of this.openBlockages.entries()) {
      if (now > blk.expiresAt) this.openBlockages.delete(id);
    }

    // Check 2: Severe Traffic Jam (Critical Queue & Velocity Collapse)
    // Precedence: Suppress jam if this junction currently has an active blockage alert
    if (!detectedAnomaly && !this.openBlockages.has(juncId)) {
      const isCriticalJam =
        queueVal >= 210 ||
        (queueVal >= 180 && speedVal <= 5) ||
        congestionVal >= 88;

      if (isCriticalJam) {
        // If junction is experiencing congestion due to spread from a neighbouring junction:
        // Do NOT raise a critical jam alert with automatic fix!
        // Instead, raise at most one lower-severity spread notice linked to the source alert!
        const spreadSource = data?.spreadSourceJunctionId || trafficMetrics?.spreadSourceJunctionId;
        if (spreadSource && spreadSource !== juncId) {
          const sourceAlert = this.openIncidents.get(spreadSource);
          detectedAnomaly = {
            type: 'congestion_spillover',
            severity: 'info',
            affectedRoad: null,
            sourceAlertId: sourceAlert?.alertId || null,
            triggerValue: queueVal,
            thresholdValue: 180,
            unit: 'm',
            title: `Congestion Spreading from ${spreadSource} into ${juncName}`,
            message: `Inflow congestion spreading across road network from neighbouring incident at ${spreadSource}.`,
            suggestedAction: null, // NO automatic action!
          };
        } else {
          // Worst road selection: Road with maximum queueLengthM
          let worstRoad = approaches[0]?.road || null;
          let maxQ = -1;
          for (const app of approaches) {
            if ((app.queueLengthM || 0) > maxQ) {
              maxQ = app.queueLengthM || 0;
              worstRoad = app.road;
            }
          }

          detectedAnomaly = {
            type: 'jam',
            severity: 'critical',
            affectedRoad: worstRoad,
            triggerValue: queueVal,
            thresholdValue: 190,
            unit: 'm',
            title: `Traffic Gridlock / Jam at ${juncName}`,
            message: `Arterial saturation: Max queue ${queueVal}m on ${worstRoad}, average speed ${speedVal} km/h (Congestion score: ${congestionVal}/100).`,
            suggestedAction: {
              action: 'extend_green',
              description: `Extend green phase by +25s on saturated arterial approach (${worstRoad}) to clear backlog.`,
            },
          };
        }
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

    // Check 4: Baseline Deviation - Unusual For This Hour (Section 5.14)
    if (!detectedAnomaly) {
      const simHour = event.data?.simulatedTime ? new Date(event.data.simulatedTime).getHours() : new Date().getHours();
      const dev = baselineService.getDeviation(juncId, simHour, speedVal, congestionVal);
      if (dev.hasBaseline && dev.isSignificantlyWorse) {
        detectedAnomaly = {
          type: 'unusual_for_this_hour',
          severity: 'warning',
          affectedRoad: approaches[0]?.road || null,
          triggerValue: speedVal,
          thresholdValue: dev.baselineSpeed,
          unit: 'km/h',
          title: `Unusual Congestion for ${simHour % 12 || 12} ${simHour >= 12 ? 'PM' : 'AM'} at ${juncName}`,
          message: `${dev.label}: Current speed ${speedVal} km/h (normal ${dev.baselineSpeed} km/h, congestion ${congestionVal} vs normal ${dev.baselineCongestionScore}).`,
          suggestedAction: {
            action: 'extend_green',
            description: `Rebalance signal phase split for unexpected volume deviation.`,
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
      metric: detectedAnomaly.type, // 'jam' | 'sudden_blockage' | 'congestion_building' | 'congestion_spillover'
      triggerValue: detectedAnomaly.triggerValue,
      thresholdValue: detectedAnomaly.thresholdValue,
      timestamp: new Date(timestamp || now),
      resolved: false,
      cause: 'unknown',
      causeSource: 'unknown',
      affectedRoad: detectedAnomaly.affectedRoad || null,
      sourceAlertId: detectedAnomaly.sourceAlertId || null,
      citizenReportCount: 0,
      status: 'open',
      suggestedAction: detectedAnomaly.suggestedAction
        ? {
            action: detectedAnomaly.suggestedAction.action,
            description: detectedAnomaly.suggestedAction.description,
            deadline: deadlineDate,
          }
        : null,
    };

    if (detectedAnomaly.type === 'sudden_blockage') {
      this.openBlockages.set(juncId, {
        alertId: alertDoc.alertId,
        road: detectedAnomaly.affectedRoad,
        expiresAt: now + 45000,
      });
    }

    if (['sudden_blockage', 'jam', 'congestion_building'].includes(detectedAnomaly.type)) {
      this.openIncidents.set(juncId, alertDoc);
      // Link any waiting unverified citizen reports for this junction (Fix 5)
      this.checkAndLinkWaitingReports(alertDoc);
    }

    this.persistAndBroadcastAlert(alertDoc);

    return alertDoc;
  }

  async checkAndLinkWaitingReports(alertDoc) {
    if (mongoose.connection?.readyState !== 1) return;
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const waitingReports = await Report.find({
        nearestJunctionId: alertDoc.junctionId,
        linkedAlertId: null,
        timestamp: { $gte: tenMinutesAgo },
      }).sort({ timestamp: -1 });

      if (waitingReports.length > 0) {
        let totalCount = alertDoc.citizenReportCount || 0;
        for (const rpt of waitingReports) {
          rpt.linkedAlertId = alertDoc.alertId;
          rpt.status = 'verified';
          await rpt.save();
          totalCount += (rpt.reportCount || 1);
        }

        alertDoc.citizenReportCount = totalCount;
        if (alertDoc.causeSource !== 'officer') {
          alertDoc.cause = waitingReports[0].category;
          alertDoc.causeSource = 'citizen_report';
        }

        await Alert.updateOne(
          { alertId: alertDoc.alertId },
          {
            $set: {
              cause: alertDoc.cause,
              causeSource: alertDoc.causeSource,
              citizenReportCount: alertDoc.citizenReportCount,
            },
          }
        );

        if (this.socketBroadcastCallback) {
          this.socketBroadcastCallback(alertDoc);
        }
      }
    } catch (e) {
      // Non-critical background report linking
    }
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
