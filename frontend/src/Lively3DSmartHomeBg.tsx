import { useEffect, useRef, useState } from 'react'

interface Beacon {
  id: string
  label: string
  sub: string
  icon: string
  color: string
  xPct: number // % position on 3D image
  yPct: number
}

const BEACONS: Beacon[] = [
  { id: 'living', label: 'Living Room', sub: 'Chandelier · Ambient Lights', icon: 'lightbulb', color: '#F59E0B', xPct: 40, yPct: 68 },
  { id: 'kitchen', label: 'Chef Kitchen', sub: 'Island Lights · Exhaust Fan', icon: 'kitchen', color: '#10B981', xPct: 64, yPct: 65 },
  { id: 'bedroom', label: 'Master Bedroom', sub: 'Ceiling Fan Spinning · 24°C', icon: 'toys', color: '#06B6D4', xPct: 70, yPct: 36 },
  { id: 'bath', label: 'Smart Bath', sub: 'Water Heater · Exhaust', icon: 'bathtub', color: '#8B5CF6', xPct: 58, yPct: 32 },
  { id: 'hvac', label: 'Smart HVAC Core', sub: 'Air Quality 24 µg/m³ · Optimal', icon: 'thermostat', color: '#4F46E5', xPct: 34, yPct: 56 },
]

export default function Lively3DSmartHomeBg() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<'villa' | 'core'>('villa')
  const [activeBeacon, setActiveBeacon] = useState<string | null>(null)

  // 3D Parallax interpolation with direct GPU transforms & automatic idle sleep
  useEffect(() => {
    let currentX = 0
    let currentY = 0
    let targetX = 0
    let targetY = 0
    let animId: number
    let isRunning = false

    const loop = () => {
      const dx = targetX - currentX
      const dy = targetY - currentY
      currentX += dx * 0.1
      currentY += dy * 0.1

      if (stageRef.current) {
        stageRef.current.style.transform = `perspective(1200px) rotateX(${-currentY * 0.5}deg) rotateY(${currentX * 0.5}deg) translate3d(${currentX * 3}px, ${currentY * 2}px, 0) scale(1.03)`
      }

      // Automatically sleep the animation loop when motion settles to save 100% GPU/CPU!
      if (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02) {
        animId = requestAnimationFrame(loop)
      } else {
        isRunning = false
      }
    }

    const startLoop = () => {
      if (!isRunning) {
        isRunning = true
        animId = requestAnimationFrame(loop)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth: w, innerHeight: h } = window
      targetX = ((e.clientX - w / 2) / (w / 2)) * 10
      targetY = ((e.clientY - h / 2) / (h / 2)) * 8
      startLoop()
    }

    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        targetX = Math.max(-10, Math.min(10, (e.gamma / 30) * 10))
        targetY = Math.max(-8, Math.min(8, ((e.beta - 45) / 30) * 8))
        startLoop()
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true })
    }
    startLoop()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('deviceorientation', handleDeviceOrientation)
    }
  }, [])

  const bgImage = scene === 'villa' ? '/3d/dashboard_3d.jpg' : '/3d/automations_3d.jpg'

  return (
    <div
      ref={containerRef}
      className="lively-3d-viewport"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        overflow: 'hidden',
        background: '#0d0f17',
        perspective: 1200,
        pointerEvents: 'none',
      }}
    >
      {/* Dynamic 3D Layer with Parallax Tilt (Hardware Accelerated, 0ms lag) */}
      <div
        ref={stageRef}
        className="lively-3d-stage"
        style={{
          position: 'absolute',
          inset: '-5%',
          width: '110%',
          height: '110%',
          transform: 'perspective(1200px) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0) scale(1.04)',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        {/* 3D Smart Home Render */}
        <img
          src={bgImage}
          alt="3D Smart Home Environment"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: 'brightness(0.96) contrast(1.05)',
            userSelect: 'none',
          }}
        />

        {/* Subtle Ambient Vignette & Depth Mask */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 50%, rgba(13,15,23,0.1) 0%, rgba(13,15,23,0.65) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Floating Ambient Energy Particles */}
        <div className="lively-3d-particles" />

        {/* Interactive Beacons on 3D Villa */}
        {scene === 'villa' &&
          BEACONS.map((b) => {
            const isHovered = activeBeacon === b.id
            return (
              <div
                key={b.id}
                style={{
                  position: 'absolute',
                  left: `${b.xPct}%`,
                  top: `${b.yPct}%`,
                  transform: `translate(-50%, -50%) translateZ(${isHovered ? 40 : 20}px)`,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  zIndex: isHovered ? 20 : 10,
                  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                onMouseEnter={() => setActiveBeacon(b.id)}
                onMouseLeave={() => setActiveBeacon(null)}
              >
                {/* Pulsing Beacon Ring */}
                <div
                  className="lively-beacon-ring"
                  style={{
                    borderColor: b.color,
                    boxShadow: `0 0 16px ${b.color}`,
                  }}
                />
                {/* Beacon Core Dot */}
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: b.color,
                    border: '2px solid #ffffff',
                    boxShadow: `0 0 14px ${b.color}`,
                    position: 'relative',
                    zIndex: 2,
                  }}
                />

                {/* Floating Telemetry Tooltip */}
                <div
                  className={`lively-beacon-tooltip ${isHovered ? 'visible' : ''}`}
                  style={{
                    background: 'rgba(15, 23, 42, 0.92)',
                    backdropFilter: 'blur(10px)',
                    border: `1px solid ${b.color}55`,
                    boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 12px ${b.color}33`,
                  }}
                >
                  <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: b.color }}>●</span>
                    {b.label}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>{b.sub}</div>
                </div>
              </div>
            )
          })}
      </div>

      {/* Floating 3D Scene Switcher Pill (Top Right, Non-Intrusive) */}
      <div
        style={{
          position: 'fixed',
          top: 14,
          right: 80,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(15, 23, 42, 0.78)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 9999,
          padding: '3px 6px',
          boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={() => setScene('villa')}
          style={{
            border: 'none',
            background: scene === 'villa' ? 'linear-gradient(135deg, #4F46E5, #6366F1)' : 'transparent',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s ease',
          }}
        >
          🏡 3D Villa
        </button>
        <button
          onClick={() => setScene('core')}
          style={{
            border: 'none',
            background: scene === 'core' ? 'linear-gradient(135deg, #7C3AED, #9333EA)' : 'transparent',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s ease',
          }}
        >
          ⚡ 3D Neural Core
        </button>
      </div>
    </div>
  )
}

