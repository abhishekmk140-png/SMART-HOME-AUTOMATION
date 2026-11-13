"""IoT Home Automation backend (FastAPI) - ESP32-S3 6-channel relay controller & IoT Hub."""
import os, time, json, urllib.request, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import vision_ai
import laptop_ctrl
from mqtt_bridge import load_mqtt_bridges

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
STATE_FILE = BASE_DIR / "state.json"
SAVED_ROOMS_FILE = BASE_DIR / "saved_rooms.json"

ESP32_URL = "http://192.168.1.10"
RELAY_MODE = "direct"          # "direct" (device 1-to-1) or "room_nodes" (1 relay per room node)
INVERT_RELAYS = False          # True for active-LOW boards (inverts wire mask)
relay_state = {"online": True, "last": "never", "error": ""}

app = FastAPI(title="IoT Home Automation")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def dev(i, n, t, on, v, ch=None): 
    return {"id": i, "name": n, "type": t, "isOn": on, "value": v, "relayChannel": ch}
def sen(i, n, v, u): 
    return {"id": i, "name": n, "value": v, "unit": u}

def room(rid, name, cat, p, L, F, S, t, h, c, A=None):
    if A is None:
        A = [("Inverter AC", False, 24.0)] if any(w in name.lower() or w in cat.lower() for w in ["living", "bedroom", "office", "master"]) else []
    return {
        "id": rid, "name": name, "category": cat,
        "lights": [dev(f"{p}_light_{k+1}", x[0], "light", x[1], x[2]) for k, x in enumerate(L)],
        "fans": [dev(f"{p}_fan_{k+1}", x[0], "fan", x[1], x[2]) for k, x in enumerate(F)],
        "acs": [dev(f"{p}_ac_{k+1}", x[0], "ac", x[1], x[2]) for k, x in enumerate(A)],
        "switches": [dev(f"{p}_switch_{k+1}", x[0], "switchDevice", x[1], x[2]) for k, x in enumerate(S)],
        "tempSensor": sen(f"{p}_sensor_temp", "Temperature", t, "°C"),
        "humSensor": sen(f"{p}_sensor_hum", "Humidity", h, "%"),
        "co2Sensor": sen(f"{p}_sensor_co2", "Air Quality", c, "µg/m³")
    }

DEFAULT_ROOMS = [
    room("room_living_room", "Living Room", "Living Room", "lr",
        [("Ceiling Light",False,85.0),("Ambient Lamp",False,60.0),("Wall Sconce",False,40.0),("TV Backlight",False,50.0)],
        [("Ceiling Fan",False,3.0),("Air Purifier Fan",False,2.0)],
        [("Media Socket",False,1.0),("Speaker Outlet",False,1.0)], 22.4, 45.0, 18.0,
        [("Living Inverter AC",False,24.0)]),
    room("room_bedroom", "Master Bedroom", "Bedroom", "br",
        [("Nightstand Light",False,50.0),("Wardrobe Light",False,70.0),("Ceiling Fan Light",False,40.0),("Reading Lamp",False,60.0)],
        [("Quiet Fan",False,2.0),("Exhaust Fan",False,1.0)],
        [("Charger Socket",False,1.0),("Air Humidifier",False,1.0)], 20.1, 52.0, 42.0,
        [("Master Dual-Cool AC",False,22.0)]),
    room("room_kitchen", "Kitchen", "Kitchen", "kc",
        [("Counter Lights",False,90.0),("Island Pendant",False,80.0),("Pantry Light",False,50.0),("Under-Cabinet Strip",False,75.0)],
        [("Chimney Hood Fan",False,4.0),("Exhaust Fan",False,2.0)],
        [("Coffee Maker Plug",False,1.0),("Microwave Socket",False,1.0)], 24.0, 60.0, 125.0,
        []),
    room("room_bathroom", "Bathroom", "Bathroom", "bt",
        [("Mirror Vanity",False,80.0),("Ceiling Downlight",False,50.0),("Shower Light",False,60.0),("Night Light",False,30.0)],
        [("Ventilation Fan",False,2.0),("Dryer Blower",False,1.0)],
        [("Water Heater Plug",False,1.0),("Shaver Socket",False,1.0)], 21.5, 78.0, 28.0,
        []),
]

RULES = [
    {"id":"rule_1","title":"Auto Climate Control","description":"Living Room Temp > 26°C","triggerType":"temperature","thresholdValue":26.0,"actionDescription":"Action: Fans → Speed Level 4 & AC Cool","isEnabled":True},
    {"id":"rule_2","title":"Air Quality Purifier","description":"Air Quality > 75 µg/m³","triggerType":"co2","thresholdValue":75.0,"actionDescription":"Action: Exhaust Fan → TURN ON Speed 4","isEnabled":True},
    {"id":"rule_3","title":"Night Energy Saver","description":"Time > 23:00","triggerType":"schedule","thresholdValue":23.0,"actionDescription":"Action: Off sockets, AC to 25°C & lower lights","isEnabled":True},
]

DEFAULT_ROOM_URLS = {
    "ENGINEERING HUB": "http://192.168.1.10",
    "DEVELOPMENT AREA": "http://192.168.1.10",
    "THE GALLERY": "http://192.168.1.11",
    "CONFERENCE": "http://192.168.1.14",
    "CONFERENCE ROOM": "http://192.168.1.14",
    "room_living_room": "http://192.168.1.10",
    "room_kitchen": "http://192.168.1.11",
    "room_bedroom": "http://192.168.1.14",
    "room_r1793692559305": "http://192.168.1.10",
    "room_r1793692482928": "http://192.168.1.11",
    "room_r1793692575123": "http://192.168.1.14",
}

DEFAULT_ROOM_PORTS = {
    "ENGINEERING HUB": "COM8",
    "DEVELOPMENT AREA": "COM8",
    "THE GALLERY": "COM7",
    "CONFERENCE": "COM6",
    "CONFERENCE ROOM": "COM6",
    "room_living_room": "COM8",
    "room_kitchen": "COM7",
    "room_bedroom": "COM6",
    "room_r1793692559305": "COM8",
    "room_r1793692482928": "COM7",
    "room_r1793692575123": "COM6",
}

ROOMS = []
room_states = {}  # rid -> {"online": bool, "error": str, "last": str, "url": str, "mask": str}

import socket, http.client
_http_pool = {}
_udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def alldev(r): 
    return r.get("lights", []) + r.get("fans", []) + r.get("acs", []) + r.get("switches", [])

