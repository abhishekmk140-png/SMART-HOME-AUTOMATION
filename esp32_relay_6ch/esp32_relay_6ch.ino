/* ESP32-S3 6-Channel Relay Board - Multi-Room IoT Controller
   Supports 3 Dedicated Socket Boards with Specialized Sensors:
   - Board 1: Engineering Hub (Default IP: 192.168.1.10 / mDNS: esp32-hub.local)
              Sensor: ASAIR AM2315C (Temperature & Humidity on GPIO 4 & 5)
   - Board 2: The Gallery     (Default IP: 192.168.1.11 / mDNS: esp32-gallery.local)
              Sensor: Air Quality Sensor (µg/m³ on GPIO 6 / ADC1_CH5)
   - Board 3: Conference Room (Default IP: 192.168.1.14 / mDNS: esp32-conf.local)
              Sensor: Single PIR Motion Sensor (Occupancy on GPIO 6 / Physical Pin 9)
*/
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <Wire.h>

// =========================================================================
// SELECT BOARD (Change this number before flashing each board):
// 1 = Engineering Hub -> ASAIR AM2315C (Temp & Hum on GPIO 4 & 5)
// 2 = The Gallery     -> Air Quality Sensor (Analog on GPIO 6)
// 3 = Conference      -> Single PIR Motion Sensor (Occupancy on GPIO 6)
// =========================================================================
#define BOARD_ID 3

#if BOARD_ID == 1
  const char* ROOM_NAME = "Engineering Hub";
  const char* HOST_NAME = "esp32-hub";
  IPAddress STATIC_IP(192, 168, 1, 10);
  #define HAS_AM2315C true
  #define HAS_AIR_QUALITY false
  #define HAS_PIR false
#elif BOARD_ID == 2
  const char* ROOM_NAME = "The Gallery";
  const char* HOST_NAME = "esp32-gallery";
  IPAddress STATIC_IP(192, 168, 1, 11);
  #define HAS_AM2315C false
  #define HAS_AIR_QUALITY true
  #define HAS_PIR false
#elif BOARD_ID == 3
  const char* ROOM_NAME = "Conference";
  const char* HOST_NAME = "esp32-conf";
  IPAddress STATIC_IP(192, 168, 1, 14);
  #define HAS_AM2315C false
  #define HAS_AIR_QUALITY false
  #define HAS_PIR true
#endif

IPAddress GATEWAY(192, 168, 1, 1);
IPAddress SUBNET(255, 255, 255, 0);
IPAddress DNS(192, 168, 1, 1);

struct Net { const char* ssid; const char* pass; };
Net NETS[] = {
  {"Airtel_AIOTA.tech", "Aiota.7372"},   // Main Wi-Fi Router
  {"Esp32relay",        "relay.7372"},
  {"Airtel_AIOTA.7372", "Aiota.7372"},   // Hotspot Fallback
};

// Waveshare ESP32-S3-Relay-6CH GPIO pins:
const int RELAY_PIN[6] = {1, 2, 41, 42, 45, 46};
bool active_high = true;   // Set false if using active-LOW relay board

WebServer server(80);
WiFiUDP udp;
const int UDP_PORT = 8888;
bool st[6] = {0, 0, 0, 0, 0, 0};

// =========================================================================
// 1. ASAIR AM2315C (BOARD 1: ENGINEERING HUB)
// Wiring to Waveshare Pico Header:
// - Red Wire:    3.3V (VDD) -> Physical Pin 36 (3V3)
// - Black Wire:  GND        -> Physical Pin 38 or Pin 3 (GND)
// - Yellow Wire: SDA (Data) -> GPIO 4 (Pico Header Pin 6 / GP4)
// - White Wire:  SCL (Clk)  -> GPIO 5 (Pico Header Pin 7 / GP5)
// =========================================================================
#if HAS_AM2315C
#define AM2315C_SDA 4
#define AM2315C_SCL 5
#define AM2315C_ADDR 0x38

