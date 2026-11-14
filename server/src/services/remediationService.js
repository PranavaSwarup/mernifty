import crypto from 'crypto';
import mongoose from 'mongoose';
import { Alert } from '../models/Alert.js';
import { ActionLog } from '../models/ActionLog.js';
import { simulatorService } from './simulatorService.js';
import { socketService } from './socketService.js';

class RemediationService {
  constructor() {
    this.timer = null;
    this.isScanning = false;
  }

  start() {
    if (this.timer) clearInterval(this.timer);

    // Single 1-second scanner loop for deadline tracking (Section 5.10)
    this.timer = setInterval(() => {
      this.scanDeadlines();
    }, 1000);

    if (this.timer.unref) {
      this.timer.unref(); // Prevent blocking Node.js exit in tests
    }

    console.log('[RemediationService] Active 1-second auto-remediation scanner loop started.');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scanDeadlines() {
    if (this.isScanning) return;
    if (mongoose.connection?.readyState !== 1) return;

    this.isScanning = true;
    try {
      const now = new Date();

      // Find open alerts whose suggested deadline has expired
      const expiredAlerts = await Alert.find({
        status: 'open',
        resolved: false,
        'suggestedAction.deadline': { $lte: now },
      });

      for (const alert of expiredAlerts) {
        const action = alert.suggestedAction?.action || 'extend_green';
        const juncId = alert.junctionId || alert.deviceId;

        // 1. Apply the action in simulator to alter traffic flow
        simulatorService.applyRemediationAction(juncId, action, alert.affectedRoad, 90);

        // 2. Transition status to auto_applied
        alert.status = 'auto_applied';
        alert.actionApplied = {
          action,
          appliedBy: 'system',
          appliedAt: now,
        };
        await alert.save();

        // 3. Log to ActionLog for audit trail
        await ActionLog.create({
          logId: `LOG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
          alertId: alert.alertId,
          junctionId: juncId,
          zoneId: alert.zoneId,
          action,
          actor: 'system',
          actorRole: 'system',
          details: `Unanswered alert deadline elapsed. System automatically applied "${action}" fail-safe.`,
          timestamp: now,
        });

        // 4. Emit alert:updated to zone and junction rooms
        if (socketService?.io) {
          socketService.broadcastAlertUpdate({
            alertId: alert.alertId,
            status: 'auto_applied',
            actionApplied: alert.actionApplied,
            junctionId: juncId,
            zoneId: alert.zoneId,
          });
        }

        console.log(`[RemediationService] Auto-applied ${action} on ${juncId} for alert ${alert.alertId}`);
      }
    } catch (err) {
      console.error('[RemediationService] Scan error:', err.message);
    } finally {
      this.isScanning = false;
    }
  }
}

export const remediationService = new RemediationService();
