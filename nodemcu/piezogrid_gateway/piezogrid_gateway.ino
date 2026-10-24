/*
  =============================================================================
  PiezoGrid EcoControl - NodeMCU ESP8266 HTTP Gateway (telemetry + LED control)
  =============================================================================
  One authenticated HTTPS round trip per interval (POST /api/gateway/sync):

    telemetry up  -> {"steps","vCap","pulse","lux"}   (same schema as before)
    command down  -> {"command":{"commandId","command","issuedAt"} | null}
    ack piggyback -> body may include "ack":{"commandId","status","detail"}
                     for a command delivered on a PREVIOUS sync.

  Auth: header "x-gateway-token: <GATEWAY_TOKEN>" (local secrets.h, never
  committed, never logged). TLS certificate validation is ENABLED against the
  GTS Root R4 trust anchor (see ROOT_CA_PEM below). setInsecure() is never used.

  Command handling (at-least-once + idempotent):
    - The server re-sends the queued command on every sync until acknowledged
      or expired. The gateway executes a commandId exactly ONCE
      (lastExecutedCommandId) and forwards it to the Uno over UART0:
          LIGHT:ON / LIGHT:OFF / LIGHT:AUTO / PWM:<0-255>
    - The Uno applies the command and answers with a confirmation line on the
      same link:  LED:ON  |  LED:OFF   (see the Uno sketch).
    - Only then is the ack queued as {commandId, status:'applied'}. A missing
      or erroring confirmation becomes status:'rejected'. The ack is carried in
      the NEXT sync body; if that sync fails, it is retried.
    - If the server re-sends an already-acked commandId (ack response lost),
      the gateway re-queues the same ack instead of re-executing.
    - LIGHT:ON / LIGHT:OFF are latched manual overrides that take priority
      over the Uno's sensor logic until the opposite command arrives;
      LIGHT:AUTO restores the Uno's sensor-driven control. LIGHT:AUTO is a
      mode change, so either Uno confirmation (LED:ON or LED:OFF) counts as
      applied.

  Uno link: SoftwareSerial on NodeMCU D7/GPIO13 RX (<- Uno D11 TX through
            the 1k/2k divider) and D6/GPIO12 TX (-> Uno D10 RX directly).
            A large receive buffer retains compact telemetry across HTTPS waits.
            See docs/PIEZOGRID_WIRING.md.
  Serial reliability: compact Uno telemetry fits the enlarged SoftwareSerial
            receive buffer. Syncs never run while awaiting a Uno LED confirmation.
  Debug log: UART1 TX on GPIO2 (NodeMCU pin "D4"), 9600 baud, optional
            (USB serial on GPIO1/GPIO3 is also available at 115200).

  Wi-Fi credentials + GATEWAY_TOKEN live in "secrets.h" (git-ignored):
      copy nodemcu/secrets.h.example to nodemcu/secrets.h
  Libraries: ESP8266 Arduino core 3.x, ArduinoJson 6.x or 7.x.
  =============================================================================
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SoftwareSerial.h>
#include <ArduinoJson.h>
#include <time.h>
#include <stdarg.h>

#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #error "nodemcu/secrets.h is missing - copy nodemcu/secrets.h.example to nodemcu/secrets.h and add your Wi-Fi credentials and GATEWAY_TOKEN."
#endif

#if !defined(GATEWAY_TOKEN)
  #error "GATEWAY_TOKEN missing in nodemcu/secrets.h - add the value from the Render environment (never commit it)."
#endif
// Compile-time sanity check (sizeof is valid here, unlike inside #if).
static_assert(sizeof(GATEWAY_TOKEN) > 8, "GATEWAY_TOKEN looks unset - paste the real value from the Render environment into nodemcu/secrets.h.");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
#define UNO_BAUD            9600     // must match GATEWAY_BAUD in the Uno sketch
#define UNO_RX_PIN          13       // GPIO13 (NodeMCU "D7") <- Uno D11 TX via divider
#define UNO_TX_PIN          12       // GPIO12 (NodeMCU "D6") -> Uno D10 RX
#define UNO_RX_BUFFER_BYTES 512      // receive buffer for compact snapshots
#define LOG_BAUD            9600     // UART1 (GPIO2) debug log, optional monitor

SoftwareSerial unoSerial(UNO_RX_PIN, UNO_TX_PIN); // (RX, TX) = GPIO13, GPIO12
#define SYNC_INTERVAL_MS    5000UL   // keep HTTPS/TLS resource use bounded
#define RETRY_INTERVAL_MS   10000UL  // extra wait after a failed sync (cold starts)
#define WIFI_RETRY_MS       10000UL  // Wi-Fi reconnect retry cadence
#define STALE_LIMIT_MS      12000UL  // Uno sends its low-noise snapshot every 5 s
#define UNO_ACK_TIMEOUT_MS  2000UL   // allow Uno SoftwareSerial/OLED loop to confirm the LED state
#define HEALTH_LOG_MS       30000UL
#define POST_TIMEOUT_MS     15000    // HTTP timeout, bounds Render cold-start waits
#define LINE_MAX_LEN        200      // sanity cap for one Uno line
#define MAX_ACTIVITY_SUM    1000000.0f // vcap is cumulative ΣΔV, not capacitor volts
#define TLS_RX_BUFFER       4096     // backend TLS chain/replies fit; shared client avoids churn
#define TLS_TX_BUFFER       512      // BearSSL can fragment outgoing records into this buffer

// Backend endpoint (not a secret). Only change for a LOCAL test server.
static const char SYNC_URL[] =
  "https://piezogrid-cloud-backend.onrender.com/api/gateway/sync";

// Trust anchor: "GTS Root R4" exactly as served by Render's live TLS chain
// (cross-signed by GlobalSign Root CA; valid until 2028-01-28). If Render
// rotates its CA, re-extract and replace this block:
//   openssl s_client -connect piezogrid-cloud-backend.onrender.com:443 \
//     -servername piezogrid-cloud-backend.onrender.com -showcerts
static const char ROOT_CA_PEM[] PROGMEM = R"PEM(
-----BEGIN CERTIFICATE-----
MIIDejCCAmKgAwIBAgIQf+UwvzMTQ77dghYQST2KGzANBgkqhkiG9w0BAQsFADBX
MQswCQYDVQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2lnbiBudi1zYTEQMA4GA1UE
CxMHUm9vdCBDQTEbMBkGA1UEAxMSR2xvYmFsU2lnbiBSb290IENBMB4XDTIzMTEx
NTAzNDMyMVoXDTI4MDEyODAwMDA0MlowRzELMAkGA1UEBhMCVVMxIjAgBgNVBAoT
GUdvb2dsZSBUcnVzdCBTZXJ2aWNlcyBMTEMxFDASBgNVBAMTC0dUUyBSb290IFI0
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE83Rzp2iLYK5DuDXFgTB7S0md+8Fhzube
Rr1r1WEYNa5A3XP3iZEwWus87oV8okB2O6nGuEfYKueSkWpz6bFyOZ8pn6KY019e
WIZlD6GEZQbR3IvJx3PIjGov5cSr0R2Ko4H/MIH8MA4GA1UdDwEB/wQEAwIBhjAd
BgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDwYDVR0TAQH/BAUwAwEB/zAd
BgNVHQ4EFgQUgEzW63T/STaj1dj8tT7FavCUHYwwHwYDVR0jBBgwFoAUYHtmGkUN
l8qJUC99BM00qP/8/UswNgYIKwYBBQUHAQEEKjAoMCYGCCsGAQUFBzAChhpodHRw
Oi8vaS5wa2kuZ29vZy9nc3IxLmNydDAtBgNVHR8EJjAkMCKgIKAehhxodHRwOi8v
Yy5wa2kuZ29vZy9yL2dzcjEuY3JsMBMGA1UdIAQMMAowCAYGZ4EMAQIBMA0GCSqG
SIb3DQEBCwUAA4IBAQAYQrsPBtYDh5bjP2OBDwmkoWhIDDkic574y04tfzHpn+cJ
odI2D4SseesQ6bDrarZ7C30ddLibZatoKiws3UL9xnELz4ct92vID24FfVbiI1hY
+SW6FoVHkNeWIP0GCbaM4C6uVdF5dTUsMVs/ZbzNnIdCp5Gxmx5ejvEau8otR/Cs
kGN+hr/W5GvT1tMBjgWKZ1i4//emhA1JG1BbPzoLJQvyEotc03lXjTaCzv8mEbep
8RqZ7a2CPsgRbuvTPBwcOMBBmuFeU88+FSBX6+7iP0il8b4Z0QFqIwwMHfs/L6K1
vepuoxtGzi4CZ68zJpiq1UvSqTbFJjtbD4seiMHl
-----END CERTIFICATE-----
)PEM";

// ---------------------------------------------------------------------------
// Diagnostics: every [GW] message is mirrored to BOTH UART1 (GPIO2/"D4",
// optional USB-serial adapter) and the USB port (UART0, 115200 baud), so no
// serial adapter is required to debug. Never log secrets: call sites must not
// pass WIFI_PASSWORD or GATEWAY_TOKEN.
// ---------------------------------------------------------------------------
static void gwLog(const char *format, ...) {
  char buf[240];
  va_list args;
  va_start(args, format);
  vsnprintf(buf, sizeof(buf), format, args);
  va_end(args);
  Serial1.println(buf);
  Serial.println(buf);
}

static const char *wifiStatusName(int s) {
  switch (s) {
    case WL_IDLE_STATUS:     return "IDLE";
    case WL_NO_SSID_AVAIL:   return "NO_SSID_AVAIL (SSID wrong or AP out of range)";
    case WL_SCAN_COMPLETED:  return "SCAN_COMPLETED";
    case WL_CONNECTED:       return "CONNECTED";
    case WL_CONNECT_FAILED:  return "CONNECT_FAILED (wrong password?)";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED:    return "DISCONNECTED";
    default:                 return "UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
BearSSL::X509List trustAnchors;   // parsed once in setup()
BearSSL::Session  tlsSession;     // TLS session reuse (fast re-handshakes)
WiFiClientSecure   gatewayClient; // keep BearSSL's shared stack/client alive across syncs
HTTPClient         gatewayHttp;

int           lastWifiStatus = -1;    // last Wi-Fi status seen (transition logs)
bool          clockWasSane = false;   // last NTP/clock state seen (transition logs)

String        unoLine = "";
bool          haveFreshReading = false;
unsigned long lastReadingMs = 0;
unsigned long nextSyncMs = 0;
unsigned long lastWifiAttemptMs = 0;
unsigned long lastNtpLogMs = 0;
unsigned long lastHealthLogMs = 0;

// Latest real sensor snapshot (no synthetic values anywhere)
long          tSteps = 0;
float         tVCap  = 0.0f;
float         tPulse = 0.0f;
int           tLux   = 0;

// Command execution + acknowledgement bookkeeping (idempotent consumer)
String        lastExecutedCommandId = "";
bool          awaitingUno = false;
String        awaitingCommandId = "";
bool          awaitingExpectedOn = false;
bool          awaitingAnyConfirmation = false; // LIGHT:AUTO: either LED state confirms
unsigned long awaitingDeadlineMs = 0;
bool          havePendingAck = false;
String        pendingAckCommandId = "";
String        pendingAckStatus = "";
String        pendingAckDetail = "";
String        lastAckedCommandId = "";
String        lastAckedStatus = "";
String        lastAckedDetail = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
static bool clockIsSane() {
  return (long)time(nullptr) > 1735689600L; // TLS needs a correct clock
}

// Parse one telemetry line from the Uno. Returns true only for valid JSON
// containing every expected numeric field; malformed lines are dropped.
static bool parseUnoTelemetry(const String &line) {
  StaticJsonDocument<256> doc;  // ArduinoJson 6.x native; 7.x: deprecated but works
  DeserializationError err = deserializeJson(doc, line);
  if (err) {
    gwLog("[GW] JSON parse error (%s): %.80s\n", err.c_str(), line.c_str());
    return false;
  }
  if (!doc["steps"].is<long>() || !doc["vcap"].is<float>() ||
      !doc["pulse"].is<float>() || !doc["lux"].is<int>()) {
    gwLog("[GW] unexpected telemetry shape, dropped: %.80s\n", line.c_str());
    return false;
  }
  long steps  = doc["steps"].as<long>();
  float vCap  = doc["vcap"].as<float>();
  float pulse = doc["pulse"].as<float>();
  int   lux   = doc["lux"].as<int>();
  // The Uno's legacy `vcap` field carries its cumulative piezo activity sum
  // (ΣΔV), which naturally passes 25 after enough impacts. `pulse` is the
  // instantaneous sensor voltage and remains tightly bounded separately.
  if (steps < 0 || vCap < 0.0f || vCap > MAX_ACTIVITY_SUM ||
      pulse < 0.0f || pulse > 25.0f ||
      lux < 0 || lux > 100) {
    gwLog("[GW] telemetry out of range, dropped: %.80s\n", line.c_str());
    return false;
  }
  tSteps = steps; tVCap = vCap; tPulse = pulse; tLux = lux;
  haveFreshReading = true;
  lastReadingMs = millis();
  static unsigned long lastTelemetryLogMs = 0;
  if (lastTelemetryLogMs == 0 || lastReadingMs - lastTelemetryLogMs >= 5000UL) {
    lastTelemetryLogMs = lastReadingMs;
    gwLog("[GW] Uno telemetry received: steps=%ld vCap=%.2f pulse=%.2f lux=%d\n",
          tSteps, tVCap, tPulse, tLux);
  }
  return true;
}

// Classify one line from the Uno: telemetry JSON, LED confirmation, or error.
static void handleUnoLine(const String &line) {
  if (line.length() == 0) return;
  if (line[0] == '{') {
    parseUnoTelemetry(line);
    return;
  }
  // Uno confirmations for gateway commands: LED:ON / LED:OFF / ERR:<reason>
  if (!awaitingUno) return; // confirmation for a command we did not send
  if (line.startsWith("LED:")) {
    const bool ledOn = line == F("LED:ON");
    // LIGHT:AUTO is a mode change: either confirmation confirms application.
    if (!awaitingAnyConfirmation && ledOn != awaitingExpectedOn) {
      pendingAckCommandId = awaitingCommandId;
      pendingAckStatus = "rejected";
      pendingAckDetail = line;
      havePendingAck = true;
    } else {
      pendingAckCommandId = awaitingCommandId;
      pendingAckStatus = "applied";
      pendingAckDetail = "";
      havePendingAck = true;
    }
    awaitingUno = false;
    gwLog("[GW] Uno confirmed %s for %s\n",
                   pendingAckStatus.c_str(), awaitingCommandId.c_str());
    return;
  }
  if (line.startsWith("ERR:")) {
    pendingAckCommandId = awaitingCommandId;
    pendingAckStatus = "rejected";
    pendingAckDetail = line;
    havePendingAck = true;
    awaitingUno = false;
    return;
  }
  gwLog("[GW] ignored Uno line: %.80s\n", line.c_str());
}

// Execute a cloud command exactly once: forward to the Uno, then wait for its
// confirmation before queueing the ack. Re-sends of an already-executed or
// already-acked commandId never re-execute.
static void handleCloudCommand(const String &commandId, const String &command) {
  if (commandId.length() == 0 || command.length() == 0) return;
  if (commandId == lastAckedCommandId) {
    // The ack was sent but the server apparently did not resolve it in time:
    // re-queue the SAME ack instead of re-executing the command.
    pendingAckCommandId = commandId;
    pendingAckStatus = lastAckedStatus;
    pendingAckDetail = lastAckedDetail;
    havePendingAck = true;
    gwLog("[GW] re-queued ack for re-sent command (idempotent)");
    return;
  }
  if (commandId == lastExecutedCommandId) {
    return; // already executed and awaiting confirmation/ack
  }
  unoSerial.println(command);  // GPIO12 (D6) -> Uno D10 (RX) command parser
  lastExecutedCommandId = commandId;
  awaitingUno = true;
  awaitingCommandId = commandId;
  awaitingExpectedOn = (command == F("LIGHT:ON")) ||
                       (command.startsWith("PWM:") && command.substring(4).toInt() > 0);
  // LIGHT:AUTO restores the Uno's sensor-driven control without changing the
  // LED directly: either confirmation (LED:ON or LED:OFF) proves the Uno
  // applied the mode change, so expected-direction matching is skipped.
  awaitingAnyConfirmation = (command == F("LIGHT:AUTO"));
  awaitingDeadlineMs = millis() + UNO_ACK_TIMEOUT_MS;
  gwLog("[GW] forwarded to Uno: %s (%s)\n", command.c_str(), commandId.c_str());
}

// Parse the sync response body: {"ok":true,"command":{...}|null,"ackResult":..}
static void handleSyncResponse(const String &body) {
  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    gwLog("[GW] sync response parse error (%s)\n", err.c_str());
    return;
  }
  if (!doc["command"].isNull()) {
    JsonObject cmd = doc["command"].as<JsonObject>();
    const char* cid = cmd["commandId"] | "";
    const char* cmdText = cmd["command"] | "";
    handleCloudCommand(String(cid), String(cmdText));
  }
}

// Build the sync request body: telemetry plus an optional pending ack.
static size_t buildSyncBody(char *buf, size_t bufLen, bool includeTelemetry) {
  // Cloud control heartbeat must keep working even if the Uno sensor UART is
  // disconnected. Omit telemetry fields when stale; the backend still polls
  // for queued LED commands and the dashboard retains its last real reading.
  size_t len = includeTelemetry
      ? snprintf(buf, bufLen,
                 "{\"steps\":%ld,\"vCap\":%.2f,\"pulse\":%.2f,\"lux\":%d",
                 tSteps, tVCap, tPulse, tLux)
      : snprintf(buf, bufLen, "{");
  bool hasFields = includeTelemetry;
  if (havePendingAck && pendingAckDetail.length() > 0) {
    len += snprintf(buf + len, bufLen - len,
                    "%s\"ack\":{\"commandId\":\"%s\",\"status\":\"%s\",\"detail\":\"%.40s\"}",
                    hasFields ? "," : "",
                    pendingAckCommandId.c_str(), pendingAckStatus.c_str(), pendingAckDetail.c_str());
  } else if (havePendingAck) {
    len += snprintf(buf + len, bufLen - len,
                    "%s\"ack\":{\"commandId\":\"%s\",\"status\":\"%s\"}",
                    hasFields ? "," : "",
                    pendingAckCommandId.c_str(), pendingAckStatus.c_str());
  }
  len += snprintf(buf + len, bufLen - len, "}");
  return len;
}

// One authenticated HTTPS sync. The backend does not negotiate MFLN. Use an
// 4 KB receive buffer for its TLS chain/replies, and reuse one client so
// BearSSL's shared stack is allocated once instead of churning the heap.
// Outgoing records can safely use 512 bytes.
// Bounded by POST_TIMEOUT_MS; cold starts are retried. Returns true on HTTP 200.
static bool postSync(const char *payload) {
  gatewayClient.setBufferSizes(TLS_RX_BUFFER, TLS_TX_BUFFER);
  gatewayClient.setTrustAnchors(&trustAnchors); // chain validation (time-aware)
  gatewayClient.setSession(&tlsSession);        // TLS session reuse

  gatewayHttp.setTimeout(POST_TIMEOUT_MS);
  if (!gatewayHttp.begin(gatewayClient, SYNC_URL)) {
    gwLog("[GW] HTTP begin failed (heap %u)\n", ESP.getFreeHeap());
    return false;
  }
  gatewayHttp.addHeader("Content-Type", "application/json");
  gatewayHttp.addHeader("x-gateway-token", GATEWAY_TOKEN); // secret header, never logged
  int code = gatewayHttp.POST(payload);
  if (code == 200) {
    // Body is small and bounded; read it for command/ackResult handling.
    String body = gatewayHttp.getString();
    gatewayHttp.end();
    gatewayClient.stop();
    handleSyncResponse(body);
    return true;
  }
  if (code == 401) {
    // The backend rejected the token: call out the exact remediation without
    // ever printing the configured or expected value.
    gwLog("[GW] AUTHENTICATION REJECTED (HTTP 401): x-gateway-token was not accepted");
    gwLog("[GW] Fix: GATEWAY_TOKEN in nodemcu/secrets.h must EXACTLY match the Render environment variable (no quotes, spaces, or line breaks), then re-flash");
  } else if (code < 0) {
    char tlsError[160] = {0};
    int tlsCode = gatewayClient.getLastSSLError(tlsError, sizeof(tlsError));
    String httpError = HTTPClient::errorToString(code);
    gwLog("[GW] sync transport error %d (%s); TLS %d: %.80s; heap=%u maxBlock=%u", code,
          httpError.c_str(), tlsCode, tlsError, ESP.getFreeHeap(),
          ESP.getMaxFreeBlockSize());
  } else {
    String errorBody = gatewayHttp.getString();
    gwLog("[GW] sync HTTP %d (cold start / TLS?), response: %.100s", code,
          errorBody.c_str());
  }
  gatewayHttp.end();
  gatewayClient.stop();
  return false;
}

// ---------------------------------------------------------------------------
// Arduino lifecycle
// ---------------------------------------------------------------------------
void setup() {
  Serial1.begin(LOG_BAUD);
  Serial1.println();
  gwLog("[GW] PiezoGrid ESP8266 gateway booting");

  // Keep UART0 USB diagnostics while the Uno link uses buffered SoftwareSerial.
  unoSerial.begin(UNO_BAUD, SWSERIAL_8N1, UNO_RX_PIN, UNO_TX_PIN, false,
                  UNO_RX_BUFFER_BYTES);
  unoSerial.enableIntTx(false);
  Serial.begin(115200);
  gwLog("[GW] USB serial debug ready (UART0)");

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);   // credentials from secrets.h only
  gwLog("[GW] Wi-Fi connecting..."); // SSID/password not logged

  // NTP: BearSSL validates certificate validity windows, so the clock must be
  // correct before the first sync. Non-blocking; syncs wait for clockIsSane().
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  trustAnchors.append(ROOT_CA_PEM);
}

void loop() {
  unsigned long now = millis();

  // --- Status transitions (logged once per change, mirrored to USB) ---------
  int wifiStatus = WiFi.status();
  if (wifiStatus != lastWifiStatus) {
    if (wifiStatus == WL_CONNECTED) {
      gwLog("[GW] Wi-Fi connected, IP %s", WiFi.localIP().toString().c_str());
    } else {
      gwLog("[GW] Wi-Fi status: %s (%d)", wifiStatusName(wifiStatus), wifiStatus);
    }
    lastWifiStatus = wifiStatus;
  }
  bool clockSane = clockIsSane();
  if (clockSane && !clockWasSane) {
    clockWasSane = true;
    gwLog("[GW] NTP time sync OK - HTTPS certificate validation ready");
  }

  // --- Wi-Fi maintenance (core auto-reconnects; we retry and log) -----------
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiAttemptMs >= WIFI_RETRY_MS) {
      lastWifiAttemptMs = now;
      gwLog("[GW] Wi-Fi down (status %d), reconnecting\n", WiFi.status());
      WiFi.reconnect();
    }
  }

  // --- Read newline-delimited lines from the Uno (SoftwareSerial on D7) ----
  while (unoSerial.available() > 0) {
    char c = (char)unoSerial.read();
    if (c == '\n') {
      if (unoLine.length() > 0) {
        handleUnoLine(unoLine);
        unoLine = "";
      }
    } else if (c != '\r') {
      if (unoLine.length() < LINE_MAX_LEN) {
        unoLine += c;
      } else {
        unoLine = ""; // overlong line: drop and resync at the next newline
        gwLog("[GW] overlong line dropped, resyncing");
      }
    }
  }

  // --- Uno confirmation deadline --------------------------------------------
  if (awaitingUno && (long)(now - awaitingDeadlineMs) >= 0) {
    pendingAckCommandId = awaitingCommandId;
    pendingAckStatus = "rejected";
    pendingAckDetail = "uno-timeout";
    havePendingAck = true;
    awaitingUno = false;
    gwLog("[GW] no Uno confirmation for %s within %lu ms\n",
                   awaitingCommandId.c_str(), (unsigned long)UNO_ACK_TIMEOUT_MS);
  }

  // --- Authenticated sync (telemetry up + command down + ack in) ------------
  // A sync blocks the loop (HTTPS), which would corrupt a Uno confirmation
  // arriving during it ??? so never sync while awaiting the Uno's LED:ON/OFF
  // line (worst case: the sync starts ~600 ms later, inside the 10 s budget).
  bool readingFresh = haveFreshReading && (now - lastReadingMs <= STALE_LIMIT_MS);
  if (WiFi.status() == WL_CONNECTED && clockIsSane() && !awaitingUno &&
      (long)(now - nextSyncMs) >= 0) {
    char payload[256];
    size_t len = buildSyncBody(payload, sizeof(payload), readingFresh);
    if (len > 0 && len < sizeof(payload)) {
      if (postSync(payload)) {
        nextSyncMs = millis() + SYNC_INTERVAL_MS;
        if (havePendingAck) {
          // Ack was delivered with this sync; remember it for idempotent
          // re-acks if the server re-sends the same commandId.
          lastAckedCommandId = pendingAckCommandId;
          lastAckedStatus = pendingAckStatus;
          lastAckedDetail = pendingAckDetail;
          havePendingAck = false;
          pendingAckCommandId = ""; pendingAckStatus = ""; pendingAckDetail = "";
        }
      } else {
        nextSyncMs = millis() + RETRY_INTERVAL_MS;
      }
    } else {
      gwLog("[GW] payload build failed");
      nextSyncMs = millis() + RETRY_INTERVAL_MS;
    }
  } else if (!clockIsSane() && WiFi.status() == WL_CONNECTED &&
             now - lastNtpLogMs >= HEALTH_LOG_MS) {
    lastNtpLogMs = now;
    gwLog("[GW] waiting for NTP time sync before first sync");
  }

  if (!readingFresh && WiFi.status() == WL_CONNECTED &&
      now - lastHealthLogMs >= HEALTH_LOG_MS) {
    lastHealthLogMs = now;
    gwLog("[GW] no fresh Uno telemetry; cloud LED control heartbeat remains active");
  }

  // --- Periodic health log ---------------------------------------------------
  if (now - lastHealthLogMs >= HEALTH_LOG_MS) {
    lastHealthLogMs = now;
    gwLog("[GW] wifi=%d fresh=%d heap=%u\n",
                   WiFi.status(), readingFresh ? 1 : 0, ESP.getFreeHeap());
  }
}
