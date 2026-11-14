import express from 'express';
import http from 'http';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/config.js';
import { connectDB } from './config/db.js';
import { socketService } from './services/socketService.js';
import { simulatorService } from './services/simulatorService.js';
import { seedInitialData } from './utils/seedData.js';

import telemetryRoutes from './routes/telemetryRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import simulatorRoutes from './routes/simulatorRoutes.js';
import authRoutes from './routes/authRoutes.js';
import copilotRoutes from './routes/copilotRoutes.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: '*' }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (config.nodeEnv !== 'test') {
  app.use(morgan('short'));
}

// Serve client dist build if present
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'HyperPulse Telemetry Server',
    environment: config.nodeEnv,
  });
});

// Mount Routes
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/junctions', deviceRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/copilot', copilotRoutes);

// Fallback to client index.html for SPA routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('HyperPulse Telemetry API Server running. Open Vite frontend on port 5173.');
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ServerError]', err.stack || err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// Boot Sequence
async function startServer() {
  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Seed Initial Devices & Admin User
    await seedInitialData();

    // 3. Initialize Socket.IO
    socketService.init(server, config.clientUrl);

    // 4. Start HTTP Server
    server.listen(config.port, () => {
      console.log(`====================================================`);
      console.log(`🚀 HyperPulse Telemetry Engine running on port ${config.port}`);
      console.log(`📡 WebSocket server live with Room selective distribution`);
      console.log(`📊 Health check: http://localhost:${config.port}/api/health`);
      console.log(`====================================================`);

      // 5. Start background virtual device simulator
      if (config.simulatorEnabled) {
        simulatorService.start(15); // 15 events/sec default
      }
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');
  simulatorService.stop();
  server.close(() => {
    console.log('HTTP & Socket.IO server closed.');
    process.exit(0);
  });
});

startServer();
