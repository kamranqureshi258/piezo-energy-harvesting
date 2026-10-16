/**
 * PiezoGrid EcoControl - Global Cloud Telemetry Backend Server
 * Express + Socket.io Real-Time WebSocket Telemetry
 *
 * Secure designated-gateway control channel:
 *   - The gateway authenticates at handshake: auth { role:'gateway', token }
 *     matched against the GATEWAY_TOKEN environment variable. Clients with a
 *     wrong/missing token are never registered as the gateway.
 *   - Browsers receive a short-lived per-connection command ticket
 *     ('session:ticket') and must present it on 'control:light'.
 *   - Commands are delivered ONLY to the authenticated gateway socket
 *     ('hardware:pwm' {commandId, command, issuedAt}) — never broadcast to
 *     browsers. The old browser broadcast has been removed.
 *   - The gateway acknowledges via 'command:ack'; the server relays
 *     'control:ack' to the requesting browser only and times commands out
 *     after LED_COMMAND_TIMEOUT_MS.
 *   - Heartbeats + connect/disconnect drive online status, surfaced at
 *     GET /api/gateway/status and via 'gateway:status' broadcasts; newly
 *     connecting browsers are also seeded with the current gateway status.
 *   - CORS is restricted to ALLOWED_ORIGINS (comma-separated). Falls back to
 *     the deployed Vercel origin + local Vite dev origins.
 */

import express from 'express';
import crypto from 'node:crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const LED_COMMAND_TIMEOUT_MS = Number(process.env.LED_COMMAND_TIMEOUT_MS || 5000);
const CONTROL_RATE_LIMIT_MS = Number(process.env.CONTROL_RATE_LIMIT_MS || 400);

const DEFAULT_ORIGINS = [
  'https://piezo-energy-harvesting.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // No-origin requests (health checks, curl) pass; unknown origins get no
    // CORS headers instead of a hard error.
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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

// Designated-gateway registry and command bookkeeping
let gateway = null; // the single authenticated gateway socket
const gatewayStats = {
  lastSeenAt: null,
  lastCommandAt: null,
  lastAckAt: null,
};
const pendingCommands = new Map(); // commandId -> { requesterId, timer, issuedAt }
const lastControlAtBySocket = new Map(); // per-socket flood control

// Only these commands may ever reach the gateway.
const COMMAND_RE = /^(LIGHT:(ON|OFF|AUTO)|PWM:(\d{1,3}))$/;
const isAllowedCommand = (command) =>
  COMMAND_RE.test(command) &&
  (!command.startsWith('PWM:') || Number(command.slice(4)) <= 255);

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

// Gateway online status (read-only; safe for the dashboard to poll)
app.get('/api/gateway/status', (req, res) => {
  res.json({
    online: Boolean(gateway && gateway.connected),
    gatewayId: gateway ? gateway.data.gatewayId : null,
    lastSeenAt: gatewayStats.lastSeenAt,
    lastCommandAt: gatewayStats.lastCommandAt,
    lastAckAt: gatewayStats.lastAckAt,
  });
});

// Identity & authentication middleware
io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  if (auth.role === 'gateway') {
    if (!GATEWAY_TOKEN) return next(new Error('gateway-auth-disabled'));
    if (auth.token !== GATEWAY_TOKEN) return next(new Error('invalid-gateway-token'));
    socket.data.role = 'gateway';
    socket.data.gatewayId = String(auth.gatewayId || 'nodemcu-1');
    return next();
  }
  socket.data.role = 'browser';
  socket.data.cmdTicket = crypto.randomUUID();
  return next();
});

