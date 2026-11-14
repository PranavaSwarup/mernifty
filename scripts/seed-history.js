#!/usr/bin/env node

/**
 * MetroPulse BLR: 24-Hour Historical Telemetry Seeder (Section 5.13)
 * Seeds 24 hours of realistic Bengaluru traffic data into MongoDB with morning & evening peak profiles.
 * Safe to run multiple times (idempotent upsert).
 * 
 * Usage:
 *   node scripts/seed-history.js
 */

import { connectDB, closeDB } from '../server/src/config/db.js';
import { seed24HourHistory } from '../server/src/utils/seedHistory.js';

async function main() {
  console.log('====================================================');
  console.log('🌱 MetroPulse BLR: 24-Hour Historical Telemetry Seeder');
  console.log('====================================================');

  try {
    await connectDB();
    const count = await seed24HourHistory();
    console.log(`✅ Finished seeding. ${count} records active in MongoDB.`);
  } catch (err) {
    console.error('Seeding error:', err.message);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

main();
