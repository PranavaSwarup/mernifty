import { Device } from '../models/Device.js';
import { User } from '../models/User.js';
import { INITIAL_DEVICES } from '../services/simulatorService.js';

export async function seedInitialData() {
  try {
    // 1. Seed Initial Devices
    for (const dev of INITIAL_DEVICES) {
      await Device.findOneAndUpdate(
        { deviceId: dev.deviceId },
        {
          $setOnInsert: {
            name: dev.name,
            category: dev.category,
            region: dev.region,
            status: 'online',
            healthScore: 100,
            lastSeen: new Date(),
            lastMetrics: dev.baseMetrics,
            lastLocation: dev.location,
            tags: [dev.category, 'production'],
          },
        },
        { upsert: true }
      );
    }
    console.log(`[Seed] Seeded / verified ${INITIAL_DEVICES.length} telemetry devices.`);

    // 2. Seed Default Admin & Operator accounts
    const existingAdmin = await User.findOne({ email: 'admin@hyperpulse.io' });
    if (!existingAdmin) {
      await User.create({
        name: 'Chief Systems Architect',
        email: 'admin@hyperpulse.io',
        password: 'AdminPassword123!',
        role: 'admin',
        apiKey: 'hp_key_live_admin_stream_master_2026',
      });
      console.log('[Seed] Default admin account seeded: admin@hyperpulse.io / AdminPassword123!');
    }
  } catch (err) {
    console.warn('[Seed] Warning during data seed:', err.message);
  }
}
