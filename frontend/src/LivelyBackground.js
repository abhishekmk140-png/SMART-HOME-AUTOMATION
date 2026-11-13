import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
export default function LivelyBackground() {
    const videoRef = useRef(null);
    useEffect(() => {
        const video = videoRef.current;
        if (!video)
            return;
        video.muted = true;
        video.defaultMuted = true;
        video.playbackRate = 1.0;
        const tryPlay = () => {
            video.play().catch(() => { });
        };
        tryPlay();
        // Resume video playback if page becomes visible or touched
        document.addEventListener('visibilitychange', tryPlay);
        window.addEventListener('touchstart', tryPlay, { once: true });
        window.addEventListener('click', tryPlay, { once: true });
        return () => {
            document.removeEventListener('visibilitychange', tryPlay);
            window.removeEventListener('touchstart', tryPlay);
            window.removeEventListener('click', tryPlay);
        };
    }, []);
    return (_jsx("div", { className: "lively-bg-container", children: _jsx("video", { ref: videoRef, className: "lively-video-bg", src: "/smart_home_bg.mp4", autoPlay: true, loop: true, muted: true, playsInline: true }) }));
}