def ensure_channel_assignments():
    """Ensure all 3 rooms (Engineering Hub, The Gallery, Conference)
       have distinct IP addresses and their channels mapped to their respective ESP32 boards."""
    for r in ROOMS:
        rid = r.get("id", "")
        rname = r.get("name", "").strip().upper()
        # Enforce distinct default IPs if room has duplicate or missing
        if "ENGINEERING" in rname:
            r["esp32_url"] = "http://192.168.1.10"
        elif "GALLERY" in rname:
            r["esp32_url"] = "http://192.168.1.11"
        elif "CONFERENCE" in rname:
            r["esp32_url"] = "http://192.168.1.14"
        elif not r.get("esp32_url"):
            r["esp32_url"] = DEFAULT_ROOM_URLS.get(rname, DEFAULT_ROOM_URLS.get(rid, "http://192.168.1.10"))
        if "CONFERENCE" in rname and (not r.get("category") or r.get("category") == "Living Room"):
            r["category"] = "Conference"
        
        lights = r.get("lights", [])
        fans = r.get("fans", [])
        switches = r.get("switches", [])
        acs = r.get("acs", [])
        
        # Only assign relayChannel if not already set by user/config!
        for i, l in enumerate(lights):
            if l.get("relayChannel") is None:
                l["relayChannel"] = min(i + 1, 4)
        if len(fans) > 0 and fans[0].get("relayChannel") is None:
            fans[0]["relayChannel"] = 5
        if len(switches) > 0 and switches[0].get("relayChannel") is None:
            switches[0]["relayChannel"] = 6
        elif len(fans) > 1 and fans[1].get("relayChannel") is None:
            fans[1]["relayChannel"] = 6
        elif len(acs) > 0 and acs[0].get("relayChannel") is None:
            acs[0]["relayChannel"] = 6

def _do_save_file():
    try:
        data = {
            "rooms": ROOMS,
            "rules": RULES,
            "esp32_url": ESP32_URL,
            "mode": RELAY_MODE,
            "invert": INVERT_RELAYS
        }
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving state: {e}")

def save_state():
    threading.Thread(target=_do_save_file, daemon=True).start()

def _migrate_air_quality_units(rooms, rules):
    """Migrate legacy PPM air quality sensors and rules to ug/m3."""
    for r in rooms:
        co2 = r.get("co2Sensor")
        if isinstance(co2, dict) and co2.get("unit") != "µg/m³":
            val = float(co2.get("value", 24.0))
            if co2.get("unit") == "PPM" and val >= 400.0:
                val = round(max(10.0, min(500.0, (val - 400.0) * 490.0 / 1600.0 + 10.0)), 0)
            co2["name"] = "Air Quality"
            co2["value"] = round(max(0.0, val), 0)
            co2["unit"] = "µg/m³"
    for rule in rules:
        if rule.get("triggerType") == "co2" and ("PPM" in rule.get("description", "") or rule.get("thresholdValue", 0) > 500):
            rule["thresholdValue"] = 75.0
            rule["description"] = "Air Quality > 75 µg/m³"

def load_state():
    global ROOMS, RULES, ESP32_URL, RELAY_MODE, INVERT_RELAYS
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            ROOMS = data.get("rooms", [])
            for r in ROOMS:
                if "acs" not in r: r["acs"] = []
                if not r.get("esp32_url"):
                    rname = r.get("name", "").strip().upper()
                    r["esp32_url"] = DEFAULT_ROOM_URLS.get(rname, DEFAULT_ROOM_URLS.get(r.get("id", ""), "http://192.168.1.10"))
            RULES = data.get("rules", RULES)
            ESP32_URL = data.get("esp32_url", ESP32_URL)
            RELAY_MODE = data.get("mode", RELAY_MODE)
            INVERT_RELAYS = data.get("invert", INVERT_RELAYS)
            _migrate_air_quality_units(ROOMS, RULES)
            ensure_channel_assignments()
            save_state()
            return
        except Exception as e:
            print(f"Error loading state.json: {e}")

    if SAVED_ROOMS_FILE.exists():
        try:
            with open(SAVED_ROOMS_FILE, "r", encoding="utf-8") as f:
                ROOMS = json.load(f)
            _migrate_air_quality_units(ROOMS, RULES)
            ensure_channel_assignments()
            save_state()
            return
        except Exception as e:
            print(f"Error loading saved_rooms.json: {e}")

    ROOMS = DEFAULT_ROOMS
    ensure_channel_assignments()
    save_state()

load_state()

def find(rid):
    for r in ROOMS:
        if r["id"] == rid: return r
    clean = rid.lower()
    for r in ROOMS:
        rname = r["name"].lower()
        if "living" in clean and ("engineering" in rname or "hub" in rname or "development" in rname):
            return r
        if ("development" in clean or "office" in clean) and ("engineering" in rname or "hub" in rname or "development" in rname):
            return r
        if "kitchen" in clean and "gallery" in rname:
            return r
        if "bedroom" in clean and "conference" in rname:
            return r
        if clean in rname or rname in clean:
            return r
    raise HTTPException(404, f"room '{rid}' not found")

def finddev(r, did):
    for d in alldev(r):
        if d["id"] == did: return d
    did_clean = str(did).lower()
    for d in alldev(r):
        if did_clean == str(d.get("relayChannel")) or did_clean == d["name"].lower():
            return d
    raise HTTPException(404, f"device '{did}' not found in {r['name']}")

def compute_room_mask(r):
    """Compute 6-bit mask for a specific room's 6-channel ESP32."""
    mask = ["0"] * 6
    for d in alldev(r):
        ch = d.get("relayChannel")
        if ch and 1 <= ch <= 6 and d.get("isOn", False):
            mask[ch - 1] = "1"
    return "".join(mask)

def get_room_wire_mask(r):
    raw = compute_room_mask(r)
    if INVERT_RELAYS:
        return "".join("0" if c == "1" else "1" for c in raw)
    return raw

def compute_relay_mask():
    if ROOMS:
        return compute_room_mask(ROOMS[0])
    return "000000"

def get_wire_mask():
    raw = compute_relay_mask()
    if INVERT_RELAYS:
        return "".join("0" if c == "1" else "1" for c in raw)
    return raw

