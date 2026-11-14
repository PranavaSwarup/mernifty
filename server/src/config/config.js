import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/metropulse',
  jwtSecret: process.env.JWT_SECRET || 'metropulse_super_secret_jwt_key_2026_dev',
  nodeEnv: process.env.NODE_ENV || 'development',
  simulatorEnabled: process.env.SIMULATOR_ENABLED !== 'false',
  batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS, 10) || 500,
  batchSize: parseInt(process.env.BATCH_SIZE, 10) || 200,
  demoMode: process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : process.env.NODE_ENV !== 'production',
  stressTestKey: process.env.STRESS_TEST_KEY || 'blr_datasource_stress_test_key_2026',
  producerKey: process.env.PRODUCER_KEY || 'blr_datasource_producer_key_2026',
};
