import { config } from '../config/config.js';

/**
 * Makes the TTL index on telemetry match TELEMETRY_TTL_SEC.
 *
 * MongoDB deletes telemetry older than this many seconds. Mongoose creates the TTL index
 * only when it does not exist yet, so changing the setting later would silently keep the
 * old value on an existing database. This updates the existing index in place (collMod),
 * or creates it if it is missing.
 *
 * Returns { action: 'unchanged' | 'updated' | 'created', previousSec, ttlSec }.
 */
export async function ensureTelemetryRetention(model, ttlSec = config.telemetryTtlSec) {
  const seconds = Number(ttlSec);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`TELEMETRY_TTL_SEC must be a positive whole number of seconds (got ${ttlSec})`);
  }

  const collection = model.collection;
  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (err) {
    // The collection does not exist yet on a brand-new database.
    if (err?.codeName !== 'NamespaceNotFound' && err?.code !== 26) throw err;
  }

  const ttlIndex = indexes.find(
    (idx) =>
      idx.expireAfterSeconds !== undefined &&
      Object.keys(idx.key || {}).length === 1 &&
      idx.key.timestamp === 1
  );

  if (!ttlIndex) {
    await collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: seconds });
    return { action: 'created', previousSec: null, ttlSec: seconds };
  }

  if (ttlIndex.expireAfterSeconds === seconds) {
    return { action: 'unchanged', previousSec: seconds, ttlSec: seconds };
  }

  await model.db.db.command({
    collMod: collection.collectionName,
    index: { name: ttlIndex.name, expireAfterSeconds: seconds },
  });
  return { action: 'updated', previousSec: ttlIndex.expireAfterSeconds, ttlSec: seconds };
}