// WebSocket Handling
io.on('connection', (socket) => {
  if (socket.data.role === 'gateway') {
    console.log(`🔌 Designated gateway connected: ${socket.data.gatewayId} (${socket.id})`);
    gateway = socket;
    gatewayStats.lastSeenAt = new Date().toISOString();
    io.emit('gateway:status', {
      online: true,
      gatewayId: socket.data.gatewayId,
      at: gatewayStats.lastSeenAt,
    });
  } else {
    console.log(`🌐 Global Client Connected: ${socket.id}`);
    // Short-lived per-connection command ticket (refreshed on every reconnect).
    socket.emit('session:ticket', { ticket: socket.data.cmdTicket });
    // Seed the newcomer with the CURRENT gateway status so a browser that
    // loads after the gateway connected immediately knows LED commands are
    // available (without waiting for a gateway reconnect).
    if (gateway && gateway.connected) {
      socket.emit('gateway:status', {
        online: true,
        gatewayId: gateway.data.gatewayId,
        at: gatewayStats.lastSeenAt,
      });
    }
  }

  // Send current state on connection
  socket.emit('telemetry:update', globalState);

  // Gateway heartbeat (keeps lastSeenAt fresh between commands)
  socket.on('gateway:heartbeat', () => {
    gatewayStats.lastSeenAt = new Date().toISOString();
  });

  // Gateway telemetry stream
  socket.on('gateway:telemetry', (data) => {
    globalState = { ...globalState, ...data, updatedAt: new Date().toISOString() };
    socket.broadcast.emit('telemetry:update', globalState);
  });

  // Remote lighting command: validated, rate-limited, and delivered ONLY to
  // the designated gateway socket. Never broadcast to browsers.
  socket.on('control:light', (payload, cb) => {
    const respond = (body) => (typeof cb === 'function' ? cb(body) : undefined);
    if (!payload || typeof payload !== 'object' || typeof payload.command !== 'string') {
      return respond({ ok: false, reason: 'invalid-payload' });
    }
    if (payload.ticket !== socket.data.cmdTicket) {
      return respond({ ok: false, reason: 'invalid-ticket' });
    }
    if (!isAllowedCommand(payload.command)) {
      return respond({ ok: false, reason: 'invalid-command' });
    }
    const lastAt = lastControlAtBySocket.get(socket.id) || 0;
    if (Date.now() - lastAt < CONTROL_RATE_LIMIT_MS) {
      return respond({ ok: false, reason: 'rate-limited' });
    }
    lastControlAtBySocket.set(socket.id, Date.now());

    if (!gateway || !gateway.connected) {
      return respond({ ok: false, reason: 'gateway-offline' });
    }

    const commandId = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    gatewayStats.lastCommandAt = issuedAt;
    const timer = setTimeout(() => {
      if (pendingCommands.delete(commandId)) {
        console.log(`⏱️ LED command timed out: ${payload.command} (${commandId})`);
        io.to(socket.id).emit('control:ack', {
          commandId,
          status: 'timeout',
          command: payload.command,
        });
      }
    }, LED_COMMAND_TIMEOUT_MS);
    pendingCommands.set(commandId, { requesterId: socket.id, timer, issuedAt });

    gateway.emit('hardware:pwm', {
      commandId,
      command: payload.command,
      issuedAt,
    });
    console.log(
      `⚡ LED command → gateway ${gateway.data.gatewayId}: ${payload.command} (${commandId})`
    );
    return respond({ ok: true, commandId });
  });

  // Gateway acknowledgment → relay to the requesting browser only.
  socket.on('command:ack', (ack) => {
    if (!ack || typeof ack.commandId !== 'string') return;
    const pending = pendingCommands.get(ack.commandId);
    if (!pending) return; // unknown or already resolved
    clearTimeout(pending.timer);
    pendingCommands.delete(ack.commandId);
    gatewayStats.lastAckAt = new Date().toISOString();
    const latencyMs = Date.now() - Date.parse(pending.issuedAt);
    io.to(pending.requesterId).emit('control:ack', {
      commandId: ack.commandId,
      status: ack.status === 'applied' ? 'applied' : 'rejected',
      detail: ack.detail ?? null,
      latencyMs,
    });
    console.log(`✅ LED command ack (${ack.status}, ${latencyMs}ms): ${ack.commandId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client Disconnected: ${socket.id}`);
    if (socket.data.role === 'gateway' && gateway && gateway.id === socket.id) {
      gateway = null;
      io.emit('gateway:status', { online: false, at: new Date().toISOString() });
    }
    // Drop pending commands requested by this socket.
    for (const [commandId, p] of pendingCommands) {
      if (p.requesterId === socket.id) {
        clearTimeout(p.timer);
        pendingCommands.delete(commandId);
      }
    }
    lastControlAtBySocket.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 PiezoGrid Global Cloud Telemetry Backend running at http://localhost:${PORT}`);
  console.log(`🔐 Gateway auth ${GATEWAY_TOKEN ? 'ENABLED' : 'DISABLED (set GATEWAY_TOKEN)'}`);
  console.log(`🌐 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
});