def get_mapping_description():
    if ROOMS:
        r = ROOMS[0]
        ch_map = {}
        for d in alldev(r):
            ch = d.get("relayChannel")
            if ch and 1 <= ch <= 6:
                ch_map[f"CH{ch}"] = f"{r['name']} · {d['name']}"
        return {f"CH{i+1}": ch_map.get(f"CH{i+1}", f"Relay {i+1}") for i in range(6)}
    return {f"CH{i+1}": f"Relay {i+1}" for i in range(6)}

def _fire_udp_instantly(r):
    url = r.get("esp32_url")
    if not url: return
    clean = url.replace("http://", "").replace("https://", "").split("/")[0]
    host = clean.split(":")[0]
    wire_mask = get_room_wire_mask(r)
    pkt = f"v={wire_mask}".encode()
    try:
        _udp_socket.sendto(pkt, (host, 8888))
        _udp_socket.sendto(pkt, (host, 8888))
    except Exception:
        pass

def _send_fast_cmd(host, port, wire_mask):
    # 1. Instant 0ms UDP Datagram (send twice to guarantee Wi-Fi delivery)
    try:
        pkt = f"v={wire_mask}".encode()
        _udp_socket.sendto(pkt, (host, 8888))
        _udp_socket.sendto(pkt, (host, 8888))
    except Exception:
        pass

    # 2. Fast HTTP request with short 0.8s timeout and non-persistent Connection: close
    url = f"http://{host}:{port}/mask?v={wire_mask}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SmartHome/1.0", "Connection": "close"})
        with urllib.request.urlopen(req, timeout=0.8) as resp:
            if resp.status == 200:
                return True, ""
    except Exception as e:
        err = str(e)
        if "10061" in err or "refused" in err:
            return False, "Offline · Port 80 refused"
        elif "timed out" in err or "timeout" in err:
            return False, "Offline · Connection timed out"
        elif "11001" in err:
            return False, "Offline · Hostname not found"
        return False, f"Offline · {err[:25]}"
    return True, ""

def _sync_single_room(r):
    url = r.get("esp32_url")
    if not url:
        return
    wire_mask = get_room_wire_mask(r)
    clean_url = url.replace("http://", "").replace("https://", "").split("/")[0]
    host = clean_url.split(":")[0]
    port = int(clean_url.split(":")[1]) if ":" in clean_url else 80
    
    ok, err = _send_fast_cmd(host, port, wire_mask)
    now_str = time.strftime("%H:%M:%S")
    for other in ROOMS:
        other_url = other.get("esp32_url", "").replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
        if other_url == host:
            room_states[other["id"]] = {
                "online": ok,
                "error": err,
                "last": now_str,
                "url": other.get("esp32_url", ""),
                "mask": get_room_wire_mask(other)
            }

def _poll_single_host(h, p):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.35)
        res = s.connect_ex((h, p))
        s.close()
        ok = (res == 0)
        err = "" if ok else ("Offline · Connection timed out" if res == 10060 else "Offline · Port 80 refused")
    except Exception as ex:
        ok = False
        err = f"Offline · {str(ex)[:25]}"

    if ok:
        try:
            req = urllib.request.Request(f"http://{h}:{p}/status", headers={"Connection": "close", "User-Agent": "SmartHome/1.0"})
            with urllib.request.urlopen(req, timeout=0.6) as resp:
                if resp.status == 200:
                    sdata = json.loads(resp.read().decode())
                    changed = False
                    # 1. ASAIR AM2315C Temperature & Humidity
                    if "temp" in sdata and "hum" in sdata and sdata.get("sensor_ready", True):
                        t_val = round(max(0.0, float(sdata["temp"])), 1)
                        h_val = round(max(0.0, min(100.0, float(sdata["hum"]))), 1)
                        for target_r in ROOMS:
                            target_host = target_r.get("esp32_url", "").replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
                            if target_host == h:
                                if "tempSensor" in target_r and target_r["tempSensor"].get("value") != t_val:
                                    target_r["tempSensor"]["value"] = t_val
                                    changed = True
                                if "humSensor" in target_r and target_r["humSensor"].get("value") != h_val:
                                    target_r["humSensor"]["value"] = h_val
                                    changed = True
                                if not target_r.get("has_am2315c"):
                                    target_r["has_am2315c"] = True
                                    changed = True
                    elif sdata.get("sensor_ready") is False:
                        for target_r in ROOMS:
                            target_host = target_r.get("esp32_url", "").replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
                            if target_host == h and target_r.get("has_am2315c"):
                                target_r["has_am2315c"] = False
                                changed = True

                    # 2. Air Quality Sensor (Gallery or assigned room, measured in ug/m3)
                    aq_val = sdata.get("air_quality") or sdata.get("co2")
                    if aq_val is not None:
                        aq_raw = float(aq_val)
                        # Convert legacy ESP32 PPM readings (400..2000) if firmware has not been reflashed yet
                        if sdata.get("air_quality_unit") != "µg/m³" and aq_raw > 500.0:
                            aq_raw = 10.0 + ((aq_raw - 400.0) * 490.0 / 1600.0)
                        aq_num = round(max(0.0, aq_raw), 0)
                        for target_r in ROOMS:
                            target_host = target_r.get("esp32_url", "").replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
                            if target_host == h:
                                if "co2Sensor" in target_r and target_r["co2Sensor"].get("value") != aq_num:
                                    target_r["co2Sensor"]["value"] = aq_num
                                    changed = True
                                if "co2Sensor" in target_r and target_r["co2Sensor"].get("unit") != "µg/m³":
                                    target_r["co2Sensor"]["unit"] = "µg/m³"
                                    changed = True
                                if not target_r.get("has_aqi"):
                                    target_r["has_aqi"] = True
                                    changed = True

                    # 3. PIR Motion Sensor & Occupancy (Conference Room)
                    if "occupancy" in sdata:
                        occ = sdata["occupancy"]
                        sec_raw = occ.get("seconds_ago")
                        try:
                            sec_ago = int(sec_raw) if sec_raw is not None else 999
                        except Exception:
                            sec_ago = 999
                        raw_occ = bool(occ.get("occupied", False))
                        raw_pir = bool(occ.get("pir", occ.get("pir1", False)))
                        has_fw_debounce = "noise_filtered" in occ
                        now_ts = time.time()
                        for target_r in ROOMS:
                            target_host = target_r.get("esp32_url", "").replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
                            if target_host == h:
                                prev_occ = target_r.get("occupancy", {})
                                if has_fw_debounce:
                                    is_warmup = bool(occ.get("warmup", False))
                                    effective_occ = False if is_warmup else (raw_occ or raw_pir)
                                    effective_pir = False if is_warmup else raw_pir
                                    hold_until = now_ts + 4.0 if effective_pir else prev_occ.get("_hold_until", 0.0)
                                    clean_sec_ago = 999 if is_warmup else sec_ago
                                    last_real_ts = prev_occ.get("_last_real_ts", 0.0)
                                    pir_streak = 0
                                else:
                                    # Old firmware without pulse-width filter fires short EMI spikes;
                                    # require 2 consecutive raw_pir=True polls (~0.4s+ sustained) to confirm genuine motion, then hold 8s.
                                    prev_hold = float(prev_occ.get("_hold_until", 0.0) or 0.0)
                                    last_real_ts = float(prev_occ.get("_last_real_ts", 0.0) or 0.0)
                                    pir_streak = (int(prev_occ.get("_pir_streak", 0) or 0) + 1) if raw_pir else 0
                                    if pir_streak >= 2:
                                        hold_until = now_ts + 8.0
                                        last_real_ts = now_ts
                                        effective_occ = True
                                        effective_pir = True
                                    elif now_ts < prev_hold:
                                        hold_until = prev_hold
                                        effective_occ = True
                                        effective_pir = False
                                    else:
                                        hold_until = 0.0
                                        effective_occ = False
                                        effective_pir = False
                                    clean_sec_ago = int(now_ts - last_real_ts) if last_real_ts > 0 else 999

                                if prev_occ.get("occupied") != effective_occ or prev_occ.get("pir") != effective_pir or not target_r.get("has_pir"):
                                    changed = True
                                target_r["occupancy"] = {
                                    "occupied": effective_occ,
                                    "status": "Occupied" if effective_occ else "Vacant",
                                    "pir": effective_pir,
                                    "pir1": effective_pir,
                                    "seconds_ago": clean_sec_ago,
                                    "warmup": is_warmup if has_fw_debounce else False,
                                    "_hold_until": hold_until,
                                    "_last_real_ts": last_real_ts,
                                    "_pir_streak": pir_streak if not has_fw_debounce else 0,
                                }
                                target_r["has_pir"] = True

                    if changed:
                        save_state()
        except Exception:
            pass

    now_str = time.strftime("%H:%M:%S")
    for other in ROOMS:
        other_host = other.get("esp32_url", "").replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
        if other_host == h:
            prev = room_states.get(other["id"], {})
            room_states[other["id"]] = {
                "online": ok,
                "error": err,
                "last": now_str,
                "url": other.get("esp32_url", ""),
                "mask": prev.get("mask", get_room_wire_mask(other))
            }