float current_temp = 0.0;
float current_hum = 0.0;
bool sensor_ready = false;
unsigned long last_sensor_time = 0;

void init_am2315c() {
  pinMode(AM2315C_SDA, INPUT_PULLUP);
  pinMode(AM2315C_SCL, INPUT_PULLUP);
  Wire.begin(AM2315C_SDA, AM2315C_SCL, 100000);
  Wire.setTimeOut(20);
  delay(100);

  Wire.beginTransmission(AM2315C_ADDR);
  if (Wire.endTransmission() != 0) {
    sensor_ready = false;
    Serial.printf("[AM2315C] Auto-detect: Sensor not yet detected on %s.\n", ROOM_NAME);
    return;
  }

  Serial.printf("[AM2315C] ASAIR AM2315C FOUND on %s (0x38)! Initializing...\n", ROOM_NAME);
  Wire.beginTransmission(AM2315C_ADDR);
  Wire.write(0xBA); // Soft reset
  Wire.endTransmission();
  delay(25);

  Wire.beginTransmission(AM2315C_ADDR);
  Wire.write(0x71);
  if (Wire.endTransmission() == 0) {
    Wire.requestFrom((uint8_t)AM2315C_ADDR, (uint8_t)1);
    if (Wire.available()) {
      uint8_t status = Wire.read();
      if ((status & 0x08) == 0) {
        Wire.beginTransmission(AM2315C_ADDR);
        Wire.write(0xBE);
        Wire.write(0x08);
        Wire.write(0x00);
        Wire.endTransmission();
        delay(15);
      }
      sensor_ready = true;
      Serial.printf("[AM2315C] SENSOR ACTIVE on %s! Live temperature & humidity enabled.\n", ROOM_NAME);
    }
  }
}

static bool am2315c_measuring = false;
static unsigned long am2315c_start_ms = 0;

void poll_am2315c() {
  unsigned long now = millis();

  if (am2315c_measuring) {
    if (now - am2315c_start_ms < 85) return; // Non-blocking wait for conversion (0ms lag)
    am2315c_measuring = false;

    Wire.requestFrom((uint8_t)AM2315C_ADDR, (uint8_t)7);
    if (Wire.available() >= 6) {
      uint8_t buf[7];
      for (int i = 0; i < 7 && Wire.available(); i++) {
        buf[i] = Wire.read();
      }
      if ((buf[0] & 0x80) == 0) {
        uint32_t raw_h = ((uint32_t)buf[1] << 12) | ((uint32_t)buf[2] << 4) | (buf[3] >> 4);
        uint32_t raw_t = (((uint32_t)buf[3] & 0x0F) << 16) | ((uint32_t)buf[4] << 8) | buf[5];

        float h = (float)raw_h * 100.0 / 1048576.0;
        float t = ((float)raw_t * 200.0 / 1048576.0) - 50.0;

        if (t < 0.0) t = 0.0;
        if (h < 0.0) h = 0.0;
        if (h > 100.0) h = 100.0;

        current_temp = t;
        current_hum = h;
        sensor_ready = true;
        Serial.printf("[AM2315C][%s] Temp: %.1f C | Humidity: %.1f %%\n", ROOM_NAME, current_temp, current_hum);
      }
    }
    return;
  }

  if (now - last_sensor_time < (sensor_ready ? 2500 : 6000)) return;
  last_sensor_time = now;

  if (!sensor_ready) {
    Wire.beginTransmission(AM2315C_ADDR);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[AM2315C] Sensor connected to %s! Initializing...\n", ROOM_NAME);
      init_am2315c();
    }
    return;
  }

  Wire.beginTransmission(AM2315C_ADDR);
  Wire.write(0xAC);
  Wire.write(0x33);
  Wire.write(0x00);
  byte err = Wire.endTransmission();
  if (err != 0) {
    sensor_ready = false;
    Wire.end();
    delay(5);
    Wire.begin(AM2315C_SDA, AM2315C_SCL, 100000);
    Wire.setTimeOut(20);
    return;
  }

  am2315c_measuring = true;
  am2315c_start_ms = now;
}
#endif

