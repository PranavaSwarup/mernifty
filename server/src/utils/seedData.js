import { Device } from '../models/Device.js';
import { User } from '../models/User.js';
import { INITIAL_DEVICES } from '../data/junctionDevices.js';

import { seed24HourHistory } from './seedHistory.js';

export async function seedInitialData() {
  try {
    // 0. Clean up legacy non-traffic devices
    const trafficIds = INITIAL_DEVICES.map((d) => d.deviceId);
    await Device.deleteMany({ deviceId: { $nin: trafficIds } });

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

    // 2. Seed Default Accounts for each of the 4 Roles
    const DEMO_USERS = [
      {
        name: 'Bengaluru Traffic Operations Commander',
        email: 'admin@metropulse.blr',
        password: 'AdminPassword123!',
        role: 'admin',
        apiKey: 'blr_traffic_key_live_command_center_2026',
      },
      {
        name: 'South Bengaluru Traffic Officer',
        email: 'officer.south@metropulse.blr',
        password: 'Officer123!',
        role: 'officer',
        assignedZoneId: 'south-bangalore',
        apiKey: 'blr_officer_south_key_2026',
      },
      {
        name: 'Silk Board Junction Field Officer',
        email: 'officer.junction@metropulse.blr',
        password: 'Officer123!',
        role: 'officer',
        assignedJunctionId: 'JNC-BLR-001',
        apiKey: 'blr_officer_junction_key_2026',
      },
      {
        name: 'Emergency Response Ambulance Driver',
        email: 'ambulance@metropulse.blr',
        password: 'Ambulance123!',
        role: 'ambulance',
        vehicleId: 'AMB-BLR-01',
        apiKey: 'blr_ambulance_01_key_2026',
      },
      {
        name: 'Bengaluru Citizen Commuter',
        email: 'citizen@metropulse.blr',
        password: 'Citizen123!',
        role: 'citizen',
        apiKey: 'blr_citizen_demo_key_2026',
      },
    ];

    for (const u of DEMO_USERS) {
      const existing = await User.findOne({ email: u.email });
      if (!existing) {
        await User.create(u);
      }
    }
    console.log('[Seed] Seeded / verified 5 role-based demo accounts (admin, officer.south, officer.junction, ambulance, citizen).');

    // 3. Seed 24-Hour Telemetry History (Section 5.13)
    try {
      await seed24HourHistory();
    } catch (seedErr) {
      console.error('[Seed] Error during 24-hour history seed:', seedErr.message);
      throw seedErr;
    }
  } catch (err) {
    console.error('[Seed] Critical failure during data seed:', err.message);
    throw err;
  }
}
