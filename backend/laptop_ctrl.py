"""Safe Windows Laptop Control Module for VISION AI Voice Assistant."""
import ctypes
import datetime
import os
import shutil
import socket
import subprocess
import time
import urllib.parse
import webbrowser
from pathlib import Path
from typing import Any, Dict, List, Optional

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# Virtual Key codes for Windows media & system control
VK_LWIN = 0x5B
VK_MENU = 0x12   # Alt
VK_TAB = 0x09
VK_F4 = 0x73
VK_D = 0x44
VK_M = 0x4D
VK_VOLUME_MUTE = 0xAD
VK_VOLUME_DOWN = 0xAE
VK_VOLUME_UP = 0xAF
VK_MEDIA_NEXT = 0xB0
VK_MEDIA_PREV = 0xB1
VK_MEDIA_STOP = 0xB2
VK_MEDIA_PLAY_PAUSE = 0xB3
KEYEVENTF_KEYUP = 0x0002

APP_ALIASES: Dict[str, str] = {
    "notepad": "notepad.exe",
    "calculator": "calc.exe",
    "calc": "calc.exe",
    "paint": "mspaint.exe",
    "mspaint": "mspaint.exe",
    "chrome": "chrome.exe",
    "google chrome": "chrome.exe",
    "edge": "msedge.exe",
    "microsoft edge": "msedge.exe",
    "explorer": "explorer.exe",
    "file explorer": "explorer.exe",
    "files": "explorer.exe",
    "cmd": "cmd.exe",
    "command prompt": "cmd.exe",
    "powershell": "powershell.exe",
    "terminal": "wt.exe",
    "windows terminal": "wt.exe",
    "task manager": "taskmgr.exe",
    "taskmgr": "taskmgr.exe",
    "settings": "ms-settings:",
    "windows settings": "ms-settings:",
    "wifi settings": "ms-settings:network-wifi",
    "bluetooth settings": "ms-settings:bluetooth",
    "display settings": "ms-settings:display",
    "sound settings": "ms-settings:sound",
    "camera": "microsoft.windows.camera:",
    "clock": "ms-clock:",
    "store": "ms-windows-store:",
    "snipping tool": "snippingtool.exe",
    "vscode": "code",
    "vs code": "code",
    "visual studio code": "code",
    "arduino": "Arduino IDE.exe",
    "arduino ide": "Arduino IDE.exe",
    "word": "winword.exe",
    "excel": "excel.exe",
    "powerpoint": "powerpnt.exe",
    "spotify": "spotify:",
    "whatsapp": "whatsapp:",
    "vlc": "vlc.exe",
    "control panel": "control.exe",
}

CLOSABLE_APPS: Dict[str, str] = {
    "notepad": "notepad.exe",
    "calculator": "CalculatorApp.exe",
    "calc": "CalculatorApp.exe",
    "paint": "mspaint.exe",
    "mspaint": "mspaint.exe",
    "chrome": "chrome.exe",
    "google chrome": "chrome.exe",
    "edge": "msedge.exe",
    "microsoft edge": "msedge.exe",
    "spotify": "Spotify.exe",
    "vlc": "vlc.exe",
    "word": "WINWORD.EXE",
    "excel": "EXCEL.EXE",
    "powerpoint": "POWERPNT.EXE",
    "task manager": "Taskmgr.exe",
    "cmd": "cmd.exe",
    "command prompt": "cmd.exe",
    "whatsapp": "WhatsApp.exe",
}

SITE_SHORTCUTS: Dict[str, str] = {
    "youtube": "https://www.youtube.com",
    "google": "https://www.google.com",
    "gmail": "https://mail.google.com",
    "mail": "https://mail.google.com",
    "github": "https://github.com",
    "chatgpt": "https://chatgpt.com",
    "gemini": "https://gemini.google.com",
    "maps": "https://maps.google.com",
    "google maps": "https://maps.google.com",
    "netflix": "https://www.netflix.com",
    "spotify": "https://open.spotify.com",
    "whatsapp": "https://web.whatsapp.com",
    "instagram": "https://www.instagram.com",
    "linkedin": "https://www.linkedin.com",
}


class _SYSTEM_POWER_STATUS(ctypes.Structure):
    _fields_ = [
        ("ACLineStatus", ctypes.c_byte),
        ("BatteryFlag", ctypes.c_byte),
        ("BatteryLifePercent", ctypes.c_byte),
        ("SystemStatusFlag", ctypes.c_byte),
        ("BatteryLifeTime", ctypes.c_ulong),
        ("BatteryFullLifeTime", ctypes.c_ulong),
    ]


class _MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


def _tap_key(vk: int, count: int = 1):
    for _ in range(max(1, count)):
        user32.keybd_event(vk, 0, 0, 0)
        time.sleep(0.01)
        user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
        time.sleep(0.01)