// =========================================================================
// 2. AIR QUALITY SENSOR (BOARD 2: THE GALLERY)
// Wiring to Waveshare Pico Header:
// - VCC: 3.3V or 5V (Physical Pin 36 or Pin 40)
// - GND: GND        (Physical Pin 38 or Pin 3)
// - AO:  GPIO 6     (Physical Pin 9 / GP6 / ADC1_CH5)
// =========================================================================
#if HAS_AIR_QUALITY
#define AQ_PIN 6
float current_aqi = 24.0;
unsigned long last_aq_time = 0;

void init_air_quality() {
  pinMode(AQ_PIN, INPUT);
  analogReadResolution(12);
  Serial.printf("[AIR QUALITY] Initialized on GPIO %d (ADC1_CH5 / Pico Pin 9)\n", AQ_PIN);
}

void poll_air_quality() {
  if (millis() - last_aq_time < 2000) return;
  last_aq_time = millis();

  int raw = analogRead(AQ_PIN);
  // Scale raw ADC (0..4095) to micrograms per cubic meter (10 - 500 ug/m3)
  float aqi = 10.0 + ((float)raw * 490.0 / 4095.0);
  current_aqi = (current_aqi * 0.7) + (aqi * 0.3); // Exponential smoothing filter
  Serial.printf("[AIR QUALITY][%s] Raw ADC: %d | Filtered Air Quality: %.0f ug/m3\n", ROOM_NAME, raw, current_aqi);
}
#endif

// =========================================================================
// 3. SINGLE PIR MOTION SENSOR (BOARD 3: CONFERENCE ROOM)
// EXACT 3-WIRE WIRING CONNECTION:
// 1. VCC -> 5V  (Waveshare Pico Physical Pin 40 / VSYS 5V)
// 2. GND -> GND (Waveshare Pico Physical Pin 38 or Pin 3 / GND)
// 3. OUT -> IO4 (Waveshare Pico Physical Pin 6  / GPIO 4)
// =========================================================================
#if HAS_PIR
#define PIR_PIN 4         // Sole PIR Output Pin: GPIO 4 (Physical Pin 6)
#define PIR_HOLD_MS 10000 // Keep Occupied for 10 seconds after motion stops

bool pir_active = false;
bool is_occupied = false;
unsigned long last_motion_time = 0;
int last_pin4 = 0;
unsigned long total_motion_hits = 0;

void init_pir() {
  pinMode(PIR_PIN, INPUT_PULLDOWN);
  Serial.println("[PIR] Active on IO4 (GPIO 4 / Physical Pin 6) | Connections: VCC=5V, GND=GND, OUT=IO4");
}

void poll_pir() {
  unsigned long now = millis();
  int r4 = digitalRead(PIR_PIN);
  last_pin4 = r4;

  // DYNAMIC ZERO-DELAY SENSING ON IO4 ONLY
  if (r4 == HIGH) {
    pir_active = true;
    last_motion_time = now;

    if (!is_occupied) {
      is_occupied = true;
      total_motion_hits++;
      Serial.printf("\n=======================================================\n");
      Serial.printf("  [CONFERENCE] >>> MOTION DETECTED ON IO4 -> OCCUPIED <<<\n");
      Serial.printf("  Signal: IO4=HIGH (5V VCC powered) | Hit #%lu\n", total_motion_hits);
      Serial.printf("=======================================================\n\n");
    }
  } else {
    pir_active = false;
  }

  // Auto-vacate dynamically after 10 seconds without motion
  if (is_occupied && (now - last_motion_time > PIR_HOLD_MS)) {
    is_occupied = false;
    Serial.printf("\n[CONFERENCE] --- No motion on IO4 for %ds -> NOT OCCUPIED (VACANT) ---\n\n", PIR_HOLD_MS / 1000);
  }

  // Live status heartbeat every 1.5 seconds in Serial Monitor
  static unsigned long last_heartbeat = 0;
  if (now - last_heartbeat >= 1500) {
    last_heartbeat = now;
    Serial.printf("[PIR LIVE] OUT (IO4)=%d | State=%s | Hits=%lu | Status=%s\n",
                  r4, pir_active ? "MOTION" : "IDLE", total_motion_hits,
                  is_occupied ? "OCCUPIED" : "NOT OCCUPIED (VACANT)");
  }
}
#endif

