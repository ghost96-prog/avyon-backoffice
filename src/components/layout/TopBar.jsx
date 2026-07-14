// src/components/layout/TopBar.jsx
import React, { useState, useRef, useEffect } from "react";
import { Menu, ChevronDown, Lock, LogOut, Repeat, Bell } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { ROLE_BADGE_COLORS, ROLE_LABELS } from "../../utils/permissions";
import SubscriptionCountdownBar from "../common/SubscriptionCountDownBar";
import "./TopBar.css";

export default function TopBar({ onOpenMobileNav, title }) {
  const { businessName, branches, branchId, selectedBranchId, activeStaff, requiresPin, lockSession, logout } =
    useAppContext();
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