def _combo_key(mod_vk: int, key_vk: int):
    user32.keybd_event(mod_vk, 0, 0, 0)
    time.sleep(0.02)
    user32.keybd_event(key_vk, 0, 0, 0)
    time.sleep(0.02)
    user32.keybd_event(key_vk, 0, KEYEVENTF_KEYUP, 0)
    time.sleep(0.02)
    user32.keybd_event(mod_vk, 0, KEYEVENTF_KEYUP, 0)


def _find_start_menu_shortcut(name: str) -> Optional[str]:
    clean = name.strip().lower()
    if not clean:
        return None
    roots = [
        Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Microsoft" / "Windows" / "Start Menu" / "Programs",
        Path.home() / "AppData" / "Roaming" / "Microsoft" / "Windows" / "Start Menu" / "Programs",
    ]
    for root in roots:
        if not root.exists():
            continue
        for lnk in root.rglob("*.lnk"):
            if clean in lnk.stem.lower():
                return str(lnk)
    return None


def get_laptop_info() -> Dict[str, Any]:
    """Return live laptop battery, RAM, disk, IP, and local time."""
    info: Dict[str, Any] = {
        "hostname": socket.gethostname(),
        "local_time": datetime.datetime.now().strftime("%I:%M %p, %A %b %d"),
    }
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        info["local_ip"] = s.getsockname()[0]
        s.close()
    except Exception:
        info["local_ip"] = "127.0.0.1"

    try:
        pwr = _SYSTEM_POWER_STATUS()
        if kernel32.GetSystemPowerStatus(ctypes.byref(pwr)):
            pct = int(pwr.BatteryLifePercent)
            info["battery_pct"] = pct if 0 <= pct <= 100 else None
            info["charging"] = bool(pwr.ACLineStatus == 1)
    except Exception:
        pass

    try:
        mem = _MEMORYSTATUSEX()
        mem.dwLength = ctypes.sizeof(_MEMORYSTATUSEX)
        if kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
            info["ram_used_pct"] = int(mem.dwMemoryLoad)
            info["ram_free_gb"] = round(mem.ullAvailPhys / (1024 ** 3), 1)
            info["ram_total_gb"] = round(mem.ullTotalPhys / (1024 ** 3), 1)
    except Exception:
        pass

    try:
        du = shutil.disk_usage("C:\\")
        info["disk_free_gb"] = round(du.free / (1024 ** 3), 1)
        info["disk_total_gb"] = round(du.total / (1024 ** 3), 1)
    except Exception:
        pass

    return info


