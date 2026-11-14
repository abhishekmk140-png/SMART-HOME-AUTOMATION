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
// Wiring to Waveshare Pico Header:
// - PIR VCC: 5V         (Physical Pin 40 / VSYS or Pin 36 / 3V3)
// - PIR GND: GND        (Physical Pin 38 or Pin 3)
// - PIR OUT: IO4        (GPIO 4 / Physical Pin 6)  [also monitors IO6 / GPIO 6]
// =========================================================================
#if HAS_PIR
#define PIR_PIN 4                // Default connected to IO4 (GPIO 4)
#define PIR_ALT_PIN 6            // Also monitors IO6 (GPIO 6) as auto-fallback
#define PIR_SAMPLE_MS 10         // Debounce sample interval (10ms)
#define PIR_CONFIRM_SAMPLES 8    // Require 8 consecutive HIGH samples (80ms) to trigger genuine motion!
#define PIR_HOLD_MS 12000        // Keep occupied for 12s after confirmed motion ends
#define PIR_BOOT_SETTLE_MS 15000 // Ignore power-on / HC-SR501 warm-up calibration spikes for 15s

bool pir_active = false;
bool is_occupied = false;
bool pir_warmup = true;
unsigned long last_motion_time = 0;
unsigned long last_sample_time = 0;
unsigned long pir_boot_time = 0;
int streak_pin4 = 0;
int streak_pin6 = 0;
int last_r4 = 0;
int last_r6 = 0;
unsigned long noise_rejected = 0;
unsigned long pin4_hits = 0;
unsigned long pin6_hits = 0;
bool last_confirmed_state = false;

void init_pir() {
  pinMode(PIR_PIN, INPUT_PULLDOWN);
  pinMode(PIR_ALT_PIN, INPUT_PULLDOWN);
  pir_boot_time = millis();
  pir_warmup = true;
  Serial.printf("[PIR] Debounced PIR Sensor Active on IO4 (GPIO %d) & IO6 (GPIO %d) | Confirm=%dms | Hold=%ds | Warmup=%ds\n",
                PIR_PIN, PIR_ALT_PIN, PIR_SAMPLE_MS * PIR_CONFIRM_SAMPLES, PIR_HOLD_MS / 1000, PIR_BOOT_SETTLE_MS / 1000);
}

void poll_pir() {
  unsigned long now = millis();
  if (now - last_sample_time < PIR_SAMPLE_MS) return;
  last_sample_time = now;

  int r4 = digitalRead(PIR_PIN);
  int r6 = digitalRead(PIR_ALT_PIN);
  last_r4 = r4;
  last_r6 = r6;

  // Ignore initial Wi-Fi startup & PIR sensor warm-up calibration pulses
  if (now - pir_boot_time < PIR_BOOT_SETTLE_MS) {
    pir_warmup = true;
    streak_pin4 = 0;
    streak_pin6 = 0;
    pir_active = false;
    is_occupied = false;
    return;
  }
  pir_warmup = false;

  if (r4 == HIGH) {
    if (streak_pin4 < PIR_CONFIRM_SAMPLES) streak_pin4++;
    if (streak_pin4 == PIR_CONFIRM_SAMPLES && !last_confirmed_state) pin4_hits++;
  } else {
    if (streak_pin4 > 0 && streak_pin4 < PIR_CONFIRM_SAMPLES) {
      noise_rejected++;
      Serial.printf("[PIR NOISE] Ignored %dms spike on IO4 (total rejected=%lu)\n",
                    streak_pin4 * PIR_SAMPLE_MS, noise_rejected);
    }
    streak_pin4 = 0;
  }

  if (r6 == HIGH) {
    if (streak_pin6 < PIR_CONFIRM_SAMPLES) streak_pin6++;
    if (streak_pin6 == PIR_CONFIRM_SAMPLES && !last_confirmed_state) pin6_hits++;
  } else {
    if (streak_pin6 > 0 && streak_pin6 < PIR_CONFIRM_SAMPLES) {
      noise_rejected++;
      Serial.printf("[PIR NOISE] Ignored %dms spike on IO6 (total rejected=%lu)\n",
                    streak_pin6 * PIR_SAMPLE_MS, noise_rejected);
    }
    streak_pin6 = 0;
  }

  bool confirmed = (streak_pin4 >= PIR_CONFIRM_SAMPLES) || (streak_pin6 >= PIR_CONFIRM_SAMPLES);
  pir_active = confirmed;

  if (confirmed != last_confirmed_state) {
    last_confirmed_state = confirmed;
    Serial.printf("[PIR] Confirmed state=%s (IO4=%d, IO6=%d, hits4=%lu, hits6=%lu)\n",
                  confirmed ? "HIGH" : "LOW", r4, r6, pin4_hits, pin6_hits);
  }

  if (confirmed) {
    last_motion_time = now;
    if (!is_occupied) {
      is_occupied = true;
      Serial.println("[CONFERENCE] >>> CONFIRMED MOTION -> OCCUPIED <<<");
    }
  } else if (is_occupied && (now - last_motion_time > PIR_HOLD_MS)) {
    is_occupied = false;
    Serial.printf("[CONFERENCE] --- No motion for %ds -> VACANT ---\n", PIR_HOLD_MS / 1000);
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
  s += ",\"pin4\":" + String(last_r4) + ",\"pin6\":" + String(last_r6);
  s += ",\"hits4\":" + String(pin4_hits) + ",\"hits6\":" + String(pin6_hits);
  s += ",\"warmup\":" + String(pir_warmup ? "true" : "false");
  s += ",\"noise_filtered\":" + String(noise_rejected);
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
#if HAS_PIR
  pir_boot_time = millis(); // Start warm-up blanking after Wi-Fi TX settles
#endif
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
