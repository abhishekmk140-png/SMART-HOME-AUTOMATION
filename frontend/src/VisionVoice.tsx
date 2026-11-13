import { useCallback, useEffect, useRef, useState } from 'react'
import { api, Room } from './api'
import { joySound } from './joy'

export interface VisionUiAction {
  type: string
  tab?: number
  room_id?: string
  state?: boolean
  mode?: 'wake' | 'direct'
}

interface VisionAssistantProps {
  rooms: Room[]
  activeRoomId: string | null
  uiState: Record<string, any>
  onRefresh: () => Promise<void> | void
  onApplyRooms?: (rooms: Room[]) => void
  onUiAction: (action: VisionUiAction) => void
  toast: (msg: string) => void
}

type VisionState = 'idle' | 'listening' | 'thinking' | 'speaking'

const WAKE_RE = /^(?:hey|hi|ok|okay|hello)?\s*\b(?:vision|vission|bishan|mission|reason|session)\b[\s,.:!?-]*/i

function pickBestAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return 'audio/webm'
}

function buildAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    autoGainControl: true,
    echoCancellation: false,
    noiseSuppression: false,
  }
  if (deviceId) base.deviceId = { exact: deviceId }
  return base
}

async function createBoostedPipeline(stream: MediaStream) {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  const actx: AudioContext = new AudioCtx()
  if (actx.state === 'suspended') {
    await actx.resume().catch(() => {})
  }
  const src = actx.createMediaStreamSource(stream)
  const gain = actx.createGain()
  gain.gain.value = 3.8

  const comp = actx.createDynamicsCompressor()
  comp.threshold.value = -20
  comp.knee.value = 18
  comp.ratio.value = 6
  comp.attack.value = 0.003
  comp.release.value = 0.15

  const analyser = actx.createAnalyser()
  analyser.fftSize = 512

  const dest = actx.createMediaStreamDestination()
  src.connect(gain)
  gain.connect(comp)
  comp.connect(analyser)
  comp.connect(dest)

  return { actx, analyser, outStream: dest.stream }
}

function getDynamicGreeting(rooms: Room[]): string {
  const hr = new Date().getHours()
  const tod = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'
  const activeDevices = rooms.reduce((acc, r) => {
    const devs = [...(r.lights || []), ...(r.fans || []), ...(r.acs || []), ...(r.switches || [])]
    return acc + devs.filter(d => d.isOn).length
  }, 0)
  const variants = [
    `${tod}! Vision here. What would you like me to do?`,
    `${tod}! I'm listening. Tell me what to do on the app or your laptop.`,
    activeDevices > 0
      ? `${tod}! ${activeDevices} devices are currently active. What should I do next?`
      : `${tod}! Vision is ready. How can I help you?`,
  ]
  return variants[Math.floor(Math.random() * variants.length)]
}

