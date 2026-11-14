import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import crypto from 'crypto';

class AnomalyEngine {
  constructor() {
    // Sliding window of recent values: junctionId:metric -> array of numbers
    this.history = new Map();
    this.maxHistory = 30;
    this.alertCooldowns = new Map(); // key: junctionId:metric -> timestamp
    this.cooldownMs = 15000; // 15s cooldown per alert type to avoid alert fatigue
    this.socketBroadcastCallback = null;
  }

  setBroadcastCallback(fn) {
    this.socketBroadcastCallback = fn;
  }

  evaluate(event) {
    const { junctionId, deviceId, junctionName, deviceName, zoneId, category, metrics, timestamp, data } = event;
    const juncId = junctionId || deviceId;
    const juncName = junctionName || deviceName || juncId;
    const zId = zoneId || category || 'south-bangalore';

    if (!metrics && !data) return null;

    const trafficMetrics = metrics || data || {};
    const anomalies = [];

    // Helper to evaluate a numerical metric with Z-score + threshold
    const checkMetric = (metricName, val, warningThreshold, criticalThreshold, unit = '', higherIsBad = true) => {
      if (typeof val !== 'number') return;

      const histKey = `${juncId}:${metricName}`;
      if (!this.history.has(histKey)) {
        this.history.set(histKey, []);
      }
      const values = this.history.get(histKey);
      values.push(val);
      if (values.length > this.maxHistory) values.shift();

      let isStatisticalAnomaly = false;
      let zScore = 0;
      if (values.length >= 8) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0.001) {
          zScore = (val - mean) / stdDev;
          if (Math.abs(zScore) >= 3.0) {
            isStatisticalAnomaly = true;
          }
        }
      }

      let severity = null;
      let threshold = null;

      if (higherIsBad) {
        if (criticalThreshold !== undefined && val >= criticalThreshold) {
          severity = 'critical';
          threshold = criticalThreshold;
        } else if (warningThreshold !== undefined && val >= warningThreshold) {
          severity = 'warning';
          threshold = warningThreshold;
        }
      } else {
        if (criticalThreshold !== undefined && val <= criticalThreshold) {
          severity = 'critical';
          threshold = criticalThreshold;
        } else if (warningThreshold !== undefined && val <= warningThreshold) {
          severity = 'warning';
          threshold = warningThreshold;
        }
      }

      if (!severity && isStatisticalAnomaly) {
        severity = 'warning';
        threshold = 0;
      }

      if (severity) {
        anomalies.push({
          metric: metricName,
          triggerValue: val,
          thresholdValue: threshold,
          severity,
          zScore: parseFloat(zScore.toFixed(2)),
          unit,
        });
      }
    };

    // 1. Stalled Vehicle Incident Detection
    if (trafficMetrics.stalledVehicleDetected || data?.stalledVehicleDetected) {
      anomalies.push({
        metric: 'stalledVehicle',
        triggerValue: 1,
        thresholdValue: 0,
        severity: 'critical',
        zScore: 4.5,
        unit: 'event',
        customTitle: `Stalled Vehicle Obstacle at ${juncName}`,
        customMsg: `Vision camera detected an immobilized / stalled vehicle blocking arterial lanes. Emergency towing dispatch recommended.`,
      });
    }

    // 2. Emergency Vehicle (Ambulance / Fire) Corridor Preemption
    if (trafficMetrics.ambulanceDetected || data?.ambulanceDetected) {
      anomalies.push({
        metric: 'ambulancePreemption',
        triggerValue: 1,
        thresholdValue: 0,
        severity: 'critical',
        zScore: 5.0,
        unit: 'event',
        customTitle: `Emergency Vehicle Approaching ${juncName}`,
        customMsg: `Ambulance transponder & camera beacon active. Automated Green Corridor Preemption recommended.`,
      });
    }

    // 3. Gridlock & Saturated Queue Detection
    if (typeof trafficMetrics.maxQueueLengthM === 'number') {
      checkMetric('maxQueueLengthM', trafficMetrics.maxQueueLengthM, 120, 165, 'm', true);
    }
    if (typeof trafficMetrics.avgSpeedKmph === 'number') {
      checkMetric('avgSpeedKmph', trafficMetrics.avgSpeedKmph, 11, 6, 'km/h', false);
    }
    if (typeof trafficMetrics.totalFlowVehiclesPerMin === 'number') {
      checkMetric('totalFlowVehiclesPerMin', trafficMetrics.totalFlowVehiclesPerMin, 135, 175, 'veh/min', true);
    }

    // Support legacy server/fleet/turbine metrics if passed in tests
    if (typeof trafficMetrics.cpuPercent === 'number') {
      checkMetric('cpuPercent', trafficMetrics.cpuPercent, 82, 94, '%', true);
    }
    if (typeof trafficMetrics.vibrationMmS === 'number') {
      checkMetric('vibrationMmS', trafficMetrics.vibrationMmS, 5.0, 7.5, 'mm/s', true);
    }

    if (anomalies.length === 0) return null;

    // Pick highest severity anomaly
    const highestAnomaly = anomalies.reduce((prev, curr) => {
      if (curr.severity === 'critical') return curr;
      if (prev.severity === 'critical') return prev;
      return curr;
    }, anomalies[0]);

    // Check cooldown
    const cooldownKey = `${juncId}:${highestAnomaly.metric}`;
    const now = Date.now();
    const lastAlertTime = this.alertCooldowns.get(cooldownKey) || 0;
    if (now - lastAlertTime < this.cooldownMs) {
      return null;
    }

    this.alertCooldowns.set(cooldownKey, now);

    const title = highestAnomaly.customTitle || `${highestAnomaly.metric} ${highestAnomaly.severity.toUpperCase()} at ${juncName}`;
    const message =
      highestAnomaly.customMsg ||
      `${highestAnomaly.metric} reached ${highestAnomaly.triggerValue} ${highestAnomaly.unit} (Threshold: ${highestAnomaly.thresholdValue} ${highestAnomaly.unit}${
        highestAnomaly.zScore ? `, Z-Score: ${highestAnomaly.zScore}` : ''
      })`;

    const alertDoc = {
      alertId: `ALT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      junctionId: juncId,
      deviceId: juncId,
      deviceName: juncName,
      zoneId: zId,
      category: zId,
      severity: highestAnomaly.severity,
      title,
      message,
      metric: highestAnomaly.metric,
      triggerValue: highestAnomaly.triggerValue,
      thresholdValue: highestAnomaly.thresholdValue,
      timestamp: new Date(timestamp || now),
      resolved: false,
    };

    this.persistAndBroadcastAlert(alertDoc);

    return alertDoc;
  }

  async persistAndBroadcastAlert(alertDoc) {
    try {
      await Alert.create(alertDoc);

      const penalty = alertDoc.severity === 'critical' ? 25 : 10;
      await Device.updateOne(
        { deviceId: alertDoc.deviceId },
        {
          $inc: { healthScore: -penalty },
          $set: { status: alertDoc.severity === 'critical' ? 'critical' : 'warning' },
        }
      );

      if (this.socketBroadcastCallback) {
        this.socketBroadcastCallback(alertDoc);
      }
    } catch (err) {
      console.error('[AnomalyEngine] Alert save error:', err.message);
    }
  }
}

export const anomalyEngine = new AnomalyEngine();
