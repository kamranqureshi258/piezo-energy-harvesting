/*
  =============================================================================
  PiezoGrid EcoControl Pro - OLED + Motion Sensor + Piezo Energy Harvesting
  =============================================================================
  Hardware Setup:
    - OLED Display: 128x64 SSD1306 (I2C address auto-detected at 0x3C or 0x3D; SDA=A4, SCL=A5)
    - LDR Sensor: Analog Pin A0
    - Piezo Sensor: Analog Pin A1
    - PIR Motion Sensor: Digital Pin 2
    - Streetlight Relay / LED: Digital Pin 8
    - Day/Night toggle button: Digital Pin 4 to GND (INPUT_PULLUP)

  Serial commands (9600 baud, newline-terminated) - accepted on BOTH ports:
    LIGHT:ON / LIGHT:OFF / LIGHT:AUTO
    MODE:DAY / MODE:NIGHT / MODE:AUTO
    PWM:<0-255>          (mapped to LED force on/off, matching the server allow-list)

  Gateway UART -> NodeMCU ESP8266 (nodemcu/piezogrid_gateway.ino):
    Gateway bridge wiring:
    - Uno D11 (SoftwareSerial TX, 5V) -> 1k/2k voltage divider -> NodeMCU D7 (GPIO13, hardware UART RX)
    - Uno D10 (SoftwareSerial RX)     <- NodeMCU D6 (GPIO12, TX) directly
    - Common GND between Uno and NodeMCU is REQUIRED.
    - 9600 baud, newline-terminated.
      Uno -> NodeMCU: compact JSON telemetry (steps/vcap/pulse/lux) every 5 s;
        USB telemetry also includes night/light fields.
      NodeMCU -> Uno: LIGHT:ON / LIGHT:OFF / LIGHT:AUTO / PWM:<0-255>
      Uno -> NodeMCU confirmations after applying a gateway command:
        LED:ON / LED:OFF  (same protocol as arduino/led_serial_test)
    - USB Serial (D0/D1) remains fully available for debugging and commands.
  =============================================================================
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SoftwareSerial.h>
#include <math.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
bool displayReady = false;

#define LDR_PIN A0
#define PIEZO_PIN A1
#define PIR_PIN 2
#define STREETLIGHT_PIN 8
#define DAYNIGHT_BTN_PIN 4

// Gateway commands arrive over SoftwareSerial. Telemetry leaves on D11 and
// must reach NodeMCU D7/GPIO13 through a 1k/2k divider. D2 (PIR), D4 (button)
// and D8 (LED) remain assigned; D0/D1 stay reserved for USB debugging.
#define GATEWAY_RX_PIN 10  // Uno RX input  <- NodeMCU D6 (GPIO12, TX, 3.3V direct)
#define GATEWAY_TX_PIN 11  // Uno TX output (5V) -> 1k/2k divider -> NodeMCU D7 (GPIO13, RX)
#define GATEWAY_BAUD   9600
SoftwareSerial gatewaySerial(GATEWAY_RX_PIN, GATEWAY_TX_PIN);  // (10, 11): RX first

int stepCount = 0;
float totalVoltage = 0.0;
float filteredPulseVoltage = 0.0;
float piezoBaselineAdc = 0.0;
float peakObservedDeltaAdc = 0.0;
float peakPositiveExcursionAdc = 0.0;
float peakNegativeExcursionAdc = 0.0;
bool piezoEventActive = false;
bool piezoArmed = false;
uint8_t piezoTriggerSamples = 0;
unsigned long piezoQuietSince = 0;
unsigned long lastSerialTime = 0;
unsigned long lastDisplayTime = 0;
unsigned long lastGatewayTelemetryTime = 0;
unsigned long lastStepTime = 0;
unsigned long piezoStartupTime = 0;
unsigned long piezoEventStartedAt = 0;
unsigned long lastPiezoUpdateTime = 0;
float piezoEventPeakVoltage = 0.0;
// A piezo disc and an Arduino analog input pick up electrical/mechanical
// noise. Count one event only after a clear excursion from the resting
// baseline; require the signal to return to quiet before another event.
const unsigned long STEP_DEBOUNCE_MS = 1000;
const float PIEZO_TRIGGER_VOLTS = 0.005f;  // reference sensitivity from the supplied sketch
const int PIEZO_TRIGGER_ADC = (int)(PIEZO_TRIGGER_VOLTS * 1023.0f / 5.0f + 0.5f);
const int PIEZO_RELEASE_ADC = 15;  // return close to baseline before re-arming
const int PIEZO_NOISE_FLOOR_ADC = 20;  // above observed idle peaks (~12 ADC); keeps measured taps (~61 ADC)
const unsigned long PIEZO_QUIET_RESET_MS = 80;
const unsigned long PIEZO_REARM_QUIET_MS = 1000;
const unsigned long PIEZO_STARTUP_CALIBRATION_MS = 2000;
const unsigned long PIEZO_MAX_EVENT_MS = 800;
const float PIEZO_PULSE_DECAY_V_PER_SEC = 3.0;
const unsigned long DISPLAY_REFRESH_MS = 500;
const unsigned long USB_TELEMETRY_MS = 5000;
// The ESP gateway polls cloud commands independently; a 5 s Uno snapshot keeps
// telemetry fresh while reducing serial coupling into the high-impedance A1.
const unsigned long GATEWAY_TELEMETRY_MS = 5000;
// Give the rectifier input time to settle after a D11 transmission burst.
const unsigned long GATEWAY_PIEZO_QUIET_MS = 250;

enum LightMode { LIGHT_AUTO, LIGHT_FORCE_ON, LIGHT_FORCE_OFF };
enum DayMode { DAY_AUTO, DAY_FORCE_DAY, DAY_FORCE_NIGHT };

LightMode lightMode = LIGHT_AUTO;
DayMode dayMode = DAY_AUTO;

bool lastBtnState = HIGH;
unsigned long lastBtnChangeMs = 0;
const unsigned long BTN_DEBOUNCE_MS = 40;

String serialBuffer = "";
String gatewayBuffer = "";             // NodeMCU command buffer
bool gatewayLedConfirmPending = false; // gateway command affected the LED
bool usbDiagPending = false;           // USB diagnostic for a received command
String lastDiagCommand = "";
String lastDiagSource = "";

uint8_t findOledAddress() {
  const uint8_t candidateAddresses[] = {0x3C, 0x3D};
  for (uint8_t i = 0; i < sizeof(candidateAddresses); i++) {
    Wire.beginTransmission(candidateAddresses[i]);
    if (Wire.endTransmission() == 0) {
      return candidateAddresses[i];
    }
  }
  return 0;
}

void setup() {
  Serial.begin(9600);
  Serial.println(F("UNO_BOOT"));
  Serial.setTimeout(20);
  gatewaySerial.begin(GATEWAY_BAUD);
  Wire.begin();
  Wire.setWireTimeout(25000, true);
  pinMode(PIR_PIN, INPUT);
  pinMode(STREETLIGHT_PIN, OUTPUT);
  pinMode(DAYNIGHT_BTN_PIN, INPUT_PULLUP);

  const uint8_t oledAddress = findOledAddress();
  if (oledAddress == 0) {
    Serial.println(F("No I2C device found at 0x3C or 0x3D; continuing without OLED."));
  } else if (!display.begin(SSD1306_SWITCHCAPVCC, oledAddress)) {
    Serial.print(F("I2C device found at 0x"));
    Serial.print(oledAddress, HEX);
    Serial.println(F(" but SSD1306 initialization failed; continuing without OLED."));
  } else {
    displayReady = true;
    Serial.print(F("OLED detected at I2C address 0x"));
    Serial.println(oledAddress, HEX);
    display.clearDisplay();
    display.setTextColor(WHITE);
    display.setTextSize(1);
    display.setCursor(10, 10);
    display.println(F("PROTOTYPE BOOTING..."));
    display.setCursor(10, 25);
    display.println(F("LED Output: D8"));
    display.display();
  }

  // Let the analog input settle and use its resting level as the initial
  // baseline. The baseline then follows only quiet readings very slowly.
  long baselineTotal = 0;
  for (uint8_t i = 0; i < 32; i++) {
    baselineTotal += analogRead(PIEZO_PIN);
    delay(2);
  }
  piezoBaselineAdc = baselineTotal / 32.0;
  piezoStartupTime = millis();
  lastPiezoUpdateTime = piezoStartupTime;
}

void applySerialCommand(String input) {
  input.trim();
  if (input.length() == 0) return;

  if (input.startsWith("PWM:")) {
    int pwmVal = input.substring(4).toInt();
    lightMode = (pwmVal > 0) ? LIGHT_FORCE_ON : LIGHT_FORCE_OFF;
  } else if (input.equalsIgnoreCase("LIGHT:ON")) {
    lightMode = LIGHT_FORCE_ON;
  } else if (input.equalsIgnoreCase("LIGHT:OFF")) {
    lightMode = LIGHT_FORCE_OFF;
  } else if (input.equalsIgnoreCase("LIGHT:AUTO")) {
    lightMode = LIGHT_AUTO;
  } else if (input.equalsIgnoreCase("MODE:DAY") || input.equalsIgnoreCase("DAY")) {
    dayMode = DAY_FORCE_DAY;
  } else if (input.equalsIgnoreCase("MODE:NIGHT") || input.equalsIgnoreCase("NIGHT")) {
    dayMode = DAY_FORCE_NIGHT;
  } else if (input.equalsIgnoreCase("MODE:AUTO") || input.equalsIgnoreCase("AUTO")) {
    dayMode = DAY_AUTO;
  }
}

// Read newline-terminated commands from one serial port. Gateway-sourced
// commands that affect the LED set the confirmation flag so the loop can
// answer with LED:ON / LED:OFF after the state is actually applied. Every
// received command sets the USB diagnostic flag (reported after the LED state
// is applied, as a complete line that never corrupts JSON telemetry).
void pollCommandStream(Stream &port, String &buffer, bool fromGateway) {
  while (port.available() > 0) {
    char c = (char)port.read();
    if (c == '\n' || c == '\r') {
      if (buffer.length() > 0) {
        bool affectsLed = buffer.startsWith(F("LIGHT:")) || buffer.startsWith(F("PWM:"));
        applySerialCommand(buffer);
        if (affectsLed) {
          usbDiagPending = true;
          lastDiagCommand = buffer;
          lastDiagSource = fromGateway ? F("gateway") : F("usb");
        }
        if (fromGateway && affectsLed) {
          gatewayLedConfirmPending = true;
        }
        buffer = "";
      }
    } else {
      if (buffer.length() < 48) {
        buffer += c;
      }
    }
  }
}

// USB Serial remains the debug/command console; the NodeMCU link runs the
// same parser so cloud commands reach the same code path.
void pollSerial() {
  pollCommandStream(Serial, serialBuffer, false);
  pollCommandStream(gatewaySerial, gatewayBuffer, true);
}

void pollDayNightButton() {
  bool btnState = digitalRead(DAYNIGHT_BTN_PIN);
  unsigned long now = millis();
  if (btnState != lastBtnState && (now - lastBtnChangeMs) > BTN_DEBOUNCE_MS) {
    lastBtnChangeMs = now;
    lastBtnState = btnState;
    if (btnState == LOW) {
      if (dayMode == DAY_AUTO) {
        dayMode = DAY_FORCE_NIGHT;
      } else if (dayMode == DAY_FORCE_NIGHT) {
        dayMode = DAY_FORCE_DAY;
      } else {
        dayMode = DAY_AUTO;
      }
    }
  }
}

void loop() {
  pollSerial();
  pollDayNightButton();

  int ldrValue = analogRead(LDR_PIN);
  bool ldrIsNight = (ldrValue < 600);

  bool isNight = ldrIsNight;
  if (dayMode == DAY_FORCE_DAY) isNight = false;
  if (dayMode == DAY_FORCE_NIGHT) isNight = true;

  int motionDetected = digitalRead(PIR_PIN);

  // Debug latch kept from bring-up: when true the LED is held off regardless
  // of mode. LED control (local serial or cloud gateway) requires false.
  const bool LED_FORCE_OFF_DEBUG = false;

  bool shouldTurnOn = false;
  if (lightMode == LIGHT_FORCE_ON) {
    shouldTurnOn = true;
  } else if (lightMode == LIGHT_FORCE_OFF) {
    shouldTurnOn = false;
  } else {
    // Original automatic behavior: ON when dark (LDR) AND PIR motion HIGH.
    shouldTurnOn = (isNight && motionDetected == HIGH);
  }
  if (LED_FORCE_OFF_DEBUG) {
    shouldTurnOn = false;
  }
  digitalWrite(STREETLIGHT_PIN, shouldTurnOn ? HIGH : LOW);

  // Truthful confirmation for the gateway: sent only after the LED state was
  // actually applied (same protocol as arduino/led_serial_test).
  if (gatewayLedConfirmPending) {
    gatewayLedConfirmPending = false;
    gatewaySerial.println(shouldTurnOn ? F("LED:ON") : F("LED:OFF"));
  }

  // USB diagnostic for the last received command + resulting LED state.
  // Complete println lines only - JSON telemetry is never interleaved.
  if (usbDiagPending) {
    usbDiagPending = false;
    Serial.print(F("[CMD] "));
    Serial.print(lastDiagCommand);
    Serial.print(F(" ("));
    Serial.print(lastDiagSource);
    Serial.print(F(") -> LED "));
    Serial.println(shouldTurnOn ? F("ON") : F("OFF"));
  }

  unsigned long now = millis();
  // Discard the first ADC conversion after reading A0 (the LDR), then take a
  // five-sample median. This rejects isolated serial-coupled spikes while
  // retaining the low 0.005 V sensitivity used by the reference sketch.
  analogRead(PIEZO_PIN);
  delayMicroseconds(120);
  int piezoSamples[5];
  for (uint8_t i = 0; i < 5; i++) {
    piezoSamples[i] = analogRead(PIEZO_PIN);
    delayMicroseconds(40);
  }
  int maximumPiezoSample = piezoSamples[0];
  int minimumPiezoSample = piezoSamples[0];
  for (uint8_t i = 1; i < 5; i++) {
    if (piezoSamples[i] > maximumPiezoSample) maximumPiezoSample = piezoSamples[i];
    if (piezoSamples[i] < minimumPiezoSample) minimumPiezoSample = piezoSamples[i];
  }
  for (uint8_t i = 1; i < 5; i++) {
    int key = piezoSamples[i];
    int j = i - 1;
    while (j >= 0 && piezoSamples[j] > key) {
      piezoSamples[j + 1] = piezoSamples[j];
      j--;
    }
    piezoSamples[j + 1] = key;
  }
  int rawPiezo = piezoSamples[2];
  // The median tracks the resting level; the maximum catches short positive
  // rectified pulses which can be lost by median filtering alone.
  float signedDeltaAdc = rawPiezo - piezoBaselineAdc;
  float positivePeakDeltaAdc = maximumPiezoSample - piezoBaselineAdc;
  float negativePeakDeltaAdc = piezoBaselineAdc - minimumPiezoSample;
  if (positivePeakDeltaAdc > peakPositiveExcursionAdc) {
    peakPositiveExcursionAdc = positivePeakDeltaAdc;
  }
  if (negativePeakDeltaAdc > peakNegativeExcursionAdc) {
    peakNegativeExcursionAdc = negativePeakDeltaAdc;
  }
  float deviationAdc = positivePeakDeltaAdc > 0.0f ? positivePeakDeltaAdc : 0.0f;
  if (deviationAdc <= PIEZO_NOISE_FLOOR_ADC) deviationAdc = 0;
  float absoluteDeltaAdc = max(fabs(maximumPiezoSample - piezoBaselineAdc),
                               fabs(minimumPiezoSample - piezoBaselineAdc));
  if (absoluteDeltaAdc > peakObservedDeltaAdc) peakObservedDeltaAdc = absoluteDeltaAdc;

  float deltaSeconds = (now - lastPiezoUpdateTime) / 1000.0;
  lastPiezoUpdateTime = now;
  float measuredPulseVoltage = (deviationAdc * 5.0) / 1023.0;
  bool calibratingPiezo = now - piezoStartupTime < PIEZO_STARTUP_CALIBRATION_MS;
  bool gatewayTransmitWindow = lastGatewayTelemetryTime != 0 &&
      now - lastGatewayTelemetryTime < GATEWAY_PIEZO_QUIET_MS;

  if (calibratingPiezo) {
    // Ignore boot/settling transients and quickly learn the sensor's resting
    // level before allowing a footstep to increment the counter.
    piezoBaselineAdc = (0.98 * piezoBaselineAdc) + (0.02 * rawPiezo);
    piezoEventActive = false;
    piezoTriggerSamples = 0;
    filteredPulseVoltage = 0.0;
    piezoQuietSince = 0;
  } else if (gatewayTransmitWindow) {
    // Ignore analog samples during the SoftwareSerial telemetry burst: the
    // Uno's own D11 transmission can couple into A1 and resemble a piezo hit.
    filteredPulseVoltage -= PIEZO_PULSE_DECAY_V_PER_SEC * deltaSeconds;
    if (filteredPulseVoltage < 0.0) filteredPulseVoltage = 0.0;
    piezoTriggerSamples = 0;
  } else {
    // Require a quiet baseline before each event. A bouncing or floating
    // input can otherwise cross the threshold repeatedly without footsteps.
    if (!piezoArmed && !piezoEventActive && deviationAdc <= PIEZO_RELEASE_ADC) {
      if (piezoQuietSince == 0) piezoQuietSince = now;
      if (now - piezoQuietSince >= PIEZO_REARM_QUIET_MS) {
        piezoArmed = true;
        piezoQuietSince = 0;
      }
    } else if (!piezoArmed && deviationAdc > PIEZO_RELEASE_ADC) {
      piezoQuietSince = 0;
    }

    if (piezoArmed && !piezoEventActive && deviationAdc >= PIEZO_TRIGGER_ADC) {
      if (piezoTriggerSamples < 3) piezoTriggerSamples++;
    } else {
      piezoTriggerSamples = 0;
    }

    if (piezoArmed && !piezoEventActive && piezoTriggerSamples >= 1 &&
        now - lastStepTime >= STEP_DEBOUNCE_MS) {
      piezoEventStartedAt = now;
      piezoEventActive = true;
      piezoArmed = false;
      piezoTriggerSamples = 0;
      piezoQuietSince = 0;
      piezoEventPeakVoltage = measuredPulseVoltage;
      filteredPulseVoltage = piezoEventPeakVoltage;
      // Count once when the positive impact is confirmed. A bridge rectifier
      // and storage capacitor can hold A1 high after the impact, so waiting
      // for the signal to return to baseline would lose real events.
      stepCount++;
      totalVoltage += piezoEventPeakVoltage * 2.0f;
      lastStepTime = now;
    }

    if (piezoEventActive) {
      if (measuredPulseVoltage > filteredPulseVoltage) {
        filteredPulseVoltage = measuredPulseVoltage;
      }
      if (measuredPulseVoltage > piezoEventPeakVoltage) {
        piezoEventPeakVoltage = measuredPulseVoltage;
      }
      if (deviationAdc <= PIEZO_RELEASE_ADC) {
        if (piezoQuietSince == 0) piezoQuietSince = now;
        if (now - piezoQuietSince >= PIEZO_QUIET_RESET_MS) {
          piezoEventActive = false;
          // The impact was already counted at confirmation time.
          filteredPulseVoltage = 0.0;
          piezoQuietSince = 0;
        }
      } else {
        piezoQuietSince = 0;
      }

      // A rectifier/storage node may hold its voltage well after an impact.
      // End the event once and re-zero the baseline so the held level does not
      // prevent re-arming forever. The 1 s quiet re-arm and debounce prevent a
      // single held pulse or rebound from being counted repeatedly.
      if (piezoEventActive && now - piezoEventStartedAt >= PIEZO_MAX_EVENT_MS) {
        piezoEventActive = false;
        filteredPulseVoltage = 0.0;
        piezoQuietSince = 0;
        piezoArmed = false;
        piezoBaselineAdc = rawPiezo;
      }
    } else {
      // Follow slow sensor offset changes only while no impact event is active.
      if (fabs(rawPiezo - piezoBaselineAdc) <= PIEZO_RELEASE_ADC) {
        piezoBaselineAdc = (0.995 * piezoBaselineAdc) + (0.005 * rawPiezo);
      }
      filteredPulseVoltage = max(0.0, filteredPulseVoltage -
                                  (PIEZO_PULSE_DECAY_V_PER_SEC * deltaSeconds));
    }
  }

  float currentVoltage = filteredPulseVoltage < 0.05 ? 0.0 : filteredPulseVoltage;

  if (displayReady && now - lastDisplayTime >= DISPLAY_REFRESH_MS) {
    lastDisplayTime = now;
    display.clearDisplay();

    display.setCursor(0, 0);
    display.print(F("STATUS: "));
    display.println(isNight ? F("NIGHT") : F("DAY"));
    display.drawLine(0, 10, SCREEN_WIDTH - 1, 10, SSD1306_WHITE);

    display.setCursor(0, 13);
    display.print(F("Steps: "));
    display.println(stepCount);

    display.setCursor(0, 25);
    display.print(F("Harvested: "));
    display.print(totalVoltage, 2);
    display.println(F(" V"));

    display.setCursor(0, 37);
    display.print(F("Motion: "));
    display.println(motionDetected == HIGH ? F("YES") : F("NO"));

    display.setCursor(0, 49);
    display.print(F("Streetlight: "));
    display.println(shouldTurnOn ? F("ON") : F("OFF"));

    display.display();
  }

  if (now - lastSerialTime >= USB_TELEMETRY_MS) {
    lastSerialTime = now;

    int ambientLuxPct = map(ldrValue, 0, 1023, 100, 0);
    if (dayMode == DAY_FORCE_NIGHT) ambientLuxPct = 8;
    if (dayMode == DAY_FORCE_DAY) ambientLuxPct = 92;
    if (ambientLuxPct < 0) ambientLuxPct = 0;
    if (ambientLuxPct > 100) ambientLuxPct = 100;

    // Both UARTs send at the same 5-second cadence to reduce coupling into A1;
    // A1 sampling is suppressed briefly after the paired transmission burst.
    sendTelemetryJson(Serial, stepCount, totalVoltage, currentVoltage,
                      ambientLuxPct, isNight, shouldTurnOn);
    // Keep a raw A1 diagnostic on USB only so the bridge output and threshold
    // can be checked without changing the NodeMCU telemetry JSON schema.
    static unsigned long lastPiezoDiagTime = 0;
    if (now - lastPiezoDiagTime >= 5000) {
      lastPiezoDiagTime = now;
      Serial.print(F("[PIEZO] raw_adc="));
      Serial.print(rawPiezo);
      Serial.print(F(" baseline_adc="));
      Serial.print(piezoBaselineAdc, 1);
      Serial.print(F(" signed_delta_adc="));
      Serial.print(signedDeltaAdc, 1);
      Serial.print(F(" delta_adc="));
      Serial.print(deviationAdc, 1);
      Serial.print(F(" peak_delta_adc="));
      Serial.print(peakObservedDeltaAdc, 1);
      Serial.print(F(" peak_positive_adc="));
      Serial.print(peakPositiveExcursionAdc, 1);
      Serial.print(F(" peak_negative_adc="));
      Serial.print(peakNegativeExcursionAdc, 1);
      Serial.print(F(" trigger_adc="));
      Serial.print(PIEZO_TRIGGER_ADC);
      Serial.print(F(" armed="));
      Serial.println(piezoArmed ? 1 : 0);
      peakObservedDeltaAdc = 0.0;
      peakPositiveExcursionAdc = 0.0;
      peakNegativeExcursionAdc = 0.0;
    }
    if (now - lastGatewayTelemetryTime >= GATEWAY_TELEMETRY_MS) {
      lastGatewayTelemetryTime = now;
      sendGatewayTelemetryJson(gatewaySerial, stepCount, totalVoltage,
                               currentVoltage, ambientLuxPct);
    }
  }
}

// One complete JSON object per line; identical field names/units on both
// ports. The NodeMCU maps "vcap" -> "vCap" for the cloud API.
void sendTelemetryJson(Stream &out, long steps, float vcapSum, float piezoVolt,
                       int ambientLuxPct, bool isNight, bool ledOn) {
  out.print(F("{\"steps\":"));
  out.print(steps);
  out.print(F(",\"vcap\":"));
  out.print(vcapSum, 2);
  out.print(F(",\"pulse\":"));
  out.print(piezoVolt, 2);
  out.print(F(",\"lux\":"));
  out.print(ambientLuxPct);
  out.print(F(",\"night\":"));
  out.print(isNight ? 1 : 0);
  out.print(F(",\"light\":"));
  out.print(ledOn ? 1 : 0);
  out.println(F("}"));
}

// Keep the Uno-to-ESP line below SoftwareSerial's small receive buffer. The
// backend gateway only consumes these four fields; night/light remain USB-only.
void sendGatewayTelemetryJson(Stream &out, long steps, float vcapSum,
                              float piezoVolt, int ambientLuxPct) {
  out.print(F("{\"steps\":"));
  out.print(steps);
  out.print(F(",\"vcap\":"));
  out.print(vcapSum, 2);
  out.print(F(",\"pulse\":"));
  out.print(piezoVolt, 2);
  out.print(F(",\"lux\":"));
  out.print(ambientLuxPct);
  out.println(F("}"));
}
