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
  // A throwaway model with no indexes of its own, so the test controls the TTL index fully
  const schema = new mongoose.Schema({ timestamp: Date }, { autoIndex: false });
  Model = mongoose.model('RetentionProbe', schema, 'retention_probe');
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function ttlSeconds() {
  const idx = (await Model.collection.indexes()).find((i) => i.expireAfterSeconds !== undefined);
  return idx ? idx.expireAfterSeconds : null;
}

test('creates the TTL index when the collection is new', async () => {
  const res = await ensureTelemetryRetention(Model, 3600);
  assert.equal(res.action, 'created');
  assert.equal(await ttlSeconds(), 3600);
});

test('updates an existing TTL index in place when the setting changes', async () => {
  await Model.collection.dropIndexes();
  await Model.collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7200 });
  const res = await ensureTelemetryRetention(Model, 3600);
  assert.equal(res.action, 'updated');
  assert.equal(res.previousSec, 7200);
  assert.equal(await ttlSeconds(), 3600);
});

test('leaves a matching TTL index alone', async () => {
  const res = await ensureTelemetryRetention(Model, 3600);
  assert.equal(res.action, 'unchanged');
});

test('rejects an invalid retention value', async () => {
  await assert.rejects(() => ensureTelemetryRetention(Model, 0));
  await assert.rejects(() => ensureTelemetryRetention(Model, 'abc'));
});