def _background_health_poller():
    with ThreadPoolExecutor(max_workers=6) as pool:
        while True:
            try:
                time.sleep(1.0)
                unique_hosts = {}
                for r in list(ROOMS):
                    u = r.get("esp32_url", "")
                    if u:
                        clean = u.replace("http://", "").replace("https://", "").split("/")[0]
                        h = clean.split(":")[0]
                        p = int(clean.split(":")[1]) if ":" in clean else 80
                        if h not in unique_hosts:
                            unique_hosts[h] = p
                list(pool.map(lambda item: _poll_single_host(item[0], item[1]), unique_hosts.items()))
            except Exception:
                pass

threading.Thread(target=_background_health_poller, daemon=True).start()

def sync_relays(target_rid=None):
    if target_rid:
        for r in ROOMS:
            if r["id"] == target_rid:
                threading.Thread(target=_sync_single_room, args=(r,), daemon=True).start()
                return
    for r in ROOMS:
        threading.Thread(target=_sync_single_room, args=(r,), daemon=True).start()

def check_rules():
    for rule in RULES:
        if not rule.get("isEnabled", False): continue
        for r in ROOMS:
            if rule.get("triggerType") == "temperature" and r.get("tempSensor", {}).get("value", 0) > rule.get("thresholdValue", 26):
                for f in r.get("fans", []): 
                    f["isOn"], f["value"] = True, 4.0
            elif rule.get("triggerType") == "co2" and r.get("co2Sensor", {}).get("value", 0) > rule.get("thresholdValue", 75) and len(r.get("fans", [])) >= 2:
                r["fans"][1]["isOn"], r["fans"][1]["value"] = True, 4.0

@app.get("/health")
@app.get("/api/health")
def health(): 
    return {"status": "ok", "esp32": any(st.get("online", False) for st in room_states.values())}

@app.get("/api/relays")
def relays():
    boards = []
    any_online = False
    for r in ROOMS:
        rid = r["id"]
        st = room_states.get(rid, {})
        if st.get("online"):
            any_online = True
        rmask = compute_room_mask(r)
        rwmask = get_room_wire_mask(r)
        rurl = r.get("esp32_url") or DEFAULT_ROOM_URLS.get(r["name"].strip().upper(), "http://192.168.1.10")
        ch_map = {}
        for d in alldev(r):
            ch = d.get("relayChannel")
            if ch and 1 <= ch <= 6:
                key = f"CH{ch}"
                if key in ch_map and d["name"] not in ch_map[key]:
                    ch_map[key] = f"{ch_map[key]} & {d['name']}"
                else:
                    ch_map[key] = d["name"]
        
        boards.append({
            "id": rid,
            "name": r["name"],
            "port": DEFAULT_ROOM_PORTS.get(r["name"].strip().upper(), DEFAULT_ROOM_PORTS.get(rid, "COM6")),
            "category": r.get("category", ""),
            "esp32_url": rurl,
            "online": st.get("online", False),
            "error": st.get("error", ""),
            "last": st.get("last", "never"),
            "active_mask": rmask,
            "wire_mask": rwmask,
            "map": {f"CH{i+1}": ch_map.get(f"CH{i+1}", f"Relay {i+1}") for i in range(6)}
        })

    first_board = boards[0] if boards else {}
    return {
        "esp32_url": first_board.get("esp32_url", "http://192.168.1.10"),
        "mode": "direct",
        "invert": INVERT_RELAYS,
        "map": first_board.get("map", {}),
        "active_mask": first_board.get("active_mask", "000000"),
        "wire_mask": first_board.get("wire_mask", "000000"),
        "boards": boards,
        "online": any_online,
        "last": time.strftime("%H:%M:%S"),
        "error": ""
    }

class RelayConfig(BaseModel):
    url: str

class RelayModePayload(BaseModel):
    mode: str

