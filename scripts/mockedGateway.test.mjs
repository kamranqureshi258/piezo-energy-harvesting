/**
 * PiezoGrid — local mock-gateway test suite for the secure LED-control path.
 *
 * Spawns the REAL server.js on 127.0.0.1:<port> with a test-only GATEWAY_TOKEN
 * and exercises the full contract with mocked sockets:
 *   gateway auth (wrong/right token), session tickets, addressed delivery,
 *   ack relay, timeout, offline nack, command allow-list, rate limit,
 *   heartbeat/status. NO production contact, NO real hardware.
 *
 * Run:  node scripts/mockedGateway.test.mjs
 * Exit: 0 when every check passes, 1 otherwise.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require2 = createRequire(path.join(repoRoot, 'package.json'));
const { io } = require2('socket.io-client');

const PORT = Number(process.env.TEST_PORT || 31001);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TOKEN = process.env.TEST_GATEWAY_TOKEN || 'local-test-token';

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connectBrowser() {
  const s = io(BASE_URL, { auth: { role: 'browser' }, transports: ['websocket'] });
  const t = { socket: s, ticket: null, acks: [], pwm: [] };
  s.on('session:ticket', (p) => { t.ticket = p && p.ticket ? p.ticket : null; });
  s.on('control:ack', (a) => t.acks.push(a));
  s.on('hardware:pwm', (p) => t.pwm.push(p));
  t.ready = new Promise((res) => s.on('connect', res));
  return t;
}
function connectGateway(token) {
  const s = io(BASE_URL, { auth: { role: 'gateway', token }, transports: ['websocket'] });
  const t = { socket: s, pwm: [] };
  s.on('hardware:pwm', (p) => t.pwm.push(p));
  t.ready = new Promise((res) => s.on('connect', res));
  t.connectError = new Promise((res) => s.on('connect_error', (e) => res(e)));
  return t;
}
const once = (t, event, ms = 1500) => new Promise((res) => {
  const timer = setTimeout(() => res(null), ms);
  t.socket.once(event, (data) => { clearTimeout(timer); res(data); });
});
const send = (socket, payload) =>
  new Promise((res) => socket.emit('control:light', payload, res));

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      GATEWAY_TOKEN: TOKEN,
      LED_COMMAND_TIMEOUT_MS: '800', // short timeout for fast tests
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  let stderrTail = '';
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-2000); });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE_URL}/api/gateway/status`);
      if (r.ok) return { child, stderrTail };
    } catch { /* not up yet */ }
    await wait(200);
  }
  console.error('server did not start; stderr:\n' + stderrTail);
  child.kill();
  process.exit(1);
}

