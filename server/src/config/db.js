import mongoose from 'mongoose';
import { config } from './config.js';

let mongodInstance = null;
let databaseType = 'disconnected';

export function getDatabaseInfo() {
  return {
    type: databaseType, // 'external-mongodb' | 'in-memory-mongodb' | 'disconnected'
    readyState: mongoose.connection.readyState,
    name: mongoose.connection.name || 'metropulse',
  };
}

export async function connectDB() {
  // In production, require explicit MONGODB_URI to prevent silent data loss on restart
  if (config.nodeEnv === 'production' && !process.env.MONGODB_URI) {
    const errorMsg = 'FATAL: MONGODB_URI environment variable is required in production mode!';
    console.error(`[DB] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Option 1: Try connecting to configured MONGODB_URI
  try {
    console.log(`[DB] Attempting connection to MongoDB at: ${config.mongoUri}...`);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 45000,
    });
    databaseType = 'external-mongodb';
    console.log('[DB] [Active: external-mongodb] Successfully connected to persistent MongoDB cluster.');
    return;
  } catch (err) {
    if (config.nodeEnv === 'production') {
      console.error(`[DB] FATAL: Production MongoDB connection failed: ${err.message}`);
      throw err;
    }
    console.warn(`[DB] Could not connect to local/external MongoDB (${err.message}).`);
    console.log('[DB] Launching in-memory MongoDB instance for seamless standalone development...');
  }

  // Option 2: Fallback to MongoMemoryServer for development
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
    databaseType = 'in-memory-mongodb';
    console.log('[DB] [Active: in-memory-mongodb] Connected to in-memory MongoDB development store.');
  } catch (memErr) {
    console.error('[DB] MongoMemoryServer initialization error:', memErr.message);
  }

  // Handle Mongoose connection events
  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] Mongoose disconnected. Auto-reconnecting...');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[DB] Mongoose connection error:', err.message);
  });
}

export async function closeDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongodInstance) {
    await mongodInstance.stop();
  }
}
