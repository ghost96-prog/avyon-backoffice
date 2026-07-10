// src/components/layout/DashboardLayout.jsx
import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { NAV_SECTIONS } from "../../utils/navConfig";
import "./DashboardLayout.css";
// Add near the top of DashboardLayout.jsx
import { useBranchNotifications } from '../../hooks/useBranchNotification';
import ToastStack from '../common/ToastStack';
import { useAppContext } from '../../context/AppContext';
function titleForPath(pathname) {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.to === pathname) return item.label;
    }
  }
  return "Dashboard";
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem("bo:sidebarCollapsed");
    return stored ? stored === "1" : true;
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
const { branchId } = useAppContext();
const { toasts, dismissToast, markRead } = useBranchNotifications(branchId);
  useEffect(() => {
    localStorage.setItem("bo:sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className={`shell ${collapsed ? "shell-collapsed" : ""}`}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="shell-main">
        <TopBar onOpenMobileNav={() => setMobileOpen(true)} title={titleForPath(location.pathname)} />
          <ToastStack toasts={toasts} onDismiss={dismissToast} onMarkRead={markRead} />

        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}