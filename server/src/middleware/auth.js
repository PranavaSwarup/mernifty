import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { User } from '../models/User.js';

// Parse JWT token or API key. If none provided, req.user is null (anonymous).
export async function authenticate(req, res, next) {
  try {
    req.user = null;

    // 1. Check API Key header
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const user = await User.findOne({ apiKey }).select('-password');
      if (user) {
        req.user = user;
        return next();
      }
    }

    // 2. Check Authorization Bearer Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id).select('-password');
      if (user) {
        req.user = user;
        return next();
      }
    }

    // Anonymous request (valid for public read-only views)
    next();
  } catch (err) {
    // If a token was provided but is invalid or expired, return 401
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication credentials',
    });
  }
}

// Require a logged-in user
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in to perform this action.',
    });
  }
  next();
}

// Require a verified Data Source API key (role: 'source') for telemetry ingestion
export async function requireDataSourceKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query?.apiKey;
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required for telemetry ingestion. Provide X-API-Key header.',
    });
  }

  try {
    const user = await User.findOne({ apiKey });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key for telemetry ingestion.',
      });
    }

    if (user.role !== 'source') {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Key belongs to role '${user.role}'. Only registered data sources may ingest telemetry.`,
      });
    }

    req.dataSource = user;
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Require one of the specified roles
export function requireRole(allowedRoles = ['admin']) {
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (!rolesArray.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Role '${req.user.role}' is not authorized. Required: [${rolesArray.join(', ')}]`,
      });
    }

    next();
  };
}

// Area authorization helper for officers
export function checkAreaAuthorization(user, zoneId, junctionId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'officer') {
    // If officer assigned to specific zone, check match
    if (user.assignedZoneId && zoneId && user.assignedZoneId !== zoneId) {
      return false;
    }
    // If officer assigned to specific junction, check match
    if (user.assignedJunctionId && junctionId && user.assignedJunctionId !== junctionId) {
      return false;
    }
    return true;
  }
  return false;
}