void apply(int i) { 
  digitalWrite(RELAY_PIN[i], (st[i] == active_high) ? HIGH : LOW); 
}

String json() {
  String s = "{\"room\":\"" + String(ROOM_NAME) + "\",\"board_id\":" + String(BOARD_ID) + ",\"relays\":[";
  for (int i = 0; i < 6; i++) { 
    s += st[i] ? "1" : "0"; 
    if (i < 5) s += ","; 
  }
  IPAddress ip = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP() : WiFi.softAPIP();
  s += "],\"ip\":\"" + ip.toString() + "\",\"hostname\":\"" + String(HOST_NAME) + "\",\"active_high\":" + (active_high ? "true" : "false");

#if HAS_AM2315C
  if (sensor_ready) {
    s += ",\"sensor\":\"AM2315C\",\"sensor_ready\":true";
    s += ",\"temp\":" + String(current_temp, 1);
    s += ",\"hum\":" + String(current_hum, 1);
  } else {
    s += ",\"sensor\":\"AM2315C\",\"sensor_ready\":false";
  }
#endif

#if HAS_AIR_QUALITY
  s += ",\"sensor\":\"AirQuality\"";
  s += ",\"air_quality\":" + String(current_aqi, 0);
  s += ",\"air_quality_unit\":\"µg/m³\"";
  s += ",\"co2\":" + String(current_aqi, 0);
#endif

#if HAS_PIR
  s += ",\"occupancy\":{\"occupied\":" + String(is_occupied ? "true" : "false");
  s += ",\"status\":\"" + String(is_occupied ? "Occupied" : "Vacant") + "\"";
  s += ",\"pir\":" + String(pir_active ? "true" : "false");
  s += ",\"pir1\":" + String(pir_active ? "true" : "false");
  s += ",\"seconds_ago\":" + String(last_motion_time > 0 ? (millis() - last_motion_time) / 1000 : 999);
  s += ",\"pin4\":" + String(last_pin4);
  s += ",\"hits\":" + String(total_motion_hits);
  s += "}";
#endif

  s += "}";
  return s;
}

