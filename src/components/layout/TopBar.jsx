// src/components/layout/TopBar.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, ChevronDown, Lock, LogOut, Repeat, Bell, MessagesSquare, Sparkles } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { useCommunityUnread } from "../../context/CommunityUnreadContext";
import { ROLE_BADGE_COLORS, ROLE_LABELS, BACKOFFICE_PERMISSIONS as P } from "../../utils/permissions";
import SubscriptionCountdownBar from "../common/SubscriptionCountDownBar";
import "./TopBar.css";

// Fireworks around the Intelligence button: 12 sparks fanning out in a circle,
// alternating long/short throws and cycling colours. All motion is CSS (see TopBar.css).
const INTEL_SPARK_COLORS = ["#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#22c55e", "#ec4899"];
const INTEL_SPARKS = Array.from({ length: 12 }, (_, i) => ({
  angle: i * 30,
  dist: i % 2 ? 19 : 30,
  color: INTEL_SPARK_COLORS[i % INTEL_SPARK_COLORS.length],
}));

export default function TopBar({ onOpenMobileNav, title }) {
  const navigate = useNavigate();
  const { businessName, branches, branchId, selectedBranchId, activeStaff, requiresPin, lockSession, logout, hasBackofficePermission } =
    useAppContext();
  const { unreadCount } = useCommunityUnread();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ✅ Show whichever branch is actually selected right now (set from
  // Products/Dashboard's store switchers), not the static login branch —
  // otherwise this label never moves even though gating elsewhere does.
  const currentBranch = branches?.find((b) => b.branchId === (selectedBranchId || branchId));
  const badge = ROLE_BADGE_COLORS[activeStaff?.role] || ROLE_BADGE_COLORS.owner;
  const initials = (activeStaff?.name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button className="topbar-icon-btn topbar-menu-btn" onClick={onOpenMobileNav} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="topbar-title-block">
            <h1 className="topbar-title">{title || "Dashboard"}</h1>
            {businessName && (
              <div className="topbar-branch">
                <span>{businessName}</span>
                {currentBranch && (
                  <>
                    <span className="topbar-dot">·</span>
                    <span>{currentBranch.name}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="topbar-right">
          {/* ✅ Avyon Intelligence — only for staff who can view sales reports (same permission as the route) */}
          {hasBackofficePermission(P.VIEW_SALES_REPORTS) && (
            <button
              className="topbar-icon-btn topbar-community-btn topbar-intel-btn"
              aria-label="Avyon Intelligence"
              title="Avyon Intelligence"
              onClick={() => navigate("/intelligence")}
            >
              <span className="topbar-intel-sparks" aria-hidden="true">
                {INTEL_SPARKS.map((sp, i) => (
                  <span
                    key={i}
                    className="topbar-intel-spark"
                    style={{ "--a": `${sp.angle}deg`, "--d": `${sp.dist}px`, "--c": sp.color }}
                  />
                ))}
              </span>
              <Sparkles size={18} className="topbar-intel-icon" />
              <span className="topbar-community-label">Avyon Intelligence - AI</span>
            </button>
          )}

          {/* ✅ Community button with label on desktop */}
          <button
            className="topbar-icon-btn topbar-community-btn"
            aria-label="Community"
            title="Community"
            onClick={() => navigate("/community")}
          >
            <MessagesSquare size={18} />
            <span className="topbar-community-label">Community</span>
            {unreadCount > 0 && (
              <span className="topbar-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
            )}
          </button>

          <button className="topbar-icon-btn" aria-label="Notifications">
            <Bell size={18} />
          </button>

          <div className="topbar-user" ref={menuRef}>
            <button className="topbar-user-btn" onClick={() => setMenuOpen((o) => !o)}>
              <span className="topbar-avatar" style={{ background: badge.bg, color: badge.fg }}>
                {initials}
              </span>
              <span className="topbar-user-text">
                <span className="topbar-user-name">{activeStaff?.name || "…"}</span>
                <span className="topbar-user-role" style={{ color: badge.fg }}>
                  {ROLE_LABELS[activeStaff?.role] || activeStaff?.role}
                </span>
              </span>
              <ChevronDown size={15} className="topbar-user-chevron" />
            </button>

            {menuOpen && (
              <div className="topbar-menu">
                {requiresPin && (
                  <button
                    className="topbar-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      lockSession();
                    }}
                  >
                    <Lock size={15} /> Lock session
                  </button>
                )}
                {requiresPin && (
                  <button
                    className="topbar-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      lockSession();
                    }}
                  >
                    <Repeat size={15} /> Switch user
                  </button>
                )}
                <button className="topbar-menu-item topbar-menu-item-danger" onClick={logout}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {/* ✅ Subscription bar directly under the topbar */}
      <SubscriptionCountdownBar />
    </>
  );
}