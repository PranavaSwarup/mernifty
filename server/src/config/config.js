import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperpulse',
  jwtSecret: process.env.JWT_SECRET || 'hyperpulse_super_secret_jwt_key_2026_dev',
  nodeEnv: process.env.NODE_ENV || 'development',
  simulatorEnabled: process.env.SIMULATOR_ENABLED !== 'false',
  batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS, 10) || 1000,
  batchSize: parseInt(process.env.BATCH_SIZE, 10) || 500,
  telemetryTtlSec: parseInt(process.env.TELEMETRY_TTL_SEC, 10) || 7200,
  publicReadonly: process.env.PUBLIC_READONLY !== 'false',
  demoPersonas: process.env.DEMO_PERSONAS === 'true',
};
