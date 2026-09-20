/**
 * Interactive Footstep & Piezoelectric Energy Simulator Engine
 * Simulates piezoelectric tile physics, capacitor charging/discharging curves,
 * and ambient light conditions when physical Arduino is not connected.
 */

export class PhysicsSimulator {
  constructor({ onStateUpdate }) {
    this.onStateUpdate = onStateUpdate || (() => {});
    
    // Physical state
    this.steps = 42;             // Initial simulated steps
    this.vCap = 3.65;            // Initial capacitor voltage (Volts)
    this.maxCapVoltage = 5.0;    // Max rated capacitor voltage
    this.pulseVoltage = 0.0;     // Instantaneous piezo pulse spike
    this.ambientLux = 45;        // Ambient light percentage (0-100%)
    this.capacitance = 0.0047;   // 4700 uF capacitor
    
    // Auto-walk / traffic simulation toggle
    this.autoFootsteps = false;
    this.footstepFrequency = 2;  // Steps per second in auto mode
    
    this.timer = null;
    this.lastTickTime = Date.now();
  }

  start() {
    if (this.timer) return;
    this.lastTickTime = Date.now();
    this.timer = setInterval(() => this.tick(), 100); // 10Hz tick
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stomp(forceMultiplier = 1.0) {
    this.steps += 1;
    
    // Each step injects ~0.15 Joules of mechanical energy converted to electrical
    const joulesInjected = 0.14 * forceMultiplier;
    
    // E = 0.5 * C * V^2 => V_new = sqrt(V_old^2 + 2 * E / C)
    const currentEnergy = 0.5 * this.capacitance * Math.pow(this.vCap, 2);
    const newEnergy = currentEnergy + joulesInjected;
    const calculatedNewVoltage = Math.sqrt((2 * newEnergy) / this.capacitance);
    
    // Cap voltage cannot exceed max rated voltage
    this.vCap = Math.min(this.maxCapVoltage, calculatedNewVoltage);

    // Pulse voltage spike (transient sensor voltage reading, e.g. 1.8V to 4.5V)
    this.pulseVoltage = Number((1.5 + Math.random() * 2.5 * forceMultiplier).toFixed(2));

    this.emitState();
  }

  tick(currentBrightnessPct = 50) {
    const now = Date.now();
    const dt = (now - this.lastTickTime) / 1000; // seconds
    this.lastTickTime = now;

    // Decay transient pulse voltage spike back to 0
    if (this.pulseVoltage > 0) {
      this.pulseVoltage = Math.max(0, this.pulseVoltage - 8.0 * dt);
    }

    // Auto footsteps mode simulation
    if (this.autoFootsteps && Math.random() < 0.25) {
      this.stomp(0.8 + Math.random() * 0.4);
    }

    // Discharge capacitor based on LED brightness output
    // LED power at 100% ~ 0.35 Watts
    const ledPowerWatts = (currentBrightnessPct / 100) * 0.35;
    if (this.vCap > 0.1 && ledPowerWatts > 0) {
      const energyDrawnJoules = ledPowerWatts * dt;
      const currentEnergy = 0.5 * this.capacitance * Math.pow(this.vCap, 2);
      const remainingEnergy = Math.max(0, currentEnergy - energyDrawnJoules);
      this.vCap = Math.sqrt((2 * remainingEnergy) / this.capacitance);
    }

    // Small capacitor self-discharge leakage resistor
    if (this.vCap > 0) {
      this.vCap = Math.max(0, this.vCap - 0.005 * dt);
    }

    this.emitState();
  }

  setAmbientLux(lux) {
    this.ambientLux = Math.min(100, Math.max(0, lux));
    this.emitState();
  }

  setAutoFootsteps(enabled) {
    this.autoFootsteps = enabled;
  }

  reset() {
    this.steps = 0;
    this.vCap = 0.5;
    this.pulseVoltage = 0.0;
    this.emitState();
  }

  emitState() {
    this.onStateUpdate({
      steps: this.steps,
      vCap: Number(this.vCap.toFixed(2)),
      pulse: Number(this.pulseVoltage.toFixed(2)),
      lux: Math.round(this.ambientLux),
      isSimulator: true,
    });
  }
}
