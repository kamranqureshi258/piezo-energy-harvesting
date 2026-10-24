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
 *   - HTTP device gateway: POST /api/gateway/sync (header x-gateway-token)
 *     carries telemetry up, a queued command down, and an optional ack in one
 *     round trip, and refreshes the HTTP gateway's presence lease. Commands
 *     are delivered at-least-once; devices dedupe by commandId.
 *   - CORS is restricted to ALLOWED_ORIGINS (comma-separated). Falls back to
 *     the deployed Vercel origin + local Vite dev origins.
 */

import express from 'express';
import crypto from 'node:crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
// The ESP8266 may be finishing a bounded 15 s HTTPS sync when a browser
// queues a command. Keep the command alive long enough for that sync to end,
// the next poll to deliver it, and the following poll to return its ack.
const LED_COMMAND_TIMEOUT_MS = Number(process.env.LED_COMMAND_TIMEOUT_MS || 30000);
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
  steps: null,
  vCap: null,
  pulse: null,
  lux: null,
  weather: null,
  brightness: null,
  updatedAt: null,
};

function finiteTelemetryNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

// Designated-gateway registry and command bookkeeping
let gateway = null; // the single authenticated gateway socket
const gatewayStats = {
  lastSeenAt: null,
  lastCommandAt: null,
  lastAckAt: null,
};
const pendingCommands = new Map(); // commandId -> { requesterId, timer, issuedAt, transport }
const lastControlAtBySocket = new Map(); // per-socket flood control

// HTTP-polling gateway presence: an authenticated /api/gateway/sync refreshes
// a lease; the gateway counts as online while the lease is fresh OR while a
// Socket.IO gateway session is connected. At most one HTTP command is in
// flight at a time (httpOutbox) until it is acknowledged or times out.
const httpGateway = { lastSyncAt: null };
const httpOutbox = { entry: null };
const GATEWAY_SYNC_FRESH_MS = Number(process.env.GATEWAY_SYNC_FRESH_MS || 30000);

function httpGatewayFresh() {
  return Boolean(httpGateway.lastSyncAt) &&
    Date.now() - Date.parse(httpGateway.lastSyncAt) < GATEWAY_SYNC_FRESH_MS;
}
function socketGatewayReady() {
  return Boolean(gateway && gateway.connected);
}
function gatewayOnline() {
  return socketGatewayReady() || httpGatewayFresh();
}
function currentTransport() {
  if (socketGatewayReady()) return 'socket';
  if (httpGatewayFresh()) return 'http';
  return null;
}
let gatewayOnlineState = false;
function refreshGatewayOnlineState() {
  const online = gatewayOnline();
  if (online !== gatewayOnlineState) {
    gatewayOnlineState = online;
    io.emit('gateway:status', {
      online,
      transport: currentTransport(),
      at: new Date().toISOString(),
    });
  }
}
// Constant-time secret comparison (length-checked first).
function isGatewayTokenValid(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || !GATEWAY_TOKEN) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(GATEWAY_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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

// Legacy REST ingestion endpoint, protected with the same gateway token.
app.post('/api/telemetry', (req, res) => {
  if (!isGatewayTokenValid(req.get('x-gateway-token'))) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }
  const { steps, vCap, pulse, lux, weather, brightness } = req.body;

  let telemetryUpdated = false;
  for (const [key, value] of Object.entries({ steps, vCap, pulse, lux, brightness })) {
    const number = finiteTelemetryNumber(value);
    if (number !== undefined) {
      globalState[key] = number;
      telemetryUpdated = true;
    }
  }
  if (typeof weather === 'string' && weather.length <= 32) {
    globalState.weather = weather;
    telemetryUpdated = true;
  }
  if (telemetryUpdated) globalState.updatedAt = new Date().toISOString();

  // Broadcast update to all global clients
  io.emit('telemetry:update', globalState);

  res.json({ success: true, state: globalState });
});

// Gateway online status (read-only; safe for the dashboard to poll)
app.get('/api/gateway/status', (req, res) => {
  res.json({
    online: gatewayOnline(),
    transport: currentTransport(),
    gatewayId: socketGatewayReady() ? gateway.data.gatewayId : null,
    lastSeenAt: gatewayStats.lastSeenAt,
    lastSyncAt: httpGateway.lastSyncAt,
    lastCommandAt: gatewayStats.lastCommandAt,
    lastAckAt: gatewayStats.lastAckAt,
  });
});