export function VisionAssistant({ rooms, activeRoomId, uiState, onRefresh, onApplyRooms, onUiAction, toast }: VisionAssistantProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<VisionState>('idle')
  const [autoOn, setAutoOn] = useState(() => localStorage.getItem('vision_handsfree_v2') === '1')
  const [directMode, setDirectMode] = useState(() => localStorage.getItem('vision_direct_mode') === '1')
  const [ttsOn, setTtsOn] = useState(true)
  const [micBlocked, setMicBlocked] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState(() => localStorage.getItem('vision_mic_id') || '')
  const [manualOverride, setManualOverride] = useState(false)
  const [inputText, setInputText] = useState('')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState('Tap the Mic button to greet Vision and give your voice command.')
  const [executed, setExecuted] = useState<string[]>([])

  const manualStreamRef = useRef<MediaStream | null>(null)
  const manualMediaRecRef = useRef<MediaRecorder | null>(null)
  const greetingAbortRef = useRef<(() => void) | null>(null)
  const sessionActiveRef = useRef(false)
  const historyRef = useRef<Array<{ user: string; vision: string }>>([])
  const startSessionTurnRef = useRef<((isFollowUp: boolean) => void) | null>(null)
  const stateRef = useRef<VisionState>('idle')
  const ttsSpeakingRef = useRef(false)
  const followUpUntilRef = useRef(0)
  const activeRoomRef = useRef<string | null>(activeRoomId)
  const uiStateRef = useRef<Record<string, any>>(uiState)
  const roomsRef = useRef<Room[]>(rooms)
  const directModeRef = useRef(directMode)
  const autoOnRef = useRef(autoOn)
  const selectedMicRef = useRef(selectedMicId)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { activeRoomRef.current = activeRoomId }, [activeRoomId])
  useEffect(() => { uiStateRef.current = uiState }, [uiState])
  useEffect(() => { roomsRef.current = rooms }, [rooms])
  useEffect(() => {
    selectedMicRef.current = selectedMicId
    if (selectedMicId) localStorage.setItem('vision_mic_id', selectedMicId)
  }, [selectedMicId])
  useEffect(() => {
    directModeRef.current = directMode
    localStorage.setItem('vision_direct_mode', directMode ? '1' : '0')
  }, [directMode])
  useEffect(() => {
    autoOnRef.current = autoOn
    localStorage.setItem('vision_handsfree_v2', autoOn ? '1' : '0')
  }, [autoOn])

  const refreshMicList = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter(d => d.kind === 'audioinput' && d.deviceId)
      setMics(inputs)
      const cur = selectedMicRef.current
      if ((!cur || cur === 'communications') && inputs.length > 1) {
        const hw = inputs.find(
          d => d.deviceId !== 'default' && d.deviceId !== 'communications' && /microphone array|realtek|headset|usb/i.test(d.label) && !/ai noise/i.test(d.label)
        )
        if (hw) {
          setSelectedMicId(hw.deviceId)
        }
      }
    } catch {}
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!ttsOn || !('speechSynthesis' in window) || !text.trim()) {
      followUpUntilRef.current = Date.now() + 12000
      if (onEnd) {
        onEnd()
      } else {
        setState(prev => (prev === 'thinking' || prev === 'speaking' ? 'idle' : prev))
      }
      return
    }
    try {
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume()
      const utter = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferred =
        voices.find(v => /google|natural|zira|aria|samantha|daniel/i.test(v.name) && v.lang.startsWith('en')) ||
        voices.find(v => v.lang.startsWith('en'))
      if (preferred) utter.voice = preferred
      utter.rate = 1.12
      utter.pitch = 1.0
      ttsSpeakingRef.current = true
      setState('speaking')

      let done = false
      const finish = () => {
        if (done) return
        done = true
        window.clearTimeout(safety)
        greetingAbortRef.current = null
        ttsSpeakingRef.current = false
        followUpUntilRef.current = Date.now() + 12000
        if (onEnd) {
          onEnd()
        } else {
          setState(prev => (prev === 'speaking' || prev === 'thinking' ? 'idle' : prev))
        }
      }
      const safety = window.setTimeout(finish, Math.min(9000, Math.max(2500, text.length * 80)))
      greetingAbortRef.current = () => {
        window.speechSynthesis.cancel()
        finish()
      }
      utter.onend = finish
      utter.onerror = finish
      window.speechSynthesis.speak(utter)
    } catch {
      ttsSpeakingRef.current = false
      followUpUntilRef.current = Date.now() + 12000
      if (onEnd) onEnd()
      else setState('idle')
    }
  }, [ttsOn])

  const runUiActions = useCallback((uiActions: VisionUiAction[]) => {
    for (const act of uiActions || []) {
      if (!act || !act.type) continue
      if (act.type === 'sleep_voice') {
        setAutoOn(false)
        continue
      }
      if (act.type === 'set_voice_mode' && (act.mode === 'wake' || act.mode === 'direct')) {
        setDirectMode(act.mode === 'direct')
        toast(act.mode === 'direct' ? 'Vision: Direct Mode ON' : 'Vision: Hey Vision Wake Mode')
        continue
      }
      onUiAction(act)
    }
  }, [onUiAction, toast])

  const applyResult = useCallback(async (res: { ignore?: boolean; end_conversation?: boolean; heard: string; reply: string; executed: string[]; ui_actions?: VisionUiAction[]; rooms?: Room[] }, wasManual = false) => {
    if (res.ignore) {
      sessionActiveRef.current = false
      setManualOverride(false)
      if (wasManual) {
        setReply('I did not hear a command. Tap Mic to speak again.')
      }
      setState(prev => (prev === 'thinking' ? 'idle' : prev))
      return
    }
    if (res.heard) setHeard(res.heard)
    const replyText = res.reply || 'Done.'
    setReply(replyText)
    historyRef.current = [...historyRef.current.slice(-3), { user: res.heard || '', vision: replyText }]

    if (res.rooms && onApplyRooms) {
      onApplyRooms(res.rooms)
    }

    const actionBadges = [...(res.executed || [])]
    if (res.ui_actions && res.ui_actions.length > 0) {
      runUiActions(res.ui_actions)
      res.ui_actions.forEach(u => {
        if (u.type === 'navigate') actionBadges.push(['Dashboard', 'Analytics', 'Automations', 'Settings'][u.tab ?? 0] || 'Navigate')
        else if (u.type === 'open_room') actionBadges.push('Opened Room')
        else if (u.type === 'go_back') actionBadges.push('Dashboard')
        else if (u.type === 'set_3d') actionBadges.push(`3D View ${u.state ? 'ON' : 'OFF'}`)
        else if (u.type === 'set_lively_bg') actionBadges.push(`3D Mesh ${u.state ? 'ON' : 'OFF'}`)
        else if (u.type === 'set_fullscreen') actionBadges.push(`Fullscreen ${u.state ? 'ON' : 'OFF'}`)
      })
    }
    setExecuted(actionBadges)
    if (actionBadges.length > 0) {
      joySound.sceneChime()
      void onRefresh()
      toast(`Vision: ${actionBadges.slice(0, 3).join(', ')}`)
    } else {
      joySound.pop()
    }

    if (res.end_conversation) {
      sessionActiveRef.current = false
      setManualOverride(false)
      speak(replyText)
      return
    }

    // Automatically keep listening for the next command in the conversation!
    if (sessionActiveRef.current && wasManual) {
      speak(replyText, () => {
        if (sessionActiveRef.current && startSessionTurnRef.current) {
          window.setTimeout(() => startSessionTurnRef.current?.(true), 100)
        } else {
          setManualOverride(false)
          setState('idle')
        }
      })
    } else {
      setManualOverride(false)
      speak(replyText)
    }
  }, [onApplyRooms, onRefresh, runUiActions, speak, toast])

  const sendTextCommand = useCallback(async (raw: string) => {
    const clean = raw.replace(WAKE_RE, '').trim()
    if (!clean) {
      followUpUntilRef.current = Date.now() + 12000
      setState('idle')
      setReply("Yes, I'm listening. Tell me what to control or open.")
      speak("Yes, I'm listening.")
      return
    }
    setHeard(clean)
    setExecuted([])
    setState('thinking')
    setOpen(true)
    try {
      const res = await api.visionText(clean, activeRoomRef.current, uiStateRef.current, historyRef.current)
      await applyResult(res, false)
    } catch (err: any) {
      const msg = err?.message || 'Could not reach Vision AI.'
      setReply(msg.includes('Vision AI error') ? msg : 'Unable to reach Vision AI right now.')
      setState('idle')
      toast('Vision AI request failed')
    }
  }, [applyResult, speak, toast])

  const sendAudioBlob = useCallback(async (blob: Blob, mimeType: string, requireWake: boolean, wasManual = false) => {
    if (blob.size < 900) {
      sessionActiveRef.current = false
      setManualOverride(false)
      if (wasManual) setReply('Recording was empty. Check microphone selector above.')
      setState(prev => (prev === 'thinking' || prev === 'listening' ? 'idle' : prev))
      return
    }
    setState('thinking')
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('read error'))
      reader.readAsDataURL(blob)
    })
    const b64 = dataUrl.split(',')[1] || ''
    if (!b64) {
      sessionActiveRef.current = false
      setManualOverride(false)
      setState('idle')
      return
    }
    try {
      const cleanMime = mimeType.split(';')[0] || 'audio/webm'
      const res = await api.visionAudio(b64, cleanMime, activeRoomRef.current, uiStateRef.current, requireWake, historyRef.current)
      if (!res.ignore || wasManual) setOpen(true)
      await applyResult(res, wasManual)
    } catch (err: any) {
      sessionActiveRef.current = false
      setManualOverride(false)
      let msg = err?.message || 'Vision could not process that audio.'
      try { const parsed = JSON.parse(msg); if (parsed?.detail) msg = parsed.detail } catch {}
      setReply(msg.includes('timed out') ? 'Gemini took too long — please repeat your command.' : msg)
      setState('idle')
    }
  }, [applyResult])

  const stopManualMic = useCallback(() => {
    sessionActiveRef.current = false
    if (manualMediaRecRef.current && manualMediaRecRef.current.state === 'recording') {
      manualMediaRecRef.current.stop()
    }
    if (manualStreamRef.current) {
      manualStreamRef.current.getTracks().forEach(t => t.stop())
      manualStreamRef.current = null
    }
  }, [])

  // Start recording from an already-acquired stream (boosted 3.8x + 48kbps Opus)
  const beginManualCapture = useCallback(async (stream: MediaStream, isFollowUp = false) => {
    manualStreamRef.current = stream
    const mimeType = pickBestAudioMime()
    const { actx, analyser, outStream } = await createBoostedPipeline(stream)
    const rec = new MediaRecorder(outStream, { mimeType, audioBitsPerSecond: 32000 })
    const chunks: BlobPart[] = []
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    const buf = new Uint8Array(analyser.frequencyBinCount)

    let raf = 0
    let heardSpeech = false
    let speechFrames = 0
    let lastSound = Date.now()
    const started = Date.now()
    let canceledByUser = false

    rec.onstop = async () => {
      cancelAnimationFrame(raf)
      setMicLevel(0)
      actx.close().catch(() => {})
      stream.getTracks().forEach(t => t.stop())
      manualStreamRef.current = null
      manualMediaRecRef.current = null

      if (canceledByUser || (isFollowUp && !heardSpeech)) {
        sessionActiveRef.current = false
        setManualOverride(false)
        setState('idle')
        return
      }

      const blob = new Blob(chunks, { type: mimeType })
      await sendAudioBlob(blob, mimeType, false, true)
    }

    ;(rec as any)._cancelQuiet = () => { canceledByUser = true; rec.stop() }

    manualMediaRecRef.current = rec
    rec.start()
    setState('listening')
    if (!isFollowUp) {
      setReply('Listening... speak your command (tap Mic when done).')
    }

    const loop = () => {
      if (!manualMediaRecRef.current || manualMediaRecRef.current.state !== 'recording') return
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const d = (buf[i] - 128) / 128
        sum += d * d
      }
      const rms = Math.sqrt(sum / buf.length)
      setMicLevel(Math.min(100, Math.round(rms * 550)))
      const now = Date.now()
      if (rms > 0.012) {
        speechFrames += 1
        lastSound = now
        if (speechFrames >= 3) heardSpeech = true
      }
      // Wait 850ms after user finishes speaking (up to 12s max); on follow-up, exit after 5.5s if silent
      if (heardSpeech && now - lastSound > 850) {
        manualMediaRecRef.current?.stop()
        return
      }
      if (!heardSpeech && isFollowUp && now - started > 5500) {
        manualMediaRecRef.current?.stop()
        return
      }
      if (now - started > 12000) {
        manualMediaRecRef.current?.stop()
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  }, [sendAudioBlob])

  const startSessionTurn = useCallback(async (isFollowUp: boolean) => {
    if (!sessionActiveRef.current) {
      setManualOverride(false)
      setState('idle')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(selectedMicRef.current || undefined)
      })
      if (!sessionActiveRef.current) {
        stream.getTracks().forEach(t => t.stop())
        setManualOverride(false)
        setState('idle')
        return
      }
      await beginManualCapture(stream, isFollowUp)
    } catch {
      sessionActiveRef.current = false
      setManualOverride(false)
      setState('idle')
    }
  }, [beginManualCapture])

  useEffect(() => {
    startSessionTurnRef.current = startSessionTurn
  }, [startSessionTurn])

  // Dynamic Multi-Command Conversation Flow:
  // Tap Mic -> Greet dynamically & ask what to do -> Listen Command #1 -> Reply & Auto-Listen Command #2, #3...
  const handleMicTap = useCallback(async () => {
    setMicBlocked(false)

    // If user taps while Vision is speaking -> barge-in and start listening immediately
    if (stateRef.current === 'speaking' && greetingAbortRef.current) {
      greetingAbortRef.current()
      return
    }

    // If currently listening -> if user already spoke, submit now; otherwise stop conversation
    if (manualMediaRecRef.current && manualMediaRecRef.current.state === 'recording') {
      manualMediaRecRef.current.stop()
      return
    }

    if (stateRef.current === 'thinking') return

    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Microphone access requires HTTPS or localhost')
      return
    }

    sessionActiveRef.current = true
    historyRef.current = []
    setManualOverride(true)
    setOpen(true)
    setHeard('')
    setExecuted([])

    try {
      joySound.pop()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(selectedMicRef.current || undefined)
      })
      refreshMicList()

      const greeting = getDynamicGreeting(roomsRef.current)
      setReply(greeting)

      let startedCapture = false
      const launchCapture = () => {
        if (startedCapture) return
        startedCapture = true
        window.setTimeout(() => {
          if (stream.active && sessionActiveRef.current) {
            beginManualCapture(stream, false)
          } else {
            stream.getTracks().forEach(t => t.stop())
            sessionActiveRef.current = false
            setManualOverride(false)
            setState('idle')
          }
        }, 100)
      }

      speak(greeting, launchCapture)
    } catch {
      sessionActiveRef.current = false
      setManualOverride(false)
      setMicBlocked(true)
      toast('Allow microphone permission in browser address bar')
    }
  }, [beginManualCapture, refreshMicList, speak, toast])

  // Optional Always-On Continuous Hands-Free VAD Engine (toggleable via Auto ON/OFF)
  useEffect(() => {
    if (!autoOn || manualOverride) {
      setMicLevel(0)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicBlocked(true)
      return
    }

    let disposed = false
    let stream: MediaStream | null = null
    let actx: AudioContext | null = null
    let rec: MediaRecorder | null = null
    let raf = 0

    const startContinuousVad = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(selectedMicId || undefined)
        })
        if (disposed) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        setMicBlocked(false)
        refreshMicList()

        const boosted = await createBoostedPipeline(stream)
        actx = boosted.actx
        const analyser = boosted.analyser
        const recStream = boosted.outStream
        const buf = new Uint8Array(analyser.frequencyBinCount)

        const mimeType = pickBestAudioMime()
        let chunks: BlobPart[] = []
        let segmentStart = Date.now()
        let speechActive = false
        let speechFrames = 0
        let speechStartTime = 0
        let lastSpeechTime = 0
        let noiseFloor = 0.01

        const spawnRecorder = () => {
          if (disposed || !stream || !autoOnRef.current) return
          chunks = []
          segmentStart = Date.now()
          speechActive = false
          speechFrames = 0
          speechStartTime = 0
          const nextRec = new MediaRecorder(recStream, { mimeType, audioBitsPerSecond: 32000 })
          nextRec.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }
          nextRec.onstop = async () => {
            const wasSpeech = speechActive && speechFrames >= 3 && (Date.now() - speechStartTime > 250)
            const blob = new Blob(chunks, { type: mimeType })
            chunks = []
            if (disposed || !autoOnRef.current) return

            if (wasSpeech && stateRef.current !== 'thinking' && !ttsSpeakingRef.current) {
              const requireWake = !directModeRef.current && Date.now() > followUpUntilRef.current
              await sendAudioBlob(blob, mimeType, requireWake, false)
            } else if (stateRef.current === 'listening') {
              setState('idle')
            }

            if (!disposed && autoOnRef.current) {
              window.setTimeout(spawnRecorder, 120)
            }
          }
          rec = nextRec
          nextRec.start()
        }

        spawnRecorder()

        const tick = () => {
          if (disposed) return
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const d = (buf[i] - 128) / 128
            sum += d * d
          }
          const rms = Math.sqrt(sum / buf.length)
          setMicLevel(Math.min(100, Math.round(rms * 550)))

          const now = Date.now()
          const busy = stateRef.current === 'thinking' || ttsSpeakingRef.current

          if (!busy && rec && rec.state === 'recording') {
            if (!speechActive && rms < 0.06) {
              noiseFloor = noiseFloor * 0.96 + rms * 0.04
            }
            const threshold = Math.max(0.016, noiseFloor * 2.1)

            if (rms > threshold) {
              speechFrames += 1
              lastSpeechTime = now
              if (!speechActive && speechFrames >= 3) {
                speechActive = true
                speechStartTime = now
                setState('listening')
              }
            } else if (!speechActive && speechFrames > 0) {
              speechFrames = Math.max(0, speechFrames - 1)
            }

            if (speechActive && ((now - lastSpeechTime > 950) || (now - speechStartTime > 11000))) {
              rec.stop()
            } else if (!speechActive && now - segmentStart > 4500) {
              rec.stop()
            }
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch {
        setMicBlocked(true)
      }
    }

    startContinuousVad()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      setMicLevel(0)
      try { if (rec && rec.state === 'recording') rec.stop() } catch {}
      if (actx) actx.close().catch(() => {})
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [autoOn, manualOverride, selectedMicId, refreshMicList, sendAudioBlob])

  useEffect(() => {
    return () => {
      stopManualMic()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [stopManualMic])

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || state === 'thinking') return
    const q = inputText.trim()
    setInputText('')
    sendTextCommand(q)
  }

  const stateColor =
    state === 'listening' ? '#10B981' :
    state === 'thinking' ? '#F59E0B' :
    state === 'speaking' ? '#38BDF8' :
    autoOn && !micBlocked ? '#10B981' : '#6366F1'

  return (
    <div style={{
      position: 'fixed',
      right: 18,
      bottom: 84,
      zIndex: 1200,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 10,
      maxWidth: 'calc(100vw - 36px)'
    }}>
      {open && (
        <div style={{
          width: 365,
          maxWidth: 'calc(100vw - 36px)',
          borderRadius: 20,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${state === 'listening' ? 'rgba(16,185,129,0.7)' : state === 'speaking' ? 'rgba(56,189,248,0.6)' : 'rgba(99,102,241,0.4)'}`,
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.55)',
          padding: 16,
          color: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: stateColor,
                boxShadow: `0 0 12px ${stateColor}`
              }} />
              <b style={{ fontSize: 14, letterSpacing: 0.8 }}>VISION</b>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: 'rgba(56,189,248,0.16)', color: '#38BDF8',
                border: '1px solid rgba(56,189,248,0.35)'
              }}>GEMINI AI</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <button
                type="button"
                onClick={() => setAutoOn(a => !a)}
                title="Toggle always-on hands-free listening"
                style={{
                  border: autoOn ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.14)',
                  background: autoOn ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                  color: autoOn ? '#34D399' : '#94A3B8',
                  borderRadius: 99, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer'
                }}>
                {autoOn ? 'Auto ON' : 'Auto OFF'}
              </button>
              {autoOn && (
                <button
                  type="button"
                  onClick={() => setDirectMode(d => !d)}
                  title={directMode ? 'Direct Mode: Every spoken command runs immediately' : 'Wake Mode: Say "Hey Vision" before commands'}
                  style={{
                    border: directMode ? '1px solid rgba(56,189,248,0.5)' : '1px solid rgba(255,255,255,0.14)',
                    background: directMode ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)',
                    color: directMode ? '#38BDF8' : '#94A3B8',
                    borderRadius: 99, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer'
                  }}>
                  {directMode ? 'Direct' : 'Hey Vision'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = !ttsOn
                  setTtsOn(next)
                  if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel()
                }}
                title={ttsOn ? 'Mute Vision voice reply' : 'Unmute Vision voice reply'}
                style={{
                  width: 26, height: 26, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,0.08)', color: ttsOn ? '#38BDF8' : '#64748B',
                  display: 'grid', placeItems: 'center', cursor: 'pointer'
                }}>
                <span className="mi o" style={{ fontSize: 15 }}>{ttsOn ? 'volume_up' : 'volume_off'}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: 26, height: 26, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,0.08)', color: '#94A3B8',
                  display: 'grid', placeItems: 'center', cursor: 'pointer'
                }}>
                <span className="mi o" style={{ fontSize: 15 }}>close</span>
              </button>
            </div>
          </div>

          {!micBlocked && (autoOn || state === 'listening' || mics.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(autoOn || state === 'listening') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: state === 'listening' ? '#34D399' : '#94A3B8', fontWeight: 700, minWidth: 52 }}>
                    {state === 'listening' ? 'HEARING' : 'MIC LIVE'}
                  </span>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(4, micLevel)}%`,
                      height: '100%',
                      background: state === 'listening' ? '#10B981' : '#38BDF8',
                      transition: 'width 60ms linear'
                    }} />
                  </div>
                </div>
              )}
              {mics.length > 0 && (
                <select
                  value={selectedMicId}
                  onChange={e => setSelectedMicId(e.target.value)}
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: '1px solid rgba(148, 163, 184, 0.22)',
                    borderRadius: 8,
                    padding: '4px 8px',
                    color: '#CBD5E1',
                    fontSize: 10.5,
                    outline: 'none'
                  }}>
                  {mics.map((m, idx) => (
                    <option key={m.deviceId} value={m.deviceId}>
                      Mic: {m.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div style={{
            background: 'rgba(30, 41, 59, 0.72)',
            borderRadius: 12,
            padding: '10px 12px',
            border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            {heard && (
              <div style={{ fontSize: 11.5, color: '#94A3B8' }}>
                <b style={{ color: '#CBD5E1' }}>You:</b> "{heard}"
              </div>
            )}
            <div style={{ fontSize: 13, lineHeight: 1.4, color: '#F1F5F9', fontWeight: 500 }}>
              {micBlocked
                ? 'Microphone access blocked. Allow mic permission in Chrome address bar and tap Mic.'
                : state === 'thinking'
                  ? 'Vision is executing your command...'
                  : reply}
            </div>
            {executed.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                {executed.map((ex, i) => (
                  <span key={i} style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: 'rgba(16,185,129,0.2)', color: '#34D399',
                    border: '1px solid rgba(16,185,129,0.4)'
                  }}>✓ {ex}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              'Open Analytics',
              'Laptop battery?',
              'Take screenshot',
              'Open YouTube',
              'Turn off all lights'
            ].map(cmd => (
              <button
                key={cmd}
                type="button"
                disabled={state === 'thinking'}
                onClick={() => sendTextCommand(cmd)}
                style={{
                  fontSize: 11, padding: '4px 9px', borderRadius: 99,
                  background: 'rgba(99,102,241,0.16)', color: '#C7D2FE',
                  border: '1px solid rgba(99,102,241,0.32)', cursor: 'pointer'
                }}>
                {cmd}
              </button>
            ))}
          </div>

          <form onSubmit={submitForm} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder='Tap Mic or type any command...'
              style={{
                flex: 1,
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: 12,
                padding: '8px 11px',
                color: '#F8FAFC',
                fontSize: 12.5,
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || state === 'thinking'}
              style={{
                width: 34, height: 34, borderRadius: 10, border: 'none',
                background: '#4F46E5', color: '#fff', display: 'grid', placeItems: 'center',
                cursor: 'pointer', opacity: !inputText.trim() || state === 'thinking' ? 0.5 : 1
              }}>
              <span className="mi o" style={{ fontSize: 17 }}>send</span>
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(14px)',
            color: '#F8FAFC',
            border: `1px solid ${state === 'listening' ? 'rgba(16,185,129,0.6)' : state === 'speaking' ? 'rgba(56,189,248,0.55)' : 'rgba(99,102,241,0.45)'}`,
            borderRadius: 99,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7
          }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: stateColor,
            boxShadow: `0 0 10px ${stateColor}`
          }} />
          {state === 'listening' ? 'VISION LISTENING...' :
           state === 'thinking' ? 'VISION THINKING...' :
           state === 'speaking' ? 'VISION SPEAKING...' :
           autoOn ? (directMode ? 'VISION DIRECT AUTO' : 'VISION AUTO · HEY VISION') : 'VISION AI'}
        </button>

        <button
          type="button"
          onClick={handleMicTap}
          title={state === 'listening' ? 'Stop & send now' : 'Tap to talk to Vision'}
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.22)',
            background: state === 'listening'
              ? 'linear-gradient(135deg, #10B981, #059669)'
              : state === 'speaking'
                ? 'linear-gradient(135deg, #0EA5E9, #2563EB)'
                : state === 'thinking'
                  ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                  : 'linear-gradient(135deg, #4F46E5, #06B6D4)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            boxShadow: `0 8px 26px ${state === 'listening' ? 'rgba(16,185,129,0.55)' : 'rgba(79,70,229,0.5)'}`,
            cursor: 'pointer',
            transition: 'transform 0.15s ease'
          }}>
          <span className="mi" style={{ fontSize: 24 }}>
            {state === 'listening' ? 'graphic_eq' : state === 'speaking' ? 'record_voice_over' : state === 'thinking' ? 'hourglass_top' : 'mic'}
          </span>
        </button>
      </div>
    </div>
  )
}
