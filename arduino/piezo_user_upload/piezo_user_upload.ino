#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SoftwareSerial.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
SoftwareSerial espSerial(10, 11); // RX, TX; Uno D11 TX -> NodeMCU D7 via divider

const int LDR_PIN = A0;
const int PIEZO_PIN = A1;
const int STORAGE_CAP_PIN = A2;
const int PIR_PIN = 2;
const int LED_PIN = 8;

// A2 measures the post-bridge 1000 uF storage capacitor DC voltage.
// Keep A2 at or below 5 V. If the capacitor can exceed 5 V, use a divider
// and set STORAGE_DIVIDER_RATIO to the inverse divider scale.
const float STORAGE_DIVIDER_RATIO = 1.0f;

const int DARK_THRESHOLD = 600;
// The idle telemetry hovered near the old 100-count edge and generated
// repeated false steps. Use hysteresis so one noisy crossing cannot retrigger
// until the rectified input has fallen back near its resting level.
const int STEP_TRIGGER_THRESHOLD = 35;
const int STEP_RELEASE_THRESHOLD = 20;
const unsigned long DEBOUNCE_MS = 700;
const unsigned long SEND_INTERVAL = 200;
const unsigned long GATEWAY_SEND_INTERVAL = 1000;
const unsigned long OLED_REFRESH_MS = 200;

unsigned long steps = 0;
float storageCapVoltage = 0.0f;
unsigned long lastStepTime = 0;
unsigned long lastSendTime = 0;
unsigned long lastGatewaySendTime = 0;
unsigned long lastGatewayStepsSent = 0;

bool motion = false;
bool isDark = false;
bool lightOn = false;
bool commandNeedsAck = false;
bool piezoArmed = true;

enum LightMode { AUTO_MODE, FORCE_ON, FORCE_OFF };
enum DayMode { AUTO_DAY, FORCE_DAY, FORCE_NIGHT };

LightMode lightMode = AUTO_MODE;
DayMode dayMode = AUTO_DAY;

int ldrValue = 0;
int luxPercent = 0;
int piezoValue = 0;
float piezoVolts = 0.0;
unsigned long lastOLEDTime = 0;

void readSensors() {
  ldrValue = analogRead(LDR_PIN);
  motion = digitalRead(PIR_PIN) == HIGH;
  isDark = ldrValue < DARK_THRESHOLD;
  luxPercent = constrain(map(ldrValue, 0, 1023, 100, 0), 0, 100);

  // A1 must receive a properly protected 0-5 V signal.
  piezoValue = analogRead(PIEZO_PIN);
  piezoVolts = piezoValue * (5.0 / 1023.0);

  // Keep the post-bridge storage voltage for cloud telemetry. Discard one ADC
  // conversion after switching A1→A2.
  analogRead(STORAGE_CAP_PIN);
  delayMicroseconds(50);
  int capacitorAdc = analogRead(STORAGE_CAP_PIN);
  storageCapVoltage = capacitorAdc * (5.0f / 1023.0f) * STORAGE_DIVIDER_RATIO;
}

void countFootsteps() {
  unsigned long now = millis();

  if (!piezoArmed && piezoValue <= STEP_RELEASE_THRESHOLD) {
    piezoArmed = true;
  }

  if (piezoArmed && piezoValue >= STEP_TRIGGER_THRESHOLD &&
      now - lastStepTime >= DEBOUNCE_MS) {
    steps++;
    lastStepTime = now;
    piezoArmed = false;
  }
}

void controlStreetlight() {
  bool darkForControl = isDark;
  if (dayMode == FORCE_DAY) darkForControl = false;
  if (dayMode == FORCE_NIGHT) darkForControl = true;

  if (lightMode == FORCE_ON) {
    lightOn = true;
  } else if (lightMode == FORCE_OFF) {
    lightOn = false;
  } else {
    lightOn = darkForControl && motion;
  }

  digitalWrite(LED_PIN, lightOn ? HIGH : LOW);
}

