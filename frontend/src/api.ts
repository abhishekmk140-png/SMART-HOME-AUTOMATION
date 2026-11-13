// Mirrors lib/services/api_service.dart (same endpoints, same JSON, same URL cleaning).
export type Dev = {
  id: string;
  name: string;
  type: 'light' | 'fan' | 'switchDevice' | 'ac';
  isOn: boolean;
  value: number;
  relayChannel?: number | null;
}
export type Sensor = { id: string; name: string; value: number; unit: string }
export type Room = { id: string; name: string; category: string; esp32_url?: string; has_am2315c?: boolean; has_aqi?: boolean; has_pir?: boolean; occupancy?: { occupied: boolean; pir?: boolean; pir1?: boolean; pir2?: boolean; status: string; seconds_ago?: number; warmup?: boolean }; lights: Dev[]; fans: Dev[]; acs?: Dev[]; switches: Dev[]; tempSensor: Sensor; humSensor: Sensor; co2Sensor: Sensor }
export type Rule = { id: string; title: string; description: string; triggerType: string; thresholdValue: number; actionDescription: string; isEnabled: boolean }

function sanitizeUrl(u: string): string {
  let c = (u || '').trim()
  if (!c || c === '/api' || c === 'This Server') return '/api'
  if (c.startsWith('/')) {
    if (!c.endsWith('/api')) c = c.replace(/\/+$/, '') + '/api'
    return c
  }
  if (!c.startsWith('http://') && !c.startsWith('https://')) {
    c = 'http://' + c
  }
  try {
    const parsed = new URL(c)
    if (!parsed.port && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || /^192\.168\./.test(parsed.hostname))) {
      parsed.port = '8000'
    }
    let p = parsed.pathname.replace(/\/+$/, '')
    if (!p.endsWith('/api')) p = (p ? p : '') + '/api'
    return `${parsed.protocol}//${parsed.host}${p}`
  } catch {
    return '/api'
  }
}

let rawStored = localStorage.getItem('baseUrl') || '/api'
let base = sanitizeUrl(rawStored)
if (base !== rawStored) {
  localStorage.setItem('baseUrl', base)
}

export const baseUrl = () => base
export function setBaseUrl(u: string) {
  base = sanitizeUrl(u)
  localStorage.setItem('baseUrl', base)
}

const j = { 'Content-Type': 'application/json' }
const req = (m: string, p: string, b?: any) => fetch(base + p, { method: m, headers: b ? j : undefined, body: b ? JSON.stringify(b) : undefined })

export const api = {
  health: async () => { try { return (await fetch(base + '/health', { signal: AbortSignal.timeout(3000) })).ok } catch { return false } },
  rooms: async (): Promise<Room[]> => (await req('GET', '/rooms')).json(),
  rules: async (): Promise<Rule[]> => (await req('GET', '/automations')).json(),
  createRoom: (name: string, category: string) => req('POST', '/rooms', { name, category }),
  editRoom: (id: string, name: string, category: string) => req('PUT', `/rooms/${id}`, { name, category }),
  deleteRoom: (id: string) => req('DELETE', `/rooms/${id}`),
  toggleRoom: (id: string) => req('POST', `/rooms/${id}/toggle`),
  addDevice: (r: string, name: string, type: string, relayChannel?: number | null) => req('POST', `/rooms/${r}/devices`, { name, type, relayChannel }),
  editDevice: (r: string, d: string, name: string, relayChannel?: number | null) => req('PUT', `/rooms/${r}/devices/${d}`, { name, relayChannel }),
  deleteDevice: (r: string, d: string) => req('DELETE', `/rooms/${r}/devices/${d}`),
  toggle: (r: string, d: string) => req('PUT', `/rooms/${r}/devices/${d}/toggle`),
  value: (r: string, d: string, value: number) => req('PUT', `/rooms/${r}/devices/${d}/value`, { value }),
  all: (r: string, isOn: boolean) => req('PUT', `/rooms/${r}/all-devices`, { isOn }),
  sensor: (r: string, t: string, value: number) => req('PUT', `/rooms/${r}/sensors/${t}`, { value }),
  createRule: (b: any) => req('POST', '/automations', b),
  toggleRule: (id: string) => req('PUT', `/automations/${id}/toggle`),
  scene: (n: string) => req('POST', `/scenes/${n}`),
  relays: async () => (await req('GET', '/relays')).json(),
  setRelayUrl: async (url: string) => (await req('POST', '/relays/url', { url })).json(),
  setRelayMode: async (mode: string) => (await req('POST', '/relays/mode', { mode })).json(),
  toggleChannel: async (ch: number) => (await req('POST', `/relays/${ch}/toggle`)).json(),
  toggleRoomChannel: async (rid: string, ch: number) => (await req('POST', `/rooms/${rid}/relays/${ch}/toggle`)).json(),
  setRoomEsp32Url: async (rid: string, url: string) => (await req('POST', `/rooms/${rid}/esp32`, { url })).json(),
  invertRelays: async () => (await req('POST', '/relays/invert')).json(),
  visionStatus: async () => (await req('GET', '/vision/status')).json(),
  visionText: async (text: string, active_room_id?: string | null, ui_state?: Record<string, any>, history?: Array<{ user: string; vision: string }>): Promise<{ ignore?: boolean; end_conversation?: boolean; heard: string; reply: string; executed: string[]; ui_actions: any[]; rooms: Room[] }> => {
    const res = await req('POST', '/vision/text', { text, active_room_id, ui_state, history })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  visionAudio: async (audio_base64: string, mime_type: string, active_room_id?: string | null, ui_state?: Record<string, any>, wake_word_required = false, history?: Array<{ user: string; vision: string }>): Promise<{ ignore?: boolean; end_conversation?: boolean; heard: string; reply: string; executed: string[]; ui_actions: any[]; rooms: Room[] }> => {
    const res = await req('POST', '/vision/audio', { audio_base64, mime_type, active_room_id, ui_state, wake_word_required, history })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
}
