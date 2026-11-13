# Smart Home Automation System

A full-stack, hardware-integrated IoT Smart Home Automation platform featuring real-time ESP32-S3 microcontroller switching, environmental sensor telemetry, multi-device AIOTA MQTT connectivity, and an adaptive Bento Glass web dashboard.

## Architecture

- **ESP32 Firmware (`esp32_relay_6ch/`):**
  - Multi-board controller for 6-channel relays.
  - Sensors supported:
    - **Board 1 (Engineering Hub):** ASAIR AM2315C High-precision Temperature & Humidity sensor (I2C on GPIO 4/5).
    - **Board 2 (The Gallery):** Indoor Air Quality sensor measuring particulate/gas concentration in **`µg/m³`** (Micrograms per cubic meter on GPIO 6 / ADC1_CH5).
    - **Board 3 (Conference Room):** PIR Motion & Occupancy Sensor with noise debouncing on GPIO 6.
  - Sub-50ms switching latency with UDP multicast and fallback REST HTTP endpoints.

- **Backend Hub (`backend/`):**
  - **FastAPI / Uvicorn server** providing low-latency REST APIs and UDP fast-path device triggers.
  - **Multi-Device MQTT Bridge (`mqtt_bridge.py`):** Concurrently connects multiple hardware/cloud device IDs to `mqtt.aiota.tech:1883`, publishing real-time telemetry/status and executing remote JSON commands (`scenes`, `rooms`, `relay channels`, `6-bit masks`).
  - **Vision AI Voice Assistant (`vision_ai.py`):** Hands-free voice control and automation powered by Google Gemini.
  - **Keepalive Service:** Automated background health watcher.

- **Frontend Dashboard (`frontend/`):**
  - Modern, responsive **Bento Glass** UI built with **React**, **TypeScript**, and **Vite**.
  - Adaptive layout designed for mobile phones (edge-to-edge), tablets, and desktop displays (wide bento grid with floating pill dock).
  - Real-time room telemetry dials, live wattage tracking, energy forecasting, and one-tap quick scenes.

---

## Setup & Running

### 1. Backend

```bash
cd backend
python -m pip install -r requirements.txt
cp .env.example .env   # Configure your credentials
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev      # For development
npm run build    # For production bundle served directly by FastAPI
```

### 3. ESP32-S3 Firmware

Open `esp32_relay_6ch/esp32_relay_6ch.ino` in Arduino IDE or compile via `arduino-cli`:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32s3 esp32_relay_6ch
```
Set `BOARD_ID` (1, 2, or 3) before flashing each respective room controller board.
