import test from 'node:test';
import assert from 'node:assert';
import { findProductionConfigProblems } from '../src/config/config.js';

const GOOD_SECRET = 'a-private-secret-that-is-long-enough-123';

test('production config check: nothing is required outside production', () => {
  assert.deepStrictEqual(findProductionConfigProblems({ NODE_ENV: 'development' }), []);
  assert.deepStrictEqual(findProductionConfigProblems({ NODE_ENV: 'test' }), []);
  assert.deepStrictEqual(findProductionConfigProblems({}), []);
});

test('production config check: missing JWT_SECRET and MONGODB_URI are both reported', () => {
  const problems = findProductionConfigProblems({ NODE_ENV: 'production' });
  assert.strictEqual(problems.length, 2);
  assert.ok(problems.some((p) => p.includes('JWT_SECRET')));
  assert.ok(problems.some((p) => p.includes('MONGODB_URI')));
});

test('production config check: the public development JWT secret is rejected', () => {
  const problems = findProductionConfigProblems({
    NODE_ENV: 'production',
    JWT_SECRET: 'metropulse_super_secret_jwt_key_2026_dev',
    MONGODB_URI: 'mongodb://example/metropulse',
  });
  assert.strictEqual(problems.length, 1);
  assert.ok(problems[0].includes('JWT_SECRET'));
});

test('production config check: a short JWT secret is rejected', () => {
  const problems = findProductionConfigProblems({
    NODE_ENV: 'production',
    JWT_SECRET: 'too-short',
    MONGODB_URI: 'mongodb://example/metropulse',
  });
  assert.strictEqual(problems.length, 1);
  assert.ok(problems[0].includes('24'));
});

test('production config check: a private secret and a database URI pass', () => {
  const problems = findProductionConfigProblems({
    NODE_ENV: 'production',
    JWT_SECRET: GOOD_SECRET,
    MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/metropulse',
  });
  assert.deepStrictEqual(problems, []);
});