def _set_brightness(level: int):
    lvl = max(5, min(100, int(level)))
    ps_cmd = f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, {lvl})"
    subprocess.Popen(
        ["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps_cmd],
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )


def _get_brightness() -> Optional[int]:
    try:
        out = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command", "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness"],
            timeout=2.5,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        return int(out.decode().strip())
    except Exception:
        return None


def _take_screenshot() -> str:
    shots_dir = Path.home() / "Pictures" / "Screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)
    fname = f"Vision_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    target = shots_dir / fname
    ps_script = (
        "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
        "$b = [System.Windows.Forms.SystemInformation]::VirtualScreen; "
        "$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; "
        "$g = [System.Drawing.Graphics]::FromImage($bmp); "
        "$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size); "
        f"$bmp.Save('{str(target)}', [System.Drawing.Imaging.ImageFormat]::Png); "
        "$g.Dispose(); $bmp.Dispose()"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps_script],
        timeout=8,
        check=True,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    return str(target)


def execute_laptop_action(act: Dict[str, Any]) -> Optional[str]:
    """Execute one typed Windows laptop action safely. Returns badge label or None."""
    atype = str(act.get("type", "")).strip().lower()

    if atype == "open_app":
        raw_name = str(act.get("app") or act.get("name") or "").strip()
        if not raw_name:
            return None
        key = raw_name.lower()
        target = APP_ALIASES.get(key)
        if not target:
            target = _find_start_menu_shortcut(key) or raw_name
        if target.startswith("ms-") or target.endswith(":"):
            os.startfile(target)
        else:
            try:
                os.startfile(target)
            except Exception:
                subprocess.Popen(
                    ["cmd", "/c", "start", "", target],
                    creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
                )
        return f"Opened {raw_name}"

    if atype == "close_app":
        raw_name = str(act.get("app") or act.get("name") or "").strip().lower()
        exe = CLOSABLE_APPS.get(raw_name)
        if not exe and raw_name.endswith(".exe") and raw_name not in ("python.exe", "python3.13.exe", "explorer.exe", "code.exe"):
            exe = raw_name
        if not exe:
            return None
        subprocess.Popen(
            ["taskkill", "/IM", exe, "/F"],
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        return f"Closed {raw_name}"

    if atype == "open_url":
        raw = str(act.get("url") or act.get("site") or "").strip()
        if not raw:
            return None
        url = SITE_SHORTCUTS.get(raw.lower(), raw)
        if not url.startswith("http://") and not url.startswith("https://"):
            if "." not in url:
                url = f"https://www.{url}.com"
            else:
                url = f"https://{url}"
        webbrowser.open(url)
        return f"Opened {raw}"

    if atype == "web_search":
        q = str(act.get("query") or "").strip()
        if not q:
            return None
        webbrowser.open(f"https://www.google.com/search?q={urllib.parse.quote_plus(q)}")
        return f"Searched: {q[:24]}"

    if atype == "youtube_search":
        q = str(act.get("query") or "").strip()
        if not q:
            webbrowser.open("https://www.youtube.com")
            return "Opened YouTube"
        webbrowser.open(f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(q)}")
        return f"YouTube: {q[:24]}"

    if atype == "volume":
        op = str(act.get("op") or "up").lower()
        if op == "mute" or op == "unmute":
            _tap_key(VK_VOLUME_MUTE, 1)
            return "Audio Muted/Toggled"
        if op == "up":
            steps = max(1, min(25, int(act.get("steps") or 5)))
            _tap_key(VK_VOLUME_UP, steps)
            return "Volume Up"
        if op == "down":
            steps = max(1, min(25, int(act.get("steps") or 5)))
            _tap_key(VK_VOLUME_DOWN, steps)
            return "Volume Down"
        if op == "set":
            pct = max(0, min(100, int(act.get("level") if act.get("level") is not None else 50)))
            _tap_key(VK_VOLUME_DOWN, 50)
            if pct > 0:
                _tap_key(VK_VOLUME_UP, max(1, round(pct / 2)))
            return f"Volume {pct}%"

    if atype == "media":
        op = str(act.get("op") or "play_pause").lower()
        if op in ("play", "pause", "play_pause"):
            _tap_key(VK_MEDIA_PLAY_PAUSE, 1)
            return "Media Play/Pause"
        if op in ("next", "skip"):
            _tap_key(VK_MEDIA_NEXT, 1)
            return "Next Track"
        if op in ("prev", "previous", "back"):
            _tap_key(VK_MEDIA_PREV, 1)
            return "Previous Track"
        if op == "stop":
            _tap_key(VK_MEDIA_STOP, 1)
            return "Media Stopped"

    if atype == "brightness":
        op = str(act.get("op") or "set").lower()
        if op == "set":
            lvl = max(5, min(100, int(act.get("level") if act.get("level") is not None else 70)))
            _set_brightness(lvl)
            return f"Brightness {lvl}%"
        cur = _get_brightness()
        base = cur if cur is not None else 60
        nxt = min(100, base + 20) if op == "up" else max(10, base - 20)
        _set_brightness(nxt)
        return f"Brightness {nxt}%"

    if atype == "screenshot":
        saved = _take_screenshot()
        return f"Screenshot Saved ({Path(saved).name})"

    if atype == "window_action":
        op = str(act.get("op") or "show_desktop").lower()
        if op == "show_desktop":
            _combo_key(VK_LWIN, VK_D)
            return "Show Desktop"
        if op == "minimize_all":
            _combo_key(VK_LWIN, VK_M)
            return "Minimized Windows"
        if op == "switch_window":
            _combo_key(VK_MENU, VK_TAB)
            return "Switched Window"
        if op == "close_window":
            _combo_key(VK_MENU, VK_F4)
            return "Closed Window"
        if op == "task_view":
            _combo_key(VK_LWIN, VK_TAB)
            return "Task View"

    if atype == "power_action":
        op = str(act.get("op") or "").lower()
        if op == "lock":
            subprocess.Popen(["rundll32.exe", "user32.dll,LockWorkStation"])
            return "Laptop Locked"
        if op == "sleep":
            subprocess.Popen(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
            return "Laptop Sleeping"

    if atype == "create_note":
        content = str(act.get("content") or act.get("text") or "").strip()
        title = str(act.get("title") or "").strip()
        if not content:
            return None
        notes_dir = Path.home() / "Desktop" / "Vision_Notes"
        notes_dir.mkdir(parents=True, exist_ok=True)
        safe_title = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
        fname = f"{safe_title or 'Note_' + datetime.datetime.now().strftime('%H%M%S')}.txt"
        path = notes_dir / fname
        path.write_text(content + "\n", encoding="utf-8")
        if act.get("open", True):
            os.startfile(str(path))
        return f"Saved Note: {fname}"

    if atype == "clipboard_copy":
        txt = str(act.get("text") or "").strip()
        if not txt:
            return None
        p = subprocess.Popen(["clip"], stdin=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0)
        p.communicate(input=txt.encode("utf-16le"))
        return "Copied to Clipboard"

    return None
