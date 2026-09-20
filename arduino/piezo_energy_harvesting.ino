/*
  =============================================================================
  Piezoelectric Energy Harvesting & Smart Light Control - Arduino Sketch
  =============================================================================
  Hardware Setup:
    1. Piezoelectric Sensors connected in parallel via Rectifier Diode Bridge
       to a Energy Storage Capacitor (e.g., 1000uF - 4700uF or Supercapacitor 5.5V).
    2. Analog Pin A0: Voltage Divider reading Capacitor Voltage (V_cap).
    3. Analog Pin A1: Piezo Instantaneous Impulse Sensor (for step detection).
    4. Analog Pin A2: LDR Ambient Light Sensor.
    5. Digital Pin 9 (PWM): Output to Transistor / MOSFET / Relay controlling LED.
  =============================================================================
*/

// Pin Definitions
const int PIN_CAP_VOLTAGE  = A0; // Capacitor voltage divider pin
const int PIN_PIEZO_IMPULSE= A1; // Piezo pulse detector pin
const int PIN_LDR_LIGHT    = A2; // Ambient Light Sensor (LDR)
const int PIN_LED_PWM      = 9;  // PWM Light output pin (0 - 255)

// Circuit Constants
const float VREF = 5.0;            // ADC Reference Voltage
const float VOLTAGE_DIVIDER_RATIO = 2.0; // Divider ratio (R1=10k, R2=10k -> ratio 2.0 for up to 10V)
const int PIEZO_THRESHOLD = 150;   // ADC threshold for counting a footstep pulse

// State Variables
unsigned long footstepCount = 0;
bool lastStepState = false;
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 200; // Send serial telemetry every 200ms

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_PWM, OUTPUT);
  analogWrite(PIN_LED_PWM, 0); // Start off
}

void loop() {
  // Read Sensors
  int rawCapVoltage = analogRead(PIN_CAP_VOLTAGE);
  int rawPiezoPulse = analogRead(PIN_PIEZO_IMPULSE);
  int rawLdrLux     = analogRead(PIN_LDR_LIGHT);

  // Calculate actual capacitor voltage
  float capVoltage = (rawCapVoltage / 1023.0) * VREF * VOLTAGE_DIVIDER_RATIO;
  
  // Calculate Ambient Brightness percentage (0-100%)
  int ambientLuxPct = map(rawLdrLux, 0, 1023, 0, 100);

  // Detect Footstep Edge
  bool isStepping = (rawPiezoPulse > PIEZO_THRESHOLD);
  if (isStepping && !lastStepState) {
    footstepCount++;
  }
  lastStepState = isStepping;

  // Process incoming Serial commands from Web App (e.g. "PWM:180" or "MODE:AUTO")
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.startsWith("PWM:")) {
      int pwmVal = input.substring(4).toInt();
      pwmVal = constrain(pwmVal, 0, 255);
      analogWrite(PIN_LED_PWM, pwmVal);
    }
  }

  // Send Telemetry to Web App periodically
  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;

    // Send formatted JSON line
    // Format: {"steps":12,"vcap":3.82,"pulse":0.45,"lux":68}
    float pulseVolt = (rawPiezoPulse / 1023.0) * VREF;
    
    Serial.print("{\"steps\":");
    Serial.print(footstepCount);
    Serial.print(",\"vcap\":");
    Serial.print(capVoltage, 2);
    Serial.print(",\"pulse\":");
    Serial.print(pulseVolt, 2);
    Serial.print(",\"lux\":");
    Serial.print(ambientLuxPct);
    Serial.println("}");
  }
}
