// src/components/community/AutoplayVideo.jsx
//
// Instagram-style video: muted autoplay while scrolled into view, paused
// otherwise, with a tap-to-unmute speaker button. Tapping the video itself
// opens the caller's preview (post -> MediaViewer, comment -> Lightbox).

import React, { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Play } from "lucide-react";
import { useInView } from "../../hooks/useInView";
import "./AutoplayVideo.css";

export default function AutoplayVideo({ src, onOpen, compact = false }) {
  const [wrapperRef, inView] = useInView({ threshold: 0.55 });
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (inView) {
      const playPromise = video.play();
      if (playPromise?.then) {
        playPromise.then(() => setPaused(false)).catch(() => setPaused(true));
      }
    } else {
      video.pause();
      setPaused(true);
    }
  }, [inView]);

  const toggleMute = (e) => {
    e.stopPropagation();
    setMuted((m) => !m);
  };

  return (
    <div
      ref={wrapperRef}
      className={`autoplay-video ${compact ? "autoplay-video--compact" : ""}`}
      onClick={() => onOpen?.()}
      role="button"
      tabIndex={0}
    >
      <video ref={videoRef} src={src} muted={muted} loop playsInline preload="metadata" />

      {paused && (
        <div className="autoplay-video-playbtn">
          <Play size={compact ? 16 : 22} fill="white" />
        </div>
      )}

      <button
        className="autoplay-video-mute"
        onClick={toggleMute}
        aria-label={muted ? "Unmute video" : "Mute video"}
      >
        {muted ? <VolumeX size={compact ? 12 : 15} /> : <Volume2 size={compact ? 12 : 15} />}
      </button>
    </div>
  );
}
