// Joyful Audio & Micro-Interaction Engine for Smart Home Hub
// Uses pure HTML5 Web Audio API synthesizer - 100% zero audio files required!

class JoyAudio {
  private ctx: AudioContext | null = null
  public enabled: boolean = true

  constructor() {
    try {
      this.enabled = localStorage.getItem('joy_sound') !== 'false'
    } catch {
      this.enabled = true
    }
  }

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) this.ctx = new AudioCtx()
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    try {
      localStorage.setItem('joy_sound', String(this.enabled))
    } catch {}
    if (this.enabled) this.pop()
    return this.enabled
  }

  // Crisp satisfying bubble pop on tapping tabs, buttons & chips
  pop() {
    if (!this.enabled) return
    this.init()
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(520, now)
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.055)
    gain.gain.setValueAtTime(0.14, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.07)
  }

  // Delightful harmonic tone for device switch ON/OFF (Asynchronous, 0ms UI delay)
  toggleDev(on: boolean) {
    if (!this.enabled) return
    setTimeout(() => {
      try {
        this.init()
        if (!this.ctx) return
        const now = this.ctx.currentTime
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = 'triangle'
        if (on) {
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.09) // A4 to E5
        } else {
          osc.frequency.setValueAtTime(587.33, now)
          osc.frequency.exponentialRampToValueAtTime(369.99, now + 0.09) // D5 down to F#4
        }
        gain.gain.setValueAtTime(0.12, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
        osc.connect(gain)
        gain.connect(this.ctx.destination)
        osc.start(now)
        osc.stop(now + 0.11)
      } catch {}
    }, 0)
  }

  // Joyful 4-note ascending major arpeggio for Quick Scenes & celebrations
  sceneChime() {
    if (!this.enabled) return
    this.init()
    if (!this.ctx) return
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      const t = this.ctx!.currentTime + i * 0.055
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(0.13, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26)
      osc.connect(gain)
      gain.connect(this.ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.26)
    })
  }

  // Gentle descending shutdown chime for "All Off"
  powerDown() {
    if (!this.enabled) return
    this.init()
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.16)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.17)
  }
}

export const joySound = new JoyAudio()

// Joyful Particle & Confetti Sparkle Burst (Asynchronous, Zero UI Thread Overhead)
export function burstJoy(e?: React.MouseEvent | MouseEvent | { clientX: number; clientY: number }) {
  setTimeout(() => {
    try {
      const colors = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#8B5CF6']
      const count = 12
      let startX = window.innerWidth / 2
      let startY = window.innerHeight / 3

      if (e && 'clientX' in e && e.clientX && e.clientY) {
        startX = e.clientX
        startY = e.clientY
      }

      const frag = document.createDocumentFragment()
      const els: HTMLElement[] = []

      for (let i = 0; i < count; i++) {
        const el = document.createElement('div')
        const color = colors[i % colors.length]
        const size = Math.random() * 5 + 4
        const angle = (Math.PI * 2 * i) / count
        const dist = Math.random() * 80 + 40
        const dx = Math.cos(angle) * dist
        const dy = Math.sin(angle) * dist - 15

        el.className = 'joy-spark-particle'
        el.style.cssText = `
          position: fixed;
          left: ${startX}px;
          top: ${startY}px;
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border-radius: 50%;
          pointer-events: none;
          z-index: 99999;
          transform: translate(-50%, -50%);
          transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease-out;
          opacity: 1;
          box-shadow: 0 0 8px ${color};
        `
        frag.appendChild(el)
        els.push(el)

        requestAnimationFrame(() => {
          el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`
          el.style.opacity = '0'
        })
      }

      document.body.appendChild(frag)
      setTimeout(() => {
        els.forEach(el => el.parentNode?.removeChild(el))
      }, 650)
    } catch {}
  }, 10)
}

