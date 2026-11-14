import mongoose from 'mongoose';
import { Alert } from '../models/Alert.js';
import { Device } from '../models/Device.js';
import crypto from 'crypto';

const PERSISTENCE_FRAMES = 3;

function computeMedian(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeRobustStats(values, minScale = 1) {
  const med = computeMedian(values);
  const absDevs = values.map((v) => Math.abs(v - med));
  const mad = computeMedian(absDevs);
  const sigma = Math.max(minScale, 1.4826 * mad);
  return { median: med, sigma };
}

function shortJunctionTitle(juncName) {
  if (!juncName) return 'Junction';
  return String(juncName).split('(')[0].trim() || juncName;
}

class AnomalyEngine {
  constructor() {
    // Sliding baseline window of normal recent values: junctionId:metric -> number[]
    this.history = new Map();
    this.streaks = new Map(); // junctionId:metric -> consecutive anomalous frame count
    this.activeDiscrete = new Set(); // junctionId:metric currently active (rising-edge dedup)
    this.maxHistory = 40;
    this.alertCooldowns = new Map(); // key: junctionId:metric -> timestamp
    this.cooldownMs = 15000; // 15s cooldown per alert type to avoid alert fatigue
    this.socketBroadcastCallback = null;
  }

  setBroadcastCallback(fn) {
    this.socketBroadcastCallback = fn;
  }

  reset() {
    this.history.clear();
    this.streaks.clear();
    this.activeDiscrete.clear();
    this.alertCooldowns.clear();
  }

  evaluate(event) {
    const { junctionId, deviceId, junctionName, deviceName, zoneId, category, metrics, timestamp, data } = event;
    const juncId = junctionId || deviceId;
    const juncName = junctionName || deviceName || juncId;
    const shortName = shortJunctionTitle(juncName);
    const zId = zoneId || category || 'south-bangalore';

    if (!metrics && !data) return null;

    const trafficMetrics = metrics || data || {};
    const approaches = Array.isArray(data?.approaches) ? data.approaches : [];
    const anomalies = [];

    const worstApproachRoad = (metricKey, findMin = false) => {
      if (approaches.length === 0) return null;
      let best = approaches[0];
      for (let i = 1; i < approaches.length; i++) {
        const cur = approaches[i];
        const curVal = Number(cur?.[metricKey]);
        const bestVal = Number(best?.[metricKey]);
        if (!Number.isFinite(curVal)) continue;
        if (!Number.isFinite(bestVal) || (findMin ? curVal < bestVal : curVal > bestVal)) {
          best = cur;
        }
      }
      return best?.road || null;
    };

    /**
     * Evaluate one continuous traffic metric using:
     * 1) One-sided robust baseline (median + 1.4826*MAD)
     * 2) Minimum practical floor/ceiling AND relative effect size over baseline
     * 3) Multi-frame persistence (>= 3 consecutive frames)
     */
    const checkMetric = ({
      metricName,
      val,
      warningThreshold,
      criticalThreshold,
      practicalFloor,
      minRelChange,
      minScale,
      unit,
      higherIsBad = true,
      nounLabel,
      approachRoad = null,
    }) => {
      if (typeof val !== 'number' || !Number.isFinite(val)) return;

      const histKey = `${juncId}:${metricName}`;
      if (!this.history.has(histKey)) {
        this.history.set(histKey, []);
      }
      const values = this.history.get(histKey);

      let baseline = val;
      let sigma = minScale;
      let zScore = 0;
      const hasBaseline = values.length >= 8;

      if (hasBaseline) {
        const stats = computeRobustStats(values, minScale);
        baseline = stats.median;
        sigma = stats.sigma;
        zScore = (val - baseline) / sigma;
      }

      // Practical effect gate + one-sided directional check
      const passesDirection = !hasBaseline || (higherIsBad ? val > baseline : val < baseline);
      const passesPracticalFloor = higherIsBad ? val >= practicalFloor : val <= practicalFloor;
      const relBaseline = Math.max(minScale, baseline);
      const passesRelEffect = !hasBaseline
        ? true
        : higherIsBad
          ? val >= relBaseline * (1 + minRelChange)
          : val <= baseline * (1 - minRelChange);

      const isStatAnom = hasBaseline && (higherIsBad ? zScore >= 3.0 : zScore <= -3.0);

      let severity = null;
      let threshold = null;

      if (passesDirection && passesPracticalFloor && passesRelEffect) {
        if (higherIsBad) {
          if (criticalThreshold !== undefined && val >= criticalThreshold) {
            severity = 'critical';
            threshold = criticalThreshold;
          } else if (warningThreshold !== undefined && val >= warningThreshold) {
            severity = 'warning';
            threshold = warningThreshold;
          } else if (isStatAnom) {
            severity = 'warning';
            threshold = Number(
              Math.max(practicalFloor, relBaseline * (1 + minRelChange), baseline + 3 * sigma).toFixed(1)
            );
          }
        } else {
          if (criticalThreshold !== undefined && val <= criticalThreshold) {
            severity = 'critical';
            threshold = criticalThreshold;
          } else if (warningThreshold !== undefined && val <= warningThreshold) {
            severity = 'warning';
            threshold = warningThreshold;
          } else if (isStatAnom) {
            severity = 'warning';
            threshold = Number(
              Math.max(1, Math.min(practicalFloor, baseline * (1 - minRelChange), baseline - 3 * sigma)).toFixed(1)
            );
          }
        }
      }

      if (!severity) {
        // Normal observation: reset streak and update rolling baseline
        this.streaks.set(histKey, 0);
        values.push(val);
        if (values.length > this.maxHistory) values.shift();
        return;
      }

      const nextStreak = (this.streaks.get(histKey) || 0) + 1;
      this.streaks.set(histKey, nextStreak);
      if (nextStreak < PERSISTENCE_FRAMES) {
        return;
      }

      // Never emit Threshold: 0
      const safeThreshold =
        Number.isFinite(threshold) && threshold > 0 ? threshold : practicalFloor;
      const sigmaText =
        hasBaseline && Math.abs(zScore) >= 0.1
          ? `${zScore >= 0 ? '+' : ''}${zScore.toFixed(1)}σ`
          : severity.toUpperCase();
      const whereText = approachRoad ? `${approachRoad} at ${shortName}` : shortName;
      const roundedVal = Number.isInteger(val) ? val : Number(val.toFixed(1));
      const roundedBase = Number.isInteger(baseline) ? baseline : Number(baseline.toFixed(1));
      const cmpWord = higherIsBad ? 'limit' : 'min';

      anomalies.push({
        metric: metricName,
        triggerValue: val,
        thresholdValue: safeThreshold,
        severity,
        zScore: hasBaseline ? parseFloat(zScore.toFixed(2)) : null,
        unit,
        customTitle: `${nounLabel} on ${whereText} (${sigmaText})`,
        customMsg: `${approachRoad ? `${approachRoad}: ` : ''}${metricName} at ${roundedVal} ${unit} (baseline ${roundedBase} ${unit}, ${cmpWord} ${safeThreshold} ${unit}, ${sigmaText}, ${nextStreak} frames).`,
      });
    };

    // 1. Stalled Vehicle Incident Detection (immediate discrete rising-edge event; no fabricated zScore)
    const stallKey = `${juncId}:stalledVehicle`;
    if (trafficMetrics.stalledVehicleDetected || data?.stalledVehicleDetected) {
      if (!this.activeDiscrete.has(stallKey)) {
        this.activeDiscrete.add(stallKey);
        anomalies.push({
          metric: 'stalledVehicle',
          triggerValue: 1,
          thresholdValue: 1,
          severity: data?.stalledSeverity || trafficMetrics.severity || 'critical',
          zScore: null,
          unit: 'event',
          customTitle: `Stalled Vehicle Obstacle at ${juncName}`,
          customMsg: `Vision camera detected an immobilized / stalled vehicle blocking arterial lanes. Emergency towing dispatch recommended.`,
        });
      }
    } else {
      this.activeDiscrete.delete(stallKey);
    }

    // 2. Emergency Vehicle (Ambulance / Fire) Corridor Preemption (discrete rising-edge event)
    const ambKey = `${juncId}:ambulancePreemption`;
    if (trafficMetrics.ambulanceDetected || data?.ambulanceDetected) {
      if (!this.activeDiscrete.has(ambKey)) {
        this.activeDiscrete.add(ambKey);
        anomalies.push({
          metric: 'ambulancePreemption',
          triggerValue: 1,
          thresholdValue: 1,
          severity: data?.emergencySeverity || trafficMetrics.severity || 'critical',
          zScore: null,
          unit: 'event',
          customTitle: `Emergency Vehicle Approaching ${juncName}`,
          customMsg: `Ambulance transponder & camera beacon active. Automated Green Corridor Preemption recommended.`,
        });
      }
    } else {
      this.activeDiscrete.delete(ambKey);
    }

    // 3. One-Sided Congestion Detectors with Practical Floor + Persistence
    if (typeof trafficMetrics.maxQueueLengthM === 'number') {
      checkMetric({
        metricName: 'maxQueueLengthM',
        val: trafficMetrics.maxQueueLengthM,
        warningThreshold: 120,
        criticalThreshold: 165,
        practicalFloor: 60,
        minRelChange: 0.5,
        minScale: 4.0,
        unit: 'm',
        higherIsBad: true,
        nounLabel: 'Queue surge',
        approachRoad: worstApproachRoad('queueLengthM', false),
      });
    }
    if (typeof trafficMetrics.avgSpeedKmph === 'number') {
      checkMetric({
        metricName: 'avgSpeedKmph',
        val: trafficMetrics.avgSpeedKmph,
        warningThreshold: 11,
        criticalThreshold: 6,
        practicalFloor: 15,
        minRelChange: 0.3,
        minScale: 1.5,
        unit: 'km/h',
        higherIsBad: false,
        nounLabel: 'Speed collapse',
        approachRoad: worstApproachRoad('avgSpeedKmph', true),
      });
    }
    if (typeof trafficMetrics.totalFlowVehiclesPerMin === 'number') {
      checkMetric({
        metricName: 'totalFlowVehiclesPerMin',
        val: trafficMetrics.totalFlowVehiclesPerMin,
        warningThreshold: 135,
        criticalThreshold: 175,
        practicalFloor: 110,
        minRelChange: 0.45,
        minScale: 8.0,
        unit: 'veh/min',
        higherIsBad: true,
        nounLabel: 'Demand surge',
        approachRoad: worstApproachRoad('vehiclesPerMin', false),
      });
    }

    if (anomalies.length === 0) return null;

    // Pick highest severity anomaly (discrete / critical priority over warning)
    const highestAnomaly = anomalies.reduce((prev, curr) => {
      if (curr.severity === 'critical' && prev.severity !== 'critical') return curr;
      return prev;
    }, anomalies[0]);

    // Check cooldown
    const cooldownKey = `${juncId}:${highestAnomaly.metric}`;
    const now = Date.now();
    const lastAlertTime = this.alertCooldowns.get(cooldownKey) || 0;
    if (now - lastAlertTime < this.cooldownMs) {
      return null;
    }

    this.alertCooldowns.set(cooldownKey, now);

    const alertDoc = {
      alertId: `ALT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      junctionId: juncId,
      deviceId: juncId,
      deviceName: juncName,
      zoneId: zId,
      category: zId,
      severity: highestAnomaly.severity,
      title: highestAnomaly.customTitle,
      message: highestAnomaly.customMsg,
      metric: highestAnomaly.metric,
      triggerValue: highestAnomaly.triggerValue,
      thresholdValue: highestAnomaly.thresholdValue,
      zScore: highestAnomaly.zScore,
      timestamp: new Date(timestamp || now),
      resolved: false,
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
