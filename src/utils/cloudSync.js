/**
 * Global Cloud WebSocket Telemetry Sync Utility
 * Connects frontend to the global cloud server for real-time telemetry streaming worldwide.
 *
 * Secure LED-control client:
 *   - The backend issues a per-connection session ticket ('session:ticket');
 *     it is captured here and presented on every 'control:light'.
 *   - sendRemoteControl() returns a Promise resolving with the server's
 *     immediate validation result ({ok, commandId, reason?}); the gateway's
 *     outcome arrives separately as 'control:ack' (see onCommandAck).
 *   - Gateway online status arrives via 'gateway:status' (see onGatewayStatus).
 *   - Browser-to-browser command broadcasting no longer exists: commands are
 *     delivered only to the authenticated designated gateway.
 */

import { io } from 'socket.io-client';

class CloudSyncManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.serverUrl = import.meta.env.VITE_CLOUD_SERVER_URL || 'https://piezogrid-cloud-backend.onrender.com';
    this.statusListeners = [];
    this.ticket = null;
  }

  connect(customUrl) {
    // If a different URL is requested, tear down the existing socket first.
    if (customUrl && this.socket && this.serverUrl !== customUrl) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (customUrl) this.serverUrl = customUrl;
    // One socket per page: reuse it so repeated connect() calls (React
    // StrictMode remounts, re-renders) cannot create duplicate connections.
    // Reconnection after drops is handled by socket.io itself.
    if (this.socket) return;

    try {
      this.socket = io(this.serverUrl, {
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log(`⚡ Connected to Global Cloud Backend: ${this.serverUrl}`);
        this.connected = true;
        this.notifyStatus(true);
      });

      this.socket.on('disconnect', () => {
        console.log('❌ Disconnected from Global Cloud Backend');
        this.connected = false;
        this.notifyStatus(false);
      });

      this.socket.on('connect_error', () => {
        this.connected = false;
        this.notifyStatus(false);
      });

      // Per-connection command ticket from the backend. Re-issued on every
      // (re)connect, so it is always fresh for the current server session.
      this.socket.on('session:ticket', (data) => {
        this.ticket = data && typeof data.ticket === 'string' ? data.ticket : null;
      });
    } catch (e) {
      console.warn('Cloud sync connect error:', e);
    }
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
    callback(this.connected);
    // Returns an unsubscribe function so React effects can clean up.
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  notifyStatus(status) {
    this.statusListeners.forEach((cb) => cb(status));
  }

  subscribeTelemetry(onUpdate) {
    if (!this.socket) this.connect();
    if (!this.socket) return () => {}; // connect() failed; nothing to subscribe
    const handler = (data) => onUpdate(data);
    this.socket.on('telemetry:update', handler);
    // Returns an unsubscribe function so React effects can clean up
    // (prevents duplicate listeners across re-renders/remounts).
    return () => {
      if (this.socket) this.socket.off('telemetry:update', handler);
    };
  }

  emitGatewayData(telemetryData) {
    if (this.socket && this.connected) {
      this.socket.emit('gateway:telemetry', telemetryData);
    }
  }

  /**
   * Send an LED command through the secure designated-gateway path.
   * Resolves with the server's immediate validation result:
   *   { ok: true, commandId }                        — queued for the gateway
   *   { ok: false, reason }                          — rejected before delivery
   * The gateway's final outcome arrives as a 'control:ack' event (use
   * onCommandAck) matching the returned commandId.
   */
  sendRemoteControl(command) {
    return new Promise((resolve) => {
      if (!this.socket || !this.connected) {
        resolve({ ok: false, reason: 'not-connected', commandId: null });
        return;
      }
      if (typeof this.ticket !== 'string' || !this.ticket) {
        resolve({ ok: false, reason: 'no-session-ticket', commandId: null });
        return;
      }
      // Safety net: the server always acks; never hang the UI forever.
      const fallback = setTimeout(
        () => resolve({ ok: false, reason: 'no-response', commandId: null }),
        3000
      );
      this.socket.emit('control:light', { ticket: this.ticket, command }, (res) => {
        clearTimeout(fallback);
        resolve(res || { ok: false, reason: 'no-response', commandId: null });
      });
    });
  }

  /**
   * Subscribe to command outcomes: 'control:ack' events
   * { commandId, status: 'applied'|'rejected'|'timeout', latencyMs?, detail? }.
   * Returns an unsubscribe function.
   */
  onCommandAck(callback) {
    if (!this.socket) this.connect();
    if (!this.socket) return () => {};
    const handler = (data) => callback(data);
    this.socket.on('control:ack', handler);
    return () => {
      if (this.socket) this.socket.off('control:ack', handler);
    };
  }

  /**
   * Subscribe to designated-gateway online status:
   * { online: boolean, gatewayId?, at? } — emitted on gateway connect/disconnect.
   * Returns an unsubscribe function.
   */
  onGatewayStatus(callback) {
    if (!this.socket) this.connect();
    if (!this.socket) return () => {};
    const handler = (data) => callback(data);
    this.socket.on('gateway:status', handler);
    return () => {
      if (this.socket) this.socket.off('gateway:status', handler);
    };
  }
}

export const cloudSync = new CloudSyncManager();
