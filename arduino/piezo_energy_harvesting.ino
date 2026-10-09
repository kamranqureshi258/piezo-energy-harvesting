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
  =============================================================================
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Pin Definitions
#define LDR_PIN A0
#define PIEZO_PIN A1
#define PIR_PIN 2
#define STREETLIGHT_PIN 3

// System Variables
int stepCount = 0;
float totalVoltage = 0.0;
float previousVoltage = 0.0; 
unsigned long lastSerialTime = 0;

// Streetlight control from the web app:
//   LIGHT:ON / LIGHT:OFF force the LED, LIGHT:AUTO returns to sensor mode.
//   PWM:<0-255> is the web auto-algorithm request (only used in AUTO mode).
enum LightMode { LIGHT_AUTO, LIGHT_FORCE_ON, LIGHT_FORCE_OFF };
LightMode lightMode = LIGHT_AUTO;
bool webPwmRequestOn = false;
String serialLine = "";

void handleCommand(String cmd) {
  cmd.trim();
  if (cmd.equalsIgnoreCase("LIGHT:ON")) {
    lightMode = LIGHT_FORCE_ON;
  } else if (cmd.equalsIgnoreCase("LIGHT:OFF")) {
    lightMode = LIGHT_FORCE_OFF;
  } else if (cmd.equalsIgnoreCase("LIGHT:AUTO")) {
    lightMode = LIGHT_AUTO;
  } else if (cmd.startsWith("PWM:")) {
    webPwmRequestOn = (cmd.substring(4).toInt() > 0);
  }
}

// Non-blocking: drain every complete command waiting in the RX buffer.
void readSerialCommands() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLine.length() > 0) handleCommand(serialLine);
      serialLine = "";
    } else if (serialLine.length() < 32) {
      serialLine += c;
    }
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(PIR_PIN, INPUT);
  pinMode(STREETLIGHT_PIN, OUTPUT);

  // Start OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED FAILED TO BOOT!");
    for (;;); 
  }

  // Boot Screen & LED Hardware Self-Test
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(10, 10);
  display.println("PROTOTYPE BOOTING...");
  display.setCursor(10, 25);
  display.println("Testing LED Pin 3...");
  display.display();

  // Test LED on Pin 3 for 2 seconds to verify hardware polarity & wiring
  digitalWrite(STREETLIGHT_PIN, HIGH);
  delay(2000);
  digitalWrite(STREETLIGHT_PIN, LOW);

  display.clearDisplay();
  display.setCursor(10, 20);
  display.println("System Ready!");
  display.display();
  delay(1000);

  // SYNC BASELINE: Read residual charge to prevent phantom initial step
  int initialRead = analogRead(PIEZO_PIN);
  previousVoltage = (initialRead / 1023.0) * 5.0;
}

void loop() {
  // 1. Read Ambient Light (LDR)
  int ldrValue = analogRead(LDR_PIN);
  // Support both LDR module types (analog value < 600 or > 600)
  bool isNight = (ldrValue < 600); 

  // 2. Read Motion Sensor (PIR)
  int motionDetected = digitalRead(PIR_PIN);

  // 3. Smart Streetlight Logic (Web force ON/OFF, otherwise sensors + web auto request)
  readSerialCommands();
  bool shouldTurnOn;
  if (lightMode == LIGHT_FORCE_ON) {
    shouldTurnOn = true;
  } else if (lightMode == LIGHT_FORCE_OFF) {
    shouldTurnOn = false;
  } else {
    shouldTurnOn = (isNight && motionDetected == HIGH) || webPwmRequestOn;
  }
  digitalWrite(STREETLIGHT_PIN, shouldTurnOn ? HIGH : LOW);

  // 4. Physical Piezo Energy Harvesting (Ultra-Sensitive Delta)
  int rawPiezo = analogRead(PIEZO_PIN);
  float currentVoltage = (rawPiezo / 1023.0) * 5.0; 

  if ((currentVoltage - previousVoltage) >= 0.01) { 
    stepCount++;
    totalVoltage += (currentVoltage - previousVoltage); 
    delay(250); 
  } 
  
  previousVoltage = currentVoltage; 

  // 5. Update OLED Interface with Live Hardware Debug Info
  display.clearDisplay();
  
  // Line 1: Status & LDR Raw Value
  display.setCursor(0, 0);
  display.print("LDR:");
  display.print(ldrValue);
  display.print(" ");
  display.println(isNight ? "[NIGHT]" : "[DAY]");
  
  // Line 2: PIR Motion & Steps
  display.setCursor(0, 16);
  display.print("PIR:");
  display.print(motionDetected == HIGH ? "MOTION " : "IDLE   ");
  display.print("Stp:");
  display.println(stepCount);
  
  // Line 3: Harvested Voltage
  display.setCursor(0, 32);
  display.print("Harvested: ");
  display.print(totalVoltage, 2);
  display.println(" V");
  
  // Line 4: Pin 3 LED Output State
  display.setCursor(0, 48);
  display.print("LED:");
  display.print(shouldTurnOn ? "ON " : "OFF");
  display.print(" Mode:");
  if (lightMode == LIGHT_FORCE_ON) display.println("WEB-ON");
  else if (lightMode == LIGHT_FORCE_OFF) display.println("WEB-OFF");
  else display.println("AUTO");
  
  display.display();


  // 6. Serial Telemetry Stream for Web Application & Global Cloud Sync
  unsigned long now = millis();
  if (now - lastSerialTime >= 200) {
    lastSerialTime = now;
    
    int ambientLuxPct = map(ldrValue, 0, 1023, 100, 0);
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
    Serial.print(",\"led\":");
    Serial.print(shouldTurnOn ? 1 : 0);
    Serial.println("}");
  }
}
