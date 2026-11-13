import json
import os
import threading
import time
from typing import Any, Callable, Dict, List, Optional

import paho.mqtt.client as mqtt


class SmartHomeMqttBridge:
    """Persistent MQTT bridge for publishing facility telemetry/status and executing remote commands."""

    def __init__(
        self,
        get_snapshot: Callable[[str], Dict[str, Any]],
        on_command: Callable[[Dict[str, Any]], Dict[str, Any]],
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        cfg = config or {}
        self._get_snapshot = get_snapshot
        self._on_command = on_command
        self.host = str(cfg.get("host") or os.getenv("MQTT_HOST", "mqtt.aiota.tech")).strip()
        self.port = int(cfg.get("port") or os.getenv("MQTT_PORT", "1883"))
        self.client_id = str(cfg.get("client_id") or os.getenv("MQTT_CLIENT_ID", "dev_3ed2c49053d1")).strip()
        self.username = str(cfg.get("username") or os.getenv("MQTT_USERNAME", self.client_id)).strip()
        self.password = str(cfg.get("password") or os.getenv("MQTT_PASSWORD", "")).strip()
        self.telemetry_topic = str(
            cfg.get("telemetry_topic") or os.getenv("MQTT_TELEMETRY_TOPIC", f"devices/{self.client_id}/telemetry")
        ).strip()
        self.status_topic = str(
            cfg.get("status_topic") or os.getenv("MQTT_STATUS_TOPIC", f"devices/{self.client_id}/status")
        ).strip()
        self.command_topic = str(
            cfg.get("command_topic") or os.getenv("MQTT_COMMAND_TOPIC", f"devices/{self.client_id}/cmd")
        ).strip()

        self.connected = False
        self.last_error: Optional[str] = None
        self.last_publish_ts: Optional[float] = None
        self.last_command: Optional[Dict[str, Any]] = None
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._client: Optional[mqtt.Client] = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if not self.host or self._thread is not None:
            return
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self.client_id)
        if self.username:
            client.username_pw_set(self.username, self.password)
        client.will_set(
            self.status_topic,
            payload=json.dumps({"online": False, "client_id": self.client_id}),
            qos=1,
            retain=True,
        )
        client.on_connect = self._handle_connect
        client.on_disconnect = self._handle_disconnect
        client.on_message = self._handle_message
        client.reconnect_delay_set(min_delay=2, max_delay=30)
        self._client = client

        try:
            client.connect_async(self.host, self.port, keepalive=60)
            client.loop_start()
        except Exception as exc:
            self.last_error = str(exc)
            print(f"[MQTT:{self.client_id}] Connect init error: {exc}")

        self._thread = threading.Thread(target=self._publish_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._client is not None:
            try:
                if self.connected:
                    self._client.publish(
                        self.status_topic,
                        json.dumps({"online": False, "client_id": self.client_id, "ts": int(time.time())}),
                        qos=1,
                        retain=True,
                    )
                self._client.loop_stop()
                self._client.disconnect()
            except Exception:
                pass

    def publish_now(self) -> None:
        self._wake_event.set()

    def info(self) -> Dict[str, Any]:
        return {
            "host": self.host,
            "port": self.port,
            "client_id": self.client_id,
            "connected": self.connected,
            "telemetry_topic": self.telemetry_topic,
            "status_topic": self.status_topic,
            "command_topic": self.command_topic,
            "last_publish_ts": self.last_publish_ts,
            "last_command": self.last_command,
            "last_error": self.last_error,
        }

    def _handle_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any, _props: Any = None) -> None:
        if reason_code == 0 or str(reason_code) == "Success":
            self.connected = True
            self.last_error = None
            client.subscribe(self.command_topic, qos=1)
            print(f"[MQTT:{self.client_id}] Connected to {self.host}:{self.port}; subscribed {self.command_topic}")
            self._publish_snapshot()
        else:
            self.connected = False
            self.last_error = f"Connect refused: {reason_code}"
            print(f"[MQTT:{self.client_id}] Connect failed: {reason_code}")

    def _handle_disconnect(self, _client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any = None, _props: Any = None) -> None:
        self.connected = False
        if reason_code not in (0, None) and str(reason_code) != "Normal disconnection":
            self.last_error = f"Disconnected: {reason_code}"
        print(f"[MQTT:{self.client_id}] Disconnected ({reason_code})")

    def _handle_message(self, _client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
        raw = msg.payload.decode("utf-8", errors="replace").strip()
        if not raw:
            return
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                payload = {"scene": str(payload)}
        except Exception:
            payload = {"scene": raw}
        try:
            res = self._on_command(payload)
            self.last_command = {"payload": payload, "result": res, "ts": int(time.time())}
            print(f"[MQTT:{self.client_id} CMD] {payload} -> {res}")
            self.publish_now()
        except Exception as exc:
            self.last_error = str(exc)
            print(f"[MQTT:{self.client_id} CMD ERROR] {payload}: {exc}")

    def _publish_snapshot(self) -> None:
        if self._client is None or not self.connected:
            return
        try:
            snap = self._get_snapshot(self.client_id)
            telemetry = snap.get("telemetry", {})
            status = snap.get("status", {})
            self._client.publish(self.telemetry_topic, json.dumps(telemetry), qos=0, retain=False)
            self._client.publish(self.status_topic, json.dumps(status), qos=1, retain=True)
            self.last_publish_ts = time.time()
        except Exception as exc:
            self.last_error = str(exc)
            print(f"[MQTT:{self.client_id} PUBLISH ERROR] {exc}")

    def _publish_loop(self) -> None:
        while not self._stop_event.is_set():
            self._publish_snapshot()
            self._wake_event.wait(timeout=5.0)
            self._wake_event.clear()


class MultiMqttManager:
    """Manages one or more SmartHomeMqttBridge instances simultaneously."""

    def __init__(self, bridges: List[SmartHomeMqttBridge]) -> None:
        self.bridges = bridges

    def start(self) -> None:
        for b in self.bridges:
            b.start()

    def stop(self) -> None:
        for b in self.bridges:
            b.stop()

    def publish_now(self) -> None:
        for b in self.bridges:
            b.publish_now()

    def info(self) -> Dict[str, Any]:
        devices = [b.info() for b in self.bridges]
        return {
            "connected_count": sum(1 for d in devices if d.get("connected")),
            "total": len(devices),
            "devices": devices,
        }


def load_mqtt_bridges(
    get_snapshot: Callable[[str], Dict[str, Any]],
    on_command: Callable[[Dict[str, Any]], Dict[str, Any]],
) -> MultiMqttManager:
    """Load primary MQTT_* config and any extra devices from MQTT_EXTRA_DEVICES_JSON."""
    bridges: List[SmartHomeMqttBridge] = [SmartHomeMqttBridge(get_snapshot, on_command)]
    extra_raw = os.getenv("MQTT_EXTRA_DEVICES_JSON", "").strip()
    if extra_raw:
        try:
            extra_list = json.loads(extra_raw)
            if isinstance(extra_list, list):
                for item in extra_list:
                    if isinstance(item, dict) and item.get("client_id"):
                        bridges.append(SmartHomeMqttBridge(get_snapshot, on_command, config=item))
        except Exception as exc:
            print(f"[MQTT] Failed to parse MQTT_EXTRA_DEVICES_JSON: {exc}")
    return MultiMqttManager(bridges)
