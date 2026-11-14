import { Device } from '../models/Device.js';
import { User } from '../models/User.js';
import { INITIAL_DEVICES } from '../services/simulatorService.js';

export async function seedInitialData() {
  try {
    // 1. Seed Initial Bengaluru Traffic Junctions
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

    // 2. Seed Default Admin & Operator accounts
    const existingAdmin = await User.findOne({ email: 'admin@hyperpulse.io' });
    if (!existingAdmin) {
      await User.create({
        name: 'Bengaluru Traffic Operations Commander',
        email: 'admin@hyperpulse.io',
        password: 'AdminPassword123!',
        role: 'admin',
        apiKey: 'blr_traffic_key_live_command_center_2026',
      });
      console.log('[Seed] Default traffic operator account seeded: admin@hyperpulse.io / AdminPassword123!');
    }
  } catch (err) {
    console.warn('[Seed] Warning during data seed:', err.message);
  }
}