@app.post("/api/relays/mode")
def set_relay_mode(b: RelayModePayload):
    global RELAY_MODE
    if b.mode in ("direct", "room_nodes"):
        RELAY_MODE = b.mode
        save_state()
        sync_relays()
    return relays()

@app.post("/api/relays/invert")
def toggle_invert():
    global INVERT_RELAYS
    INVERT_RELAYS = not INVERT_RELAYS
    save_state()
    sync_relays()
    return relays()

@app.post("/api/relays/url")
def set_relay_url(b: RelayConfig):
    global ESP32_URL
    u = b.url.strip()
    if u and not u.startswith("http://") and not u.startswith("https://"):
        u = "http://" + u
    ESP32_URL = u
    save_state()
    sync_relays()
    return relays()

class RoomRelayUrl(BaseModel):
    url: str

@app.post("/api/rooms/{rid}/esp32")
def set_room_esp32_url(rid: str, b: RoomRelayUrl):
    u = b.url.strip()
    if u and not u.startswith("http://") and not u.startswith("https://"):
        u = "http://" + u
    target = None
    for r in ROOMS:
        if r["id"] == rid or r["name"].strip().lower() == rid.strip().lower():
            r["esp32_url"] = u
            target = r
            break
    if not target:
        target = find(rid)
        if target:
            target["esp32_url"] = u
    save_state()
    sync_relays(target_rid=target["id"] if target else rid)
    return relays()

@app.post("/api/rooms/{rid}/relays/{ch}/toggle")
def toggle_room_channel(rid: str, ch: int):
    if ch < 1 or ch > 6:
        raise HTTPException(400, "channel must be 1..6")
    r = find(rid)
    any_on = any(d.get("isOn", False) for d in alldev(r) if d.get("relayChannel") == ch)
    new_state = not any_on
    for d in alldev(r):
        if d.get("relayChannel") == ch:
            d["isOn"] = new_state
    _fire_udp_instantly(r)
    save_state()
    sync_relays(target_rid=rid)
    return relays()

@app.post("/api/relays/{ch}/toggle")
def toggle_channel(ch: int):
    if ch < 1 or ch > 6:
        raise HTTPException(400, "channel must be 1..6")
    for r in ROOMS:
        for d in alldev(r):
            if d.get("relayChannel") == ch:
                d["isOn"] = not d.get("isOn", False)
        _fire_udp_instantly(r)
        sync_relays(target_rid=r["id"])
    save_state()
    return relays()

@app.get("/api/rooms")
def get_rooms(): 
    return ROOMS

class NewRoom(BaseModel):
    name: str
    category: str

@app.post("/api/rooms")
def create_room(b: NewRoom):
    p = f"r{int(time.time()*1000)}"
    r = room(f"room_{p}", b.name, b.category, p,
      [("Main Light",False,80.0),("Ceiling Light",False,70.0),("Ambient Lamp",False,50.0),("Night Strip",False,40.0)],
      [("Ceiling Fan",False,3.0),("Exhaust Fan",False,2.0)],
      [("Wall Socket 1",False,1.0),("Wall Socket 2",False,1.0)], 24.5, 48.0, 420.0)
    ROOMS.append(r)
    ensure_channel_assignments()
    check_rules()
    save_state()
    sync_relays()
    return r

@app.delete("/api/rooms/{rid}")
def del_room(rid: str):
    ROOMS[:] = [r for r in ROOMS if r["id"] != rid]
    save_state()
    sync_relays()
    return {"ok": True}

class EditRoom(BaseModel):
    name: str
    category: str

@app.put("/api/rooms/{rid}")
def edit_room(rid: str, b: EditRoom):
    r = find(rid)
    r["name"] = b.name
    r["category"] = b.category
    save_state()
    return r

@app.post("/api/rooms/{rid}/toggle")
def toggle_room(rid: str):
    r = find(rid)
    any_on = any(d.get("isOn", False) for d in alldev(r))
    new_state = not any_on
    for d in alldev(r):
        d["isOn"] = new_state
    _fire_udp_instantly(r)
    save_state()
    sync_relays(target_rid=rid)
    return r

class NewDev(BaseModel):
    name: str
    type: str
    relayChannel: Optional[int] = None

@app.post("/api/rooms/{rid}/devices")
def add_dev(rid: str, b: NewDev):
    r = find(rid)
    k = {"light": "lights", "fan": "fans", "ac": "acs"}.get(b.type, "switches")
    if k not in r: r[k] = []
    init_val = 100.0 if b.type == "light" else 3.0 if b.type == "fan" else 24.0 if b.type == "ac" else 1.0
    d = dev(f"{rid}_custom_{int(time.time()*1000)}", b.name, b.type, False,
            init_val, ch=b.relayChannel)
    r[k].append(d)
    save_state()
    sync_relays(target_rid=rid)
    return d

class EditDev(BaseModel):
    name: str
    relayChannel: Optional[int] = None

@app.put("/api/rooms/{rid}/devices/{did}")
def edit_dev(rid: str, did: str, b: EditDev):
    d = finddev(find(rid), did)
    d["name"] = b.name
    if b.relayChannel is not None and 1 <= b.relayChannel <= 6:
        d["relayChannel"] = b.relayChannel
    else:
        d["relayChannel"] = None
    save_state()
    sync_relays(target_rid=rid)
    return d

@app.delete("/api/rooms/{rid}/devices/{did}")
def del_dev(rid: str, did: str):
    r = find(rid)
    for k in ("lights", "fans", "acs", "switches"):
        if k in r:
            r[k] = [d for d in r[k] if d["id"] != did]
    save_state()
    sync_relays(target_rid=rid)
    return {"ok": True}

@app.put("/api/rooms/{rid}/devices/{did}/toggle")
def toggle(rid: str, did: str):
    r = find(rid)
    d = finddev(r, did)
    new_state = not d["isOn"]
    ch = d.get("relayChannel")
    if ch:
        for dev_item in alldev(r):
            if dev_item.get("relayChannel") == ch:
                dev_item["isOn"] = new_state
    else:
        d["isOn"] = new_state
    _fire_udp_instantly(r)
    save_state()
    sync_relays(target_rid=rid)
    return d

class Val(BaseModel):
    value: float

@app.put("/api/rooms/{rid}/devices/{did}/value")
def setval(rid: str, did: str, b: Val):
    d = finddev(find(rid), did)
    d["value"] = b.value
    save_state()
    return d

class AllOn(BaseModel):
    isOn: bool

