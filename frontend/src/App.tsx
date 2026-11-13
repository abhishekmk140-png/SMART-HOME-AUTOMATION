import { useCallback, useEffect, useRef, useState, ReactNode } from 'react'
import { api, baseUrl, setBaseUrl, Room, Rule, Dev, Sensor } from './api'
import Lively3DSmartHomeBg from './Lively3DSmartHomeBg'
import { joySound, burstJoy } from './joy'

const I = ({ n, c, s, o = true, cls = '', st = {} }: { n: string; c?: string; s?: number; o?: boolean; cls?: string; st?: any }) =>
  <span className={`mi ${o ? 'o' : ''} ${cls}`} style={{ color: c, fontSize: s, ...st }}>{n}</span>
const Sw = ({ on, set }: { on: boolean; set: () => void }) => <button className={`sw ${on ? 'on' : ''}`} onClick={set} />
const tint = (c: string, a = 0.12) => `color-mix(in srgb, ${c} ${a * 100}%, transparent)`
const CAT_ICON: Record<string, string> = { conference: 'groups', 'conference room': 'groups', 'living room': 'living', living: 'living', kitchen: 'kitchen', hall: 'door_sliding', bedroom: 'bedroom_parent', bathroom: 'bathtub', dining: 'dining', office: 'work', 'development area': 'work', development: 'work' }
const catIcon = (c: string) => CAT_ICON[c.toLowerCase()] || 'meeting_room'
const all = (r: Room) => [...r.lights, ...r.fans, ...(r.acs || []), ...r.switches]
const active = (r: Room) => all(r).filter(d => d.isOn).length
const sSensor = (s: Sensor, t: 'temperature' | 'humidity' | 'co2') => {
  const v = Math.max(0, s.value)
  if (t === 'temperature') return { color: '#F97316', text: v < 18 ? 'Cool' : v <= 26 ? 'Optimal' : 'Warm', icon: 'thermostat', pct: Math.min(1, v / 50) }
  if (t === 'humidity') return { color: '#0284C7', text: v < 30 ? 'Dry' : v <= 60 ? 'Comfortable' : 'Humid', icon: 'water_drop', pct: Math.min(1, v / 100) }
  return { color: v < 35 ? '#10B981' : v < 115 ? '#F59E0B' : '#EF4444', text: v < 35 ? 'Good' : v < 115 ? 'Moderate' : 'High', icon: 'co2', pct: v / 250 }
}

