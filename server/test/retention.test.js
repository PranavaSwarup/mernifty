import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ensureTelemetryRetention } from '../src/utils/telemetryRetention.js';

let mongod;
let Model;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // A throwaway model with no indexes of its own, so the test controls the TTL indexes fully
  const schema = new mongoose.Schema({ timestamp: Date }, { autoIndex: false, timestamps: true });
  Model = mongoose.model('RetentionProbe', schema, 'retention_probe');
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function ttlIndexes() {
  return (await Model.collection.indexes())
    .filter((i) => i.expireAfterSeconds !== undefined)
    .map((i) => [Object.keys(i.key)[0], i.expireAfterSeconds]);
}

test('creates the TTL index on createdAt when the collection is new', async () => {
  const res = await ensureTelemetryRetention(Model, 3600);
  assert.equal(res.action, 'created');
  assert.deepEqual(await ttlIndexes(), [['createdAt', 3600]]);
});

test('replaces an old TTL on timestamp with one on createdAt', async () => {
  await Model.collection.dropIndexes();
  await Model.collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7200 });
  const res = await ensureTelemetryRetention(Model, 3600);
  assert.deepEqual(res.removed, ['timestamp_1']);
  assert.deepEqual(await ttlIndexes(), [['createdAt', 3600]]);
});

test('updates an existing createdAt TTL in place when the setting changes', async () => {
  const res = await ensureTelemetryRetention(Model, 2700);
  assert.equal(res.action, 'updated');
  assert.equal(res.previousSec, 3600);
  assert.deepEqual(await ttlIndexes(), [['createdAt', 2700]]);
});

test('leaves a matching TTL index alone', async () => {
  const res = await ensureTelemetryRetention(Model, 2700);
  assert.equal(res.action, 'unchanged');
  assert.deepEqual(res.removed, []);
});

test('a reading stamped hours in the future still expires by its storage time', async () => {
  // Simulated clock far ahead of real time: storage time decides expiry, not the event time
  await Model.create({ timestamp: new Date(Date.now() + 12 * 3600 * 1000) });
  const doc = await Model.findOne().lean();
  assert.ok(doc.createdAt instanceof Date);
  assert.ok(Math.abs(doc.createdAt.getTime() - Date.now()) < 60_000, 'createdAt is the real storage time');
});

test('rejects an invalid retention value', async () => {
  await assert.rejects(() => ensureTelemetryRetention(Model, 0));
  await assert.rejects(() => ensureTelemetryRetention(Model, 'abc'));
});
