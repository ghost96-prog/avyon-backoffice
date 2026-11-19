// src/components/common/CommunityPostToast.jsx
//
// Pops up when a new Community post arrives that the user hasn't seen. Fed by
// CommunityUnreadContext (same listener that drives the TopBar badge). "Dismiss" / X only hides the
// toast; the badge and the bouncing Community button stay until the user opens Community.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MessagesSquare, X } from "lucide-react";
import { useCommunityUnread } from "../../context/CommunityUnreadContext";
import "./CommunityPostToast.css";

const AUTO_HIDE_MS = 15000;

function snippet(text, max = 90) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

export default function CommunityPostToast() {
  const { newPostToast, dismissNewPostToast, markCommunitySeen } = useCommunityUnread();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef(null);

  const onCommunity = pathname.startsWith("/community");
  const visible = !!newPostToast && !onCommunity;

  // Auto-hide after a while (paused while the pointer is over it). Re-arms for each new post.
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!visible || hovered) return undefined;
    timerRef.current = setTimeout(dismissNewPostToast, AUTO_HIDE_MS);
    return () => clearTimeout(timerRef.current);
  }, [visible, hovered, newPostToast?.latest?.id, dismissNewPostToast]);

  if (!visible) return null;

  const { count, latest } = newPostToast;
  const who = latest.authorName || "Someone";
  const preview = snippet(latest.body) || (latest.hasMedia ? "shared a photo or video" : "");
  const title = count > 1 ? `${count} new posts in Community` : "New post in Community";

  const handleView = () => {
    dismissNewPostToast();
    markCommunitySeen();
    navigate("/community");
  };

  return (
    <div
      className="cpt"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="cpt-icon"><MessagesSquare size={18} /></div>
      <div className="cpt-main">
        <div className="cpt-title">{title}</div>
        <div className="cpt-body">
          <strong>{who}</strong>{preview ? `: ${preview}` : ""}
        </div>
        <div className="cpt-actions">
          <button type="button" className="cpt-link cpt-link-primary" onClick={handleView}>View</button>
          <button type="button" className="cpt-link" onClick={dismissNewPostToast}>Dismiss</button>
        </div>
      </div>
      <button type="button" className="cpt-x" aria-label="Dismiss" onClick={dismissNewPostToast}>
        <X size={14} />
      </button>
    </div>
  );
}