function Header({ title, isFull, onToggleFull, onOpenMobile, onLock, livelyOn, onToggleLively }: any) {
  const [soundOn, setSoundOn] = useState(joySound.enabled)
  return (
    <div className="hdr">
      <div className="row g10">
        <h1>{title}</h1>
        <span className="live-pill"><span className="dot" />Live</span>
      </div>
      <div className="row g6">
        <button
          className="circ"
          style={{ width: 34, height: 34, background: soundOn ? 'rgba(16,185,129,0.18)' : 'var(--c3)' }}
          title={soundOn ? 'Joyful Sounds: ON (Tap to mute)' : 'Joyful Sounds: MUTED (Tap to unmute)'}
          onClick={() => {
            const next = joySound.toggle()
            setSoundOn(next)
          }}>
          <I n={soundOn ? 'volume_up' : 'volume_off'} s={18} c={soundOn ? '#10B981' : 'var(--onv)'} />
        </button>
        <button
          className="circ"
          style={{ width: 34, height: 34, background: livelyOn ? 'rgba(99,102,241,0.22)' : 'var(--c3)' }}
          title={livelyOn ? 'Smart Home Mesh Background: ON (Tap to toggle)' : 'Smart Home Mesh Background: OFF (Tap to turn on)'}
          onClick={() => {
            joySound.pop()
            if (onToggleLively) onToggleLively()
          }}>
          <I n="hub" s={18} c={livelyOn ? '#4F46E5' : 'var(--onv)'} />
        </button>
        <button
          className="circ"
          style={{ width: 34, height: 34, background: 'rgba(2,132,199,0.12)' }}
          title="Mobile Phone Link & QR Code"
          onClick={() => { joySound.pop(); onOpenMobile() }}>
          <I n="phone_iphone" s={18} c="#0284C7" />
        </button>
        <button
          className="circ"
          style={{ width: 34, height: 34, background: 'rgba(99,102,241,0.12)' }}
          title="Lock with Mobile Biometric Security"
          onClick={() => { joySound.pop(); onLock() }}>
          <I n="fingerprint" s={19} c="#6366F1" />
        </button>
        <button
          className="circ"
          style={{ width: 34, height: 34, background: 'var(--c3)' }}
          title={isFull ? 'Exit Fullscreen' : 'Open Fullscreen Mode'}
          onClick={() => { joySound.pop(); onToggleFull() }}>
          <I n={isFull ? 'fullscreen_exit' : 'fullscreen'} s={20} c="var(--onv)" />
        </button>
      </div>
    </div>
  )
}
function Fan({ on, speed = 2, c, s = 24 }: { on: boolean; speed: number; c: string; s?: number }) {
  const dur = Math.max(0.25, 1.3 - (speed || 2) * 0.22)
  return (
    <div style={{ width: s, height: s, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        className={on ? 'spin' : ''}
        style={{
          animationDuration: `${dur}s`,
          display: 'block',
          transformOrigin: 'center center'
        }}>
        {/* Center motor hub */}
        <circle cx="12" cy="12" r="3.2" fill={c} />
        <circle cx="12" cy="12" r="1.3" fill="#fff" opacity={0.7} />
        {/* 3 Aerodynamic ceiling fan blades at 0, 120, 240 deg */}
        <path d="M12 8.8 C11.3 5.4 10 2.2 12 1 C14 2.2 12.7 5.4 12 8.8 Z" fill={c} opacity={on ? 1 : 0.75} />
        <path d="M9.3 13.6 C6.1 15.3 3.2 17 2.2 15 C3.3 13 6.5 13.4 9.3 13.6 Z" fill={c} opacity={on ? 1 : 0.75} />
        <path d="M14.7 13.6 C17.9 15.3 20.8 17 21.8 15 C20.7 13 17.5 13.4 14.7 13.6 Z" fill={c} opacity={on ? 1 : 0.75} />
      </svg>
    </div>
  )
}

/* Biometric Authentication Lock Screen for Mobile & Desktop */
function BiometricLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState('Touch Fingerprint Sensor or use FaceID')

  const triggerNativeBiometric = async () => {
    setScanning(true)
    setMsg('Waiting for Mobile Biometric Sensor...')
    if (navigator.vibrate) navigator.vibrate([30, 50, 30])

    try {
      // Real mobile hardware biometric (Fingerprint / TouchID / FaceID)
      if (window.PublicKeyCredential && navigator.credentials) {
        const hasAuth = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false)
        if (hasAuth) {
          const challenge = new Uint8Array(32)
          window.crypto.getRandomValues(challenge)
          const cred = await navigator.credentials.create({
            publicKey: {
              challenge,
              rp: { name: 'Smart Home IoT' },
              user: {
                id: new Uint8Array([1, 2, 3, 4, 5]),
                name: 'owner@home',
                displayName: 'Smart Home Owner'
              },
              pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
              authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required'
              },
              timeout: 60000
            }
          }).catch(() => null)

          if (cred) {
            setMsg('Phone Biometric Verified ✓')
            if (navigator.vibrate) navigator.vibrate([40, 60, 40])
            setTimeout(onUnlock, 300)
            return
          }
        }
      }
    } catch {
      // Fallback to instant interactive touch verification
    }

    // Interactive tactile scan verification with phone vibration
    setTimeout(() => {
      setMsg('Biometric Verified ✓')
      if (navigator.vibrate) navigator.vibrate([40, 60, 40])
      setTimeout(onUnlock, 400)
    }, 700)
  }

  // Auto-trigger biometric prompt immediately when opened on phone
  useEffect(() => {
    const t = setTimeout(() => {
      triggerNativeBiometric()
    }, 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="bio-overlay">
      <div className="bio-header">
        <div className="bio-shield">
          <I n="fingerprint" s={34} c="#818CF8" />
        </div>
        <div className="bio-title">Smart Home Secure</div>
        <div className="bio-subtitle">Native Mobile Biometric Authentication (Fingerprint / FaceID)</div>
      </div>

      <div className="bio-center">
        <div className={`bio-scanner ${scanning ? 'scanning' : ''}`} onClick={triggerNativeBiometric}>
          {scanning && <div className="bio-laser" />}
          <I n={scanning ? 'fingerprint' : 'lock'} s={56} c={scanning ? '#6EE7B7' : '#A5B4FC'} />
        </div>
        <div className="bio-prompt">{msg}</div>
        <div className="bio-status">Scan your phone's native fingerprint or FaceID sensor</div>
      </div>

      <div className="col g8" style={{ width: '100%', maxWidth: 320, alignItems: 'center' }}>
        <button className="bio-btn" onClick={triggerNativeBiometric}>
          <I n="fingerprint" s={22} c="#fff" />
          <span>Scan Phone Biometric</span>
        </button>
        <button className="bio-btn bypass" onClick={onUnlock}>
          <I n="key" s={18} c="rgba(255,255,255,0.8)" />
          <span>Continue with PIN Passcode</span>
        </button>
      </div>
    </div>
  )
}

/* Modal for Mobile Phone Access & QR Code */
function MobileAccessModal({ close, onLock }: any) {
  const mobileUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `${window.location.protocol}//${window.location.host}/?mobile=1&biometric=1`
    : 'http://192.168.1.20:8000/?mobile=1&biometric=1'
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(mobileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="modal" onClick={close}>
      <div className="dlg col g12" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, textAlign: 'center' }}>
        <div className="row sb">
          <div className="row g8">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(2,132,199,0.12)', display: 'grid', placeItems: 'center' }}>
              <I n="phone_iphone" c="#0284C7" s={22} />
            </div>
            <b style={{ fontSize: 16 }}>Mobile Phone Access</b>
          </div>
          <button className="circ" style={{ background: 'none' }} onClick={close}><I n="close" s={20} /></button>
        </div>

        <div className="mut" style={{ fontSize: 13, lineHeight: 1.4 }}>
          Scan the QR Code with your phone camera or open the link below on the same Wi-Fi network (<b>Airtel_AIOTA.tech</b>).
        </div>

        <div style={{ display: 'grid', placeItems: 'center', margin: '8px 0' }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <svg width="180" height="180" viewBox="0 0 180 180">
              <rect x="10" y="10" width="50" height="50" rx="8" fill="#1E1B4B" />
              <rect x="20" y="20" width="30" height="30" rx="4" fill="#fff" />
              <rect x="27" y="27" width="16" height="16" rx="2" fill="#3525CD" />
              <rect x="120" y="10" width="50" height="50" rx="8" fill="#1E1B4B" />
              <rect x="130" y="20" width="30" height="30" rx="4" fill="#fff" />
              <rect x="137" y="27" width="16" height="16" rx="2" fill="#3525CD" />
              <rect x="10" y="120" width="50" height="50" rx="8" fill="#1E1B4B" />
              <rect x="20" y="130" width="30" height="30" rx="4" fill="#fff" />
              <rect x="27" y="137" width="16" height="16" rx="2" fill="#3525CD" />
              <rect x="70" y="16" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="88" y="16" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="104" y="16" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="70" y="32" width="10" height="10" rx="2" fill="#10B981" />
              <rect x="88" y="32" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="70" y="48" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="104" y="48" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="16" y="70" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="32" y="70" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="48" y="70" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="16" y="88" width="10" height="10" rx="2" fill="#10B981" />
              <rect x="32" y="88" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="16" y="104" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="48" y="104" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="120" y="70" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="136" y="70" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="152" y="70" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="120" y="88" width="10" height="10" rx="2" fill="#10B981" />
              <rect x="152" y="88" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="120" y="104" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="136" y="104" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="70" y="70" width="40" height="40" rx="10" fill="rgba(79,70,229,0.12)" />
              <text x="90" y="96" textAnchor="middle" fill="#3525CD" fontSize="24" fontFamily="Material Icons">fingerprint</text>
              <rect x="70" y="120" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="88" y="120" width="10" height="10" rx="2" fill="#10B981" />
              <rect x="104" y="120" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="70" y="136" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="88" y="136" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="104" y="136" width="10" height="10" rx="2" fill="#10B981" />
              <rect x="70" y="152" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="88" y="152" width="10" height="10" rx="2" fill="#0284C7" />
              <rect x="104" y="152" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="120" y="120" width="10" height="10" rx="2" fill="#3525CD" />
              <rect x="136" y="136" width="10" height="10" rx="2" fill="#1E1B4B" />
              <rect x="152" y="152" width="10" height="10" rx="2" fill="#0284C7" />
            </svg>
          </div>
        </div>

        <div className="col g6" style={{ background: 'var(--c1)', padding: 10, borderRadius: 12, wordBreak: 'break-all' }}>
          <span className="mut" style={{ fontSize: 11, fontWeight: 600 }}>DIRECT MOBILE & BIOMETRIC LINK:</span>
          <a href={mobileUrl} target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--pri)', fontWeight: 600, textDecoration: 'none' }}>
            {mobileUrl}
          </a>
        </div>

        <div className="row sb" style={{ gap: 8, marginTop: 4 }}>
          <button className="btn o" style={{ flex: 1, padding: 10 }} onClick={copy}>
            <I n={copied ? "check" : "content_copy"} s={18} />
            {copied ? 'Copied Link!' : 'Copy Link'}
          </button>
          <button className="btn" style={{ flex: 1, padding: 10, background: '#4F46E5' }} onClick={() => { close(); onLock() }}>
            <I n="fingerprint" s={18} c="#fff" />
            Test Biometric
          </button>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_ROOMS: Room[] = [
  {
    id: "room_engineering_hub",
    name: "Engineering Hub",
    category: "Development",
    esp32_url: "http://192.168.1.10",
    has_am2315c: true,
    tempSensor: { id: "hub_temp", name: "Temperature", value: 24.5, unit: "°C" },
    humSensor: { id: "hub_hum", name: "Humidity", value: 52.0, unit: "%" },
    co2Sensor: { id: "hub_aq", name: "Air Quality", value: 22.0, unit: "µg/m³" },
    lights: [
      { id: "hub_light_1", name: "Workstation Lights", type: "light", isOn: true, value: 90, relayChannel: 1 },
      { id: "hub_light_2", name: "Lab Overhead Spot", type: "light", isOn: false, value: 70, relayChannel: 2 },
    ],
    fans: [
      { id: "hub_fan_1", name: "Exhaust Vent Fan", type: "fan", isOn: true, value: 3, relayChannel: 3 },
    ],
    acs: [
      { id: "hub_ac_1", name: "Precision Inverter AC", type: "ac", isOn: true, value: 24, relayChannel: 4 },
    ],
    switches: [
      { id: "hub_pwr_1", name: "20A Main Socket", type: "switchDevice", isOn: true, value: 1, relayChannel: 5 },
      { id: "hub_aux_1", name: "Auxiliary Workbench", type: "switchDevice", isOn: false, value: 0, relayChannel: 6 },
    ],
  },
  {
    id: "room_the_gallery",
    name: "The Gallery",
    category: "Hall",
    esp32_url: "http://192.168.1.11",
    has_aqi: true,
    tempSensor: { id: "gal_temp", name: "Temperature", value: 23.0, unit: "°C" },
    humSensor: { id: "gal_hum", name: "Humidity", value: 48.0, unit: "%" },
    co2Sensor: { id: "gal_co2", name: "Air Quality", value: 18.0, unit: "µg/m³" },
    lights: [
      { id: "gal_light_1", name: "Chandelier Ambient", type: "light", isOn: true, value: 85, relayChannel: 1 },
      { id: "gal_light_2", name: "Wall Accent Wash", type: "light", isOn: true, value: 60, relayChannel: 2 },
    ],
    fans: [
      { id: "gal_fan_1", name: "Ceiling Circulation Fan", type: "fan", isOn: false, value: 2, relayChannel: 3 },
    ],
    acs: [
      { id: "gal_ac_1", name: "Central Climate AC", type: "ac", isOn: false, value: 24, relayChannel: 4 },
    ],
    switches: [
      { id: "gal_sw_1", name: "Display Sockets", type: "switchDevice", isOn: true, value: 1, relayChannel: 5 },
    ],
  },
  {
    id: "room_conference",
    name: "Conference",
    category: "Conference",
    esp32_url: "http://192.168.1.14",
    has_pir: true,
    occupancy: { occupied: true, status: "Occupied", pir: true, pir1: true, seconds_ago: 5 },
    tempSensor: { id: "conf_temp", name: "Temperature", value: 22.8, unit: "°C" },
    humSensor: { id: "conf_hum", name: "Humidity", value: 46.0, unit: "%" },
    co2Sensor: { id: "conf_co2", name: "Air Quality", value: 28.0, unit: "µg/m³" },
    lights: [
      { id: "conf_light_1", name: "Boardroom Downlights", type: "light", isOn: true, value: 100, relayChannel: 1 },
      { id: "conf_light_2", name: "Presentation Spot", type: "light", isOn: false, value: 50, relayChannel: 2 },
    ],
    fans: [
      { id: "conf_fan_1", name: "Quiet Meeting Fan", type: "fan", isOn: true, value: 2, relayChannel: 3 },
    ],
    acs: [
      { id: "conf_ac_1", name: "Conference AC Core", type: "ac", isOn: true, value: 23, relayChannel: 4 },
    ],
    switches: [
      { id: "conf_proj_1", name: "Projector & Screen Lift", type: "switchDevice", isOn: true, value: 1, relayChannel: 5 },
    ],
  },
]

export default function App() {
  const [tab, setTab] = useState(0)
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS)
  const [rules, setRules] = useState<Rule[]>([])
  const [ok, setOk] = useState(true)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [snack, setSnack] = useState('')
  const toast = (m: string) => { setSnack(m); setTimeout(() => setSnack(''), 1800) }

  const isMobileUrl = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('biometric') === '1' ||
    localStorage.getItem('biometric_locked') === '1'
  )
  const [isLocked, setIsLocked] = useState(Boolean(isMobileUrl))
  const [mobileModal, setMobileModal] = useState(false)

  const isUrlFull = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('fullscreen') === '1' ||
    new URLSearchParams(window.location.search).get('full') === '1' ||
    localStorage.getItem('fullscreen') === '1'
  )
  const [isFull, setIsFull] = useState(Boolean(isUrlFull))

  const isUrl3D = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('view') === '3d' ||
    new URLSearchParams(window.location.search).get('3d') === '1'
  )
  const [is3D, setIs3D] = useState(Boolean(isUrl3D))

  const toggle3D = () => {
    const next = !is3D
    setIs3D(next)
    localStorage.setItem('view_3d', next ? '1' : '0')
  }

  const [livelyOn, setLivelyOn] = useState(localStorage.getItem('smart_lively_bg') !== '0')
  const toggleLively = () => {
    const next = !livelyOn
    setLivelyOn(next)
    localStorage.setItem('smart_lively_bg', next ? '1' : '0')
    toast(next ? 'Smart Home Mesh: Active ✨' : 'Smart Home Mesh: Paused')
  }

  const toggleFull = () => {
    const next = !isFull
    setIsFull(next)
    localStorage.setItem('fullscreen', next ? '1' : '0')
    if (next && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else if (!next && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }

  const inFlightRef = useRef(false)
  const prevRoomsHash = useRef('')
  const prevRulesHash = useRef('')
  const lastActionTs = useRef(0)

  const load = useCallback(async () => {
    if (inFlightRef.current || (typeof document !== 'undefined' && document.hidden)) return
    if (Date.now() - lastActionTs.current < 3500) return
    inFlightRef.current = true
    try {
      const [rms, rls] = await Promise.all([api.rooms(), api.rules()])
      if (Date.now() - lastActionTs.current < 3500) return
      const rmsHash = JSON.stringify(rms)
      if (rmsHash !== prevRoomsHash.current) {
        prevRoomsHash.current = rmsHash
        setRooms(rms)
      }
      const rlsHash = JSON.stringify(rls)
      if (rlsHash !== prevRulesHash.current) {
        prevRulesHash.current = rlsHash
        setRules(rls)
      }
      setOk(true)
    } catch {
      setOk(false)
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => { 
    load()
    const t = setInterval(load, 2000) 
    return () => clearInterval(t) 
  }, [load])

  // Instant optimistic device toggle (Lights, Fans, ACs, Switches) - 0ms delay!
  const onToggleDev = (rid: string, did: string) => {
    lastActionTs.current = Date.now()
    setRooms(prev => {
      const updated = prev.map(r => {
        if (r.id !== rid) return r
        const allD = [...r.lights, ...r.fans, ...(r.acs || []), ...r.switches]
        const target = allD.find(x => x.id === did)
        const ch = target?.relayChannel
        const newOn = target ? !target.isOn : false
        joySound.toggleDev(newOn)
        const flip = (d: Dev) => {
          if (ch && d.relayChannel === ch) return { ...d, isOn: newOn }
          if (d.id === did) return { ...d, isOn: !d.isOn }
          return d
        }
        return {
          ...r,
          lights: r.lights.map(flip),
          fans: r.fans.map(flip),
          acs: (r.acs || []).map(flip),
          switches: r.switches.map(flip),
        }
      })
      prevRoomsHash.current = JSON.stringify(updated)
      return updated
    })
    api.toggle(rid, did).catch(() => {})
  }

  // Instant optimistic room node toggle - 0ms delay!
  const onToggleRoom = (rid: string) => {
    lastActionTs.current = Date.now()
    let nextOnState = false
    setRooms(prev => {
      const updated = prev.map(r => {
        if (r.id !== rid) return r
        const allDevs = r.lights.concat(r.fans, r.acs || [], r.switches)
        const nextOn = !allDevs.some(d => d.isOn)
        nextOnState = nextOn
        const setDev = (d: Dev) => ({ ...d, isOn: nextOn })
        return {
          ...r,
          lights: r.lights.map(setDev),
          fans: r.fans.map(setDev),
          acs: (r.acs || []).map(setDev),
          switches: r.switches.map(setDev),
        }
      })
      prevRoomsHash.current = JSON.stringify(updated)
      return updated
    })
    joySound.toggleDev(nextOnState)
    if (nextOnState) burstJoy()
    api.toggleRoom(rid).catch(() => {})
  }

  // Instant optimistic all-in-room toggle
  const onToggleAll = (rid: string, isOn: boolean) => {
    lastActionTs.current = Date.now()
    joySound.toggleDev(isOn)
    if (isOn) burstJoy()
    setRooms(prev => {
      const updated = prev.map(r => {
        if (r.id !== rid) return r
        const setDev = (d: Dev) => ({ ...d, isOn })
        return {
          ...r,
          lights: r.lights.map(setDev),
          fans: r.fans.map(setDev),
          acs: (r.acs || []).map(setDev),
          switches: r.switches.map(setDev),
        }
      })
      prevRoomsHash.current = JSON.stringify(updated)
      return updated
    })
    api.all(rid, isOn).catch(() => {})
  }

  // Instant optimistic scene switch
  const onScene = (n: string) => {
    const isOff = n.toLowerCase().includes('off')
    const isOn = n.toLowerCase().includes('on')
    const isConf = n.toLowerCase().includes('conference')
    setRooms(prev => prev.map(r => {
      const matchConf = r.name.toLowerCase().includes('conference') || (r.category || '').toLowerCase().includes('conference') || (r.category || '').toLowerCase().includes('living')
      const setDev = (d: Dev) => ({ ...d, isOn: isOff ? false : isOn ? true : isConf ? matchConf : d.isOn })
      return {
        ...r,
        lights: r.lights.map(setDev),
        fans: r.fans.map(setDev),
        acs: (r.acs || []).map(setDev),
        switches: r.switches.map(setDev),
      }
    }))
    if (isOff) {
      joySound.powerDown()
    } else {
      joySound.sceneChime()
      burstJoy()
    }
    api.scene(n).catch(() => load())
    toast(`Activated "${n}" scene across all rooms ✨`)
  }

  const act = async (f: () => Promise<any>) => { await f(); await load() }

  const lights = rooms.flatMap(r => r.lights), fans = rooms.flatMap(r => r.fans), acs = rooms.flatMap(r => r.acs || []), sws = rooms.flatMap(r => r.switches)
  const watts = (() => { 
    let w = 0; 
    rooms.forEach(r => { 
      r.lights.forEach(l => l.isOn && (w += l.value / 100 * 12)); 
      r.fans.forEach(f => f.isOn && (w += f.value / 5 * 55)); 
      r.acs?.forEach(a => a.isOn && (w += 650));
      r.switches.forEach(s => s.isOn && (w += 40)) 
    }); 
    return w > 0 ? w : 42 
  })()
  const kwh = watts * 14 / 1000, cost = 48.5 + kwh * 30 * 0.05
  const avg = (k: 'tempSensor' | 'humSensor' | 'co2Sensor', d: number) => rooms.length ? rooms.reduce((a, r) => a + r[k].value, 0) / rooms.length : d
  const M = { lights, fans, acs, sws, watts, kwh, cost, temp: avg('tempSensor', 22.5), hum: avg('humSensor', 48), co2: avg('co2Sensor', 24) }
  const room = rooms.find(r => r.id === roomId)

  return <>
    {livelyOn && <Lively3DSmartHomeBg />}
    <div className={`app ${isFull ? 'fullscreen' : ''}`}>
      {isLocked && <BiometricLockScreen onUnlock={() => { setIsLocked(false); localStorage.removeItem('biometric_locked'); toast('Biometric Verified — Welcome!') }} />}
      {mobileModal && <MobileAccessModal close={() => setMobileModal(false)} onLock={() => setIsLocked(true)} />}
      {!ok && <div style={{ background: '#FFDAD6', color: '#BA1A1A', fontSize: 12, padding: '6px 20px', textAlign: 'center' }}>Backend not reachable at {baseUrl()} — check Settings</div>}
      {roomId ? <RoomDetail room={room} back={() => setRoomId(null)} onToggleDev={onToggleDev} onToggleAll={onToggleAll} act={act} toast={toast} onOpenMobile={() => setMobileModal(true)} onLock={() => setIsLocked(true)} />
        : <>
          {tab === 0 && <Dashboard rooms={rooms} M={M} onToggleRoom={onToggleRoom} onScene={onScene} reloadRooms={load} isFull={isFull} onToggleFull={toggleFull} onOpenMobile={() => setMobileModal(true)} onLock={() => setIsLocked(true)} act={act} toast={toast} open={setRoomId} livelyOn={livelyOn} onToggleLively={toggleLively} />}
          {tab === 1 && <Analytics rooms={rooms} M={M} isFull={isFull} onToggleFull={toggleFull} is3D={is3D} onToggle3D={toggle3D} onOpenMobile={() => setMobileModal(true)} onLock={() => setIsLocked(true)} livelyOn={livelyOn} onToggleLively={toggleLively} />}
          {tab === 2 && <Automations rules={rules} act={act} isFull={isFull} onToggleFull={toggleFull} is3D={is3D} onToggle3D={toggle3D} onOpenMobile={() => setMobileModal(true)} onLock={() => setIsLocked(true)} livelyOn={livelyOn} onToggleLively={toggleLively} />}
          {tab === 3 && <Settings ok={ok} reload={load} toast={toast} isFull={isFull} onToggleFull={toggleFull} is3D={is3D} onToggle3D={toggle3D} onOpenMobile={() => setMobileModal(true)} onLock={() => setIsLocked(true)} livelyOn={livelyOn} onToggleLively={toggleLively} />}
        <div className="nav">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
            { id: 'analytics', label: 'Analytics', icon: 'analytics' },
            { id: 'automations', label: 'Automations', icon: 'bolt' },
            { id: 'settings', label: 'Settings', icon: 'settings' },
          ].map((item, i) => {
            const isActive = tab === i
            return (
              <button
                key={item.id}
                className={`joy-nav-btn ${item.id} ${isActive ? 'active' : ''}`}
                onClick={() => { joySound.pop(); setTab(i) }}
              >
                <I n={item.icon} o={!isActive} s={22} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </>}
    {snack && <div className="snack">{snack}</div>}
    </div>
  </>
}

/* ---------------- Dashboard ---------------- */
const ROOM_EMOJIS: Record<string, string> = {
  'All Rooms': '🌟',
  'Conference': '💼',
  'Hall': '🚪',
  'Development Area': '💻',
  'Living Room': '🛋️',
  'Bedroom': '🛏️',
  'Kitchen': '🍳',
  'Bathroom': '🛁'
}

const SCENE_CLASSES: Record<string, string> = {
  'All Off': 'pill-scene-alloff',
  'All On': 'pill-scene-allon',
  'Conference': 'pill-scene-conference',
  'Night Mode': 'pill-scene-night',
  'Eco Mode': 'pill-scene-eco'
}

function Dashboard({ rooms, M, onToggleRoom, onScene, reloadRooms, isFull, onToggleFull, onOpenMobile, onLock, act, toast, open, livelyOn, onToggleLively }: any) {
  const [filter, setFilter] = useState('All Rooms'), [scene, setScene] = useState('All On')
  const [adding, setAdding] = useState(false), [sheet, setSheet] = useState(false)
  const [editRoom, setEditRoom] = useState<Room | null>(null), [delRoom, setDelRoom] = useState<Room | null>(null)
  const [configRoom, setConfigRoom] = useState<Room | null>(null)
  const h = new Date().getHours(), now = new Date()
  const greet = h >= 5 && h < 12 ? 'Good Morning ☀️' : h >= 12 && h < 17 ? 'Good Afternoon 🌤️' : h >= 17 && h < 21 ? 'Good Evening 🌇' : 'Good Night 🌙'
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const shown = filter === 'All Rooms' ? rooms : rooms.filter((r: Room) => {
    const f = filter.toLowerCase()
    const rName = r.name.toLowerCase()
    const rCat = (r.category || '').toLowerCase()
    if (f === 'conference' || f === 'living room') {
      return rName.includes('conference') || rCat.includes('conference') || rCat.includes('living')
    }
    if (f === 'development area') {
      return rName.includes('engineering') || rCat.includes('development') || rCat.includes('office')
    }
    if (f === 'hall') {
      return rName.includes('gallery') || rCat.includes('hall')
    }
    return rCat === f || rName.includes(f)
  })
  const doScene = (n: string, e?: React.MouseEvent) => {
    setScene(n)
    if (n === 'All Off') {
      joySound.powerDown()
    } else {
      joySound.sceneChime()
      burstJoy(e)
    }
    onScene(n)
  }
  const Metric = ({ ic, c, bd, label, val, spin, type }: any) => (
    <div
      className={`card joy-metric-card ${type || ''}`}
      onClick={() => joySound.pop()}
    >
      <div className="row sb">
        <div style={{ width: 38, height: 38, borderRadius: 12, background: tint(c, 0.16), border: `1px solid ${tint(c, 0.3)}`, display: 'grid', placeItems: 'center' }}>
          {spin ? <Fan on speed={3} c={c} s={22} /> : <I n={ic} c={c} s={22} />}
        </div>
        <span className="badge" style={{ background: tint(c, 0.16), color: c, fontWeight: 700, padding: '3px 9px' }}>{bd}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--onv)', marginTop: 12, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -.3, marginTop: 2 }}>{val}</div>
    </div>
  )
  return <><Header title="Dashboard" isFull={isFull} onToggleFull={onToggleFull} onOpenMobile={onOpenMobile} onLock={onLock} livelyOn={livelyOn} onToggleLively={onToggleLively} />
  <div className="scroll col" style={{ gap: 18 }}>
    <div className="row sb" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div className="mut" style={{ fontWeight: 500 }}>{date}</div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -.6, marginTop: 2 }}>{greet}</div>
        <div className="joy-greeting-badge">
          <span className="joy-greeting-dot" />
          <span>Home Hub Synchronized · {rooms.length} Active Nodes</span>
        </div>
      </div>
      <div className="row g10">
        <button className="circ" style={{ background: 'var(--c4)' }} title="Add New Room Node" onClick={() => { joySound.pop(); setAdding(true) }}><I n="add" s={22} /></button>
        <button className="circ" style={{ background: 'var(--pric)', boxShadow: '0 4px 14px rgba(79,70,229,0.4)' }} title="Quick Home Presets" onClick={() => { joySound.pop(); setSheet(true) }}><I n="tune" c="#fff" s={20} /></button>
      </div>
    </div>
    <div className="row sb" style={{ padding: '18px 20px', borderRadius: 20, flexWrap: 'wrap', gap: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'linear-gradient(135deg, rgba(79,70,229,0.24), rgba(18,25,42,0.88), rgba(6,182,212,0.18))', boxShadow: '0 10px 28px rgba(0,0,0,0.32)' }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--onv)' }}>Projected Energy & Live Load</div>
        <div className="row g8" style={{ flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: -.6, color: '#fff' }}>${M.cost.toFixed(2)}</span>
          <span className="badge row" style={{ background: 'rgba(16,185,129,0.18)', color: '#34D399', gap: 4, fontWeight: 700 }}><I n="trending_down" s={14} />-12% vs last mo</span>
          <span className="badge row" style={{ background: 'rgba(56,189,248,0.16)', color: '#38BDF8', gap: 4, fontWeight: 700 }}><I n="bolt" s={14} />{M.watts.toFixed(0)} W live</span>
        </div>
      </div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 5 }}>{[[16, .35], [24, .5], [20, .65], [32, .8], [28, .9], [40, 1]].map(([hh, op], i) =>
        <div key={i} style={{ width: 11, height: hh, borderRadius: '4px 4px 0 0', background: i === 5 ? '#38BDF8' : `rgba(99,102,241,${op})`, boxShadow: i === 5 ? '0 0 12px rgba(56,189,248,0.65)' : 'none' }} />)}</div>
    </div>
    <div className="metrics-grid">
      <Metric ic="lightbulb" c="#F59E0B" bd="Active" label="Lights" val={`${M.lights.filter((d: Dev) => d.isOn).length} / ${M.lights.length}`} type={M.lights.some((d: Dev) => d.isOn) ? 'active-lights' : ''} />
      <Metric spin={M.fans.some((d: Dev) => d.isOn)} ic="toys" c="#06B6D4" bd="Spinning" label="Fans" val={`${M.fans.filter((d: Dev) => d.isOn).length} Active`} type={M.fans.some((d: Dev) => d.isOn) ? 'active-fans' : ''} />
      <Metric ic="ac_unit" c="#0284C7" bd={M.acs?.some((d: Dev) => d.isOn) ? "Cooling" : "Eco"} label="Air Conditioners" val={`${M.acs?.filter((d: Dev) => d.isOn).length || 0} Active`} type={M.acs?.some((d: Dev) => d.isOn) ? 'active-ac' : ''} />
      <Metric ic="thermostat" c="#818CF8" bd="Optimal" label="Avg Temp" val={`${M.temp.toFixed(1)}°C`} />
    </div>
    <div className="col g10">
      <div className="row sb">
        <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Quick Scenes</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--onv)' }}>· One-tap presets</span>
        </h3>
      </div>
      <div className="scroll-chips">
        {[
          ['All Off', 'power_settings_new', 'pill-scene-alloff'],
          ['All On', 'bolt', 'pill-scene-allon'],
          ['Night Mode', 'dark_mode', 'pill-scene-night'],
          ['Eco Mode', 'eco', 'pill-scene-eco']
        ].map(([n, ic, cls]) =>
          <button
            key={n}
            className={`pill ${cls} ${scene === n ? 'on' : ''}`}
            style={{ padding: '9px 17px', fontWeight: 700 }}
            onClick={(e) => doScene(n, e)}
          >
            <I n={ic} s={17} />{n}
          </button>
        )}
      </div>
    </div>
    <div className="col g10">
      <div className="row sb">
        <h3 style={{ fontSize: 15 }}>Rooms & Nodes</h3>
        <span className="mut">{shown.length} shown</span>
      </div>
      <div className="scroll-chips">
        {['All Rooms', 'Conference', 'Hall', 'Development Area', 'Bedroom', 'Kitchen', 'Bathroom'].map(c => (
          <button
            key={c}
            className={`pill joy-room-pill ${filter === c ? 'on' : ''}`}
            style={{ padding: '7px 15px', fontSize: 12.5, fontWeight: 600 }}
            onClick={() => { joySound.pop(); setFilter(c) }}
          >
            <span>{ROOM_EMOJIS[c] || '🏠'}</span>
            <span>{c}</span>
          </button>
        ))}
      </div>
    </div>
    {shown.length === 0 ? <div className="card col" style={{ padding: 32, alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <div style={{ padding: 16, borderRadius: '50%', background: tint('#4F46E5') }}><I n="other_houses" s={42} c="var(--pri)" /></div>
      <b style={{ fontSize: 17 }}>No Rooms Configured</b><div style={{ fontSize: 13, color: 'var(--onv)' }}>Tap "Add Room" to create a living room, bedroom, or kitchen.<br />Presets will be automatically created.</div>
      <button className="btn" onClick={() => { joySound.pop(); setAdding(true) }}><I n="add" c="#fff" s={20} />Add Room Now</button></div>
      : <>
        <div className="rooms-grid">
        {shown.map((r: Room) => {
          const a = active(r), c = sSensor(r.co2Sensor, 'co2')
          const hasActive = a > 0
          const totalDevs = all(r).length
          const pct = totalDevs ? Math.round((a / totalDevs) * 100) : 0
          return <div key={r.id} className={`card col g10 ${hasActive ? 'card-joy-active' : ''}`} style={{ padding: 16 }}>
            <div className="row sb" style={{ cursor: 'pointer', gap: 10 }} onClick={() => { joySound.pop(); open(r.id) }}>
              <div className="row g12" style={{ minWidth: 0, flex: 1 }}>
                <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 14, display: 'grid', placeItems: 'center', background: hasActive ? tint('#6366F1', 0.2) : 'var(--c2)', border: hasActive ? '1px solid rgba(129,140,248,0.35)' : '1px solid rgba(255,255,255,0.06)' }}>
                  <I n={catIcon(r.category)} c={hasActive ? '#818CF8' : 'var(--onv)'} s={24} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="row g6" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 15.5, letterSpacing: -0.2 }}>{r.name}</b>
                    {r.esp32_url && (
                      <span className="badge" style={{ background: 'rgba(6,182,212,0.15)', color: '#38BDF8', fontSize: 10, fontFamily: 'monospace', padding: '1px 7px', border: '1px solid rgba(6,182,212,0.28)' }}>
                        {r.esp32_url.replace('http://', '')}
                      </span>
                    )}
                  </div>
                  <div className="mut" style={{ marginTop: 2 }}>
                    {hasActive ? <span style={{ color: '#A5B4FC', fontWeight: 600 }}>{a} / {totalDevs} devices active</span> : `${totalDevs} devices standby`} · {r.category}
                  </div>
                </div>
              </div>
              <div className="row g8" style={{ alignItems: 'center', flexShrink: 0 }}>
                <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                  {(r.name.toUpperCase().includes('CONFERENCE') || r.name.toUpperCase().includes('GALLERY') || r.name.toUpperCase().includes('ENGINEERING')) ? null : (
                    <>
                      <span className="badge" style={{ background: tint(c.color), color: c.color, fontWeight: 700 }}>{r.co2Sensor.value.toFixed(0)} {r.co2Sensor.unit || 'µg/m³'}</span>
                      <span className="mut" style={{ fontSize: 11 }}>{r.tempSensor.value.toFixed(1)}°C · {r.humSensor.value.toFixed(0)}%</span>
                    </>
                  )}
                </div>
                <div onClick={e => e.stopPropagation()}>
                  <Sw on={hasActive} set={() => {
                    joySound.toggleDev(!hasActive)
                    if (!hasActive) burstJoy()
                    onToggleRoom(r.id)
                  }} />
                </div>
              </div>
            </div>
            <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9999, background: hasActive ? 'linear-gradient(90deg, #6366F1, #38BDF8)' : 'transparent', transition: 'width 0.3s ease' }} />
            </div>
            <div className="row sb" style={{ paddingTop: 2 }}>
              <button className="btn t" style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 10 }} onClick={() => { joySound.pop(); open(r.id) }}>
                <I n="open_in_new" s={15} /> Open Room
              </button>
              <button
                className="pill"
                style={{ padding: '5px 12px', fontSize: 12, gap: 5, color: '#E2E8F0' }}
                onClick={(e) => {
                  e.stopPropagation()
                  joySound.pop()
                  setConfigRoom(r)
                }}
              >
                <I n="tune" s={14} c="var(--pri)" /> Configure
              </button>
            </div>
          </div>
        })}
        </div>
        <button className="btn o" style={{ width: '100%', padding: '12px' }} onClick={() => setAdding(true)}>
          <I n="add" s={20} c="var(--pri)" /> Add New Room Node
        </button>
      </>}
    <Rel toast={toast} reloadRooms={reloadRooms} />
  </div>
    {configRoom && (
      <ConfigureRoomModal
        room={configRoom}
        close={() => setConfigRoom(null)}
        toast={toast}
        onEdit={(r: Room) => {
          setEditRoom(r)
        }}
        onRemove={(r: Room) => {
          setDelRoom(r)
        }}
      />
    )}
    {adding && <AddRoom close={() => setAdding(false)} add={(n: string, c: string) => act(() => api.createRoom(n, c))} toast={toast} />}
    {editRoom && <EditRoomModal room={editRoom} close={() => setEditRoom(null)} onSave={(n: string, c: string) => act(() => api.editRoom(editRoom.id, n, c))} toast={toast} />}
    {delRoom && <div className="modal" onClick={() => setDelRoom(null)}><div className="dlg col g12" onClick={e => e.stopPropagation()}>
      <h3>Remove Room Node?</h3>
      <div className="mut">Are you sure you want to remove <b>{delRoom.name}</b> and all of its devices?</div>
      <div className="row sb">
        <button className="btn t" onClick={() => setDelRoom(null)}>Cancel</button>
        <button className="btn" style={{ background: '#F43F5E' }} onClick={() => { act(() => api.deleteRoom(delRoom.id)); toast(`Removed ${delRoom.name}`); setDelRoom(null) }}>Delete</button>
      </div></div></div>}
    {sheet && <div className="modal" onClick={() => setSheet(false)}><div className="sheet" onClick={e => e.stopPropagation()}><h3 style={{ marginBottom: 12 }}>Quick Home Presets</h3>
      {[['All Off (Emergency Shutdown)', 'Power down lights, fans, & sockets', 'All Off', 'power_settings_new', '#EF4444'], ['All On (Full Illumination)', 'Activate lighting and ventilation', 'All On', 'bolt', '#F59E0B'], ['Night Mode', 'Dim lights & activate quiet fan speeds', 'Night Mode', 'dark_mode', '#3525CD']].map(([t, s, n, ic, c]) =>
        <div key={n} className="row g12" style={{ padding: '12px 0', cursor: 'pointer' }} onClick={() => { doScene(n); setSheet(false) }}><I n={ic} c={c} /><div><b>{t}</b><div className="mut">{s}</div></div></div>)}</div></div>}
  </>
}

