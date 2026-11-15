import { config } from '../config/config.js';

// Telemetry is expired by the real time it was stored (Mongoose's createdAt), not by the
// event's own `timestamp`. Simulator events are stamped with the simulated clock, which can
// run hours ahead of real time; a TTL on `timestamp` would then keep every reading for
// those extra hours and overflow a 512 MB Atlas free cluster.
export const TELEMETRY_TTL_FIELD = 'createdAt';

const isSingleFieldTtl = (idx) =>
  idx.expireAfterSeconds !== undefined && Object.keys(idx.key || {}).length === 1;

/**
 * Makes telemetry expire TELEMETRY_TTL_SEC seconds after it was stored.
 *
 * Mongoose creates a TTL index only when it does not exist yet, so a changed setting, or a
 * TTL left on another field by an earlier version, would otherwise stay in place on an
 * existing database. This removes TTL indexes on any other field, updates the createdAt TTL
 * in place (collMod) when its value differs, or creates it when it is missing.
 *
 * Returns { action: 'unchanged' | 'updated' | 'created', previousSec, ttlSec, removed }.
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

  // Remove expiry rules on any other field (for example `timestamp` from an earlier version)
  const removed = [];
  for (const idx of indexes) {
    if (isSingleFieldTtl(idx) && idx.key[TELEMETRY_TTL_FIELD] === undefined) {
      await collection.dropIndex(idx.name);
      removed.push(idx.name);
    }
  }

  const ttlIndex = indexes.find((idx) => isSingleFieldTtl(idx) && idx.key[TELEMETRY_TTL_FIELD] === 1);

  if (!ttlIndex) {
    await collection.createIndex({ [TELEMETRY_TTL_FIELD]: 1 }, { expireAfterSeconds: seconds });
    return { action: 'created', previousSec: null, ttlSec: seconds, removed };
  }

  if (ttlIndex.expireAfterSeconds === seconds) {
    return { action: 'unchanged', previousSec: seconds, ttlSec: seconds, removed };
  }

  await model.db.db.command({
    collMod: collection.collectionName,
    index: { name: ttlIndex.name, expireAfterSeconds: seconds },
  });
  return { action: 'updated', previousSec: ttlIndex.expireAfterSeconds, ttlSec: seconds, removed };
}