@app.put("/api/rooms/{rid}/all-devices")
def all_dev(rid: str, b: AllOn):
    r = find(rid)
    for d in alldev(r): 
        d["isOn"] = b.isOn
    _fire_udp_instantly(r)
    save_state()
    sync_relays(target_rid=rid)
    return {"ok": True}

@app.put("/api/rooms/{rid}/sensors/{stype}")
def set_sensor(rid: str, stype: str, b: Val):
    find(rid)[{"temperature": "tempSensor", "humidity": "humSensor", "co2": "co2Sensor"}[stype]]["value"] = b.value
    check_rules()
    save_state()
    sync_relays()
    return {"ok": True}

class TelemetryData(BaseModel):
    temp: Optional[float] = None
    hum: Optional[float] = None
    co2: Optional[float] = None
    air_quality: Optional[float] = None
    occupied: Optional[bool] = None
    pir1: Optional[bool] = None
    pir2: Optional[bool] = None

@app.post("/api/rooms/{rid}/telemetry")
@app.get("/api/rooms/{rid}/telemetry")
def update_room_telemetry(rid: str, t: Optional[float] = None, h: Optional[float] = None, c: Optional[float] = None, occupied: Optional[bool] = None, pir1: Optional[bool] = None, pir2: Optional[bool] = None, air_quality: Optional[float] = None, payload: Optional[TelemetryData] = None):
    r = find(rid)
    tv = t if t is not None else (payload.temp if payload else None)
    hv = h if h is not None else (payload.hum if payload else None)
    cv = c if c is not None else ((payload.air_quality if payload and payload.air_quality is not None else payload.co2) if payload else None)
    if air_quality is not None:
        cv = air_quality
    
    occ = occupied if occupied is not None else (payload.occupied if payload else None)
    p1 = pir1 if pir1 is not None else (payload.pir1 if payload else None)
    p2 = pir2 if pir2 is not None else (payload.pir2 if payload else None)

    if tv is not None and "tempSensor" in r:
        r["tempSensor"]["value"] = max(0.0, round(float(tv), 1))
        r["has_am2315c"] = True
    if hv is not None and "humSensor" in r:
        r["humSensor"]["value"] = max(0.0, min(100.0, round(float(hv), 1)))
        r["has_am2315c"] = True
    if cv is not None and "co2Sensor" in r:
        r["co2Sensor"]["value"] = round(float(cv), 0)
        r["has_aqi"] = True
    if occ is not None:
        is_o = bool(occ)
        p_val = bool(p1 if p1 is not None else is_o)
        r["occupancy"] = {
            "occupied": is_o,
            "status": "Occupied" if is_o else "Vacant",
            "pir": p_val,
            "pir1": p_val
        }
        r["has_pir"] = True
    
    check_rules()
    save_state()
    return {
        "status": "ok",
        "room": r["name"],
        "temp": r.get("tempSensor", {}).get("value"),
        "hum": r.get("humSensor", {}).get("value"),
        "co2": r.get("co2Sensor", {}).get("value"),
        "occupancy": r.get("occupancy")
    }

@app.get("/api/automations")
def get_rules(): 
    return RULES

class NewRule(BaseModel):
    title: str
    description: str
    triggerType: str
    thresholdValue: float
    actionDescription: str

@app.post("/api/automations")
def add_rule(b: NewRule):
    r = {**b.model_dump(), "id": f"rule_{int(time.time()*1000)}", "isEnabled": True}
    RULES.append(r)
    save_state()
    return r

@app.put("/api/automations/{rid}/toggle")
def toggle_rule(rid: str):
    for r in RULES:
        if r["id"] == rid: 
            r["isEnabled"] = not r["isEnabled"]
            save_state()
            return r
    raise HTTPException(404)

@app.post("/api/scenes/{name}")
def scene(name: str):
    n = name.lower()
    for r in ROOMS:
        if n == "all off":
            for d in alldev(r): d["isOn"] = False
        elif n == "all on":
            for d in alldev(r): d["isOn"] = True
        elif n == "night mode":
            for i, l in enumerate(r.get("lights", [])): l["isOn"] = (i == 3)
            for f in r.get("fans", []): f["isOn"], f["value"] = True, 2.0
            for s in r.get("switches", []): s["isOn"] = False
        elif n == "eco mode":
            for i, l in enumerate(r.get("lights", [])): l["isOn"] = (i == 0)
            for f in r.get("fans", []): f["value"] = 2.0
        elif "conference" in n:
            is_conf = "conference" in r.get("name", "").lower() or "conference" in r.get("category", "").lower() or "living" in r.get("category", "").lower()
            for d in alldev(r):
                d["isOn"] = is_conf
        _fire_udp_instantly(r)
    save_state()
    sync_relays()
    return {"ok": True}

class VisionTextReq(BaseModel):
    text: str
    active_room_id: Optional[str] = None
    ui_state: Optional[dict] = None
    history: Optional[list] = None

class VisionAudioReq(BaseModel):
    audio_base64: str
    mime_type: Optional[str] = "audio/webm"
    active_room_id: Optional[str] = None
    ui_state: Optional[dict] = None
    wake_word_required: Optional[bool] = False
    history: Optional[list] = None

