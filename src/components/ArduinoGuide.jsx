import React, { useState } from 'react';
import { Cpu, Code2, Copy, Check, FileText, CircuitBoard, Layers } from 'lucide-react';

export default function ArduinoGuide() {
  const [copied, setCopied] = useState(false);

  const arduinoCode = `/*
  =============================================================================
  Piezoelectric Energy Harvesting & Smart Light Control - Arduino Sketch
  =============================================================================
  Hardware Setup:
    1. Piezoelectric Sensors connected in parallel via Rectifier Diode Bridge
       to an Energy Storage Capacitor (e.g., 4700uF 16V or Supercapacitor 5.5V).
    2. Analog Pin A0: Voltage Divider reading Capacitor Voltage (V_cap).
    3. Analog Pin A1: Piezo Instantaneous Impulse Sensor (for step detection).
    4. Analog Pin A2: LDR Ambient Light Sensor.
    5. Digital Pin 9 (PWM): Output to N-Channel MOSFET (IRF540N) controlling LED.
  =============================================================================
*/

const int PIN_CAP_VOLTAGE  = A0; // Capacitor voltage divider pin
const int PIN_PIEZO_IMPULSE= A1; // Piezo pulse detector pin
const int PIN_LDR_LIGHT    = A2; // Ambient Light Sensor (LDR)
const int PIN_LED_PWM      = 9;  // PWM Light output pin (0 - 255)

const float VREF = 5.0;            // ADC Reference Voltage
const float VOLTAGE_DIVIDER_RATIO = 2.0; // R1=10k, R2=10k
const int PIEZO_THRESHOLD = 150;   // ADC threshold for footstep edge

unsigned long footstepCount = 0;
bool lastStepState = false;
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 200; // 200ms telemetry interval

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_PWM, OUTPUT);
  analogWrite(PIN_LED_PWM, 0);
}

void loop() {
  int rawCapVoltage = analogRead(PIN_CAP_VOLTAGE);
  int rawPiezoPulse = analogRead(PIN_PIEZO_IMPULSE);
  int rawLdrLux     = analogRead(PIN_LDR_LIGHT);

  float capVoltage = (rawCapVoltage / 1023.0) * VREF * VOLTAGE_DIVIDER_RATIO;
  int ambientLuxPct = map(rawLdrLux, 0, 1023, 0, 100);

  bool isStepping = (rawPiezoPulse > PIEZO_THRESHOLD);
  if (isStepping && !lastStepState) {
    footstepCount++;
  }
  lastStepState = isStepping;

  // Listen for PWM brightness commands from Web App
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\\n');
    input.trim();
    if (input.startsWith("PWM:")) {
      int pwmVal = input.substring(4).toInt();
      pwmVal = constrain(pwmVal, 0, 255);
      analogWrite(PIN_LED_PWM, pwmVal);
    }
  }

  // Telemetry stream out
  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;
    float pulseVolt = (rawPiezoPulse / 1023.0) * VREF;

    Serial.print("{\\"steps\\":");
    Serial.print(footstepCount);
    Serial.print(",\\"vcap\\":");
    Serial.print(capVoltage, 2);
    Serial.print(",\\"pulse\\":");
    Serial.print(pulseVolt, 2);
    Serial.print(",\\"lux\\":");
    Serial.print(ambientLuxPct);
    Serial.println("}");
  }
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(arduinoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
      {/* Title */}
      <div className="flex items-center space-x-2.5">
        <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
          <CircuitBoard className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-100">Arduino Hardware & Wiring Guide</h2>
          <p className="text-xs text-slate-400">Complete Pinout Schematics & C++ Code</p>
        </div>
      </div>

      {/* Grid: Component List & Circuit Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Component List */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Required Components</span>
          </h3>

          <ul className="text-xs text-slate-300 space-y-2">
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">Piezoelectric Discs (×4-8):</span>
              <span className="text-amber-300 font-mono">Parallel Tile Array</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">Bridge Rectifier (1N4007 ×4):</span>
              <span className="text-amber-300 font-mono">AC to DC Rectification</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">Storage Capacitor:</span>
              <span className="text-cyan-300 font-mono">4700µF 16V / 5.5V SuperCap</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">Voltage Divider Resistors:</span>
              <span className="text-cyan-300 font-mono">10kΩ + 10kΩ (Pin A0)</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">LDR Light Sensor:</span>
              <span className="text-purple-300 font-mono">Pin A2 (with 10k resistor)</span>
            </li>
            <li className="flex justify-between pb-1">
              <span className="font-semibold text-slate-400">LED Driver MOSFET:</span>
              <span className="text-emerald-300 font-mono">IRF540N (Pin D9 PWM)</span>
            </li>
          </ul>
        </div>

        {/* Pinout Schematic */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Arduino Pin Mapping</span>
          </h3>

          <div className="space-y-2 text-xs">
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-amber-400 font-bold">Analog A0</span>
              <span className="text-slate-300">Capacitor Voltage Divider</span>
            </div>
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-cyan-400 font-bold">Analog A1</span>
              <span className="text-slate-300">Piezo Impulse Sensor (Step Edge)</span>
            </div>
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-purple-400 font-bold">Analog A2</span>
              <span className="text-slate-300">LDR Ambient Light Sensor</span>
            </div>
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-emerald-400 font-bold">Digital D9 (PWM)</span>
              <span className="text-slate-300">MOSFET LED Brightness Control</span>
            </div>
          </div>
        </div>
      </div>

      {/* Code Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
            <Code2 className="w-4 h-4 text-amber-400" />
            <span>Arduino C++ Firmware (`piezo_energy_harvesting.ino`)</span>
          </span>

          <button
            onClick={copyToClipboard}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 shadow-md"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Sketch Code</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-amber-200/90 overflow-x-auto max-h-72 leading-relaxed">
          {arduinoCode}
        </pre>
      </div>
    </div>
  );
}
