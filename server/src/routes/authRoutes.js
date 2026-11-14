import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { publicReadOrAuth } from '../middleware/auth.js';

const router = express.Router();

const DEMO_PERSONA_EMAILS = {
  admin: 'admin@metropulse.io',
  supervisor: 'admin@metropulse.io',
  'south-operator': 'south.operator@metropulse.io',
  south: 'south.operator@metropulse.io',
  'east-operator': 'east.operator@metropulse.io',
  east: 'east.operator@metropulse.io',
  viewer: 'viewer@metropulse.io',
  anonymous: 'viewer@metropulse.io',
  anon: 'viewer@metropulse.io',
};

function signUserToken(user, extra = {}) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      zones: user.zones || [],
      name: user.name,
      email: user.email,
      ...extra,
    },
    config.jwtSecret,
    { expiresIn: extra.demo ? '24h' : '7d' }
  );
}

// 1. Register new user (public self-registration creates viewer only; admins promote roles)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'viewer',
      zones: [],
    });

    const token = signUserToken(user);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        zones: user.zones,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = signUserToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        zones: user.zones || [],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Demo persona login (enabled strictly when DEMO_PERSONAS=true)
router.post('/demo-login', async (req, res) => {
  try {
    const isDemoEnabled =
      process.env.DEMO_PERSONAS === 'true' ||
      (process.env.DEMO_PERSONAS !== 'false' && process.env.NODE_ENV !== 'production');
    if (!isDemoEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Demo persona switching is disabled (set DEMO_PERSONAS=true to enable)',
      });
    }

    const { persona } = req.body || {};
    const email = DEMO_PERSONA_EMAILS[persona];
    if (!email) {
      return res.status(400).json({
        success: false,
        error: `Unknown demo persona '${persona}'. Available: ${Object.keys(DEMO_PERSONA_EMAILS).join(', ')}`,
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: `Demo user '${email}' is not seeded yet`,
      });
    }

    const isAnon = persona === 'anonymous' || persona === 'anon';
    const token = signUserToken(user, {
      demo: true,
      anonymous: isAnon,
      persona: isAnon ? 'anonymous' : persona,
    });

    res.json({
      success: true,
      demo: true,
      persona: isAnon ? 'anonymous' : persona,
      notice: 'DEMO PERSONA JWT: issued for hackathon demo convenience only',
      token,
      user: {
        id: isAnon ? 'anonymous-viewer' : user._id,
        name: isAnon ? 'Anonymous Viewer' : user.name,
        email: user.email,
        role: user.role,
        zones: isAnon ? [] : (user.zones || []),
        anonymous: isAnon,
        persona: isAnon ? 'anonymous' : persona,
        demo: true,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Current session check (explicit anonymous viewer when PUBLIC_READONLY=true; no silent operator escalation)
router.get('/me', publicReadOrAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

export default router;
