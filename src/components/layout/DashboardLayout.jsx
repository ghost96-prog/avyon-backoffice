// src/components/layout/DashboardLayout.jsx
import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { NAV_SECTIONS } from "../../utils/navConfig";
import "./DashboardLayout.css";

import { useBranchNotifications } from '../../hooks/useBranchNotification';
import { useInsights } from '../../hooks/useInsights';
import ToastStack from '../common/ToastStack';
import InsightToastStack from '../common/InsightToastStack';
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

  // ⚠️ Was `branchId` (the static home/login branch — fixed at login,
  // and typically null for owner/admin accounts that have no single home
  // branch). That meant useBranchNotifications silently never fired for
  // exactly the accounts most likely to be watching the backoffice.
  // `selectedBranchId` is the shared, actively-viewed branch (same one
  // the Dashboard store switcher writes to), so it tracks whatever's
  // actually on screen.
  //
  // useInsights is business-wide now (not branch-scoped) — it polls
  // every branch under the business at once, so it doesn't take a
  // branchId at all. That's what makes insight toasts fire regardless of
  // which branch is selected and regardless of which screen the owner is
  // currently on.
  const { selectedBranchId } = useAppContext();
  const { toasts, dismissToast, markRead } = useBranchNotifications(selectedBranchId);
  const { toasts: insightToasts, dismissToast: dismissInsightToast, markRead: markInsightRead } = useInsights();

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
        <InsightToastStack toasts={insightToasts} onDismiss={dismissInsightToast} onMarkRead={markInsightRead} />

        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}