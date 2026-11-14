import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/config.js';
import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { DeviceKey, hashDeviceKey } from '../models/DeviceKey.js';
import { JUNCTION_CATALOGUE } from '../middleware/validator.js';

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

async function resolveBearerUser(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (!isDbReady()) {
    throw new Error('Authentication store unavailable');
  }
  const user = await User.findById(decoded.id).select('-password').lean();
  if (!user) {
    throw new Error('User not found');
  }
  return {
    id: String(user._id),
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    zones: Array.isArray(user.zones) ? user.zones : [],
    demo: Boolean(decoded.demo),
    anonymous: false,
  };
}

async function resolveDeviceKey(rawKey) {
  if (!isDbReady()) {
    throw new Error('Key store unavailable');
  }
  const keyHash = hashDeviceKey(rawKey);
  const dk = await DeviceKey.findOne({ keyHash, active: true });
  if (!dk) {
    throw new Error('Invalid or inactive API key');
  }
  // Fire-and-forget lastUsedAt update
  DeviceKey.updateOne({ _id: dk._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  return dk;
}

/**
 * Strict authentication middleware (JWT Bearer or verified DeviceKey).
 * Never silently grants an anonymous operator role.
 */
export async function authenticate(req, res, next) {
  try {
    const rawApiKey = req.headers['x-api-key'];
    if (rawApiKey) {
      const dk = await resolveDeviceKey(rawApiKey);
      req.deviceKey = dk;
      req.user = {
        id: `device:${dk._id}`,
        _id: dk._id,
        name: dk.label,
        role: 'device',
        scopes: dk.scopes || ['ingest'],
        allowedJunctionIds: dk.allowedJunctionIds || [],
        zones: [],
        anonymous: false,
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      req.user = await resolveBearerUser(token);
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide a valid Bearer JWT or X-API-Key.',
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Invalid or expired authentication credentials',
    });
  }
}

/**
 * Read-only GET authentication gate:
 * - If credentials are provided, they are strictly verified (invalid -> 401).
 * - If no credentials are provided and PUBLIC_READONLY=true (default), sets explicit
 *   anonymous viewer `{ role: 'viewer', anonymous: true }`. Otherwise returns 401.
 */
export async function publicReadOrAuth(req, res, next) {
  const hasCreds = Boolean(req.headers['x-api-key'] || req.headers.authorization);
  if (hasCreds) {
    return authenticate(req, res, next);
  }

  const allowAnon = process.env.PUBLIC_READONLY !== 'false';
  if (allowAnon && req.method === 'GET') {
    req.user = {
      id: 'anonymous-viewer',
      name: 'Anonymous Viewer',
      role: 'viewer',
      zones: [],
      anonymous: true,
    };
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Authentication required',
  });
}

/**
 * Ingestion authentication gate: requires valid active DeviceKey with 'ingest' scope
 * OR an admin JWT. Any unauthenticated or invalid key request returns 401.
 */
export async function authenticateIngest(req, res, next) {
  try {
    const rawApiKey = req.headers['x-api-key'];
    if (rawApiKey) {
      const dk = await resolveDeviceKey(rawApiKey);
      if (!dk.scopes?.includes('ingest')) {
        return res.status(403).json({
          success: false,
          error: 'API key lacks required "ingest" scope',
        });
      }
      req.deviceKey = dk;
      req.user = {
        id: `device:${dk._id}`,
        _id: dk._id,
        name: dk.label,
        role: 'device',
        scopes: dk.scopes,
        allowedJunctionIds: dk.allowedJunctionIds || [],
        anonymous: false,
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const user = await resolveBearerUser(token);
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Telemetry ingestion requires a DeviceKey or admin JWT',
        });
      }
      req.user = user;
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Ingestion requires a valid X-API-Key or admin Bearer token',
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Invalid ingestion credentials',
    });
  }
}

export function requireRole(allowedRoles = ['admin']) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
      });
    }
    next();
  };
}

export async function resolveJunctionZone(junctionOrDeviceId) {
  if (!junctionOrDeviceId) return null;
  if (JUNCTION_CATALOGUE.has(junctionOrDeviceId)) {
    return JUNCTION_CATALOGUE.get(junctionOrDeviceId);
  }
  if (isDbReady()) {
    const dev = await Device.findOne({
      $or: [{ deviceId: junctionOrDeviceId }, { junctionId: junctionOrDeviceId }],
    })
      .select('zoneId category')
      .lean();
    if (dev) return dev.zoneId || dev.category || null;
  }
  return null;
}

/**
 * Enforce zone-level RBAC for junction-targeted mutations:
 * - 'admin' can mutate any junction or city-wide targets ('all', monsoon).
 * - 'operator' can mutate ONLY junctions belonging to their assigned `req.user.zones`.
 * - Anyone else -> 403.
 */
export async function requireJunctionZoneAccess(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    if (req.user.role !== 'operator') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: operator or admin role required',
      });
    }

    const userZones = Array.isArray(req.user.zones) ? req.user.zones : [];
    const targetId =
      req.params?.deviceId ||
      req.body?.junctionId ||
      req.body?.deviceId ||
      req.query?.junctionId;

    const isCityWideMonsoon =
      req.body?.metric === 'monsoon' || Boolean(req.body?.flags?.monsoon);

    if (!targetId || targetId === 'all' || targetId === '*' || isCityWideMonsoon) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: city-wide or multi-zone actions require admin role',
      });
    }

    const targetZone = await resolveJunctionZone(targetId);
    if (!targetZone) {
      return res.status(404).json({
        success: false,
        error: `Unknown junction: ${targetId}`,
      });
    }

    if (!userZones.includes(targetZone)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: junction '${targetId}' (${targetZone}) is outside operator zones [${userZones.join(', ')}]`,
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
