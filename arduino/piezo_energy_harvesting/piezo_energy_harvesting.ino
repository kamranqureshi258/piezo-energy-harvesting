/*
  =============================================================================
  PiezoGrid EcoControl Pro - OLED + Motion Sensor + Piezo Energy Harvesting
  =============================================================================
  Hardware Setup:
    - OLED Display: 128x64 SSD1306 (I2C Address 0x3C: SDA, SCL)
    - LDR Sensor: Analog Pin A0
    - Piezo Sensor: Analog Pin A1
    - PIR Motion Sensor: Digital Pin 2
    - Streetlight Relay / LED: Digital Pin 3
    - Day/Night toggle button: Digital Pin 4 to GND (INPUT_PULLUP)
  Serial commands (9600 baud, newline-terminated):
    LIGHT:ON / LIGHT:OFF / LIGHT:AUTO
    MODE:DAY / MODE:NIGHT / MODE:AUTO
  =============================================================================
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

#define LDR_PIN A0
#define PIEZO_PIN A1
#define PIR_PIN 2
#define STREETLIGHT_PIN 3
#define DAYNIGHT_BTN_PIN 4

int stepCount = 0;
float totalVoltage = 0.0;
float previousVoltage = 0.0;
unsigned long lastSerialTime = 0;

enum LightMode { LIGHT_AUTO, LIGHT_FORCE_ON, LIGHT_FORCE_OFF };
enum DayMode { DAY_AUTO, DAY_FORCE_DAY, DAY_FORCE_NIGHT };

LightMode lightMode = LIGHT_AUTO;
DayMode dayMode = DAY_AUTO;

bool lastBtnState = HIGH;
unsigned long lastBtnChangeMs = 0;
const unsigned long BTN_DEBOUNCE_MS = 40;

String serialBuffer = "";

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(20);
  pinMode(PIR_PIN, INPUT);
  pinMode(STREETLIGHT_PIN, OUTPUT);
  pinMode(DAYNIGHT_BTN_PIN, INPUT_PULLUP);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED FAILED TO BOOT!");
    for (;;);
  }

  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(10, 10);
  display.println("PROTOTYPE BOOTING...");
  display.setCursor(10, 25);
  display.println("Testing LED Pin 3...");
  display.display();

  digitalWrite(STREETLIGHT_PIN, HIGH);
  delay(2000);
  digitalWrite(STREETLIGHT_PIN, LOW);

  display.clearDisplay();
  display.setCursor(10, 12);
  display.println("System Ready!");
  display.setCursor(10, 28);
  display.println("D4: Day/Night button");
  display.display();
  delay(1000);

  int initialRead = analogRead(PIEZO_PIN);
  previousVoltage = (initialRead / 1023.0) * 5.0;
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

void pollSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        applySerialCommand(serialBuffer);
        serialBuffer = "";
      }
    } else {
      if (serialBuffer.length() < 48) {
        serialBuffer += c;
      }
    }
  }
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

  bool shouldTurnOn = false;
  if (lightMode == LIGHT_FORCE_ON) {
    shouldTurnOn = true;
  } else if (lightMode == LIGHT_FORCE_OFF) {
    shouldTurnOn = false;
  } else {
    shouldTurnOn = (isNight && motionDetected == HIGH);
  }

  digitalWrite(STREETLIGHT_PIN, shouldTurnOn ? HIGH : LOW);

  int rawPiezo = analogRead(PIEZO_PIN);
  float currentVoltage = (rawPiezo / 1023.0) * 5.0;

  if ((currentVoltage - previousVoltage) >= 0.01) {
    stepCount++;
    totalVoltage += (currentVoltage - previousVoltage);
    delay(250);
  }

  previousVoltage = currentVoltage;

  const char* dayLabel = "AUTO-DAY";
  if (dayMode == DAY_FORCE_NIGHT) dayLabel = "MAN-NIGHT";
  else if (dayMode == DAY_FORCE_DAY) dayLabel = "MAN-DAY";
  else if (isNight) dayLabel = "AUTO-NIGHT";

  display.clearDisplay();

  display.setCursor(0, 0);
  display.print("LDR:");
  display.print(ldrValue);
  display.print(" ");
  display.println(isNight ? "[NIGHT]" : "[DAY]");

  display.setCursor(0, 16);
  display.print("PIR:");
  display.print(motionDetected == HIGH ? "MOTION " : "IDLE   ");
  display.print("Stp:");
  display.println(stepCount);

  display.setCursor(0, 32);
  display.print("Mode:");
  display.print(dayLabel);
  display.print(lightMode == LIGHT_FORCE_ON ? " L:ON" : (lightMode == LIGHT_FORCE_OFF ? " L:OFF" : " L:AU"));

  display.setCursor(0, 48);
  display.print("LED Pin 3: ");
  display.println(shouldTurnOn ? "ON [HIGH]" : "OFF [LOW]");

  display.display();

  unsigned long now = millis();
  if (now - lastSerialTime >= 200) {
    lastSerialTime = now;

    int ambientLuxPct = map(ldrValue, 0, 1023, 100, 0);
    if (dayMode == DAY_FORCE_NIGHT) ambientLuxPct = 8;
    if (dayMode == DAY_FORCE_DAY) ambientLuxPct = 92;
    if (ambientLuxPct < 0) ambientLuxPct = 0;
    if (ambientLuxPct > 100) ambientLuxPct = 100;

    Serial.print("{\"steps\":");
    Serial.print(stepCount);
    Serial.print(",\"vcap\":");
    Serial.print(totalVoltage, 2);
    Serial.print(",\"pulse\":");
    Serial.print(currentVoltage, 2);
    Serial.print(",\"lux\":");
    Serial.print(ambientLuxPct);
    Serial.print(",\"night\":");
    Serial.print(isNight ? 1 : 0);
    Serial.print(",\"light\":");
    Serial.print(shouldTurnOn ? 1 : 0);
    Serial.println("}");
  }
}