// ---- run -------------------------------------------------------------------
const { child, stderrTail } = await startServer();
try {
  // 1. wrong gateway token rejected
  const badGw = connectGateway('wrong-token');
  const gwErr = await badGw.connectError;
  record('gateway auth: wrong token rejected', Boolean(gwErr && /invalid-gateway-token/.test(gwErr.message)), gwErr && gwErr.message);

  // 2. correct gateway token accepted + registered
  const gw = connectGateway(TOKEN);
  await gw.ready;
  const status1 = await (await fetch(`${BASE_URL}/api/gateway/status`)).json();
  record('gateway auth: correct token registered', status1.online === true);

  // 3. browser gets session ticket (+ telemetry snapshot)
  const A = connectBrowser();
  await A.ready;
  await wait(150);
  record('browser connect: session ticket issued', typeof A.ticket === 'string' && A.ticket.length > 10);

  // 4. forged ticket rejected, nothing delivered
  const cb4 = await send(A.socket, { ticket: 'forged', command: 'LIGHT:ON' });
  record('control: forged ticket rejected', cb4.ok === false && cb4.reason === 'invalid-ticket', JSON.stringify(cb4));
  record('control: forged ticket NOT delivered to gateway', gw.pwm.length === 0);

  // 5. valid command delivered ONLY to the gateway (never other browsers)
  const B = connectBrowser();
  await B.ready;
  const cb5 = await send(A.socket, { ticket: A.ticket, command: 'LIGHT:ON' });
  record('control: valid command accepted with commandId', cb5.ok === true && typeof cb5.commandId === 'string', JSON.stringify(cb5));
  await wait(150);
  const gwMsg = gw.pwm.find((p) => p.commandId === cb5.commandId);
  record('delivery: gateway received addressed command', Boolean(gwMsg) && gwMsg.command === 'LIGHT:ON');
  record('delivery: other browser received NOTHING', B.pwm.length === 0);

  // 6. gateway ack relayed to the requesting browser only
  gw.socket.emit('command:ack', { commandId: cb5.commandId, status: 'applied' });
  const ack6 = await once(A, 'control:ack');
  record('ack: requester received applied ack', Boolean(ack6) && ack6.status === 'applied' && ack6.commandId === cb5.commandId, JSON.stringify(ack6));
  record('ack: other browser did NOT receive the ack', B.acks.length === 0);

  // 7. missing gateway ack -> timeout to requester
  await wait(500); // clear the rate-limit window
  const cb7 = await send(A.socket, { ticket: A.ticket, command: 'LIGHT:OFF' });
  const ack7 = await once(A, 'control:ack', 2000);
  record('timeout: unacked command reports timeout', cb7.ok === true && Boolean(ack7) && ack7.status === 'timeout', JSON.stringify(ack7));

  // 8. gateway offline -> immediate nack
  gw.socket.disconnect();
  await wait(150);
  const status2 = await (await fetch(`${BASE_URL}/api/gateway/status`)).json();
  record('status: gateway offline reported', status2.online === false);
  const cb8 = await send(A.socket, { ticket: A.ticket, command: 'LIGHT:AUTO' });
  record('control: gateway offline -> immediate nack', cb8.ok === false && cb8.reason === 'gateway-offline', JSON.stringify(cb8));

  // 9. command allow-list
  const gw2 = connectGateway(TOKEN);
  await gw2.ready;
  await wait(500);
  const cb9 = await send(A.socket, { ticket: A.ticket, command: 'LED:ON' });
  record('allow-list: unknown command rejected', cb9.ok === false && cb9.reason === 'invalid-command', JSON.stringify(cb9));
  const cb9b = await send(A.socket, { ticket: A.ticket, command: 'PWM:999' });
  record('allow-list: PWM > 255 rejected', cb9b.ok === false && cb9b.reason === 'invalid-command');

  // 10. rate limit
  await wait(500);
  const rl1 = await send(A.socket, { ticket: A.ticket, command: 'LIGHT:ON' });
  const rl2 = await send(A.socket, { ticket: A.ticket, command: 'LIGHT:OFF' });
  record('rate limit: burst second command rejected', rl1.ok === true && rl2.ok === false && rl2.reason === 'rate-limited', JSON.stringify(rl2));

  // 11. gateway heartbeat updates lastSeenAt
  gw2.socket.emit('gateway:heartbeat');
  await wait(120);
  const status3 = await (await fetch(`${BASE_URL}/api/gateway/status`)).json();
  record('heartbeat: lastSeenAt updates', Boolean(status3.lastSeenAt), status3.lastSeenAt);

  // 12. legacy string payload (old clients) safely rejected
  const cb12 = await new Promise((res) => {
    A.socket.emit('control:light', 'LIGHT:ON', res);
    setTimeout(() => res({ ok: false, reason: 'no-response' }), 1000);
  });
  record('compat: legacy string payload rejected', cb12.ok === false, JSON.stringify(cb12));

  // 13. REGRESSION (connection order): a browser connecting while a gateway is
  // already online must immediately receive the current gateway status —
  // without waiting for any gateway reconnect.
  const C = connectBrowser();
  const seedC = await once(C, 'gateway:status', 1500);
  await C.ready;
  record(
    'seed: late browser learns gateway is online immediately',
    Boolean(seedC) && seedC.online === true && typeof seedC.gatewayId === 'string',
    JSON.stringify(seedC)
  );
  C.socket.disconnect();

  [A.socket, B.socket, gw2.socket].forEach((s) => s.disconnect());
} finally {
  child.kill();
  await wait(300);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length && stderrTail) {
  console.error('server stderr tail:\n' + stderrTail);
}
process.exit(passed === results.length ? 0 : 1);