void updateOLED() {
  unsigned long now = millis();
  if (now - lastOLEDTime < OLED_REFRESH_MS) return;
  lastOLEDTime = now;

  static bool initialized = false;
  static int shownNight = -1;
  static unsigned long shownSteps = 0;
  static int shownPiezoHundredthsV = -1;
  static int shownMotion = -1;
  static int shownLightStatus = -1;
  bool changed = false;

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);

  bool nightForDisplay = isDark;
  if (dayMode == FORCE_DAY) nightForDisplay = false;
  if (dayMode == FORCE_NIGHT) nightForDisplay = true;
  int nightValue = nightForDisplay ? 1 : 0;
  if (!initialized || shownNight != nightValue) {
    display.fillRect(48, 0, 80, 8, SSD1306_BLACK);
    display.setCursor(48, 0);
    display.print(nightForDisplay ? F("NIGHT") : F("DAY"));
    shownNight = nightValue;
    changed = true;
  }

  if (!initialized || shownSteps != steps) {
    display.fillRect(42, 10, 86, 8, SSD1306_BLACK);
    display.setCursor(42, 10);
    display.print(steps);
    shownSteps = steps;
    changed = true;
  }

  int piezoHundredthsV = (int)(piezoVolts * 100.0f + 0.5f);
  if (!initialized || shownPiezoHundredthsV != piezoHundredthsV) {
    display.fillRect(60, 20, 68, 8, SSD1306_BLACK);
    display.setCursor(60, 20);
    display.print(piezoHundredthsV / 100.0f, 2);
    display.print(F(" V"));
    shownPiezoHundredthsV = piezoHundredthsV;
    changed = true;
  }

  int motionValue = motion ? 1 : 0;
  if (!initialized || shownMotion != motionValue) {
    display.fillRect(48, 30, 80, 8, SSD1306_BLACK);
    display.setCursor(48, 30);
    display.print(motion ? F("YES") : F("NO"));
    shownMotion = motionValue;
    changed = true;
  }

  int lightStatus = lightMode == FORCE_ON ? 2 : lightMode == FORCE_OFF ? 3 : (lightOn ? 1 : 0);
  if (!initialized || shownLightStatus != lightStatus) {
    display.fillRect(0, 40, 128, 8, SSD1306_BLACK);
    display.setCursor(0, 40);
    display.print(F("LED: "));
    if (lightMode == FORCE_ON) {
      display.print(F("WEB ON"));
    } else if (lightMode == FORCE_OFF) {
      display.print(F("WEB OFF"));
    } else {
      display.print(F("AUTO "));
      display.print(lightOn ? F("ON") : F("OFF"));
    }
    shownLightStatus = lightStatus;
    changed = true;
  }

  initialized = true;
  if (changed) display.display();
}

void sendDashboardData(Stream &out) {
  // vcap is the post-bridge storage-capacitor voltage; pulse is the piezo A1
  // input voltage. They are distinct physical measurements.
  out.print(F("{\"steps\":"));
  out.print(steps);
  out.print(F(",\"vcap\":"));
  out.print(storageCapVoltage, 2);
  out.print(F(",\"pulse\":"));
  out.print(piezoVolts, 2);
  out.print(F(",\"lux\":"));
  out.print(luxPercent);
  out.print(F(",\"night\":"));
  out.print(isDark ? 1 : 0);
  out.print(F(",\"light\":"));
  out.print(lightOn ? 1 : 0);
  out.println(F("}"));
}

void applyCommand(String command) {
  command.trim();

  if (command == F("LIGHT:ON")) {
    lightMode = FORCE_ON;
    commandNeedsAck = true;
  } else if (command == F("LIGHT:OFF")) {
    lightMode = FORCE_OFF;
    commandNeedsAck = true;
  } else if (command == F("LIGHT:AUTO")) {
    lightMode = AUTO_MODE;
    commandNeedsAck = true;
  } else if (command.startsWith(F("PWM:"))) {
    lightMode = command.substring(4).toInt() > 0 ? FORCE_ON : FORCE_OFF;
    commandNeedsAck = true;
  } else if (command == F("MODE:DAY")) {
    dayMode = FORCE_DAY;
  } else if (command == F("MODE:NIGHT")) {
    dayMode = FORCE_NIGHT;
  } else if (command == F("MODE:AUTO")) {
    dayMode = AUTO_DAY;
  }
}

void readESPCommands() {
  if (espSerial.available()) {
    applyCommand(espSerial.readStringUntil('\n'));
  }
}

void readUSBCommands() {
  if (Serial.available()) {
    applyCommand(Serial.readStringUntil('\n'));
  }
}

void setup() {
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(9600);
  Serial.setTimeout(20);
  espSerial.begin(9600);
  espSerial.setTimeout(20);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("OLED initialization failed"));
    while (true) {}
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print(F("STATUS: "));
  display.setCursor(0, 10);
  display.print(F("Steps: "));
  display.setCursor(0, 20);
  display.print(F("Harvested: "));
  display.setCursor(0, 30);
  display.print(F("Motion: "));
  display.setCursor(0, 40);
  display.print(F("LED: "));
  display.display();
}

void loop() {
  readUSBCommands();
  readESPCommands();
  readSensors();
  countFootsteps();
  controlStreetlight();

  // The gateway waits for this confirmation before reporting a website
  // LED command as applied.
  if (commandNeedsAck) {
    espSerial.println(lightOn ? F("LED:ON") : F("LED:OFF"));
    commandNeedsAck = false;
  }

  updateOLED();

  unsigned long now = millis();

  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;
    sendDashboardData(Serial);   // USB diagnostics; web app reads backend only
  }

  // Push a new step count immediately; send regular snapshots once per second
  // so the other readings stay fresh without excessive serial traffic.
  bool stepsChanged = steps != lastGatewayStepsSent;
  if (stepsChanged || now - lastGatewaySendTime >= GATEWAY_SEND_INTERVAL) {
    lastGatewaySendTime = now;
    lastGatewayStepsSent = steps;
    sendDashboardData(espSerial);
  }
}