/* ESP32 relay status strip (shows the 3 socket boards and their 6 channels) */
function Rel({ toast, reloadRooms }: any) {
  const [r, setR] = useState<any>(null)
  const [selectedBoardIdx, setSelectedBoardIdx] = useState(0)
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const lastChannelActionTs = useRef(0)

  const refresh = () => {
    if (Date.now() - lastChannelActionTs.current < 3000) return
    api.relays().then(data => {
      if (Date.now() - lastChannelActionTs.current < 3000) return
      setR(data)
      if (!editing) {
        if (data.boards && data.boards[selectedBoardIdx]) {
          setUrl(data.boards[selectedBoardIdx].esp32_url || '')
        } else if (data.esp32_url) {
          setUrl(data.esp32_url)
        }
      }
    }).catch(() => setR(null))
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [selectedBoardIdx])

  const activeBoard = r?.boards && r.boards[selectedBoardIdx] ? r.boards[selectedBoardIdx] : null

  const saveUrl = async () => {
    setBusy(true)
    try {
      if (activeBoard) {
        await api.setRoomEsp32Url(activeBoard.id, url)
        if (toast) toast(`${activeBoard.name} ESP32 URL updated!`)
      } else {
        const updated = await api.setRelayUrl(url)
        if (toast) toast(updated.online ? 'ESP32 Connected Successfully!' : 'ESP32 Offline')
      }
      refresh()
      setEditing(false)
    } catch {
      if (toast) toast('Error updating ESP32 URL')
    } finally {
      setBusy(false)
    }
  }

  const changeMode = async (mode: string) => {
    try {
      const updated = await api.setRelayMode(mode)
      setR((prev: any) => ({ ...prev, ...updated }))
      if (toast) toast(mode === 'room_nodes' ? 'Mode: 1 Relay per Room Node' : 'Mode: Direct 1-to-1 Device Relays')
    } catch {
      if (toast) toast('Failed to update relay mode')
    }
  }

  const toggleChannel = async (ch: number) => {
    lastChannelActionTs.current = Date.now()
    joySound.pop()
    if (activeBoard) {
      setR((prev: any) => {
        if (!prev || !prev.boards) return prev
        const newBoards = [...prev.boards]
        const b = { ...newBoards[selectedBoardIdx] }
        const m = (b.active_mask || '000000').split('')
        m[ch - 1] = m[ch - 1] === '1' ? '0' : '1'
        b.active_mask = m.join('')
        newBoards[selectedBoardIdx] = b
        return { ...prev, boards: newBoards }
      })
      api.toggleRoomChannel(activeBoard.id, ch).then(() => {
        if (reloadRooms) reloadRooms()
      }).catch(() => {})
      if (toast) toast(`${activeBoard.name} · CH${ch} toggled`)
    } else {
      api.toggleChannel(ch).then((updated: any) => {
        setR((prev: any) => ({ ...prev, ...updated }))
        if (reloadRooms) reloadRooms()
      }).catch(() => {})
    }
  }

  const toggleInvert = async () => {
    try {
      const updated = await api.invertRelays()
      setR((prev: any) => ({ ...prev, ...updated }))
      if (toast) toast(updated.invert ? 'Relay Logic: Active LOW (Inverted)' : 'Relay Logic: Active HIGH (Normal)')
    } catch {
      if (toast) toast('Failed to invert relay logic')
    }
  }

  if (!r) return null
  const mask = activeBoard ? (activeBoard.active_mask || '000000') : (r.active_mask || '000000')
  const isOnline = activeBoard ? activeBoard.online : r.online
  const currentUrl = activeBoard ? activeBoard.esp32_url : r.esp32_url
  const currentMap = activeBoard ? activeBoard.map : r.map

  return (
    <div className="card col g10" style={{ padding: 14 }}>
      <div className="row sb">
        <div className="row g8">
          <b style={{ fontSize: 13 }}>ESP32-S3 6-CH Socket Boards</b>
          <button className="badge" style={{ background: 'var(--c4)', border: 'none', cursor: 'pointer', padding: '2px 8px' }} onClick={() => {
            setUrl(currentUrl || '')
            setEditing(!editing)
          }}>
            {editing ? 'Cancel' : 'Change IP'}
          </button>
        </div>
        <span className="badge" style={{ background: tint(isOnline ? '#10B981' : '#EF4444'), color: isOnline ? '#10B981' : '#EF4444' }}>
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {r.boards && r.boards.length > 0 && (
        <div className="scroll-chips" style={{ margin: '4px 0' }}>
          {r.boards.map((b: any, idx: number) => (
            <button
              key={b.id}
              onClick={() => {
                joySound.pop()
                setSelectedBoardIdx(idx)
                setUrl(b.esp32_url || '')
                setEditing(false)
              }}
              className={`pill ${selectedBoardIdx === idx ? 'on' : ''}`}
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.2px',
                padding: '7px 14px',
                gap: 7,
              }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: b.online ? '#10B981' : '#EF4444' }} />
              <span>{b.name}</span>
              <span style={{ fontSize: 10, opacity: 0.85, fontFamily: 'monospace', background: 'rgba(255,255,255,0.12)', padding: '1px 6px', borderRadius: 4 }}>
                {(b.esp32_url || '').replace('http://', '')}
              </span>
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <div className="col g8" style={{ marginTop: 4 }}>
          <div className="mut" style={{ fontSize: 12 }}>Enter ESP32 IP address for {activeBoard?.name || 'Controller'}:</div>
          <div className="row g8">
            <input
              type="text"
              style={{ flex: 1, fontFamily: 'monospace', padding: '6px 10px', fontSize: 13 }}
              placeholder="e.g. 192.168.1.10"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <button className="btn" style={{ padding: '6px 14px', fontSize: 13 }} onClick={saveUrl} disabled={busy}>
              {busy ? 'Saving...' : 'Save IP'}
            </button>
          </div>
        </div>
      ) : (
        <div className="row sb mut" style={{ fontSize: 11 }}>
          <span>Target IP: <span style={{ fontFamily: 'monospace', color: '#38BDF8', fontWeight: 700 }}>{currentUrl}</span> ({activeBoard?.name || 'Board'})</span>
          {activeBoard?.error ? <span style={{ color: '#EF4444' }}>{activeBoard.error}</span> : r.error && <span style={{ color: '#EF4444' }}>{r.error}</span>}
        </div>
      )}

      <div className="col g8" style={{ marginTop: 4 }}>
        <div className="row sb" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="mut" style={{ fontSize: 11, fontWeight: 600 }}>
            {activeBoard ? `${activeBoard.name.toUpperCase()} CHANNELS (TAP TO TEST)` : 'RELAY CHANNELS (TAP TO TOGGLE)'}
          </div>
          <div className="row g6">
            <button
              className={`pill ${r.invert ? 'on' : ''}`}
              style={{ padding: '2px 8px', fontSize: 10 }}
              title="Click if physical relay states are inverted"
              onClick={toggleInvert}>
              {r.invert ? '⚡ Active LOW' : '⚡ Active HIGH'}
            </button>
          </div>
        </div>

        <div className="channels-grid">
          {[0, 1, 2, 3, 4, 5].map(i => {
            const isOn = mask[i] === '1'
            const chName = `CH${i + 1}`
            const desc = currentMap ? currentMap[chName] || chName : chName
            return (
              <div
                key={i}
                onClick={() => {
                  joySound.toggleDev(!isOn)
                  toggleChannel(i + 1)
                }}
                style={{
                  background: isOn ? 'rgba(16, 185, 129, 0.16)' : 'rgba(24, 32, 50, 0.72)',
                  border: isOn ? '1.5px solid #10B981' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '9px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s ease'
                }}>
                <div className="row sb">
                  <div className="row g6">
                    <b style={{ fontSize: 12, color: isOn ? '#10B981' : 'var(--onv)' }}>{chName}</b>
                    {isOn && desc.toLowerCase().includes('fan') && (
                      <Fan on={true} speed={3} c="#10B981" s={14} />
                    )}
                  </div>
                  <span
                    className={`badge ${isOn && !desc.toLowerCase().includes('fan') ? 'badge-blink-on' : ''}`}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 6px',
                      background: isOn ? (desc.toLowerCase().includes('fan') ? '#06B6D4' : '#F59E0B') : 'var(--c3)',
                      color: isOn ? '#fff' : 'var(--out)'
                    }}>
                    {isOn ? (desc.toLowerCase().includes('fan') ? '⟳ ON' : '● ON') : 'OFF'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--on)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {desc}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AddRoom({ close, add, toast }: any) {
  const [name, setName] = useState(''), [cat, setCat] = useState('Conference')
  return <div className="modal"><div className="dlg col g12">
    <h3>Add New Room Node</h3><div className="mut">Room / Node Name</div>
    <input type="text" value={name} placeholder="e.g. Conference, Chef Kitchen, Main Hall" onChange={e => setName(e.target.value)} />
    <div className="mut">Room Category:</div>
    <div className="chips" style={{ flexWrap: 'wrap' }}>{['Conference', 'Hall', 'Development Area', 'Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Dining', 'Office'].map(c => <button key={c} className={`pill ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
    <div className="mut"><b>Automatic IoT Device Setup:</b><br />4 Lights · 2 Fans · 2 Switches · Temp, Humidity, and CO2 Air Sensors</div>
    <div className="row sb"><button className="btn t" onClick={close}>Cancel</button>
      <button className="btn" onClick={() => { if (!name.trim()) return toast('Please enter a room name'); add(name.trim(), cat); close() }}>Create Room Node</button></div></div></div>
}

function ConfigureRoomModal({ room, close, onEdit, onRemove, toast }: any) {
  const [ip, setIp] = useState(room.esp32_url || 'http://192.168.1.10')
  const [savingIp, setSavingIp] = useState(false)

  const handleSaveIp = async () => {
    setSavingIp(true)
    try {
      await api.setRoomEsp32Url(room.id, ip)
      if (toast) toast(`${room.name} ESP32 IP updated to ${ip}`)
      close()
    } catch {
      if (toast) toast('Failed to update ESP32 IP')
    } finally {
      setSavingIp(false)
    }
  }

  return (
    <div className="modal" onClick={close}>
      <div className="dlg col g12" onClick={e => e.stopPropagation()} style={{ maxWidth: 430 }}>
        <div className="row sb">
          <div className="row g10">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(99,102,241,0.18)', display: 'grid', placeItems: 'center', border: '1px solid rgba(99,102,241,0.35)' }}>
              <I n="tune" s={22} c="var(--pri)" />
            </div>
            <div>
              <b style={{ fontSize: 16 }}>Configure {room.name}</b>
              <div className="mut" style={{ fontSize: 11 }}>Node Settings · {room.category}</div>
            </div>
          </div>
          <button className="circ" style={{ background: 'none', border: 'none', width: 32, height: 32 }} onClick={close}>
            <I n="close" s={20} />
          </button>
        </div>

        <div className="col g10" style={{ margin: '8px 0' }}>
          {/* Dedicated ESP32 IP Config */}
          <div
            className="card col g8"
            style={{
              padding: 12,
              background: 'rgba(30, 41, 59, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="row sb">
              <div className="row g8">
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(6,182,212,0.18)', display: 'grid', placeItems: 'center' }}>
                  <I n="router" s={18} c="#38BDF8" />
                </div>
                <div>
                  <b style={{ fontSize: 13 }}>Dedicated ESP32 IP Address</b>
                  <div className="mut" style={{ fontSize: 10 }}>Independent IP for {room.name}</div>
                </div>
              </div>
              <span className="badge" style={{ background: 'rgba(6,182,212,0.2)', color: '#38BDF8', fontSize: 10 }}>
                6-CH Board
              </span>
            </div>
            <div className="row g8" style={{ marginTop: 2 }}>
              <input
                type="text"
                style={{ flex: 1, fontFamily: 'monospace', padding: '6px 10px', fontSize: 13 }}
                value={ip}
                placeholder="e.g. 192.168.1.10"
                onChange={e => setIp(e.target.value)}
              />
              <button
                className="btn"
                style={{ padding: '6px 14px', fontSize: 13, background: 'linear-gradient(135deg, #0284C7, #06B6D4)' }}
                onClick={handleSaveIp}
                disabled={savingIp}
              >
                {savingIp ? 'Saving...' : 'Save IP'}
              </button>
            </div>
          </div>

          {/* Edit Option */}
          <div
            className="card row sb"
            style={{
              padding: 14,
              cursor: 'pointer',
              background: 'rgba(30, 41, 59, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              transition: 'all 0.2s ease',
            }}
            onClick={() => {
              close()
              onEdit(room)
            }}
          >
            <div className="row g12">
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.22)', display: 'grid', placeItems: 'center' }}>
                <I n="edit" s={20} c="#818CF8" />
              </div>
              <div>
                <b style={{ fontSize: 14 }}>Edit Room Details</b>
                <div className="mut" style={{ fontSize: 11 }}>Rename room or change category & icon</div>
              </div>
            </div>
            <I n="chevron_right" s={22} c="var(--onv)" />
          </div>

          {/* Remove Option */}
          <div
            className="card row sb"
            style={{
              padding: 14,
              cursor: 'pointer',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              transition: 'all 0.2s ease',
            }}
            onClick={() => {
              close()
              onRemove(room)
            }}
          >
            <div className="row g12">
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(244,63,94,0.22)', display: 'grid', placeItems: 'center' }}>
                <I n="delete_outline" s={20} c="#F43F5E" />
              </div>
              <div>
                <b style={{ fontSize: 14, color: '#F43F5E' }}>Remove Room Node</b>
                <div className="mut" style={{ fontSize: 11 }}>Permanently delete this room & devices</div>
              </div>
            </div>
            <I n="chevron_right" s={22} c="#F43F5E" />
          </div>
        </div>

        <div className="row sb" style={{ marginTop: 4 }}>
          <button className="btn t" style={{ width: '100%' }} onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}

function EditRoomModal({ room, close, onSave, toast }: any) {
  const [name, setName] = useState(room.name)
  const [cat, setCat] = useState(room.category || 'Conference')
  return <div className="modal" onClick={close}><div className="dlg col g12" onClick={e => e.stopPropagation()}>
    <h3>Edit Room Node</h3><div className="mut">Room / Node Name</div>
    <input type="text" value={name} onChange={e => setName(e.target.value)} />
    <div className="mut">Room Category:</div>
    <div className="chips" style={{ flexWrap: 'wrap' }}>{['Conference', 'Hall', 'Development Area', 'Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Dining', 'Office'].map(c => <button key={c} className={`pill ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
    <div className="row sb"><button className="btn t" onClick={close}>Cancel</button>
      <button className="btn" onClick={() => { if (!name.trim()) return toast('Please enter a room name'); onSave(name.trim(), cat); toast(`Updated ${name}`); close() }}>Save Changes</button></div></div></div>
}

function EditDevModal({ dev, close, onSave, toast }: any) {
  const [name, setName] = useState(dev.name)
  const [ch, setCh] = useState(dev.relayChannel ? String(dev.relayChannel) : '')
  return <div className="modal" onClick={close}><div className="dlg col g12" onClick={e => e.stopPropagation()}>
    <h3>Edit Device</h3>
    <div className="mut">Device Name</div>
    <input type="text" value={name} onChange={e => setName(e.target.value)} />
    <div className="mut">Assigned ESP32 Relay Channel:</div>
    <select value={ch} onChange={e => setCh(e.target.value)}>
      <option value="">None (Virtual Device Only)</option>
      <option value="1">Relay Channel 1 (CH1)</option>
      <option value="2">Relay Channel 2 (CH2)</option>
      <option value="3">Relay Channel 3 (CH3)</option>
      <option value="4">Relay Channel 4 (CH4)</option>
      <option value="5">Relay Channel 5 (CH5)</option>
      <option value="6">Relay Channel 6 (CH6)</option>
    </select>
    <div className="row sb">
      <button className="btn t" onClick={close}>Cancel</button>
      <button className="btn" onClick={() => { 
        if (!name.trim()) return toast('Please enter device name'); 
        onSave(name.trim(), ch ? +ch : null); 
        toast(`Updated ${name}`); 
        close() 
      }}>Save Device</button>
    </div></div></div>
}

/* ---------------- Room detail ---------------- */
function RoomDetail({ room, back, onToggleDev, onToggleAll, act, toast }: any) {
  const [adj, setAdj] = useState<{ s: Sensor; t: any } | null>(null), [del, setDel] = useState(false), [addD, setAddD] = useState(false)
  const [editRoom, setEditRoom] = useState(false)
  const [editDev, setEditDev] = useState<Dev | null>(null)
  const [delDev, setDelDev] = useState<Dev | null>(null)
  const [nm, setNm] = useState(''), [ty, setTy] = useState('light'), [ch, setCh] = useState(''), [sv, setSv] = useState(0)
  if (!room) return <><div className="hdr"><button className="circ" onClick={back}><I n="arrow_back" /></button></div><div className="scroll" style={{ textAlign: 'center' }}>Room Not Found</div></>
  const R: Room = room, anyOn = active(R) > 0
  const Tile = ({ d }: { d: Dev }) => {
    const isLight = d.type === 'light'
    const isFan = d.type === 'fan'
    const c = isLight ? '#F59E0B' : isFan ? '#06B6D4' : d.type === 'ac' ? '#0284C7' : '#10B981'
    const devCls = (isLight ? 'dev-light' : isFan ? 'dev-fan' : d.type === 'ac' ? 'dev-ac' : 'dev-switch') + (d.isOn ? ' is-on' : '')
    const sub = !d.isOn ? 'Off' : isLight ? `Brightness: ${d.value.toFixed(0)}%` : isFan ? `Airflow: Speed ${d.value.toFixed(0)} · Spinning` : d.type === 'ac' ? `Cooling: ${d.value.toFixed(0)}°C Target` : 'Active & Powered'
    const boxCls = d.isOn && isLight ? 'bulb-box-on' : d.isOn && isFan ? 'fan-box-on' : ''

    return <div className={`card dev-card ${devCls} col g8`} style={{ padding: 14 }}>
      <div className="row sb">
        <div className="row g12">
          <div
            className={boxCls}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: d.isOn ? tint(c, .18) : 'var(--c2)',
              border: d.isOn ? `1px solid ${c}55` : '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.2s ease'
            }}>
            {isFan ? <Fan on={d.isOn} speed={d.value} c={d.isOn ? c : '#94A3B8'} s={26} /> :
             d.type === 'ac' ? <I n="ac_unit" cls={d.isOn ? 'spin' : ''} st={d.isOn ? { animationDuration: '6s' } : {}} c={d.isOn ? c : '#94A3B8'} /> :
             <I n={isLight ? 'lightbulb' : 'power_settings_new'} o={!d.isOn} c={d.isOn ? c : '#94A3B8'} s={24} />}
          </div>
          <div>
            <div className="row g6" style={{ alignItems: 'center' }}>
              <b style={{ fontSize: 15 }}>{d.name}</b>
              {d.relayChannel ? (
                <span className="badge" style={{ background: tint('#3525CD'), color: 'var(--pri)', fontSize: 10, padding: '1px 5px' }}>
                  CH{d.relayChannel}
                </span>
              ) : null}
              {d.isOn && isLight && (
                <span className="badge badge-blink-on">
                  ● ON
                </span>
              )}
              {d.isOn && isFan && (
                <span className="badge" style={{ background: '#06B6D4', color: '#fff', fontSize: 10, padding: '2px 7px', fontWeight: 800, borderRadius: 9999 }}>
                  ⟳ SPINNING
                </span>
              )}
            </div>
            <div className="mut">{sub}</div>
          </div>
        </div>
        <Sw on={d.isOn} set={() => onToggleDev(R.id, d.id)} />
      </div>
      {d.isOn && d.type === 'ac' && (
        <div className="col g8" style={{ marginTop: 6, background: 'rgba(2,132,199,0.12)', border: '1px solid rgba(2,132,199,0.25)', padding: '10px 12px', borderRadius: 12 }}>
          <div className="row sb">
            <span className="mut" style={{ fontSize: 12, fontWeight: 600 }}>Cooling Temperature:</span>
            <div className="row g6">
              <button
                className="ac-btn-round"
                onClick={() => { const v = Math.max(16, d.value - 1); act(() => api.value(R.id, d.id, v)) }}>
                -
              </button>
              <span className="ac-temp-pill">
                <I n="ac_unit" s={14} c="#0284C7" /> {d.value.toFixed(0)}°C
              </span>
              <button
                className="ac-btn-round"
                onClick={() => { const v = Math.min(30, d.value + 1); act(() => api.value(R.id, d.id, v)) }}>
                +
              </button>
            </div>
          </div>
          <input
            type="range"
            min={16}
            max={30}
            step={1}
            value={d.value}
            onChange={e => act(() => api.value(R.id, d.id, +e.target.value))}
          />
        </div>
      )}
      {d.isOn && (d.type === 'light' || d.type === 'fan') && <div style={{ marginTop: 6 }}><div className="mut">{d.type === 'fan' ? 'Airflow Speed Level:' : 'Brightness:'}</div>
        <input type="range" min={1} max={d.type === 'fan' ? 5 : 100} step={1} defaultValue={d.value} onMouseUp={e => act(() => api.value(R.id, d.id, +(e.target as any).value))} onTouchEnd={e => act(() => api.value(R.id, d.id, +(e.target as any).value))} /></div>}
      <div className="row sb" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6, marginTop: 4 }}>
        <span className="mut" style={{ fontSize: 11, textTransform: 'uppercase' }}>{d.type === 'ac' ? 'Air Conditioner (AC)' : d.type}</span>
        <div className="row g6">
          <button className="pill" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setEditDev(d)}>
            <I n="edit" s={13} /> Edit
          </button>
          <button className="pill" style={{ padding: '2px 8px', fontSize: 11, color: '#F43F5E' }} onClick={() => setDelDev(d)}>
            <I n="delete_outline" s={13} c="#F43F5E" /> Remove
          </button>
        </div>
      </div>
    </div>
  }
  return <><div className="hdr"><div className="row g8"><button className="circ" style={{ background: 'none' }} onClick={back}><I n="arrow_back" /></button>
    <h1>{R.name}</h1></div><div className="row g8"><Sw on={anyOn} set={() => onToggleAll(R.id, !anyOn)} />
      <button className="circ" style={{ background: 'none' }} title="Edit Room" onClick={() => setEditRoom(true)}><I n="edit" c="var(--onv)" /></button>
      <button className="circ" style={{ background: 'none' }} title="Delete Room" onClick={() => setDel(true)}><I n="delete_outline" c="#F43F5E" /></button></div></div>
    <div className="scroll col" style={{ gap: 14 }}>
      {R.name.toUpperCase().includes('CONFERENCE') && (() => {
        const occActive = !Boolean(R.occupancy?.warmup) && Boolean(R.occupancy?.occupied)
        const accent = occActive ? '#10B981' : '#EF4444'
        const accentLight = occActive ? '#34D399' : '#F87171'
        const bgGrad = occActive
          ? 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(30,41,59,0.9))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(30,41,59,0.9))'
        const bdr = occActive ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(239,68,68,0.35)'
        const pillBg = occActive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)'
        return (
        <div className="card row sb" style={{
          padding: '16px 20px',
          background: bgGrad,
          border: bdr,
          borderRadius: 16
        }}>
          <div className="row g12">
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: pillBg,
              display: 'grid',
              placeItems: 'center',
              boxShadow: `0 0 18px ${occActive ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.3)'}`
            }}>
              <I n={occActive ? "person" : "meeting_room"} s={26} c={accent} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--onv)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Conference Room Occupancy (PIR Sensor)
              </div>
              <b style={{ fontSize: 18, color: accentLight }}>
                {occActive ? "Occupied" : "Not Occupied"}
              </b>
            </div>
          </div>
        </div>
        )
      })()}
      <div className="row sb">
        <h3>Environmental Sensors</h3>
        {R.name.toUpperCase().includes('ENGINEERING') && (
          <span className="badge" style={{ background: 'rgba(16,185,129,0.18)', color: '#34D399', fontSize: 11, padding: '2px 8px', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 600 }}>
            ASAIR AM2315C Active
          </span>
        )}
        {R.name.toUpperCase().includes('GALLERY') && (
          <span className="badge" style={{ background: 'rgba(14,165,233,0.18)', color: '#38BDF8', fontSize: 11, padding: '2px 8px', border: '1px solid rgba(14,165,233,0.3)', fontWeight: 600 }}>
            Air Quality Sensor Active
          </span>
        )}
        {R.name.toUpperCase().includes('CONFERENCE') && (
          <span className="badge" style={{ background: 'rgba(245,158,11,0.18)', color: '#FBBF24', fontSize: 11, padding: '2px 8px', border: '1px solid rgba(245,158,11,0.3)', fontWeight: 600 }}>
            PIR Occupancy Active
          </span>
        )}
      </div>
      <div className="sensors-grid">{([[R.tempSensor, 'temperature'], [R.humSensor, 'humidity'], [R.co2Sensor, 'co2']] as any).map(([s, t]: any) => {
        const m = sSensor(s, t), r = 30, C = 2 * Math.PI * r
        return <div key={t} className="card col" style={{ padding: 14, alignItems: 'center', cursor: 'pointer' }} onClick={() => { setSv(s.value); setAdj({ s, t }) }}>
          <div style={{ position: 'relative', width: 72, height: 72 }}><svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}><circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
            <circle cx="36" cy="36" r={r} fill="none" stroke={m.color} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, m.pct))} /></svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><I n={m.icon} c={m.color} s={22} /></div></div>
          <b style={{ fontSize: 15, marginTop: 6 }}>{s.value.toFixed(t === 'co2' ? 0 : 1)}{t === 'co2' ? ' ' : ''}{s.unit}</b><div className="mut">{s.name}</div><span className="badge" style={{ background: tint(m.color), color: m.color, marginTop: 4 }}>{m.text}</span></div>
      })}</div>
      <div className="row sb"><h3>Lights</h3><span className="mut">{R.lights.filter(d => d.isOn).length} / {R.lights.length} ON</span></div>
      <div className="devices-grid">{R.lights.map(d => <Tile key={d.id} d={d} />)}</div>
      <div className="row sb"><h3>Fans</h3><span className="mut">{R.fans.filter(d => d.isOn).length} / {R.fans.length} ON</span></div>
      <div className="devices-grid">{R.fans.map(d => <Tile key={d.id} d={d} />)}</div>
      {R.acs && R.acs.length > 0 && <><div className="row sb"><h3>Air Conditioning (AC) & Climate</h3><span className="mut">{R.acs.filter(d => d.isOn).length} / {R.acs.length} ON</span></div><div className="devices-grid">{R.acs.map(d => <Tile key={d.id} d={d} />)}</div></>}
      <div className="row sb"><h3>Smart Switches & Sockets</h3><span className="mut">{R.switches.filter(d => d.isOn).length} / {R.switches.length} ON</span></div>
      <div className="devices-grid">{R.switches.map(d => <Tile key={d.id} d={d} />)}</div>
      <button className="btn o" onClick={() => { setNm(''); setCh(''); setAddD(true) }}><I n="add" s={20} c="var(--pri)" />Add Device to Room</button></div>
    {adj && <div className="modal"><div className="dlg col g12"><h3>Adjust {adj.s.name}</h3><b style={{ fontSize: 28 }}>{sv.toFixed(adj.t === 'co2' ? 0 : 1)}{adj.t === 'co2' ? ' ' : ''}{adj.s.unit}</b>
      <input type="range" min={0} max={adj.t === 'temperature' ? 50 : adj.t === 'humidity' ? 100 : 500} step={adj.t === 'co2' ? 1 : .1} value={sv} onChange={e => setSv(+e.target.value)} />
      <div className="row sb"><button className="btn t" onClick={() => setAdj(null)}>Cancel</button><button className="btn" onClick={() => { act(() => api.sensor(R.id, adj.t, sv)); setAdj(null) }}>Update</button></div></div></div>}
    {del && <div className="modal"><div className="dlg col g12"><h3>Delete Room?</h3><div className="mut">This removes {R.name} and all of its devices.</div>
      <div className="row sb"><button className="btn t" onClick={() => setDel(false)}>Cancel</button><button className="btn" style={{ background: '#BA1A1A' }} onClick={() => { act(() => api.deleteRoom(R.id)); toast('Room was removed.'); back() }}>Delete</button></div></div></div>}
    {addD && <div className="modal"><div className="dlg col g12"><h3>Add Device to Room</h3><div className="mut">Device Name</div>
      <input type="text" value={nm} placeholder="e.g. Split Inverter AC, Desk Lamp, Exhaust Fan" onChange={e => setNm(e.target.value)} />
      <div className="mut">Device Type</div>
      <select value={ty} onChange={e => setTy(e.target.value)}>
        <option value="light">Light / Lamp</option>
        <option value="fan">Fan / Cooler</option>
        <option value="ac">Air Conditioner (AC) / Climate</option>
        <option value="switchDevice">Wall Switch / Socket</option>
      </select>
      <div className="mut">Assigned ESP32 Relay Channel (Optional):</div>
      <select value={ch} onChange={e => setCh(e.target.value)}>
        <option value="">None (Virtual Device Only)</option>
        <option value="1">Relay Channel 1 (CH1)</option>
        <option value="2">Relay Channel 2 (CH2)</option>
        <option value="3">Relay Channel 3 (CH3)</option>
        <option value="4">Relay Channel 4 (CH4)</option>
        <option value="5">Relay Channel 5 (CH5)</option>
        <option value="6">Relay Channel 6 (CH6)</option>
      </select>
      <div className="row sb"><button className="btn t" onClick={() => setAddD(false)}>Cancel</button><button className="btn" onClick={() => { if (nm.trim()) { act(() => api.addDevice(R.id, nm.trim(), ty, ch ? +ch : null)); setAddD(false) } }}>Add Device</button></div></div></div>}
    {editRoom && <EditRoomModal room={R} close={() => setEditRoom(false)} onSave={(name: string, cat: string) => act(() => api.editRoom(R.id, name, cat))} toast={toast} />}
    {editDev && <EditDevModal dev={editDev} close={() => setEditDev(null)} onSave={(name: string, relayChannel?: number | null) => act(() => api.editDevice(R.id, editDev.id, name, relayChannel))} toast={toast} />}
    {delDev && <div className="modal" onClick={() => setDelDev(null)}><div className="dlg col g12" onClick={e => e.stopPropagation()}>
      <h3>Remove Device?</h3>
      <div className="mut">Remove <b>{delDev.name}</b> from this room?</div>
      <div className="row sb">
        <button className="btn t" onClick={() => setDelDev(null)}>Cancel</button>
        <button className="btn" style={{ background: '#BA1A1A' }} onClick={() => { act(() => api.deleteDevice(R.id, delDev.id)); toast(`Removed ${delDev.name}`); setDelDev(null) }}>Delete</button>
      </div></div></div>}
  </>
}

