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

  // 3. Smart Streetlight Logic (Sensor Auto Mode + Web Command Override)
  static bool webOverrideOn = false;
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.startsWith("PWM:")) {
      int pwmVal = input.substring(4).toInt();
      webOverrideOn = (pwmVal > 0);
    } else if (input.equalsIgnoreCase("LIGHT:ON")) {
      webOverrideOn = true;
    } else if (input.equalsIgnoreCase("LIGHT:OFF")) {
      webOverrideOn = false;
    }
  }

  // Turn ON streetlight if Night + Motion detected, OR if web app override is ON
  bool shouldTurnOn = (isNight && motionDetected == HIGH) || webOverrideOn;
  if (shouldTurnOn) {
    digitalWrite(STREETLIGHT_PIN, HIGH);
  } else {
    digitalWrite(STREETLIGHT_PIN, LOW);
  }

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
  display.print("LED Pin 3: ");
  if (digitalRead(STREETLIGHT_PIN) == HIGH) {
    display.println("ON [HIGH]");
  } else {
    display.println("OFF [LOW]");
  }
  
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
    Serial.println("}");
  }
}
