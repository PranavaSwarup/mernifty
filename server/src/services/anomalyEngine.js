import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import crypto from 'crypto';

class AnomalyEngine {
  constructor() {
    // Sliding window of recent values: deviceId:metric -> array of numbers
    this.history = new Map();
    this.maxHistory = 30; // 30 data points per metric
    this.alertCooldowns = new Map(); // key: deviceId:metric -> timestamp
    this.cooldownMs = 20000; // 20s cooldown per alert type to avoid alert fatigue
    this.socketBroadcastCallback = null;
  }

  setBroadcastCallback(fn) {
    this.socketBroadcastCallback = fn;
  }

  evaluate(event) {
    const { deviceId, deviceName, category, metrics, timestamp } = event;
    if (!metrics) return null;

    const anomalies = [];

    // Helper to evaluate a specific metric
    const checkMetric = (metricName, val, warningThreshold, criticalThreshold, unit = '', higherIsBad = true) => {
      if (typeof val !== 'number') return;

      // Update sliding history for Z-score calculation
      const histKey = `${deviceId}:${metricName}`;
      if (!this.history.has(histKey)) {
        this.history.set(histKey, []);
      }
      const values = this.history.get(histKey);
      values.push(val);
      if (values.length > this.maxHistory) values.shift();

      // Z-Score Statistical Anomaly
      let isStatisticalAnomaly = false;
      let zScore = 0;
      if (values.length >= 10) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0.001) {
          zScore = (val - mean) / stdDev;
          if (Math.abs(zScore) >= 3.2) {
            isStatisticalAnomaly = true;
          }
        }
      }

      // Rule-based threshold check
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

      // If statistical spike occurred even without fixed threshold breach
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

    // Category-specific evaluation
    if (category === 'server') {
      checkMetric('cpuPercent', metrics.cpuPercent, 82, 94, '%', true);
      checkMetric('memoryPercent', metrics.memoryPercent, 85, 95, '%', true);
      checkMetric('latencyMs', metrics.latencyMs, 250, 600, 'ms', true);
      checkMetric('temperatureC', metrics.temperatureC, 75, 88, '°C', true);
      checkMetric('errorRate', metrics.errorRate, 3, 10, '%', true);
    } else if (category === 'fleet') {
      checkMetric('speedKmh', metrics.speedKmh, 110, 130, 'km/h', true);
      checkMetric('batteryLevel', metrics.batteryLevel, 20, 10, '%', false);
      checkMetric('motorTempC', metrics.motorTempC, 80, 95, '°C', true);
      checkMetric('tirePressurePsi', metrics.tirePressurePsi, 28, 24, 'psi', false);
    } else if (category === 'turbine') {
      checkMetric('vibrationMmS', metrics.vibrationMmS, 5.0, 7.5, 'mm/s', true);
      checkMetric('powerOutputMw', metrics.powerOutputMw, 4.8, 5.5, 'MW', true);
      checkMetric('oilTempC', metrics.oilTempC, 80, 95, '°C', true);
      checkMetric('gridFrequencyHz', metrics.gridFrequencyHz, 49.2, 48.5, 'Hz', false);
    }

    if (anomalies.length === 0) return null;

    // Pick highest severity anomaly
    const highestAnomaly = anomalies.reduce((prev, curr) => {
      if (curr.severity === 'critical') return curr;
      if (prev.severity === 'critical') return prev;
      return curr;
    }, anomalies[0]);

    // Check cooldown
    const cooldownKey = `${deviceId}:${highestAnomaly.metric}`;
    const now = Date.now();
    const lastAlertTime = this.alertCooldowns.get(cooldownKey) || 0;
    if (now - lastAlertTime < this.cooldownMs) {
      return null; // Suppressed by cooldown to prevent flooding
    }

    this.alertCooldowns.set(cooldownKey, now);

    const alertDoc = {
      alertId: `ALT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      deviceId,
      deviceName: deviceName || deviceId,
      category,
      severity: highestAnomaly.severity,
      title: `${highestAnomaly.metric} ${highestAnomaly.severity.toUpperCase()} on ${deviceName || deviceId}`,
      message: `${highestAnomaly.metric} reached ${highestAnomaly.triggerValue} ${highestAnomaly.unit} (Threshold: ${highestAnomaly.thresholdValue} ${highestAnomaly.unit}${highestAnomaly.zScore ? `, Z-Score: ${highestAnomaly.zScore}` : ''})`,
      metric: highestAnomaly.metric,
      triggerValue: highestAnomaly.triggerValue,
      thresholdValue: highestAnomaly.thresholdValue,
      timestamp: new Date(timestamp || now),
      resolved: false,
    };

    // Save alert asynchronously and broadcast
    this.persistAndBroadcastAlert(alertDoc);

    return alertDoc;
  }

  async persistAndBroadcastAlert(alertDoc) {
    try {
      await Alert.create(alertDoc);

      // Also adjust device health score
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
