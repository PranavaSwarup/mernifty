import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Report } from '../models/Report.js';
import { Alert } from '../models/Alert.js';
import { authenticate, requireRole, checkAreaAuthorization } from '../middleware/auth.js';
import { JUNCTION_COORDINATES, findNearestJunction } from '../data/junctionGraph.js';
import { socketService } from '../services/socketService.js';

const router = express.Router();

const VALID_CATEGORIES = ['accident', 'road_blocked', 'waterlogging', 'signal_not_working', 'construction', 'other'];

// In-memory rate limiter: Max 3 reports per 10 minutes per account (Section 5.11)
const userReportHistory = new Map(); // userId -> array of timestamp numbers

function checkReportRateLimit(userId) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  if (!userReportHistory.has(userId)) {
    userReportHistory.set(userId, []);
  }

  const timestamps = userReportHistory.get(userId).filter((t) => now - t < windowMs);
  userReportHistory.set(userId, timestamps);

  if (timestamps.length >= 3) {
    return false; // Rate limit exceeded
  }

  timestamps.push(now);
  return true;
}

// 1. Submit a Citizen Incident Report (Section 5.11) (Requires login, role: citizen / any)
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id?.toString() || req.user.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required to submit an incident report' });
    }

    // Rate limit check: 3 per 10 minutes per account
    if (!checkReportRateLimit(userId)) {
      return res.status(429).json({
        success: false,
        error: 'Report submission rate limit exceeded. Maximum 3 incident reports allowed per 10 minutes.',
      });
    }

    const { category, latitude, longitude, junctionId, note = '' } = req.body;

    // Validate Category
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Field "category" must be one of: [${VALID_CATEGORIES.join(', ')}]`,
      });
    }

    // Validate Note (max 200 chars, strip HTML tags for sanitization)
    const sanitizedNote = String(note).replace(/<[^>]*>?/gm, '').slice(0, 200).trim();

    // Determine nearest junction and validate proximity
    let targetJunctionId = junctionId;
    let targetLat = latitude;
    let targetLon = longitude;

    if (!targetJunctionId && (typeof latitude === 'number' && typeof longitude === 'number')) {
      const nearest = findNearestJunction(latitude, longitude);
      if (!nearest.nearestJunctionId || nearest.distanceKm > 2.0) {
        return res.status(400).json({
          success: false,
          error: `Location is ${(nearest.distanceKm || 0).toFixed(1)}km away from nearest monitored junction. Reports must be within 2km of a Bengaluru monitored corridor.`,
        });
      }
      targetJunctionId = nearest.nearestJunctionId;
      targetLat = latitude;
      targetLon = longitude;
    } else if (targetJunctionId) {
      const juncCoord = JUNCTION_COORDINATES[targetJunctionId];
      if (!juncCoord) {
        return res.status(400).json({ success: false, error: `Unregistered junction: ${targetJunctionId}` });
      }
      targetLat = targetLat || juncCoord.latitude;
      targetLon = targetLon || juncCoord.longitude;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either "junctionId" or GPS coordinates ("latitude", "longitude") are required.',
      });
    }

    const zoneId = JUNCTION_COORDINATES[targetJunctionId]?.zoneId || 'south-bangalore';
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Grouping Duplicates (Section 5.11):
    // If an open report with the same category already exists at the same junction within last 10 minutes
    let reportDoc = null;
    const existingGroup = await Report.findOne({
      nearestJunctionId: targetJunctionId,
      category,
      status: { $in: ['received', 'verified'] },
      timestamp: { $gte: tenMinutesAgo },
    }).sort({ timestamp: -1 });

    if (existingGroup) {
      // Increment group count
      existingGroup.reportCount += 1;
      await existingGroup.save();
      reportDoc = existingGroup;
    } else {
      const reportId = `RPT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      reportDoc = await Report.create({
        reportId,
        groupId: reportId,
        userId,
        category,
        location: { latitude: targetLat, longitude: targetLon },
        nearestJunctionId: targetJunctionId,
        zoneId,
        note: sanitizedNote,
        reportCount: 1,
        status: 'received',
      });
    }

    // Link to open alerts at that junction (Section 5.11)
    const openAlert = await Alert.findOne({
      junctionId: targetJunctionId,
      resolved: false,
    }).sort({ timestamp: -1 });

    if (openAlert) {
      reportDoc.linkedAlertId = openAlert.alertId;
      await reportDoc.save();

      // Set alert cause from citizen report
      openAlert.cause = category;
      openAlert.causeSource = 'citizen_report';
      await openAlert.save();

      if (socketService?.io) {
        socketService.broadcastAlertUpdate({
          alertId: openAlert.alertId,
          cause: openAlert.cause,
          causeSource: openAlert.causeSource,
          junctionId: openAlert.junctionId,
          zoneId: openAlert.zoneId,
        });
      }
    }

    // Anonymized payload for live distribution (never leaks reporter's identity)
    const publicPayload = {
      reportId: reportDoc.reportId,
      groupId: reportDoc.groupId,
      category: reportDoc.category,
      location: reportDoc.location,
      nearestJunctionId: reportDoc.nearestJunctionId,
      zoneId: reportDoc.zoneId,
      note: reportDoc.note,
      reportCount: reportDoc.reportCount,
      status: reportDoc.status,
      linkedAlertId: reportDoc.linkedAlertId,
      timestamp: reportDoc.timestamp,
    };

    if (socketService?.io) {
      // Emit to junction and zone rooms
      socketService.io.to(`zone:${zoneId}`).to(`junction:${targetJunctionId}`).emit('report:new', publicPayload);
      // Emit to reporter's private room for live status tracking
      socketService.io.to(`user:${userId}`).emit('report:my_update', publicPayload);
    }

    res.status(201).json({
      success: true,
      report: publicPayload,
      message: `Incident report filed. Nearest junction: ${targetJunctionId} (${zoneId}).`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get Incident Reports (Public list, sanitized / anonymized)
router.get('/', async (req, res) => {
  try {
    const { junctionId, zoneId, limit = 50 } = req.query;
    const filter = {};
    if (junctionId) filter.nearestJunctionId = junctionId;
    if (zoneId) filter.zoneId = zoneId;

    const reports = await Report.find(filter)
      .select('-userId') // Strip reporter identity to guarantee citizen privacy
      .sort({ timestamp: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    res.json({ success: true, count: reports.length, reports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Verify a Report (Officer or Admin with Area Authorization)
router.patch('/:reportId/verify', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findOne({ reportId });
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    if (!checkAreaAuthorization(req.user, report.zoneId, report.nearestJunctionId)) {
      return res.status(403).json({ success: false, error: 'Access denied for your assigned area.' });
    }

    report.status = 'verified';
    await report.save();

    const publicPayload = {
      reportId: report.reportId,
      groupId: report.groupId,
      status: 'verified',
      nearestJunctionId: report.nearestJunctionId,
      zoneId: report.zoneId,
    };

    if (socketService?.io) {
      socketService.io.to(`zone:${report.zoneId}`).to(`junction:${report.nearestJunctionId}`).emit('report:updated', publicPayload);
      socketService.io.to(`user:${report.userId}`).emit('report:my_update', publicPayload);
    }

    res.json({ success: true, report: publicPayload });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Dismiss a Report (Officer or Admin with Area Authorization)
router.patch('/:reportId/dismiss', authenticate, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findOne({ reportId });
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    if (!checkAreaAuthorization(req.user, report.zoneId, report.nearestJunctionId)) {
      return res.status(403).json({ success: false, error: 'Access denied for your assigned area.' });
    }

    report.status = 'dismissed';
    await report.save();

    const publicPayload = {
      reportId: report.reportId,
      groupId: report.groupId,
      status: 'dismissed',
      nearestJunctionId: report.nearestJunctionId,
      zoneId: report.zoneId,
    };

    if (socketService?.io) {
      socketService.io.to(`zone:${report.zoneId}`).to(`junction:${report.nearestJunctionId}`).emit('report:updated', publicPayload);
      socketService.io.to(`user:${report.userId}`).emit('report:my_update', publicPayload);
    }

    res.json({ success: true, report: publicPayload });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
