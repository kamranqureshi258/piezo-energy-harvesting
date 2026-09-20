/**
 * Global Cloud WebSocket Telemetry Sync Utility
 * Connects frontend to the global cloud server for real-time telemetry streaming worldwide.
 */

import { io } from 'socket.io-client';

class CloudSyncManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.serverUrl = import.meta.env.VITE_CLOUD_SERVER_URL || 'http://localhost:3001';
    this.statusListeners = [];
  }

  connect(customUrl) {
    if (customUrl) this.serverUrl = customUrl;
    if (this.socket && this.socket.connected) return;

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
    } catch (e) {
      console.warn('Cloud sync connect error:', e);
    }
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
    callback(this.connected);
  }

  notifyStatus(status) {
    this.statusListeners.forEach((cb) => cb(status));
  }

  subscribeTelemetry(onUpdate) {
    if (!this.socket) this.connect();
    this.socket.on('telemetry:update', (data) => {
      onUpdate(data);
    });
  }

  emitGatewayData(telemetryData) {
    if (this.socket && this.connected) {
      this.socket.emit('gateway:telemetry', telemetryData);
    }
  }

  sendRemoteControl(command) {
    if (this.socket && this.connected) {
      this.socket.emit('control:light', command);
    }
  }
}

export const cloudSync = new CloudSyncManager();