def _execute_vision_actions(actions):
    """Apply Gemini-planned smart home actions directly to rooms, rules, devices, and ESP32 relays."""
    executed = []
    touched_rooms = set()
    state_changed = False

    for act in actions or []:
        if not isinstance(act, dict):
            continue
        atype = act.get("type")
        try:
            if atype == "scene" and act.get("scene"):
                sname = str(act["scene"])
                scene(sname)
                executed.append(f"Scene: {sname}")
                continue

            if atype == "sync_relays":
                sync_relays()
                executed.append("Synced ESP32 boards")
                continue

            if atype == "create_room" and act.get("name"):
                r = create_room(NewRoom(name=str(act["name"]), category=str(act.get("category") or "Living Room")))
                executed.append(f"Created room: {r['name']}")
                continue

            if atype == "delete_room" and act.get("room_id"):
                del_room(str(act["room_id"]))
                executed.append("Deleted room")
                continue

            if atype == "toggle_rule" and act.get("rule_id"):
                target_id = str(act["rule_id"])
                for rl in RULES:
                    if rl["id"] == target_id:
                        rl["isEnabled"] = bool(act["state"]) if "state" in act else (not rl.get("isEnabled", False))
                        state_changed = True
                        executed.append(f"{rl['title']}: {'ON' if rl['isEnabled'] else 'OFF'}")
                        break
                continue

            if atype == "create_rule" and act.get("title"):
                trig = str(act.get("trigger_type") or "temperature")
                th = float(act.get("threshold_value") or 26.0)
                act_desc = str(act.get("action_description") or "Custom rule")
                desc = f"{trig.title()} > {th}"
                add_rule(NewRule(title=str(act["title"]), description=desc, triggerType=trig, thresholdValue=th, actionDescription=f"Action: {act_desc}"))
                executed.append(f"Rule added: {act['title']}")
                continue

            rid = act.get("room_id")
            if not rid:
                continue

            if atype == "add_device" and act.get("name"):
                ch = int(act["relay_channel"]) if act.get("relay_channel") else None
                d = add_dev(str(rid), NewDev(name=str(act["name"]), type=str(act.get("device_type") or "light"), relayChannel=ch))
                executed.append(f"Added {d['name']}")
                continue

            if atype == "delete_device" and act.get("device_id"):
                del_dev(str(rid), str(act["device_id"]))
                executed.append("Removed device")
                continue

            if atype == "set_device_group":
                dtype = str(act.get("device_type", "all")).lower()
                new_state = bool(act.get("state", True))
                key_map = {"light": ["lights"], "lights": ["lights"], "fan": ["fans"], "fans": ["fans"], "ac": ["acs"], "acs": ["acs"], "switch": ["switches"], "switchdevice": ["switches"], "switches": ["switches"]}
                keys = key_map.get(dtype, ["lights", "fans", "acs", "switches"])
                target_rooms = ROOMS if str(rid).lower() == "all" else [find(str(rid))]
                for tr in target_rooms:
                    for k in keys:
                        for d in tr.get(k, []):
                            d["isOn"] = new_state
                    touched_rooms.add(tr["id"])
                label = "All rooms" if str(rid).lower() == "all" else target_rooms[0]["name"]
                executed.append(f"{label} {dtype}: {'ON' if new_state else 'OFF'}")
                continue

            r = find(str(rid))

            if atype == "set_room":
                new_state = bool(act.get("state", True))
                for d in alldev(r):
                    d["isOn"] = new_state
                touched_rooms.add(r["id"])
                executed.append(f"{r['name']}: {'ON' if new_state else 'OFF'}")

            elif atype == "set_device" and act.get("device_id"):
                d = finddev(r, str(act["device_id"]))
                new_state = bool(act.get("state", not d.get("isOn", False)))
                ch = d.get("relayChannel")
                if ch:
                    for item in alldev(r):
                        if item.get("relayChannel") == ch:
                            item["isOn"] = new_state
                else:
                    d["isOn"] = new_state
                touched_rooms.add(r["id"])
                executed.append(f"{d['name']}: {'ON' if new_state else 'OFF'}")

            elif atype == "set_device_value" and act.get("device_id") and act.get("value") is not None:
                d = finddev(r, str(act["device_id"]))
                val = float(act["value"])
                d["value"] = val
                if val > 0 and not d.get("isOn", False):
                    d["isOn"] = True
                touched_rooms.add(r["id"])
                executed.append(f"{d['name']} -> {val}")
        except Exception as exc:
            print(f"[VISION] Action error {act}: {exc}")

    if touched_rooms or state_changed:
        for tid in touched_rooms:
            try:
                tr = find(tid)
                _fire_udp_instantly(tr)
                sync_relays(target_rid=tid)
            except Exception:
                pass
        check_rules()
        save_state()

    return executed

@app.get("/api/vision/status")
def vision_status():
    return {
        "name": "VISION",
        "model": vision_ai.GEMINI_MODEL,
        "configured": bool(vision_ai.GEMINI_API_KEY),
    }

def _run_vision_response(res: dict, tag: str, fallback_heard: str = "") -> dict:
    """Execute backend smart-home actions + Windows laptop actions and format API payload."""
    if res.get("ignore"):
        print(f"[{tag}] ignored (silence or no wake word)")
        return {
            "ignore": True,
            "heard": "",
            "reply": "",
            "executed": [],
            "ui_actions": [],
            "rooms": ROOMS,
        }
    executed = _execute_vision_actions(res.get("actions", []))
    for la in res.get("laptop_actions", []) or []:
        if not isinstance(la, dict):
            continue
        try:
            label = laptop_ctrl.execute_laptop_action(la)
            if label:
                executed.append(label)
        except Exception as exc:
            print(f"[VISION LAPTOP] Action error {la}: {exc}")
    print(f"[{tag}] heard={res.get('heard')!r} reply={res.get('reply')!r} exec={executed} ui={res.get('ui_actions')}")
    return {
        "ignore": False,
        "end_conversation": bool(res.get("end_conversation", False)),
        "heard": res.get("heard") or fallback_heard,
        "reply": res.get("reply", "Done."),
        "executed": executed,
        "ui_actions": res.get("ui_actions", []),
        "rooms": ROOMS,
    }

@app.post("/api/vision/text")
def vision_text(req: VisionTextReq):
    ui_ctx = dict(req.ui_state or {})
    if req.active_room_id and "active_room_id" not in ui_ctx:
        ui_ctx["active_room_id"] = req.active_room_id
    ctx = vision_ai.build_home_context(ROOMS, room_states, rules=RULES, ui_state=ui_ctx)
    try:
        res = vision_ai.ask_vision(ctx, text=req.text, history=req.history)
    except Exception as exc:
        raise HTTPException(502, f"Vision AI error: {exc}")
    return _run_vision_response(res, "VISION TEXT", fallback_heard=req.text)

@app.post("/api/vision/audio")
def vision_audio(req: VisionAudioReq):
    ui_ctx = dict(req.ui_state or {})
    if req.active_room_id and "active_room_id" not in ui_ctx:
        ui_ctx["active_room_id"] = req.active_room_id
    ctx = vision_ai.build_home_context(ROOMS, room_states, rules=RULES, ui_state=ui_ctx)
    try:
        res = vision_ai.ask_vision(
            ctx,
            audio_base64=req.audio_base64,
            mime_type=req.mime_type or "audio/webm",
            wake_word_required=bool(req.wake_word_required),
            history=req.history,
        )
    except Exception as exc:
        raise HTTPException(502, f"Vision AI error: {exc}")
    return _run_vision_response(res, "VISION AUDIO")

