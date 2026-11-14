import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Device } from '../models/Device.js';
import { User } from '../models/User.js';
import { DeviceKey, hashDeviceKey } from '../models/DeviceKey.js';
import { INITIAL_DEVICES } from '../services/simulatorService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_KEYS_PATH = path.resolve(__dirname, '../../.env.local-keys');

const ALL_ZONES = [
  'south-bangalore',
  'east-bangalore',
  'north-bangalore',
  'central-bangalore',
];

function resolvePassword(envKey, fallbackEnvKey = null) {
  if (process.env[envKey]) {
    return { password: process.env[envKey], generated: false };
  }
  if (fallbackEnvKey && process.env[fallbackEnvKey]) {
    return { password: process.env[fallbackEnvKey], generated: false };
  }
  return {
    password: crypto.randomBytes(12).toString('base64url'),
    generated: true,
  };
}

export async function seedInitialData() {
  try {
    // 1. Clean up legacy non-traffic devices & seed 12 BLR junctions
    const trafficIds = INITIAL_DEVICES.map((d) => d.deviceId);
    await Device.deleteMany({ deviceId: { $nin: trafficIds } });

    for (const dev of INITIAL_DEVICES) {
      await Device.findOneAndUpdate(
        { deviceId: dev.deviceId },
        {
          $set: {
            junctionId: dev.junctionId,
            name: dev.name,
            zoneId: dev.zoneId,
            zoneName: dev.zoneName,
            category: dev.category,
            region: dev.region,
            status: 'online',
            healthScore: 100,
            lastSeen: new Date(),
            lastLocation: dev.location,
            vehicleMix: dev.vehicleMix,
            tags: [dev.zoneId, 'bengaluru-traffic', 'smart-signal'],
          },
        },
        { upsert: true }
      );
    }
    console.log(`[Seed] Seeded / verified ${INITIAL_DEVICES.length} Bengaluru Smart City Traffic Junctions.`);

    // 2. Seed RBAC Demo / Operator Users (passwords read from env or generated once randomly)
    const userSpecs = [
      {
        email: 'admin@hyperpulse.io',
        name: 'Bengaluru Traffic Operations Commander',
        role: 'admin',
        zones: ALL_ZONES,
        envKey: 'DEMO_ADMIN_PASSWORD',
      },
      {
        email: 'south.operator@hyperpulse.io',
        name: 'South Zone Desk Operator (Silk Board / Hosur Rd)',
        role: 'operator',
        zones: ['south-bangalore'],
        envKey: 'DEMO_SOUTH_OPERATOR_PASSWORD',
        fallbackEnvKey: 'DEMO_OPERATOR_PASSWORD',
      },
      {
        email: 'east.operator@hyperpulse.io',
        name: 'East Zone Desk Operator (ORR / Whitefield)',
        role: 'operator',
        zones: ['east-bangalore'],
        envKey: 'DEMO_EAST_OPERATOR_PASSWORD',
        fallbackEnvKey: 'DEMO_OPERATOR_PASSWORD',
      },
      {
        email: 'viewer@hyperpulse.io',
        name: 'Public Mobility Observer',
        role: 'viewer',
        zones: [],
        envKey: 'DEMO_VIEWER_PASSWORD',
      },
    ];

    for (const spec of userSpecs) {
      const existing = await User.findOne({ email: spec.email });
      if (!existing) {
        const { password, generated } = resolvePassword(spec.envKey, spec.fallbackEnvKey);
        await User.create({
          name: spec.name,
          email: spec.email,
          password,
          role: spec.role,
          zones: spec.zones,
        });
        if (generated) {
          console.log(`[Seed] Created user ${spec.email} (role=${spec.role}) with generated password: ${password}`);
        } else {
          console.log(`[Seed] Created user ${spec.email} (role=${spec.role}, zones=[${spec.zones.join(',')}])`);
        }
      } else if (!existing.zones || existing.zones.length === 0) {
        if (spec.zones.length > 0) {
          existing.zones = spec.zones;
          await existing.save();
        }
      }
    }

    // 3. Seed DeviceKey (SHA-256 hashed in DB; print plaintext & write server/.env.local-keys ONCE)
    const activeKeysCount = await DeviceKey.countDocuments({ active: true });
    if (activeKeysCount === 0) {
      const rawKey =
        process.env.METROPULSE_API_KEY || `mpk_${crypto.randomBytes(24).toString('hex')}`;
      await DeviceKey.create({
        keyHash: hashDeviceKey(rawKey),
        prefix: rawKey.slice(0, 12),
        label: 'Bengaluru Primary Camera Telemetry Producer',
        scopes: ['ingest', 'read'],
        allowedJunctionIds: [],
        active: true,
      });

      try {
        fs.writeFileSync(LOCAL_KEYS_PATH, `METROPULSE_API_KEY=${rawKey}\n`, { mode: 0o600 });
        console.log(`[Seed] Generated DeviceKey (prefix=${rawKey.slice(0, 12)}). Saved to server/.env.local-keys.`);
      } catch (fsErr) {
        console.warn('[Seed] Could not write server/.env.local-keys:', fsErr.message);
      }
      console.log(`[Seed] ONE-TIME Device API Key (METROPULSE_API_KEY): ${rawKey}`);
    }
  } catch (err) {
    console.warn('[Seed] Warning during data seed:', err.message);
  }
}