void reply() { 
  server.sendHeader("Access-Control-Allow-Origin", "*"); 
  server.sendHeader("Connection", "keep-alive");
  server.send(200, "application/json", json()); 
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=============================================");
  Serial.printf("ESP32-S3 6-CH RELAY: %s (Board %d)\n", ROOM_NAME, BOARD_ID);
#if HAS_AM2315C
  Serial.println("[FEATURE] ASAIR AM2315C I2C Temp & Hum Sensor Enabled");
#endif
#if HAS_AIR_QUALITY
  Serial.println("[FEATURE] Air Quality Sensor Active on GPIO 6 (ADC)");
#endif
#if HAS_PIR
  Serial.println("[FEATURE] PIR Motion Sensor Active on IO4 (GPIO 4) & IO6");
#endif
  Serial.println("=============================================");

  for (int i = 0; i < 6; i++) { 
    pinMode(RELAY_PIN[i], OUTPUT); 
    apply(i); 
  }

#if HAS_AM2315C
  init_am2315c();
  delay(100);
  poll_am2315c();
#endif

#if HAS_AIR_QUALITY
  init_air_quality();
  delay(50);
  poll_air_quality();
#endif

#if HAS_PIR
  init_pir();
  poll_pir();
#endif

  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_11dBm); // Reduce 2.4GHz RF interference into nearby PIR sensor
  WiFi.setSleep(false);
  WiFi.config(STATIC_IP, GATEWAY, SUBNET, DNS);

  bool ok = false;
  for (auto& n : NETS) {
    Serial.printf("Connecting to Wi-Fi SSID: %s\n", n.ssid);
    WiFi.begin(n.ssid, n.pass);
    for (int t = 0; t < 25 && WiFi.status() != WL_CONNECTED; t++) {
      delay(400);
      Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) { 
      ok = true; 
      break; 
    }
    WiFi.disconnect();
  }

  if (ok) {
    MDNS.begin(HOST_NAME);
    Serial.printf("[ONLINE] Connected to Wi-Fi!\n");
    Serial.printf("[IP ADDRESS] http://%s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[mDNS URL]   http://%s.local\n", HOST_NAME);
  } else {
    WiFi.mode(WIFI_AP);
    String apName = String("ESP32-") + String(HOST_NAME);
    WiFi.softAP(apName.c_str(), "12345678");
    Serial.printf("[AP MODE] Started fallback AP: %s\n", apName.c_str());
    Serial.printf("[AP IP]   http://%s\n", WiFi.softAPIP().toString().c_str());
  }

  // REST API Endpoints
  server.on("/status", reply);
  
  server.on("/sensors", []() {
    String s = "{\"room\":\"" + String(ROOM_NAME) + "\",\"board_id\":" + String(BOARD_ID);
#if HAS_AM2315C
    s += ",\"sensor\":\"AM2315C\",\"temp\":" + String(current_temp, 1) + ",\"hum\":" + String(current_hum, 1);
#endif
#if HAS_AIR_QUALITY
    s += ",\"sensor\":\"AirQuality\",\"air_quality\":" + String(current_aqi, 0) + ",\"air_quality_unit\":\"µg/m³\",\"co2\":" + String(current_aqi, 0);
#endif
#if HAS_PIR
    s += ",\"sensor\":\"PIR\",\"occupied\":" + String(is_occupied ? "true" : "false") + ",\"status\":\"" + String(is_occupied ? "Occupied" : "Vacant") + "\",\"pir\":" + String(pir_active ? "true" : "false") + ",\"pir1\":" + String(pir_active ? "true" : "false");
#endif
    s += "}";
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", s);
  });

  // Single Channel Toggle / Set: /set?ch=1..6&state=0|1
  server.on("/set", []() {
    int ch = server.arg("ch").toInt();
    if (ch >= 1 && ch <= 6) { 
      st[ch - 1] = server.arg("state") == "1"; 
      apply(ch - 1); 
    }
    reply();
  });

  // Fast 6-Bit Wire Mask: /mask?v=101010
  server.on("/mask", []() {
    String v = server.arg("v");
    for (int i = 0; i < 6 && i < (int)v.length(); i++) { 
      st[i] = v[i] == '1'; 
      apply(i); 
    }
    reply();
  });

  // Relay Inversion Logic: /invert or /invert?v=1
  server.on("/invert", []() {
    if (server.hasArg("v")) {
      active_high = (server.arg("v") != "1");
    } else {
      active_high = !active_high;
    }
    for (int i = 0; i < 6; i++) apply(i);
    reply();
  });

  server.begin();
  udp.begin(UDP_PORT);
  Serial.printf("[READY] HTTP Port 80 & Fast UDP Port %d Active\n", UDP_PORT);
}

void loop() { 
  server.handleClient(); 

#if HAS_AM2315C
  poll_am2315c();
#endif

#if HAS_AIR_QUALITY
  poll_air_quality();
#endif

#if HAS_PIR
  poll_pir();
#endif

  // Fast UDP handling (0ms lag)
  int packetSize = udp.parsePacket();
  if (packetSize > 0) {
    char buf[32];
    int len = udp.read(buf, sizeof(buf) - 1);
    if (len > 0) {
      buf[len] = '\0';
      char* v = strstr(buf, "v=");
      char* mask = v ? (v + 2) : buf;
      for (int i = 0; i < 6 && mask[i]; i++) {
        st[i] = (mask[i] == '1');
        apply(i);
      }
    }
  }
}
