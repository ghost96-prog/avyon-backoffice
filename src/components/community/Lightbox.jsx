// src/components/community/Lightbox.jsx
//
// Lightweight full-screen media viewer for comment attachments — a quick
// zoom-to-look-closer, not the full post experience (that's MediaViewer).
// Same component on every screen size: centered, tap backdrop or X to close.

import React from "react";
import { X, Heart } from "lucide-react";
import "./Lightbox.css";

export default function Lightbox({ media, caption, like, onClose }) {
  if (!media) return null;

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close preview">
        <X size={20} />
      </button>

      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {media.type === "video" ? (
          <video src={media.url} controls autoPlay playsInline className="lightbox-media" />
        ) : (
          <img src={media.url} alt="Preview" className="lightbox-media" />
        )}

        {(caption || like) && (
          <div className="lightbox-footer">
            {caption && <p className="lightbox-caption">{caption}</p>}
            {like && (
              <button
                className={`lightbox-like-btn ${like.isLiked ? "is-liked" : ""}`}
                onClick={like.onToggle}
              >
                <Heart size={15} fill={like.isLiked ? "currentColor" : "none"} />
                {like.count > 0 ? like.count : "Like"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