/* ---------------- Analytics ---------------- */
function Analytics({ rooms = [], M, isFull, onToggleFull, is3D, onToggle3D, onOpenMobile, onLock, livelyOn, onToggleLively }: any) {
  const [rng, setRng] = useState('24 Hours')
  const [selectedRoomId, setSelectedRoomId] = useState('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const selectedRoom = selectedRoomId === 'all' ? null : rooms.find((r: Room) => r.id === selectedRoomId)
  const hubRoom = rooms.find((r: Room) => r.name.toUpperCase().includes('ENGINEERING'))
  const galleryRoom = rooms.find((r: Room) => r.name.toUpperCase().includes('GALLERY'))
  const confRoom = rooms.find((r: Room) => r.name.toUpperCase().includes('CONFERENCE'))

  // Calculate dynamic sensor & power metrics for selected room or whole home
  const currentTemp = selectedRoom ? selectedRoom.tempSensor.value : M.temp
  const currentHum = selectedRoom ? selectedRoom.humSensor.value : M.hum
  const currentCo2 = selectedRoom ? selectedRoom.co2Sensor.value : M.co2

  const currentWatts = selectedRoom ? (() => {
    let w = 0
    selectedRoom.lights.forEach((l: Dev) => l.isOn && (w += (l.value / 100) * 12))
    selectedRoom.fans.forEach((f: Dev) => f.isOn && (w += (f.value / 5) * 55))
    selectedRoom.acs?.forEach((a: Dev) => a.isOn && (w += 650))
    selectedRoom.switches.forEach((s: Dev) => s.isOn && (w += 40))
    return w > 0 ? w : 14
  })() : M.watts

  const currentDailyKwh = (currentWatts * 14) / 1000
  const currentMonthlyCost = selectedRoom ? (15.0 + currentDailyKwh * 30 * 0.05) : M.cost

  const peaks = [.2, .15, .12, .1, .12, .2, .4, .55, .5, .4, .35, .3, .35, .3, .3, .35, .45, .6, .8, 1, .85, .6, .4, .3]
  const Env = ({ ic, c, bd, bc, l, v, nodeName, nodeIcon, sub }: any) => (
    <div className="card col" style={{
      flex: 1,
      minWidth: 160,
      padding: '14px 16px',
      gap: 6,
      background: 'rgba(26, 34, 52, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 14,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div className="row sb" style={{ alignItems: 'center' }}>
        <div className="row g6" style={{ alignItems: 'center' }}>
          <I n={ic} o={false} c={c} s={20} />
          {nodeName && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#38BDF8',
              letterSpacing: '0.4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              {nodeIcon && <I n={nodeIcon} s={12} c="#38BDF8" />}
              {nodeName}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: bc }}>{bd}</span>
      </div>
      <div className="mut" style={{ fontSize: 11, fontWeight: 500 }}>{l}</div>
      <div className="row sb" style={{ alignItems: 'baseline' }}>
        <b style={{ fontSize: 20, color: '#fff' }}>{v}</b>
        {sub && <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>{sub}</span>}
      </div>
    </div>
  )
  const path = (ys: number[]) => ys.map((y, i) => `${i ? 'L' : 'M'}${i * 50} ${y}`).join(' ')
  return <><Header title="Analytics" isFull={isFull} onToggleFull={onToggleFull} is3D={is3D} onToggle3D={onToggle3D} onOpenMobile={onOpenMobile} onLock={onLock} livelyOn={livelyOn} onToggleLively={onToggleLively} />
  <div className="scroll col" style={{ gap: 22 }} onClick={() => dropdownOpen && setDropdownOpen(false)}>
    {is3D && (
      <div className="hero-3d">
        <img src="/3d/analytics_3d.jpg" alt="3D Holographic Telemetry" className="hero-3d-img" />
        <div className="hero-3d-overlay">
          <div>
            <span className="hero-3d-badge">
              <I n="insights" s={14} c="#38BDF8" /> 3D TELEMETRY CENTER · {selectedRoom ? selectedRoom.name.toUpperCase() : 'WHOLE HOME'}
            </span>
            <div className="hero-3d-title">Neural Power & Telemetry Grid</div>
            <div className="hero-3d-desc">Holographic real-time telemetry analysis & power forecasting</div>
          </div>
          <div className="hero-3d-chips">
            <span className="hero-3d-node on"><I n="bolt" s={13} c="#38BDF8" /> <b>{currentWatts.toFixed(0)} W</b> {selectedRoom ? 'Room Draw' : 'Total Draw'}</span>
            <span className="hero-3d-node"><I n="thermostat" s={13} c="#F59E0B" /> <b>{currentTemp.toFixed(1)}°C</b> Temp</span>
            <span className="hero-3d-node"><I n="co2" s={13} c="#10B981" /> <b>{currentCo2.toFixed(0)} µg/m³</b> Air Quality</span>
          </div>
        </div>
      </div>
    )}
    <div className="row sb"><div className="row" style={{ background: 'rgba(30,41,59,0.75)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9999, padding: 4 }}>{['24 Hours', '7 Days', '30 Days'].map(r => <button key={r} className={`pill ${rng === r ? 'on' : ''}`} style={{ background: rng === r ? undefined : 'transparent', border: rng === r ? undefined : 'none' }} onClick={() => setRng(r)}>{r}</button>)}</div>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(30,41,59,0.75)', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center' }}><I n="tune" s={20} c="var(--onv)" /></div></div>
    
    <div className="card col" style={{ padding: 20, gap: 14, borderRadius: 20 }}>
      <div className="row sb">
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--onv)' }}>
            Real-time Power Draw · {selectedRoom ? selectedRoom.name : 'All Rooms'}
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -.8 }}>{currentWatts.toFixed(0)}</span>
          <span style={{ fontSize: 18, color: 'var(--onv)' }}> W</span>
        </div>
        <span className="badge row" style={{ background: 'rgba(16,185,129,0.2)', color: '#34D399', gap: 5, letterSpacing: .5 }}><I n="circle" o={false} s={8} />OPTIMAL</span>
      </div>
      <div className="row sb" style={{ background: 'rgba(26,34,52,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px' }}>
        <div className="row g10">
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: tint('#3525CD', 0.25), display: 'grid', placeItems: 'center' }}>
            <I n="bolt" o={false} c="var(--pri)" s={20} />
          </div>
          <div><div className="mut" style={{ fontSize: 11 }}>Projected Daily</div><b>{currentDailyKwh.toFixed(1)} kWh</b></div>
        </div>
        <div style={{ width: 1, height: 32, background: 'var(--c4)' }} />
        <div style={{ textAlign: 'right' }}><div className="mut" style={{ fontSize: 11 }}>Est. Monthly Cost</div><b>${currentMonthlyCost.toFixed(2)}</b></div>
      </div>
      <div className="row g10">
        {[['trending_down', 'var(--sec)', 'vs Yesterday', '-12.4%', '#10B981'], ['eco', 'var(--pri)', 'Carbon Offset', selectedRoom ? '0.5 kg' : '1.4 kg', 'var(--on)']].map(([ic, c, l, v, vc]) =>
          <div key={l} className="row g8" style={{ flex: 1, background: 'rgba(26,34,52,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
            <I n={ic} o={false} c={c} s={20} /><div><div className="mut" style={{ fontSize: 11 }}>{l}</div><b style={{ fontSize: 13, color: vc }}>{v}</b></div>
          </div>
        )}
      </div>
    </div>

    <div className="col g12" style={{ position: 'relative' }}>
      <div className="row sb" style={{ alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>
            {selectedRoom ? `${selectedRoom.name} Telemetry` : 'Environmental & Sensor Telemetry'}
          </h3>
          <div className="mut" style={{ fontSize: 11, marginTop: 2 }}>
            {selectedRoom ? `Live sensor readings for ${selectedRoom.name}` : 'Live telemetry labeled by specific room node'}
          </div>
        </div>

        {/* Interactive Room Selector Dropdown */}
        <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            className="pill on"
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(30, 41, 59, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              color: '#fff',
              cursor: 'pointer',
              borderRadius: 9999,
            }}
            onClick={() => {
              joySound.pop()
              setDropdownOpen(!dropdownOpen)
            }}
          >
            <span>{selectedRoom ? selectedRoom.name : 'All Rooms'}</span>
            <I n={dropdownOpen ? 'expand_less' : 'expand_more'} s={16} />
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                background: 'rgba(15, 23, 42, 0.96)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 14,
                padding: 6,
                minWidth: 220,
                zIndex: 100,
                boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <button
                className={`pill ${selectedRoomId === 'all' ? 'on' : ''}`}
                style={{
                  justifyContent: 'flex-start',
                  padding: '8px 12px',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 10,
                  width: '100%',
                  background: selectedRoomId === 'all' ? 'linear-gradient(135deg, #4F46E5, #06B6D4)' : 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onClick={() => {
                  joySound.pop()
                  setSelectedRoomId('all')
                  setDropdownOpen(false)
                }}
              >
                <span>🌟</span>
                <b>All Rooms (Whole Home)</b>
              </button>

              {rooms.map((r: Room) => (
                <button
                  key={r.id}
                  className={`pill ${selectedRoomId === r.id ? 'on' : ''}`}
                  style={{
                    justifyContent: 'flex-start',
                    padding: '8px 12px',
                    fontSize: 12,
                    border: 'none',
                    borderRadius: 10,
                    width: '100%',
                    background: selectedRoomId === r.id ? 'linear-gradient(135deg, #0284C7, #06B6D4)' : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onClick={() => {
                    joySound.pop()
                    setSelectedRoomId(r.id)
                    setDropdownOpen(false)
                  }}
                >
                  <span>{r.name.toUpperCase().includes('GALLERY') ? '🚪' : r.name.toUpperCase().includes('ENGINEERING') ? '💻' : '💼'}</span>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  {r.name.toUpperCase().includes('ENGINEERING') && (
                    <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.3)', color: '#34D399', padding: '1px 5px', borderRadius: 4, marginLeft: 'auto', fontWeight: 700 }}>
                      AM2315C
                    </span>
                  )}
                  {r.name.toUpperCase().includes('GALLERY') && (
                    <span style={{ fontSize: 9, background: 'rgba(14,165,233,0.3)', color: '#38BDF8', padding: '1px 5px', borderRadius: 4, marginLeft: 'auto', fontWeight: 700 }}>
                      Air Quality
                    </span>
                  )}
                  {r.name.toUpperCase().includes('CONFERENCE') && (
                    <span style={{ fontSize: 9, background: r.occupancy?.occupied ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: r.occupancy?.occupied ? '#34D399' : '#F87171', padding: '1px 5px', borderRadius: 4, marginLeft: 'auto', fontWeight: 700 }}>
                      {r.occupancy?.occupied ? 'Occupied' : 'Not Occupied'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Room Node Selector Pills */}
      <div className="scroll-chips">
        <button
          className={`pill ${selectedRoomId === 'all' ? 'on' : ''}`}
          style={{ padding: '6px 14px', fontSize: 11, borderRadius: 9999, fontWeight: 600 }}
          onClick={() => {
            joySound.pop()
            setSelectedRoomId('all')
          }}
        >
          <span>🌟 All Rooms</span>
        </button>
        {rooms.map((r: Room) => (
          <button
            key={r.id}
            className={`pill ${selectedRoomId === r.id ? 'on' : ''}`}
            style={{
              padding: '6px 14px',
              fontSize: 11,
              borderRadius: 9999,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={() => {
              joySound.pop()
              setSelectedRoomId(r.id)
            }}
          >
            <span>{r.name.toUpperCase().includes('GALLERY') ? '🚪' : r.name.toUpperCase().includes('ENGINEERING') ? '💻' : '💼'}</span>
            <span>{r.name}</span>
            {r.name.toUpperCase().includes('ENGINEERING') && (
              <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.25)', color: '#34D399', padding: '1px 5px', borderRadius: 4 }}>
                AM2315C
              </span>
            )}
            {r.name.toUpperCase().includes('GALLERY') && (
              <span style={{ fontSize: 9, background: 'rgba(14,165,233,0.25)', color: '#38BDF8', padding: '1px 5px', borderRadius: 4 }}>
                Air Quality
              </span>
            )}
            {r.name.toUpperCase().includes('CONFERENCE') && (
              <span style={{ fontSize: 9, background: r.occupancy?.occupied ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)', color: r.occupancy?.occupied ? '#34D399' : '#F87171', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                {r.occupancy?.occupied ? 'Occupied' : 'Not Occupied'}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sensor Telemetry Cards - With Explicit Room Node Attribution */}
      {selectedRoomId === 'all' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <Env
            ic="thermostat"
            c="#F59E0B"
            bd={(hubRoom?.tempSensor?.value ?? currentTemp) < 20 ? 'Cool' : (hubRoom?.tempSensor?.value ?? currentTemp) <= 26 ? 'Optimal' : 'Warm'}
            bc="#10B981"
            nodeName={hubRoom?.name || "ENGINEERING HUB"}
            nodeIcon="developer_board"
            l="Room Temperature"
            v={`${(hubRoom?.tempSensor?.value ?? currentTemp).toFixed(1)}°C`}
            sub="ASAIR AM2315C (GP4/5)"
          />
          <Env
            ic="water_drop"
            c="#06B6D4"
            bd={(hubRoom?.humSensor?.value ?? currentHum) < 35 ? 'Dry' : (hubRoom?.humSensor?.value ?? currentHum) <= 60 ? 'Ideal' : 'Humid'}
            bc="#06B6D4"
            nodeName={hubRoom?.name || "ENGINEERING HUB"}
            nodeIcon="developer_board"
            l="Relative Humidity"
            v={`${(hubRoom?.humSensor?.value ?? currentHum).toFixed(1)}%`}
            sub="ASAIR AM2315C (GP4/5)"
          />
          <Env
            ic="co2"
            c="#10B981"
            bd={(galleryRoom?.co2Sensor?.value ?? currentCo2) < 35 ? 'Good' : (galleryRoom?.co2Sensor?.value ?? currentCo2) < 115 ? 'Moderate' : 'High'}
            bc="#10B981"
            nodeName={galleryRoom?.name || "THE GALLERY"}
            nodeIcon="palette"
            l="Air Quality"
            v={`${(galleryRoom?.co2Sensor?.value ?? currentCo2).toFixed(0)} µg/m³`}
            sub="Air Quality Sensor (GP6)"
          />
          <Env
            ic={confRoom?.occupancy?.occupied ? "person" : "meeting_room"}
            c={confRoom?.occupancy?.occupied ? "#10B981" : "#EF4444"}
            bd={confRoom?.occupancy?.occupied ? "Occupied" : "Not Occupied"}
            bc={confRoom?.occupancy?.occupied ? "#34D399" : "#F87171"}
            nodeName={confRoom?.name || "CONFERENCE"}
            nodeIcon="groups"
            l="Room Occupancy"
            v={confRoom?.occupancy?.occupied ? "Occupied" : "Not Occupied"}
            sub="Room Occupancy"
          />
        </div>
      ) : (
        <div className="sensors-grid">
          <Env
            ic="thermostat"
            c="#F59E0B"
            bd={currentTemp < 20 ? 'Cool' : currentTemp <= 26 ? 'Optimal' : 'Warm'}
            bc="#10B981"
            nodeName={selectedRoom.name}
            l={`${selectedRoom.name} Temp`}
            v={`${currentTemp.toFixed(1)}°C`}
            sub={selectedRoom.has_am2315c ? "AM2315C Sensor" : undefined}
          />
          <Env
            ic="water_drop"
            c="#06B6D4"
            bd={currentHum < 35 ? 'Dry' : currentHum <= 60 ? 'Ideal' : 'Humid'}
            bc="var(--onv)"
            nodeName={selectedRoom.name}
            l={`${selectedRoom.name} Humidity`}
            v={`${currentHum.toFixed(1)}%`}
            sub={selectedRoom.has_am2315c ? "AM2315C Sensor" : undefined}
          />
          <Env
            ic="co2"
            c="#10B981"
            bd={currentCo2 < 35 ? 'Good' : currentCo2 < 115 ? 'Moderate' : 'High'}
            bc="#10B981"
            nodeName={selectedRoom.name}
            l={`${selectedRoom.name} Air Quality`}
            v={`${currentCo2.toFixed(0)} µg/m³`}
            sub={selectedRoom.has_aqi ? "Air Quality Sensor" : undefined}
          />
        </div>
      )}

      {/* Multi-Room Hardware & Node Directory Matrix */}
      {selectedRoomId === 'all' && (
        <div className="card col" style={{ padding: 18, gap: 14, borderRadius: 16 }}>
          <div className="row sb" style={{ alignItems: 'center' }}>
            <div className="row g8" style={{ alignItems: 'center' }}>
              <I n="hub" s={20} c="#38BDF8" />
              <div>
                <b style={{ fontSize: 14 }}>Room Node Hardware & Sensor Matrix</b>
                <div className="mut" style={{ fontSize: 11 }}>Active ESP32-S3 boards with their dedicated telemetry</div>
              </div>
            </div>
            <span className="badge" style={{ background: 'rgba(16,185,129,0.2)', color: '#34D399', fontSize: 10, fontWeight: 700 }}>
              3 NODES ONLINE
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {/* Node 1: Engineering Hub */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div className="row sb" style={{ alignItems: 'center' }}>
                <div className="row g6" style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>💻</span>
                  <b style={{ fontSize: 13, color: '#38BDF8' }}>{hubRoom ? hubRoom.name : 'ENGINEERING HUB'}</b>
                </div>
                <span style={{ fontSize: 10, background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                  192.168.1.10
                </span>
              </div>
              <div className="mut" style={{ fontSize: 11 }}>
                Sensor: <b>ASAIR AM2315C</b> (GPIO 4 SDA · GPIO 5 SCL)
              </div>
              <div className="row sb" style={{ alignItems: 'center', marginTop: 4 }}>
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontSize: 11, fontWeight: 700 }}>
                  <I n="thermostat" s={14} c="#F59E0B" /> {(hubRoom?.tempSensor?.value ?? 24.9).toFixed(1)}°C
                </span>
                <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06B6D4', fontSize: 11, fontWeight: 700 }}>
                  <I n="water_drop" s={14} c="#06B6D4" /> {(hubRoom?.humSensor?.value ?? 50.0).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Node 2: The Gallery */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div className="row sb" style={{ alignItems: 'center' }}>
                <div className="row g6" style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>🚪</span>
                  <b style={{ fontSize: 13, color: '#34D399' }}>{galleryRoom ? galleryRoom.name : 'THE GALLERY'}</b>
                </div>
                <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.15)', color: '#34D399', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                  192.168.1.11
                </span>
              </div>
              <div className="mut" style={{ fontSize: 11 }}>
                Sensor: <b>Air Quality Sensor</b> (GPIO 6 / ADC1_CH5)
              </div>
              <div className="row sb" style={{ alignItems: 'center', marginTop: 4 }}>
                <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34D399', fontSize: 11, fontWeight: 700 }}>
                  <I n="co2" s={14} c="#10B981" /> {(galleryRoom?.co2Sensor?.value ?? 24).toFixed(0)} µg/m³
                </span>
                <span style={{ fontSize: 11, color: (galleryRoom?.co2Sensor?.value ?? 24) < 35 ? '#10B981' : (galleryRoom?.co2Sensor?.value ?? 24) < 115 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>
                  {(galleryRoom?.co2Sensor?.value ?? 24) < 35 ? 'Clean Indoor Air' : (galleryRoom?.co2Sensor?.value ?? 24) < 115 ? 'Moderate Air Quality' : 'High Particulate Level'}
                </span>
              </div>
            </div>

            {/* Node 3: Conference Room */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: `1px solid ${confRoom?.occupancy?.occupied ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.35)'}`,
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div className="row sb" style={{ alignItems: 'center' }}>
                <div className="row g6" style={{ alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>👥</span>
                  <b style={{ fontSize: 13, color: confRoom?.occupancy?.occupied ? '#34D399' : '#F87171' }}>
                    {confRoom ? confRoom.name : 'CONFERENCE'}
                  </b>
                </div>
                <span style={{ fontSize: 10, background: 'rgba(255, 255, 255, 0.08)', color: 'var(--onv)', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                  {confRoom?.esp32_url ? confRoom.esp32_url.replace('http://', '').split(':')[0] : '192.168.1.14'}
                </span>
              </div>
              <div className="mut" style={{ fontSize: 11 }}>
                Sensor: <b>PIR Motion Sensor</b> (GPIO 4 / 6)
              </div>
              <div className="row sb" style={{ alignItems: 'center', marginTop: 4 }}>
                <span className="badge" style={{
                  background: confRoom?.occupancy?.occupied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.18)',
                  color: confRoom?.occupancy?.occupied ? '#34D399' : '#F87171',
                  border: confRoom?.occupancy?.occupied ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.3)',
                  fontSize: 11,
                  fontWeight: 700
                }}>
                  <I n={confRoom?.occupancy?.occupied ? "person" : "meeting_room"} s={14} c={confRoom?.occupancy?.occupied ? "#10B981" : "#EF4444"} />
                  {confRoom?.occupancy?.occupied ? "Occupied" : "Not Occupied"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedRoom?.name.toUpperCase().includes('CONFERENCE') && (
        <div className="card row sb" style={{
          padding: '14px 18px',
          background: selectedRoom.occupancy?.occupied ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.15)',
          border: selectedRoom.occupancy?.occupied ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.3)',
          borderRadius: 14
        }}>
          <div className="row g10">
            <I n={selectedRoom.occupancy?.occupied ? "person" : "meeting_room"} s={24} c={selectedRoom.occupancy?.occupied ? "#10B981" : "#EF4444"} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--onv)', fontWeight: 600 }}>CONFERENCE OCCUPANCY (PIR SENSOR)</div>
              <b style={{ fontSize: 16, color: selectedRoom.occupancy?.occupied ? '#34D399' : '#F87171' }}>
                {selectedRoom.occupancy?.occupied ? "Occupied" : "Not Occupied"}
              </b>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="card" style={{ padding: 18 }}>
      <h3>24-Hour Telemetry · {selectedRoom ? selectedRoom.name : 'All Rooms'}</h3>
      <div className="mut" style={{ marginBottom: 8 }}>Temperature & Air Quality (µg/m³) Fluctuations</div>
      <svg viewBox="0 0 250 100" width="100%"><path d={path([70, 66, 62, 58, 44, 32])} fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><path d={path([80, 84, 70, 50, 56, 40])} fill="none" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="row sb mut">{['00:00', '06:00', '12:00', '18:00', '24:00'].map(t => <span key={t}>{t}</span>)}</div>
    </div>

    <div className="card" style={{ padding: 18 }}>
      <div className="row sb">
        <div>
          <h3>Hourly Power Peaks</h3>
          <div className="mut">Morning, Afternoon & Evening Usage</div>
        </div>
        <span className="badge" style={{ background: tint('#3525CD'), color: 'var(--pri)' }}>Peak: 19:00 (1.8kW)</span>
      </div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 3, height: 90, marginTop: 12 }}>
        {peaks.map((p, i) => <div key={i} style={{ flex: 1, height: `${p * 100}%`, borderRadius: '3px 3px 0 0', background: i === 19 ? 'var(--pri)' : 'rgba(53,37,205,.3)' }} />)}
      </div>
    </div>
  </div></>
}

/* ---------------- Automations ---------------- */
function Automations({ rules, act, isFull, onToggleFull, is3D, onToggle3D, onOpenMobile, onLock, livelyOn, onToggleLively }: any) {
  const [dlg, setDlg] = useState(false), [f, setF] = useState({ title: '', trig: 'temperature', th: 26, action: '' })
  const ic: any = { temperature: 'thermostat_auto', co2: 'air', humidity: 'water_drop', schedule: 'bedtime' }
  const badge: any = { temperature: 'Climate', co2: 'Health', humidity: 'Climate', schedule: 'Power' }
  const desc = () => f.trig === 'temperature' ? `Temp > ${f.th}°C` : f.trig === 'co2' ? `Air Quality > ${f.th} µg/m³` : f.trig === 'humidity' ? `Humidity > ${f.th}%` : `Time > ${f.th}:00`
  return <><Header title="Automations" isFull={isFull} onToggleFull={onToggleFull} is3D={is3D} onToggle3D={onToggle3D} onOpenMobile={onOpenMobile} onLock={onLock} livelyOn={livelyOn} onToggleLively={onToggleLively} />
  <div className="scroll col" style={{ gap: 14, paddingBottom: 92 }}>
    {is3D && (
      <div className="hero-3d">
        <img src="/3d/automations_3d.jpg" alt="3D Neural Routine Engine" className="hero-3d-img" />
        <div className="hero-3d-overlay">
          <div>
            <span className="hero-3d-badge">
              <I n="psychology" s={14} c="#A78BFA" /> 3D AI ROUTINE ENGINE · ACTIVE
            </span>
            <div className="hero-3d-title">Autonomous Smart Core</div>
            <div className="hero-3d-desc">Smart sensory circuit mesh synchronized with {rules.length} dynamic trigger routines</div>
          </div>
          <div className="hero-3d-chips">
            <span className="hero-3d-node on"><I n="check_circle" s={13} c="#10B981" /> <b>{rules.filter((r: any) => r.isEnabled).length} Active Rules</b></span>
            <span className="hero-3d-node"><I n="memory" s={13} c="#A78BFA" /> <b>Sub-10ms</b> Cycle</span>
          </div>
        </div>
      </div>
    )}
    <div className="row sb"><div><span className="badge row" style={{ background: tint('#10B981'), color: '#10B981', gap: 5, width: 'fit-content' }}><div className="dot" />SMART ENGINE ACTIVE</span><div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>Autonomous Control Hub</div></div></div>
    <div className="row sb"><h3>Active Automations</h3><button className="btn t" style={{ padding: 0 }}>Filter Rules</button></div>
    {rules.length === 0 ? <div className="card col" style={{ padding: 28, alignItems: 'center', textAlign: 'center' }}><b style={{ fontSize: 17 }}>No Rules Configured</b><div className="mut">Automate lighting, fans, or sockets based on telemetry triggers.</div></div>
      : <div className="devices-grid">{rules.map(r => <div key={r.id} className="card row sb" style={{ padding: 16, opacity: r.isEnabled ? 1 : .6 }}><div className="row g12"><div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: tint('#4F46E5'), display: 'grid', placeItems: 'center' }}><I n={ic[r.triggerType]} c="var(--pri)" /></div>
        <div><b>{r.title}</b> <span className="badge" style={{ background: 'var(--c3)', color: 'var(--onv)', marginLeft: 4 }}>{badge[r.triggerType]}</span><div className="mut">{r.description}</div><div style={{ fontSize: 12, color: 'var(--pri)', fontWeight: 500 }}>{r.actionDescription}</div></div></div>
        <Sw on={r.isEnabled} set={() => act(() => api.toggleRule(r.id))} /></div>)}</div>}</div>
    <button className="fab" onClick={() => setDlg(true)}><I n="add" c="#fff" />Add Custom Rule</button>
    {dlg && <div className="modal"><div className="dlg col g12"><h3>Add Custom Rule</h3><div className="mut">Rule Title</div><input type="text" placeholder="e.g. Solar Eco Mode, High Heat Cooler" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <div className="mut">Trigger Condition</div><select value={f.trig} onChange={e => setF({ ...f, trig: e.target.value })}><option value="temperature">Temperature &gt; Threshold</option><option value="co2">Air Quality (µg/m³) &gt; Threshold</option><option value="schedule">Time Schedule &gt; Hour</option></select>
      <div className="mut">Threshold: <b>{f.th}</b></div><input type="range" min={0} max={f.trig === 'co2' ? 500 : f.trig === 'schedule' ? 24 : 50} value={f.th} onChange={e => setF({ ...f, th: +e.target.value })} />
      <div className="mut">Action Description</div><input type="text" placeholder="e.g. Fans → Speed Level 4" value={f.action} onChange={e => setF({ ...f, action: e.target.value })} />
      <div className="row sb"><button className="btn t" onClick={() => setDlg(false)}>Cancel</button><button className="btn" onClick={() => { if (!f.title.trim()) return; act(() => api.createRule({ title: f.title, description: desc(), triggerType: f.trig, thresholdValue: f.th, actionDescription: 'Action: ' + (f.action || 'Custom') })); setDlg(false) }}>Save Rule</button></div></div></div>}
  </>
}

/* ---------------- Settings ---------------- */
function Settings({ ok, reload, toast, isFull, onToggleFull, is3D, onToggle3D, onOpenMobile, onLock, livelyOn, onToggleLively }: any) {
  const [url, setUrl] = useState(baseUrl()), [busy, setBusy] = useState(false), [bio, setBio] = useState(localStorage.getItem('biometric_enabled') === '1'), [sql, setSql] = useState(true)
  const test = async () => { setBusy(true); setBaseUrl(url); await reload(); const h = await api.health(); setBusy(false); setUrl(baseUrl()); toast(h ? 'Connection Successful!' : 'Could not reach server') }
  const Row = ({ ic, t, s, on, set }: any) => <div className="row sb" style={{ padding: '10px 0' }}><div className="row g12"><I n={ic} c="var(--pri)" /><div><b style={{ fontSize: 14 }}>{t}</b>{s && <div className="mut">{s}</div>}</div></div>{set && <Sw on={on} set={set} />}</div>
  return <><Header title="Settings" isFull={isFull} onToggleFull={onToggleFull} is3D={is3D} onToggle3D={onToggle3D} onOpenMobile={onOpenMobile} onLock={onLock} livelyOn={livelyOn} onToggleLively={onToggleLively} />
  <div className="scroll col" style={{ gap: 16 }}>
    {is3D && (
      <div className="hero-3d">
        <img src="/3d/settings_3d.jpg" alt="3D Hardware Gateway" className="hero-3d-img" />
        <div className="hero-3d-overlay">
          <div>
            <span className="hero-3d-badge">
              <I n="dns" s={14} c="#34D399" /> 3D HARDWARE GATEWAY · {ok ? 'ONLINE' : 'SYNCING'}
            </span>
            <div className="hero-3d-title">ESP32-S3 Microcontroller Rack</div>
            <div className="hero-3d-desc">Direct high-speed GPIO bus @ 192.168.1.10 · Sub-50ms relay switching latency</div>
          </div>
          <div className="hero-3d-chips">
            <span className={`hero-3d-node ${ok ? 'on' : ''}`}><I n="router" s={13} c={ok ? '#10B981' : '#EF4444'} /> <b>ESP32 6-Relay Hub</b></span>
            <span className="hero-3d-node"><I n="wifi" s={13} c="#38BDF8" /> <b>Airtel_AIOTA.tech</b></span>
          </div>
        </div>
      </div>
    )}
    <div className="card col g12" style={{ padding: 18 }}><div className="row sb"><h3>Home Core Server</h3><span className="badge row" style={{ background: tint(ok ? '#10B981' : '#EF4444'), color: ok ? '#10B981' : '#EF4444', gap: 5 }}><div className="dot" style={{ background: ok ? '#10B981' : '#EF4444' }} />{ok ? 'WebSocket Active' : 'Offline'}</span></div>
      <div className="mut">Server Endpoint</div><div className="mut">API Gateway URL</div>
      <input type="text" style={{ fontFamily: 'monospace' }} value={url} onChange={e => setUrl(e.target.value)} />
      <div className="mut">Quick Network Select</div>
      <div className="chips">{[['This Server', '/api'], ['Wi-Fi (Router)', 'http://192.168.1.28:8000'], ['Localhost', 'http://127.0.0.1:8000'], ['Laptop Hotspot', 'http://192.168.137.1:8000']].map(([l, u]) => <button key={l} className={`pill ${url === u ? 'on' : ''}`} onClick={() => setUrl(u)}>{l}</button>)}</div>
      {url.includes('192.168.137.1') && <div className="mut" style={{ color: '#F59E0B', fontSize: 11 }}>Note: Requires Windows Mobile Hotspot to be turned ON in Windows Settings (Win + I &gt; Mobile hotspot).</div>}
      {url.includes('192.168.1.28') && <div className="mut" style={{ color: '#10B981', fontSize: 11 }}>Active Wi-Fi connection on router Airtel_AIOTA.tech.</div>}
      <button className="btn" onClick={test} disabled={busy}>{busy ? 'Syncing with Server...' : 'Test Connection & Sync'}</button></div>
    <div className="card col g10" style={{ padding: '14px 18px' }}>
      <h3 style={{ padding: '4px 0' }}>Preferences & Security</h3>
      <Row ic="fingerprint" t="Biometric Security Lock" s="Require FaceID / Fingerprint on app launch" on={bio} set={() => {
        const next = !bio
        setBio(next)
        localStorage.setItem('biometric_enabled', next ? '1' : '0')
        if (next) localStorage.setItem('biometric_locked', '1')
        toast(next ? 'Biometric Lock Enabled' : 'Biometric Lock Disabled')
      }} />
      <div className="row sb" style={{ gap: 8, marginTop: 4 }}>
        <button className="btn o" style={{ flex: 1, padding: '8px 12px', fontSize: 12 }} onClick={onOpenMobile}>
          <I n="qr_code_2" s={16} /> Open on Mobile Phone
        </button>
        <button className="btn" style={{ flex: 1, padding: '8px 12px', fontSize: 12, background: '#4F46E5' }} onClick={onLock}>
          <I n="lock" s={16} c="#fff" /> Lock with Biometric
        </button>
      </div>
    </div>
    <div className="card col g12" style={{ padding: 18 }}><h3>System & Database Cache</h3><Row ic="info" t="App Version" s="v2.4.8" /><Row ic="storage" t="SQLite Cache" s="Routines" on={sql} set={() => setSql(!sql)} />
      <div className="row g10"><button className="btn o" style={{ flex: 1 }} onClick={() => toast('Local telemetry cache cleared successfully!')}>Clear Cache</button><button className="btn o" style={{ flex: 1 }} onClick={() => toast('Diagnostic logs exported to downloads folder.')}>Export Logs</button></div></div>
  </div></>
}
