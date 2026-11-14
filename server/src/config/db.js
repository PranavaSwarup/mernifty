import mongoose from 'mongoose';
import { config } from './config.js';

let mongodInstance = null;

export async function connectDB() {
  // Option 1: Try connecting to configured MONGODB_URI
  try {
    const safeUri = config.mongoUri.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:***@');
    console.log(`[DB] Attempting connection to MongoDB at: ${safeUri}...`);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 45000,
    });
    console.log('[DB] Successfully connected to MongoDB server.');
    return;
  } catch (err) {
    console.warn(`[DB] Could not connect to local/external MongoDB (${err.message}).`);
    console.log('[DB] Launching in-memory MongoDB instance for seamless standalone operation...');
  }

  // Option 2: Fallback to MongoMemoryServer
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongodInstance = await MongoMemoryServer.create({
      instance: {
        dbName: 'metropulse',
      },
    });
    const uri = mongodInstance.getUri();
    console.log(`[DB] MongoMemoryServer started successfully at ${uri}`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 60000,
    });
    console.log('[DB] Connected to in-memory MongoDB database.');
  } catch (memErr) {
    console.error('[DB] MongoMemoryServer initialization error:', memErr.message);
    console.warn('[DB] Continuing with memory store fallback if needed.');
  }

  // Handle Mongoose connection events
  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] Mongoose disconnected. Auto-reconnecting...');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[DB] Mongoose connection error:', err.message);
  });
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    if (mongodInstance) {
      await mongodInstance.stop();
    }
  } catch (err) {
    console.error('[DB] Error during disconnect:', err.message);
  }
}
