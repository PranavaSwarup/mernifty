import { Device } from '../models/Device.js';
import { User } from '../models/User.js';
import { INITIAL_DEVICES } from '../data/junctionDevices.js';
import { config } from '../config/config.js';
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

    // 2. Seed Default Accounts for each of the 4 Roles + Data Source Ingestion Accounts
    if (config.nodeEnv === 'production') {
      if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_API_KEY) {
        throw new Error('ADMIN_PASSWORD and ADMIN_API_KEY must be provided via environment variables in production');
      }
    }

    const DEMO_USERS = [
      {
        name: 'Bengaluru Traffic Operations Commander',
        email: process.env.ADMIN_EMAIL || 'admin@metropulse.blr',
        password: process.env.ADMIN_PASSWORD || 'AdminPassword123!',
        role: 'admin',
        apiKey: process.env.ADMIN_API_KEY || 'blr_traffic_key_live_command_center_2026',
      },
      {
        name: 'South Bengaluru Traffic Officer',
        email: process.env.OFFICER_SOUTH_EMAIL || 'officer.south@metropulse.blr',
        password: process.env.OFFICER_SOUTH_PASSWORD || 'Officer123!',
        role: 'officer',
        assignedZoneId: 'south-bangalore',
        apiKey: process.env.OFFICER_SOUTH_API_KEY || 'blr_officer_south_key_2026',
      },
      {
        name: 'Silk Board Junction Field Officer',
        email: process.env.OFFICER_JUNCTION_EMAIL || 'officer.junction@metropulse.blr',
        password: process.env.OFFICER_JUNCTION_PASSWORD || 'Officer123!',
        role: 'officer',
        assignedJunctionId: 'JNC-BLR-001',
        apiKey: process.env.OFFICER_JUNCTION_API_KEY || 'blr_officer_junction_key_2026',
      },
      {
        name: 'Emergency Response Ambulance Driver',
        email: process.env.AMBULANCE_EMAIL || 'ambulance@metropulse.blr',
        password: process.env.AMBULANCE_PASSWORD || 'Ambulance123!',
        role: 'ambulance',
        vehicleId: 'AMB-BLR-01',
        apiKey: process.env.AMBULANCE_API_KEY || 'blr_ambulance_01_key_2026',
      },
      {
        name: 'Bengaluru Citizen Commuter',
        email: process.env.CITIZEN_EMAIL || 'citizen@metropulse.blr',
        password: process.env.CITIZEN_PASSWORD || 'Citizen123!',
        role: 'citizen',
        apiKey: process.env.CITIZEN_API_KEY || 'blr_citizen_demo_key_2026',
      },
      // Data Source accounts for ingest (Fix 3)
      {
        name: 'Central Camera Vision Ingestion Worker',
        email: 'source.producer@metropulse.blr',
        password: process.env.PRODUCER_PASSWORD || 'DataSourceProducerPass123!',
        role: 'source',
        apiKey: config.producerKey,
      },
      {
        name: 'Telemetry Ingestion Benchmark Engine',
        email: 'source.benchmark@metropulse.blr',
        password: process.env.STRESS_TEST_PASSWORD || 'DataSourceStressPass123!',
        role: 'source',
        apiKey: config.stressTestKey,
      },
    ];

    for (const u of DEMO_USERS) {
      const existing = await User.findOne({ email: u.email });
      if (!existing) {
        await User.create(u);
      }
    }
    console.log('[Seed] Seeded / verified 5 role-based demo accounts + 2 data source ingestion accounts.');

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
