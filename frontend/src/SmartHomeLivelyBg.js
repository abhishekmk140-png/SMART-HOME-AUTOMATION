import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
export default function SmartHomeLivelyBg() {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        let animId;
        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);
        const handleResize = () => {
            if (!canvas)
                return;
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            initNodes();
        };
        window.addEventListener('resize', handleResize);
        // Mouse coordinates for gentle interactive ripple
        const mouse = { x: -1000, y: -1000, active: false };
        const handleMouseMove = (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;
        };
        const handleTouchMove = (e) => {
            if (e.touches[0]) {
                mouse.x = e.touches[0].clientX;
                mouse.y = e.touches[0].clientY;
                mouse.active = true;
            }
        };
        const handleMouseLeave = () => {
            mouse.active = false;
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('mouseleave', handleMouseLeave);
        // Smart Home Node Types
        const NODE_TYPES = [
            { color: '#4F46E5', label: 'IoT Gateway' },
            { color: '#06B6D4', label: 'Climate' },
            { color: '#F59E0B', label: 'Lighting' },
            { color: '#10B981', label: 'Air Sensor' },
            { color: '#8B5CF6', label: 'Smart Socket' },
            { color: '#0284C7', label: 'HVAC' },
            { color: '#EC4899', label: 'Security' },
        ];
        let nodes = [];
        let packets = [];
        const initNodes = () => {
            nodes = [];
            packets = [];
            // Scale count based on screen width
            const count = Math.max(16, Math.floor((width * height) / 48000));
            for (let i = 0; i < count; i++) {
                const type = NODE_TYPES[i % NODE_TYPES.length];
                const r = Math.random() * 2.5 + 3.5;
                nodes.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.45,
                    vy: (Math.random() - 0.5) * 0.45,
                    radius: r,
                    baseRadius: r,
                    color: type.color,
                    label: type.label,
                    pulsePhase: Math.random() * Math.PI * 2,
                    pulseSpeed: Math.random() * 0.03 + 0.02,
                });
            }
            // Initial telemetry packets
            for (let i = 0; i < 10; i++) {
                spawnPacket();
            }
        };
        const spawnPacket = () => {
            if (nodes.length < 2)
                return;
            const fromIdx = Math.floor(Math.random() * nodes.length);
            // Find nearby node
            const nearby = [];
            for (let j = 0; j < nodes.length; j++) {
                if (j === fromIdx)
                    continue;
                const dx = nodes[fromIdx].x - nodes[j].x;
                const dy = nodes[fromIdx].y - nodes[j].y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 220)
                    nearby.push(j);
            }
            if (nearby.length > 0) {
                const toIdx = nearby[Math.floor(Math.random() * nearby.length)];
                packets.push({
                    fromIdx,
                    toIdx,
                    progress: 0,
                    speed: Math.random() * 0.008 + 0.006,
                    color: nodes[fromIdx].color,
                });
            }
        };
        initNodes();
        let time = 0;
        const render = () => {
            time += 0.016;
            // Background with subtle smart ambient gradient
            ctx.fillStyle = '#0b0e17';
            ctx.fillRect(0, 0, width, height);
            // Draw soft ambient glowing aura mesh orbs
            const aura1X = width * 0.3 + Math.sin(time * 0.4) * 80;
            const aura1Y = height * 0.35 + Math.cos(time * 0.3) * 60;
            const g1 = ctx.createRadialGradient(aura1X, aura1Y, 10, aura1X, aura1Y, width * 0.45);
            g1.addColorStop(0, 'rgba(79, 70, 229, 0.14)');
            g1.addColorStop(0.5, 'rgba(6, 182, 212, 0.06)');
            g1.addColorStop(1, 'rgba(11, 14, 23, 0)');
            ctx.fillStyle = g1;
            ctx.fillRect(0, 0, width, height);
            const aura2X = width * 0.75 + Math.cos(time * 0.35) * 70;
            const aura2Y = height * 0.65 + Math.sin(time * 0.4) * 60;
            const g2 = ctx.createRadialGradient(aura2X, aura2Y, 10, aura2X, aura2Y, width * 0.4);
            g2.addColorStop(0, 'rgba(16, 185, 129, 0.10)');
            g2.addColorStop(0.6, 'rgba(245, 158, 11, 0.04)');
            g2.addColorStop(1, 'rgba(11, 14, 23, 0)');
            ctx.fillStyle = g2;
            ctx.fillRect(0, 0, width, height);
            // Architectural Blueprint Subtle Grid Lines
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.lineWidth = 1;
            const gridSize = 64;
            ctx.beginPath();
            for (let x = 0; x < width; x += gridSize) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            for (let y = 0; y < height; y += gridSize) {
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
            }
            ctx.stroke();
            // Update and draw node connections (IoT Mesh)
            const maxDist = 200;
            ctx.lineWidth = 1;
            for (let i = 0; i < nodes.length; i++) {
                const n1 = nodes[i];
                // Drift motion
                n1.x += n1.vx;
                n1.y += n1.vy;
                // Screen boundary bounce
                if (n1.x < 0 || n1.x > width)
                    n1.vx *= -1;
                if (n1.y < 0 || n1.y > height)
                    n1.vy *= -1;
                // Mouse gentle repel / interaction
                if (mouse.active) {
                    const dx = n1.x - mouse.x;
                    const dy = n1.y - mouse.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 140 && dist > 0) {
                        const force = (140 - dist) / 140;
                        n1.x += (dx / dist) * force * 1.5;
                        n1.y += (dy / dist) * force * 1.5;
                    }
                }
                // Pulse phase
                n1.pulsePhase += n1.pulseSpeed;
                const pulse = Math.sin(n1.pulsePhase);
                n1.radius = n1.baseRadius + pulse * 1.2;
                // Draw connections to nearby nodes
                for (let j = i + 1; j < nodes.length; j++) {
                    const n2 = nodes[j];
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < maxDist) {
                        const alpha = (1 - d / maxDist) * 0.22;
                        ctx.strokeStyle = `rgba(165, 180, 252, ${alpha})`;
                        ctx.beginPath();
                        ctx.moveTo(n1.x, n1.y);
                        ctx.lineTo(n2.x, n2.y);
                        ctx.stroke();
                    }
                }
            }
            // Draw and update telemetry packets (data flowing along mesh)
            for (let i = packets.length - 1; i >= 0; i--) {
                const p = packets[i];
                p.progress += p.speed;
                if (p.progress >= 1) {
                    packets.splice(i, 1);
                    if (Math.random() > 0.3)
                        spawnPacket();
                    continue;
                }
                const from = nodes[p.fromIdx];
                const to = nodes[p.toIdx];
                if (!from || !to)
                    continue;
                const px = from.x + (to.x - from.x) * p.progress;
                const py = from.y + (to.y - from.y) * p.progress;
                // Glowing packet beam
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(px, py, 2.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            // Ensure packet pool stays active
            if (packets.length < 12 && Math.random() < 0.1) {
                spawnPacket();
            }
            // Draw IoT Smart Nodes
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                // Outer beacon aura
                ctx.fillStyle = n.color;
                ctx.globalAlpha = 0.12;
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius * 3.5, 0, Math.PI * 2);
                ctx.fill();
                // Inner glowing core
                ctx.globalAlpha = 0.85;
                ctx.shadowColor = n.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                ctx.fill();
                // Core bright center
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius * 0.45, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 1;
            animId = requestAnimationFrame(render);
        };
        render();
        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);
    return (_jsx("div", { style: {
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
        }, children: _jsx("canvas", { ref: canvasRef, style: {
                width: '100%',
                height: '100%',
                display: 'block',
            } }) }));
}