def _build_mqtt_snapshot(client_id: str = ""):
    """Build combined facility telemetry and status payloads for MQTT publishing."""
    ts = int(time.time())
    rooms_tel = []
    masks = {}
    online_count = 0
    total_active = 0
    total_devs = 0
    hub_temp = None
    hub_hum = None
    gallery_aq = None
    conf_occ = None

    for r in ROOMS:
        rid = r["id"]
        st = room_states.get(rid, {})
        is_online = bool(st.get("online", False))
        if is_online:
            online_count += 1
        devs = alldev(r)
        on_count = sum(1 for d in devs if d.get("isOn", False))
        total_active += on_count
        total_devs += len(devs)
        mask = compute_room_mask(r)
        masks[r.get("name", rid)] = mask

        t_val = r.get("tempSensor", {}).get("value")
        h_val = r.get("humSensor", {}).get("value")
        aq_val = r.get("co2Sensor", {}).get("value")
        occ_val = r.get("occupancy", {}).get("occupied") if "occupancy" in r else None
        rname_u = r.get("name", "").upper()
        if "ENGINEERING" in rname_u:
            hub_temp, hub_hum = t_val, h_val
        if "GALLERY" in rname_u:
            gallery_aq = aq_val
        if "CONFERENCE" in rname_u and occ_val is not None:
            conf_occ = bool(occ_val)

        rooms_tel.append({
            "id": rid,
            "name": r.get("name"),
            "online": is_online,
            "mask": mask,
            "devices_on": on_count,
            "devices_total": len(devs),
            "temp_c": t_val,
            "hum_pct": h_val,
            "air_quality_ugm3": aq_val,
            "occupied": occ_val,
        })

    return {
        "telemetry": {
            "client_id": client_id,
            "ts": ts,
            "temperature_c": hub_temp if hub_temp is not None else (ROOMS[0].get("tempSensor", {}).get("value") if ROOMS else None),
            "humidity_pct": hub_hum if hub_hum is not None else (ROOMS[0].get("humSensor", {}).get("value") if ROOMS else None),
            "air_quality_ugm3": gallery_aq if gallery_aq is not None else (ROOMS[0].get("co2Sensor", {}).get("value") if ROOMS else None),
            "air_quality_unit": "µg/m³",
            "conference_occupied": conf_occ,
            "active_devices": total_active,
            "total_devices": total_devs,
            "rooms": rooms_tel,
        },
        "status": {
            "online": True,
            "client_id": client_id,
            "ts": ts,
            "rooms_online": online_count,
            "rooms_total": len(ROOMS),
            "active_devices": total_active,
            "masks": masks,
        },
    }

def _handle_mqtt_command(payload: dict):
    """Execute remote MQTT commands for scenes, rooms, relay channels, masks, or devices."""
    cmd_type = str(payload.get("command") or payload.get("cmd") or "").strip().lower()
    if cmd_type in ("sync", "status", "ping"):
        return {"ok": True, "action": "sync"}

    if "scene" in payload and payload["scene"]:
        scene(str(payload["scene"]))
        return {"ok": True, "scene": payload["scene"]}

    target_room = find(str(payload["room"])) if payload.get("room") else (ROOMS[0] if ROOMS else None)
    if target_room is None:
        return {"ok": False, "error": "no rooms configured"}

    rid = target_room["id"]
    if "mask" in payload:
        m = str(payload["mask"]).strip()
        if len(m) == 6 and all(c in "01" for c in m):
            for d in alldev(target_room):
                ch = d.get("relayChannel")
                if ch and 1 <= ch <= 6:
                    d["isOn"] = (m[ch - 1] == "1")
            _fire_udp_instantly(target_room)
            save_state()
            sync_relays(target_rid=rid)
            return {"ok": True, "room": target_room["name"], "mask": m}
        return {"ok": False, "error": "invalid 6-bit mask"}

    if "ch" in payload or "channel" in payload:
        ch = int(payload.get("ch") or payload.get("channel"))
        if not (1 <= ch <= 6):
            return {"ok": False, "error": f"invalid channel {ch}"}
        if "state" in payload:
            desired = bool(int(payload["state"])) if str(payload["state"]).isdigit() else str(payload["state"]).lower() in ("1", "true", "on")
            for d in alldev(target_room):
                if d.get("relayChannel") == ch:
                    d["isOn"] = desired
            _fire_udp_instantly(target_room)
            save_state()
            sync_relays(target_rid=rid)
            return {"ok": True, "room": target_room["name"], "ch": ch, "state": desired}
        return toggle_room_channel(rid, ch)

    if "device" in payload and payload["device"]:
        d = finddev(target_room, str(payload["device"]))
        if "state" in payload:
            desired = bool(int(payload["state"])) if str(payload["state"]).isdigit() else str(payload["state"]).lower() in ("1", "true", "on")
            ch = d.get("relayChannel")
            for item in alldev(target_room):
                if (ch and item.get("relayChannel") == ch) or item["id"] == d["id"]:
                    item["isOn"] = desired
            _fire_udp_instantly(target_room)
            save_state()
            sync_relays(target_rid=rid)
            return {"ok": True, "room": target_room["name"], "device": d["name"], "state": desired}
        toggle(rid, d["id"])
        return {"ok": True, "room": target_room["name"], "device": d["name"], "state": d["isOn"]}

    action = str(payload.get("action") or "").strip().lower()
    if action in ("on", "off"):
        desired = (action == "on")
        for d in alldev(target_room):
            d["isOn"] = desired
        _fire_udp_instantly(target_room)
        save_state()
        sync_relays(target_rid=rid)
        return {"ok": True, "room": target_room["name"], "state": desired}
    if action == "toggle" or payload.get("room"):
        toggle_room(rid)
        return {"ok": True, "room": target_room["name"], "toggled": True}

    return {"ok": False, "error": "unrecognized command"}

mqtt_bridge = load_mqtt_bridges(_build_mqtt_snapshot, _handle_mqtt_command)

@app.get("/api/mqtt/status")
def mqtt_status():
    return mqtt_bridge.info()

@app.on_event("startup")
def _boot(): 
    sync_relays()
    mqtt_bridge.start()

@app.on_event("shutdown")
def _shutdown():
    mqtt_bridge.stop()

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST.exists(): 
    if (DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")
    if (DIST / "3d").exists():
        app.mount("/3d", StaticFiles(directory=DIST / "3d"), name="3d")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_spa(full_path: str):
        target = DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target, media_type="video/mp4" if target.suffix == ".mp4" else None)
        resp = FileResponse(DIST / "index.html")
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp
