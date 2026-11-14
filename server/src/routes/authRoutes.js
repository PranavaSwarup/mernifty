import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

// 1. Register: Citizens can register freely; always assigned 'citizen' role
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    // Role is ALWAYS citizen on registration, ignoring any role in request body
    const apiKey = `blr_cit_${crypto.randomBytes(16).toString('hex')}`;
    const user = await User.create({
      name,
      email,
      password,
      role: 'citizen',
      apiKey,
    });

    const token = jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        apiKey: user.apiKey,
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

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        assignedZoneId: user.assignedZoneId,
        assignedJunctionId: user.assignedJunctionId,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedZoneId: user.assignedZoneId,
        assignedJunctionId: user.assignedJunctionId,
        vehicleId: user.vehicleId,
        apiKey: user.apiKey,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2b. Demo Login (Gated by DEMO_MODE setting, zero passwords exposed to browser)
router.post('/demo-login', async (req, res) => {
  if (!config.demoMode) {
    return res.status(403).json({
      success: false,
      error: 'Demo login is disabled when DEMO_MODE is off.',
    });
  }

  const { roleKey } = req.body;
  if (!roleKey) {
    return res.status(400).json({ success: false, error: 'Field "roleKey" is required' });
  }

  let query = {};
  if (roleKey === 'admin') query = { role: 'admin' };
  else if (roleKey === 'officer_south') query = { role: 'officer', assignedZoneId: 'south-bangalore' };
  else if (roleKey === 'officer_junction') query = { role: 'officer', assignedJunctionId: 'JNC-BLR-001' };
  else if (roleKey === 'ambulance') query = { role: 'ambulance' };
  else if (roleKey === 'citizen') query = { role: 'citizen' };
  else {
    return res.status(400).json({ success: false, error: `Unknown roleKey: ${roleKey}` });
  }

  try {
    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ success: false, error: `Demo account for roleKey "${roleKey}" not found` });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        assignedZoneId: user.assignedZoneId,
        assignedJunctionId: user.assignedJunctionId,
        vehicleId: user.vehicleId,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedZoneId: user.assignedZoneId,
        assignedJunctionId: user.assignedJunctionId,
        vehicleId: user.vehicleId,
        apiKey: user.apiKey,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Current User Session Check
router.get('/me', authenticate, async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, user: null, role: 'anonymous' });
  }
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      assignedZoneId: req.user.assignedZoneId,
      assignedJunctionId: req.user.assignedJunctionId,
      vehicleId: req.user.vehicleId,
      apiKey: req.user.apiKey,
    },
  });
});

// 4. Admin Account Management (Admin only)
router.post('/manage-user', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { email, role, assignedZoneId, assignedJunctionId, vehicleId, name, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Target email is required' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      if (!password || !name) {
        return res.status(400).json({ success: false, error: 'Name and password required for new account' });
      }
      user = new User({
        name,
        email,
        password,
        role: role || 'officer',
        assignedZoneId: assignedZoneId || null,
        assignedJunctionId: assignedJunctionId || null,
        vehicleId: vehicleId || null,
        apiKey: `blr_staff_${crypto.randomBytes(16).toString('hex')}`,
      });
    } else {
      if (role) user.role = role;
      if (assignedZoneId !== undefined) user.assignedZoneId = assignedZoneId;
      if (assignedJunctionId !== undefined) user.assignedJunctionId = assignedJunctionId;
      if (vehicleId !== undefined) user.vehicleId = vehicleId;
    }

    await user.save();

    res.json({
      success: true,
      message: `Account for ${email} updated successfully`,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        assignedZoneId: user.assignedZoneId,
        assignedJunctionId: user.assignedJunctionId,
        vehicleId: user.vehicleId,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
