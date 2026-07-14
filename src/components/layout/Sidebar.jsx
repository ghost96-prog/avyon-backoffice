// src/components/layout/Sidebar.jsx
import React, { useState, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, X, Lock } from "lucide-react";
import { NAV_SECTIONS } from "../../utils/navConfig";
import { useAppContext } from "../../context/AppContext";
import { useModuleGate } from "../../hooks/useModuleGate";
import ModuleSubscriptionModal from "../common/ModuleSubscriptionModal";
import "./Sidebar.css";

// Import the logo
import avyonLogo from "../../assets/avyonicon.png";

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { activeStaff, hasBackofficePermission, businessName, userProfile } = useAppContext();
  const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const tooltipTimeoutRef = useRef(null);

  // ✅ Module (add-on) subscription gating — see hooks/useModuleGate.js.
  // guardNavClick returns false (and opens the modal) for nav items whose
  // moduleGateMode is 'block-nav' and the branch lacks access; items with
  // no moduleId, or moduleGateMode 'allow-view' (Products), always pass.
  const { guardNavClick, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();

  const canSee = (permission) => {
    if (permission === null) return true;
    if (!activeStaff) return false;
    if (activeStaff.role === "owner") return true;
    if (permission === "*") return ["owner", "admin"].includes(activeStaff.role);
    return hasBackofficePermission(permission);
  };

  const handleLinkHover = (e, label) => {
    if (!collapsed) {
      setTooltip({ visible: false, text: "", x: 0, y: 0 });
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      text: label,
      x: rect.right + 12,
      y: rect.top + rect.height / 2,
    });

    clearTimeout(tooltipTimeoutRef.current);
  };

  const handleLinkLeave = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip({ visible: false, text: "", x: 0, y: 0 });
    }, 100);
  };

  // ✅ A nav item shows the small lock badge when it's gated behind a
  // module AND that module isn't currently active for this branch — this
  // is purely a visual affordance so the modal isn't a surprise on click.
  const isLocked = (item) =>
    !!item.moduleId && item.moduleGateMode === "block-nav" && !hasModuleAccess(item.moduleId);

  const handleNavClick = (e, item) => {
    if (!guardNavClick(item)) {
      // Gated and not subscribed — block the route change, modal is
      // already open (guardNavClick set gateModalModuleId internally).
      e.preventDefault();
      return;
    }
    onCloseMobile();
  };

  // Get user email from userProfile or activeStaff
  const userEmail = userProfile?.email || activeStaff?.email || '';

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}

      <aside className={`sidebar ${!collapsed ? "is-expanded" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-mark">
              <img 
                src={avyonLogo} 
                alt="Avyon" 
                className="sidebar-logo-img"
                style={{
                  width: collapsed ? 32 : 36,
                  height: collapsed ? 32 : 36,
                  objectFit: 'contain',
                }}
              />
            </div>
            <div className="sidebar-brand-info">
              <span className="sidebar-brand-text">Avyon BackOffice</span>
              {!collapsed && (
                <div className="sidebar-brand-details">
                  {businessName && (
                    <span className="sidebar-brand-company">{businessName}</span>
                  )}
                  {userEmail && (
                    <span className="sidebar-brand-email">{userEmail}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <button 
            className="sidebar-toggle-btn" 
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
          
          <button className="sidebar-mobile-close" onClick={onCloseMobile} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => canSee(item.permission));
            if (!visibleItems.length) return null;
            return (
              <div className="sidebar-section" key={section.label}>
                <p className="sidebar-section-label">{section.label}</p>
                {visibleItems.map((item) => {
                  const locked = isLocked(item);
                  return (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      end={item.to === "/"}
                      onClick={(e) => handleNavClick(e, item)}
                      onMouseEnter={(e) => handleLinkHover(e, item.label)}
                      onMouseLeave={handleLinkLeave}
                      className={({ isActive }) =>
                        `sidebar-link ${isActive ? "is-active" : ""} ${locked ? "is-locked" : ""}`
                      }
                      title={collapsed ? undefined : item.label}
                    >
                      <item.icon size={18} strokeWidth={2} className="sidebar-link-icon" />
                      <span className="sidebar-link-text">{item.label}</span>
                      {locked && (
                        <Lock size={12} strokeWidth={2.5} className="sidebar-link-lock" />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      {tooltip.visible && (
        <div
          className="sidebar-link-tooltip visible"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateY(-50%)",
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* ✅ Module "not subscribed" modal — opened by guardNavClick above */}
      {gateModalModuleId && (
        <ModuleSubscriptionModal
          moduleId={gateModalModuleId}
          moduleState={getModuleState(gateModalModuleId)}
          onClose={closeGateModal}
        />
      )}
    </>
  );
}