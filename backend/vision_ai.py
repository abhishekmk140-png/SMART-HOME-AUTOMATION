"""VISION AI Voice & Full-App Control Engine powered by Google Gemini."""
import os
import re
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
from dotenv import load_dotenv
import laptop_ctrl

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
FALLBACK_MODELS = [GEMINI_MODEL, "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.5-flash"]

_http_client = httpx.Client(timeout=25.0)


def _post_gemini(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Call Gemini generateContent using keep-alive pool with automatic fallback on timeout/5xx."""
    last_err: Optional[Exception] = None
    seen = set()
    for model in FALLBACK_MODELS:
        if not model or model in seen:
            continue
        seen.add(model)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            resp = _http_client.post(url, params={"key": GEMINI_API_KEY}, json=payload)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code in (429, 500, 502, 503, 504):
                last_err = RuntimeError(f"Gemini ({model}) HTTP {resp.status_code}: {resp.text[:200]}")
                continue
            raise RuntimeError(f"Gemini API error ({resp.status_code}): {resp.text[:300]}")
        except httpx.TimeoutException as exc:
            print(f"[VISION] {model} timed out, trying fallback...")
            last_err = exc
            continue
    raise RuntimeError(str(last_err or "Vision request failed"))

SYSTEM_PROMPT = """You are VISION, an intelligent, fast, hands-free AI Voice Operating System for BOTH the Smart Home Web App AND the user's Windows Laptop!
You can control ALL hardware devices, operate ALL web app views/settings/rules, AND perform real tasks on the user's Windows laptop (opening apps/websites, searching Google/YouTube, controlling volume/brightness/media, taking screenshots, managing windows, creating notes, locking/sleeping laptop, and reporting laptop battery/RAM/disk/time).

Rooms and hardware sensors in this facility:
- ENGINEERING HUB: ASAIR AM2315C Temperature & Humidity sensor, lights, fans, 20A power switch.
- THE GALLERY: Air Quality (µg/m³) sensor, lights, fans.
- CONFERENCE: Single PIR Motion Sensor (Occupied / Vacant occupancy status), lights, fan.

Web App Tabs:
- 0 = Dashboard (home / rooms overview / scenes)
- 1 = Analytics (telemetry / power consumption / charts / node matrix)
- 2 = Automations (smart rules / routines)
- 3 = Settings (server endpoint / security / biometric / mobile QR / cache)

Available scenes: "All On", "All Off", "Night Mode", "Eco Mode", "Conference"

Respond ONLY with valid JSON matching this schema:
{
  "ignore": false,
  "end_conversation": false,
  "heard": "clean transcript of user command",
  "reply": "Short natural spoken response from Vision (1-2 crisp sentences)",
  "actions": [],
  "ui_actions": [],
  "laptop_actions": []
}

Supported BACKEND "actions" (hardware, rooms, devices, rules, scenes):
1. Single device ON/OFF:
   {"type": "set_device", "room_id": "...", "device_id": "...", "state": true}
2. Device numeric value (light brightness 0-100, fan speed 1-5, AC temp 16-30):
   {"type": "set_device_value", "room_id": "...", "device_id": "...", "value": 4}
3. Group of devices ON/OFF ("light", "fan", "ac", "switchDevice", or "all"; room_id can be a specific room id OR "all" for every room):
   {"type": "set_device_group", "room_id": "all", "device_type": "light", "state": false}
4. Entire room ON/OFF:
   {"type": "set_room", "room_id": "...", "state": true}
5. Activate scene:
   {"type": "scene", "scene": "All Off"}
6. Create room:
   {"type": "create_room", "name": "Studio", "category": "Office"}
7. Delete room:
   {"type": "delete_room", "room_id": "..."}
8. Add device to room (device_type: "light"|"fan"|"ac"|"switchDevice"):
   {"type": "add_device", "room_id": "...", "name": "Desk Lamp", "device_type": "light"}
9. Delete device from room:
   {"type": "delete_device", "room_id": "...", "device_id": "..."}
10. Toggle/set automation rule ON/OFF:
    {"type": "toggle_rule", "rule_id": "...", "state": true}
11. Create automation rule (trigger_type: "temperature"|"co2"|"humidity"|"schedule"):
    {"type": "create_rule", "title": "Cool Down", "trigger_type": "temperature", "threshold_value": 28, "action_description": "Turn on fans"}
12. Sync ESP32 hardware boards:
    {"type": "sync_relays"}

Supported FRONTEND "ui_actions" (controlling the web app interface itself):
1. Switch main tab (0=Dashboard, 1=Analytics, 2=Automations, 3=Settings):
   {"type": "navigate", "tab": 1}
2. Open a room's detail view:
   {"type": "open_room", "room_id": "..."}
3. Go back from room detail view to Dashboard:
   {"type": "go_back"}
4. Toggle 3D view banners:
   {"type": "set_3d", "state": true}
5. Toggle Lively 3D Smart Home mesh background:
   {"type": "set_lively_bg", "state": true}
6. Toggle Fullscreen mode:
   {"type": "set_fullscreen", "state": true}
7. Mute/unmute joyful UI click sounds:
   {"type": "set_sound", "state": false}
8. Open or close Mobile Access QR modal:
   {"type": "set_mobile_modal", "state": true}
9. Lock screen with Biometric lock:
   {"type": "lock_app"}
10. Refresh UI data immediately:
   {"type": "refresh"}
11. Pause/sleep hands-free voice listening:
   {"type": "sleep_voice"}
12. Switch hands-free listening mode ("wake" = requires Hey Vision, "direct" = every phrase executes without wake word):
    {"type": "set_voice_mode", "mode": "direct"}

Supported LAPTOP "laptop_actions" (controlling the user's Windows laptop):
1. Open an application ("notepad", "calculator", "chrome", "edge", "explorer", "vscode", "arduino", "cmd", "powershell", "terminal", "task manager", "settings", "wifi settings", "bluetooth settings", "paint", "spotify", "vlc", "camera", "word", "excel", "powerpoint", "whatsapp", etc.):
   {"type": "open_app", "app": "notepad"}
2. Close an application ("notepad", "calculator", "chrome", "edge", "spotify", "vlc", "paint", "word", "excel", "powerpoint", "cmd", "whatsapp"):
   {"type": "close_app", "app": "notepad"}
3. Open a website ("youtube", "google", "gmail", "github", "chatgpt", "maps", "netflix", "whatsapp", or full URL):
   {"type": "open_url", "site": "youtube"}
4. Google web search:
   {"type": "web_search", "query": "ESP32 S3 pinout"}
5. Search / play on YouTube:
   {"type": "youtube_search", "query": "lofi beats"}
6. Control laptop speaker volume ("up", "down", "mute", "unmute", or "set" with level 0-100):
   {"type": "volume", "op": "set", "level": 60}
7. Media playback ("play_pause", "next", "prev", "stop"):
   {"type": "media", "op": "play_pause"}
8. Screen brightness ("up", "down", or "set" with level 5-100):
   {"type": "brightness", "op": "set", "level": 80}
9. Take a screenshot (saves to Pictures/Screenshots):
   {"type": "screenshot"}
10. Window management ("show_desktop", "minimize_all", "switch_window", "close_window", "task_view"):
    {"type": "window_action", "op": "show_desktop"}
11. Laptop power ("lock" or "sleep"):
    {"type": "power_action", "op": "lock"}
12. Create a text note on Desktop and open it:
    {"type": "create_note", "title": "Meeting Notes", "content": "...", "open": true}
13. Copy text to clipboard:
    {"type": "clipboard_copy", "text": "..."}

Rules:
- You can combine smart home "actions", "ui_actions", and "laptop_actions" together in one command!
- Distinguish carefully between Web App settings ("Open Settings" -> ui_actions navigate tab 3) vs Windows laptop settings ("Open Windows settings" / "Open Wi-Fi settings" -> laptop_actions open_app).
- Distinguish between locking the web app ("Lock the app" -> ui_actions lock_app) vs locking the Windows PC ("Lock my laptop" -> laptop_actions power_action lock).
- Use ONLY exact "room_id", "device_id", and "rule_id" values from LIVE_HOME_STATE.
- For sensor, laptop battery/RAM/disk/IP/time, or general questions, answer directly in "reply" using LIVE_HOME_STATE and LAPTOP_STATE!
- Use RECENT_CONVERSATION (if provided) to resolve follow-ups like "The Gallery lights", "turn it off", "now Conference room", etc.
- Set "end_conversation": true ONLY if the user explicitly ends the session (e.g. "bye", "stop listening", "that's all", "done", "go to sleep", "thank you bye"); otherwise keep "end_conversation": false.
- If user just says "go home" / "dashboard", navigate to tab 0 and go_back if inside a room.
- If user says "Vision" alone with no command, set ignore: false, actions: [], ui_actions: [], laptop_actions: [], reply: "Yes, I'm listening."
- CRITICAL ANTI-HALLUCINATION RULE: NEVER guess, invent, or hallucinate words if the audio is silent, quiet, static, or faint ambient noise. Only transcribe words clearly spoken by a human voice. If no clear human speech is audible, you MUST return {"ignore": true, "end_conversation": false, "heard": "", "reply": "", "actions": [], "ui_actions": [], "laptop_actions": []}.
"""


def build_home_context(
    rooms: List[Dict[str, Any]],
    room_states: Dict[str, Dict[str, Any]],
    rules: Optional[List[Dict[str, Any]]] = None,
    ui_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build a compact snapshot of rooms, devices, sensors, rules, UI state, and laptop telemetry."""
    snapshot = []
    for r in rooms:
        rid = r.get("id", "")
        st = room_states.get(rid, {})
        devices = []
        for k in ("lights", "fans", "acs", "switches"):
            for d in r.get(k, []):
                devices.append({
                    "id": d.get("id"),
                    "name": d.get("name"),
                    "type": d.get("type"),
                    "isOn": bool(d.get("isOn", False)),
                    "value": d.get("value"),
                    "relayChannel": d.get("relayChannel"),
                })

        sensors: Dict[str, Any] = {}
        rname_u = r.get("name", "").upper()
        if r.get("has_am2315c") or "ENGINEERING" in rname_u:
            sensors["temperature_c"] = r.get("tempSensor", {}).get("value")
            sensors["humidity_pct"] = r.get("humSensor", {}).get("value")
        if r.get("has_aqi") or "GALLERY" in rname_u:
            sensors["air_quality_ugm3"] = r.get("co2Sensor", {}).get("value")
        if r.get("has_pir") or "CONFERENCE" in rname_u:
            occ = r.get("occupancy", {})
            sensors["occupancy"] = occ.get("status", "Vacant")
            sensors["motion_detected"] = bool(occ.get("pir", occ.get("occupied", False)))

        snapshot.append({
            "room_id": rid,
            "name": r.get("name"),
            "category": r.get("category"),
            "online": bool(st.get("online", False)),
            "devices": devices,
            "sensors": sensors,
        })

    return {
        "UI_STATE": ui_state or {},
        "LAPTOP_STATE": laptop_ctrl.get_laptop_info(),
        "LIVE_HOME_STATE": snapshot,
        "RULES": [
            {
                "rule_id": rl.get("id"),
                "title": rl.get("title"),
                "description": rl.get("description"),
                "isEnabled": bool(rl.get("isEnabled", False)),
            }
            for rl in (rules or [])
        ],
    }


def _parse_gemini_json(raw_text: str) -> Dict[str, Any]:
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return {
                "ignore": bool(data.get("ignore", False)),
                "end_conversation": bool(data.get("end_conversation", False)),
                "heard": str(data.get("heard", "")).strip(),
                "reply": str(data.get("reply", "Done.")).strip(),
                "actions": data.get("actions") if isinstance(data.get("actions"), list) else [],
                "ui_actions": data.get("ui_actions") if isinstance(data.get("ui_actions"), list) else [],
                "laptop_actions": data.get("laptop_actions") if isinstance(data.get("laptop_actions"), list) else [],
            }
    except Exception:
        pass
    return {
        "ignore": False,
        "end_conversation": False,
        "heard": "",
        "reply": cleaned or "Sorry, I couldn't understand that command.",
        "actions": [],
        "ui_actions": [],
        "laptop_actions": [],
    }


WAKE_RE = re.compile(r"\b(?:vision|vission|bishan|mission|hey vision|hi vision)\b", re.IGNORECASE)


def ask_vision(
    context: Dict[str, Any],
    text: Optional[str] = None,
    audio_base64: Optional[str] = None,
    mime_type: str = "audio/webm",
    wake_word_required: bool = False,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Single-call fast text/audio understanding + action planner via Gemini."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    ctx_payload = dict(context)
    if history:
        ctx_payload["RECENT_CONVERSATION"] = history[-4:]
    if wake_word_required:
        ctx_payload["WAKE_WORD_REQUIRED"] = True

    is_audio = False
    if text and text.strip():
        parts: List[Dict[str, Any]] = [
            {"text": f"LIVE_CONTEXT:\n{json.dumps(ctx_payload, ensure_ascii=False)}"},
            {"text": f"USER_VOICE_OR_TEXT_COMMAND: {text.strip()}"},
        ]
    elif audio_base64:
        clean_b64 = audio_base64.split(",")[-1].strip()
        if len(clean_b64) < 2500:
            return {"ignore": True, "end_conversation": False, "heard": "", "reply": "", "actions": [], "ui_actions": [], "laptop_actions": []}
        is_audio = True
        clean_mime = (mime_type or "audio/webm").split(";")[0].strip()
        wake_note = " If WAKE_WORD_REQUIRED is true and 'Vision' was NOT clearly spoken, set ignore=true." if wake_word_required else ""
        parts = [
            {
                "text": (
                    "STEP 1 — AUDIO CHECK: Listen strictly to the attached audio clip before looking at LIVE_CONTEXT. "
                    "If the clip is silent, static, breath, clicks, or ambient noise with NO clear spoken human words, "
                    "STOP and return ignore=true, heard='', reply='', actions=[], ui_actions=[], laptop_actions=[]. "
                    "NEVER invent or guess a command from LIVE_CONTEXT or Rules."
                    + wake_note
                )
            },
            {"inlineData": {"mimeType": clean_mime, "data": clean_b64}},
            {"text": f"LIVE_CONTEXT (use ONLY if clear human speech was heard above):\n{json.dumps(ctx_payload, ensure_ascii=False)}"},
        ]
    else:
        return {"ignore": True, "end_conversation": False, "heard": "", "reply": "", "actions": [], "ui_actions": [], "laptop_actions": []}

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.0 if is_audio else 0.15,
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }

    body = _post_gemini(payload)

    candidates = body.get("candidates") or []
    if not candidates:
        return {"ignore": False, "end_conversation": False, "heard": text or "", "reply": "Vision received an empty response.", "actions": [], "ui_actions": [], "laptop_actions": []}

    out_parts = candidates[0].get("content", {}).get("parts") or []
    raw_text = "".join(p.get("text", "") for p in out_parts if isinstance(p, dict))
    parsed = _parse_gemini_json(raw_text)
    if is_audio:
        if not parsed.get("heard"):
            parsed["ignore"] = True
        elif wake_word_required and not WAKE_RE.search(parsed["heard"]):
            parsed["ignore"] = True
    if text and not parsed["heard"]:
        parsed["heard"] = text.strip()
    return parsed