// Authenticated device sync: telemetry up, queued command down, optional
// acknowledgement in, presence refresh — one round trip. Authenticated with
// the x-gateway-token header; the token value is never logged or echoed.
app.post('/api/gateway/sync', (req, res) => {
  if (!isGatewayTokenValid(req.get('x-gateway-token'))) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = (req.body && typeof req.body === 'object') ? req.body : {};

  // Telemetry ingest — same schema and merge as POST /api/telemetry, plus a
  // finiteness guard: a field that does not coerce to a finite number (e.g.
  // "abc") is skipped rather than poisoning the shared state with NaN.
  const finiteNumber = finiteTelemetryNumber;
  const { steps, vCap, pulse, lux, weather, brightness } = body;
  let telemetryUpdated = false;
  if (steps !== undefined) { const n = finiteNumber(steps); if (n !== undefined) { globalState.steps = n; telemetryUpdated = true; } }
  if (vCap !== undefined) { const n = finiteNumber(vCap); if (n !== undefined) { globalState.vCap = n; telemetryUpdated = true; } }
  if (pulse !== undefined) { const n = finiteNumber(pulse); if (n !== undefined) { globalState.pulse = n; telemetryUpdated = true; } }
  if (lux !== undefined) { const n = finiteNumber(lux); if (n !== undefined) { globalState.lux = n; telemetryUpdated = true; } }
  if (weather !== undefined) { globalState.weather = weather; telemetryUpdated = true; }
  if (brightness !== undefined) { const n = finiteNumber(brightness); if (n !== undefined) { globalState.brightness = n; telemetryUpdated = true; } }
  if (telemetryUpdated) {
    globalState.updatedAt = new Date().toISOString();
    io.emit('telemetry:update', globalState);
  }

  // Presence: an authenticated sync refreshes the HTTP gateway's lease.
  httpGateway.lastSyncAt = new Date().toISOString();
  gatewayStats.lastSeenAt = httpGateway.lastSyncAt;
  refreshGatewayOnlineState();

  // Acknowledgement for a previously delivered HTTP command. Only commands
  // that were actually delivered over HTTP may be acknowledged here, and only
  // once (duplicate/late/unknown acks are reported, never re-relayed).
  let ackResult = null;
  const ack = body.ack;
  if (ack !== undefined) {
    if (!ack || typeof ack !== 'object' || typeof ack.commandId !== 'string' ||
        (ack.status !== 'applied' && ack.status !== 'rejected')) {
      ackResult = 'invalid';
    } else {
      const pending = pendingCommands.get(ack.commandId);
      if (!pending) {
        ackResult = 'unknown'; // duplicate or late (already resolved/expired)
      } else if (pending.transport !== 'http') {
        ackResult = 'transport-mismatch'; // socket-delivered commands ack via socket
      } else {
        clearTimeout(pending.timer);
        pendingCommands.delete(ack.commandId);
        if (httpOutbox.entry && httpOutbox.entry.commandId === ack.commandId) {
          httpOutbox.entry = null;
        }
        gatewayStats.lastAckAt = new Date().toISOString();
        const latencyMs = Date.now() - Date.parse(pending.issuedAt);
        io.to(pending.requesterId).emit('control:ack', {
          commandId: ack.commandId,
          command: pending.command,
          status: ack.status,
          detail: ack.detail ?? null,
          latencyMs,
        });
        ackResult = 'ok';
      }
    }
  }

  // Release the queue if the pending command disappeared (expired, or the
  // requesting browser disconnected) — never deliver a dead command.
  if (httpOutbox.entry && !pendingCommands.has(httpOutbox.entry.commandId)) {
    httpOutbox.entry = null;
  }

  // At-least-once delivery: the queued command is returned on every sync until
  // it is acknowledged or expires. Devices dedupe by commandId.
  let command = null;
  if (httpOutbox.entry) {
    command = {
      commandId: httpOutbox.entry.commandId,
      command: httpOutbox.entry.command,
      issuedAt: httpOutbox.entry.issuedAt,
    };
  }

  return res.json({ ok: true, command, ackResult });
});

// Identity & authentication middleware
io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  if (auth.role === 'gateway') {
    if (!GATEWAY_TOKEN) return next(new Error('gateway-auth-disabled'));
    if (!isGatewayTokenValid(typeof auth.token === 'string' ? auth.token : '')) {
      return next(new Error('invalid-gateway-token'));
    }
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
    refreshGatewayOnlineState();
  } else {
    console.log(`🌐 Global Client Connected: ${socket.id}`);
    // Short-lived per-connection command ticket (refreshed on every reconnect).
    socket.emit('session:ticket', { ticket: socket.data.cmdTicket });
    // Seed the newcomer with the CURRENT gateway status (online or offline)
    // so a browser that loads at any point immediately knows the state.
    socket.emit('gateway:status', {
      online: gatewayOnline(),
      transport: currentTransport(),
      gatewayId: socketGatewayReady() ? gateway.data.gatewayId : null,
      at: gatewayStats.lastSeenAt,
    });
  }

  // Send current state on connection
  socket.emit('telemetry:update', globalState);

  // Gateway heartbeat (keeps lastSeenAt fresh between commands)
  socket.on('gateway:heartbeat', () => {
    gatewayStats.lastSeenAt = new Date().toISOString();
  });

  // Gateway telemetry stream
  socket.on('gateway:telemetry', (data) => {
    if (socket.data.role !== 'gateway') return;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    let telemetryUpdated = false;
    for (const key of ['steps', 'vCap', 'pulse', 'lux', 'brightness']) {
      const value = finiteTelemetryNumber(data[key]);
      if (value !== undefined) {
        globalState[key] = value;
        telemetryUpdated = true;
      }
    }
    if (typeof data.weather === 'string' && data.weather.length <= 32) {
      globalState.weather = data.weather;
      telemetryUpdated = true;
    }
    if (!telemetryUpdated) return;
    globalState.updatedAt = new Date().toISOString();
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

    if (!gatewayOnline()) {
      return respond({ ok: false, reason: 'gateway-offline' });
    }

    const commandId = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    gatewayStats.lastCommandAt = issuedAt;

    // Delivery: a connected Socket.IO gateway gets the command immediately;
    // otherwise it is queued for the HTTP-polling gateway (at most one
    // unacknowledged command in flight).
    let transport;
    if (socketGatewayReady()) {
      gateway.emit('hardware:pwm', {
        commandId,
        command: payload.command,
        issuedAt,
      });
      transport = 'socket';
    } else {
      if (httpOutbox.entry) {
        return respond({ ok: false, reason: 'gateway-busy' });
      }
      httpOutbox.entry = {
        commandId,
        command: payload.command,
        issuedAt,
        requesterId: socket.id,
      };
      transport = 'http';
    }

    const timer = setTimeout(() => {
      if (pendingCommands.delete(commandId)) {
        console.log(`⏱️ LED command timed out: ${payload.command} (${commandId})`);
        if (httpOutbox.entry && httpOutbox.entry.commandId === commandId) {
          httpOutbox.entry = null; // release the queue so later commands proceed
        }
        io.to(socket.id).emit('control:ack', {
          commandId,
          status: 'timeout',
          command: payload.command,
        });
      }
    }, LED_COMMAND_TIMEOUT_MS);
    pendingCommands.set(commandId, { requesterId: socket.id, timer, issuedAt, transport, command: payload.command });

    console.log(
      `⚡ LED command (${transport}) → gateway: ${payload.command} (${commandId})`
    );
    return respond({ ok: true, commandId });
  });

  // Gateway acknowledgment → relay to the requesting browser only.
  socket.on('command:ack', (ack) => {
    if (socket.data.role !== 'gateway') return;
    if (!ack || typeof ack.commandId !== 'string') return;
    const pending = pendingCommands.get(ack.commandId);
    if (!pending) return; // unknown, duplicate, or late acknowledgement
    if (pending.transport !== 'socket') return; // HTTP acks arrive via /api/gateway/sync
    clearTimeout(pending.timer);
    pendingCommands.delete(ack.commandId);
    gatewayStats.lastAckAt = new Date().toISOString();
    const latencyMs = Date.now() - Date.parse(pending.issuedAt);
    io.to(pending.requesterId).emit('control:ack', {
      commandId: ack.commandId,
      command: pending.command,
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
      refreshGatewayOnlineState();
    }
    // Drop pending commands requested by this socket.
    for (const [commandId, p] of pendingCommands) {
      if (p.requesterId === socket.id) {
        clearTimeout(p.timer);
        pendingCommands.delete(commandId);
      }
    }
    lastControlAtBySocket.delete(socket.id);
    // Never relay a queued command's acknowledgement to a requester that is
    // gone: discard it instead.
    if (httpOutbox.entry && httpOutbox.entry.requesterId === socket.id) {
      httpOutbox.entry = null;
    }
  });
});

// Detect HTTP-gateway lease expiry (stale sync -> offline) independent of
// request arrival, so browsers learn about offline transitions promptly.
// Single interval; no timers are created per gateway or command.
setInterval(refreshGatewayOnlineState, 5000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 PiezoGrid Global Cloud Telemetry Backend running at http://localhost:${PORT}`);
  console.log(`🔐 Gateway auth ${GATEWAY_TOKEN ? 'ENABLED' : 'DISABLED (set GATEWAY_TOKEN)'}`);
  console.log(`🌐 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
});
