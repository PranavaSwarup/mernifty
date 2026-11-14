#!/usr/bin/env node

/**
 * One-off safe migration script: Telemetry time-series -> regular collection with unique eventId & TTL indexes.
 *
 * - If existing `telemetries` collection is a MongoDB time-series collection:
 *     renames it to `telemetries_legacy_ts` (never deletes data; falls back to verified copy+drop only if rename is unsupported on tier).
 * - Creates regular `telemetries` collection and syncs unique `eventId` + ordering + TTL indexes.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Telemetry } = await import('../src/models/Telemetry.js');
const { config } = await import('../src/config/config.js');

async function migrate() {
  console.log('[Migrate] Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;

  const existing = await db.listCollections({ name: 'telemetries' }).toArray();
  if (existing.length === 0) {
    console.log('[Migrate] No existing `telemetries` collection found; creating regular collection...');
  } else {
    const info = existing[0];
    const isTimeSeries = info.type === 'timeseries' || Boolean(info.options?.timeseries);
    console.log(`[Migrate] Existing \`telemetries\` type=${info.type}, isTimeSeries=${isTimeSeries}`);

    if (isTimeSeries) {
      let legacyName = 'telemetries_legacy_ts';
      const legacyCheck = await db.listCollections({ name: legacyName }).toArray();
      if (legacyCheck.length > 0) {
        legacyName = `telemetries_legacy_ts_${Date.now()}`;
      }

      const oldCol = db.collection('telemetries');
      const oldCount = await oldCol.countDocuments();
      console.log(`[Migrate] Preserving ${oldCount} docs from time-series collection into \`${legacyName}\`...`);

      try {
        await oldCol.rename(legacyName);
        console.log(`[Migrate] Renamed \`telemetries\` -> \`${legacyName}\` cleanly.`);
      } catch (renameErr) {
        console.warn(`[Migrate] Direct rename unsupported (${renameErr.message}); copying docs safely first...`);
        await db.createCollection(legacyName);
        const destCol = db.collection(legacyName);
        const cursor = oldCol.find({});
        let batch = [];
        let copied = 0;
        for await (const doc of cursor) {
          batch.push(doc);
          if (batch.length >= 500) {
            await destCol.insertMany(batch, { ordered: false });
            copied += batch.length;
            batch = [];
          }
        }
        if (batch.length > 0) {
          await destCol.insertMany(batch, { ordered: false });
          copied += batch.length;
        }
        const verifiedCount = await destCol.countDocuments();
        if (verifiedCount < oldCount) {
          throw new Error(`Aborting drop: copied ${verifiedCount} < original ${oldCount}`);
        }
        await oldCol.drop();
        console.log(`[Migrate] Verified ${copied} docs preserved in \`${legacyName}\`; dropped old time-series view.`);
      }
    } else {
      console.log('[Migrate] `telemetries` is already a regular collection; no rename needed.');
    }
  }

  // Ensure fresh regular collection and exact indexes
  const nowCheck = await db.listCollections({ name: 'telemetries' }).toArray();
  if (nowCheck.length === 0) {
    await Telemetry.createCollection();
  }
  await Telemetry.syncIndexes();

  const finalInfo = (await db.listCollections({ name: 'telemetries' }).toArray())[0];
  const indexes = await db.collection('telemetries').indexes();
  console.log(`[Migrate] Final \`telemetries\` type=${finalInfo.type}, indexes=${indexes.map((i) => i.name).join(', ')}`);

  await mongoose.disconnect();
  console.log('[Migrate] Completed safely.');
}

migrate().catch(async (err) => {
  console.error('[Migrate] Failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
