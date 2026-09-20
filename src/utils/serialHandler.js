/**
 * Web Serial API Manager for Arduino Communication
 * Connects directly to Arduino COM ports over USB.
 */

export class ArduinoSerialHandler {
  constructor({ onData, onConnect, onDisconnect, onError }) {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.keepReading = false;
    this.connected = false;

    this.onData = onData || (() => {});
    this.onConnect = onConnect || (() => {});
    this.onDisconnect = onDisconnect || (() => {});
    this.onError = onError || (() => {});
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect(baudRate = 115200) {
    if (!ArduinoSerialHandler.isSupported()) {
      throw new Error("Web Serial API is not supported in this browser. Please use Google Chrome, MS Edge, or Opera.");
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: Number(baudRate) });

      this.connected = true;
      this.keepReading = true;
      this.onConnect();

      // Start asynchronous read loop
      this.readLoop();
    } catch (err) {
      this.connected = false;
      this.onError(err.message || "Failed to connect to Serial Port");
      throw err;
    }
  }

  async readLoop() {
    let lineBuffer = '';

    while (this.port && this.port.readable && this.keepReading) {
      try {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        while (true) {
          const { value, done } = await this.reader.read();
          if (done) {
            this.reader.releaseLock();
            break;
          }
          if (value) {
            lineBuffer += value;
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop(); // keep last incomplete line in buffer

            for (let line of lines) {
              line = line.trim();
              if (line.length > 0) {
                this.parseAndEmitData(line);
              }
            }
          }
        }
      } catch (err) {
        if (this.keepReading) {
          console.error("Serial read error:", err);
          this.onError(err.message);
        }
      }
    }

    this.disconnect();
  }

  parseAndEmitData(rawLine) {
    try {
      // 1. Try JSON format: {"steps":10,"vcap":4.2,"pulse":0.5,"lux":80}
      if (rawLine.startsWith('{') && rawLine.endsWith('}')) {
        const parsed = JSON.parse(rawLine);
        this.onData({
          steps: parsed.steps ?? parsed.STEPS ?? 0,
          vCap: parsed.vcap ?? parsed.VCAP ?? 0,
          pulse: parsed.pulse ?? parsed.PULSE ?? 0,
          lux: parsed.lux ?? parsed.LUX ?? 50,
          raw: rawLine,
        });
        return;
      }

      // 2. CSV format fallback: "10,4.2,0.5,80"
      if (rawLine.includes(',')) {
        const parts = rawLine.split(',').map(s => parseFloat(s.trim()));
        if (parts.length >= 2) {
          this.onData({
            steps: parts[0] || 0,
            vCap: parts[1] || 0,
            pulse: parts[2] || 0,
            lux: parts[3] !== undefined ? parts[3] : 50,
            raw: rawLine,
          });
          return;
        }
      }

      // 3. Key-Value format fallback: "STEPS:10 VCAP:4.2"
      if (rawLine.includes(':')) {
        const obj = {};
        const pairs = rawLine.split(/\s+/);
        pairs.forEach(pair => {
          const [k, v] = pair.split(':');
          if (k && v) obj[k.toLowerCase()] = parseFloat(v);
        });
        if (obj.vcap !== undefined || obj.steps !== undefined) {
          this.onData({
            steps: obj.steps || 0,
            vCap: obj.vcap || 0,
            pulse: obj.pulse || 0,
            lux: obj.lux !== undefined ? obj.lux : 50,
            raw: rawLine,
          });
        }
      }
    } catch (err) {
      console.warn("Could not parse serial line:", rawLine, err);
    }
  }

  async sendCommand(commandStr) {
    if (!this.port || !this.port.writable || !this.connected) return;
    try {
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      const writer = textEncoder.writable.getWriter();
      await writer.write(commandStr + '\n');
      writer.releaseLock();
    } catch (err) {
      console.error("Failed to send command:", err);
    }
  }

  async disconnect() {
    this.keepReading = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
    }
    this.connected = false;
    this.port = null;
    this.onDisconnect();
  }
}
