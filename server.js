/**
 * PiezoGrid EcoControl - Global Cloud Telemetry Backend Server
 * Express + Socket.io Real-Time WebSocket Telemetry
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Global Telemetry State Store
let globalState = {
  steps: 142,
  vCap: 4.18,
  pulse: 0.0,
  lux: 48,
  weather: 'sunny',
  brightness: 75,
  updatedAt: new Date().toISOString(),
};

// Health Check & REST API Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'PiezoGrid EcoControl Global Backend Server',
    telemetry: globalState,
  });
});

// REST API Ingestion Endpoint for ESP32 / Arduino / Gateways
app.post('/api/telemetry', (req, res) => {
  const { steps, vCap, pulse, lux, weather, brightness } = req.body;

  if (steps !== undefined) globalState.steps = Number(steps);
  if (vCap !== undefined) globalState.vCap = Number(vCap);
  if (pulse !== undefined) globalState.pulse = Number(pulse);
  if (lux !== undefined) globalState.lux = Number(lux);
  if (weather !== undefined) globalState.weather = weather;
  if (brightness !== undefined) globalState.brightness = Number(brightness);
  globalState.updatedAt = new Date().toISOString();

  // Broadcast update to all global clients
  io.emit('telemetry:update', globalState);

  res.json({ success: true, state: globalState });
});

// WebSocket Handling
io.on('connection', (socket) => {
  console.log(`🌐 Global Client Connected: ${socket.id}`);

  // Send current state on connection
  socket.emit('telemetry:update', globalState);

  // Gateway telemetry stream
  socket.on('gateway:telemetry', (data) => {
    globalState = { ...globalState, ...data, updatedAt: new Date().toISOString() };
    socket.broadcast.emit('telemetry:update', globalState);
  });

  // Remote lighting command
  socket.on('control:light', (command) => {
    console.log('⚡ Remote Light Command:', command);
    io.emit('hardware:pwm', command);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 PiezoGrid Global Cloud Telemetry Backend running at http://localhost:${PORT}`);
});
