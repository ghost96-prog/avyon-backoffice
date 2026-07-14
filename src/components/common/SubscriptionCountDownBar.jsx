// src/components/common/SubscriptionCountdownBar.jsx
import React, { useState, useMemo } from "react";
import { AlertTriangle, Clock, MessageCircle, Mail, X } from "lucide-react";
import { useBranchSubscriptions } from "../../hooks/useBranchSubscription";
import { useModuleSubscriptions } from "../../hooks/useModuleSubscriptions";
import { getModuleInfo } from "../../utils/moduleCatalog";
import { useAppContext } from "../../context/AppContext";
import "./SubscriptionCountDownBar.css";

const SUPPORT_WHATSAPP_NUMBER = "263783556354";
const SUPPORT_EMAIL = "gkmangezi09@gmail.com";

// Same warning window as the base subscription's own isWithinWarningWindow
// flag (backend-driven) — kept here since module status doesn't carry an
// equivalent flag, just accessExpiresAt/msRemaining.
const MODULE_WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function formatCountdown(ms) {
  if (ms == null) return "—";
  if (ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export default function SubscriptionCountdownBar() {
  // ✅ selectedBranchId is whatever branch is actually being worked on right
  // now (Products/Dashboard store switchers); branchId is only the static
  // login branch — same fix as TopBar/ModuleSubscriptionModal.
  const { branchId, selectedBranchId, businessId, branches } = useAppContext();
  const { branchStatuses, loading: baseLoading } = useBranchSubscriptions();
  // Already keyed to selectedBranchId internally, so `modules` here always
  // reflects whichever branch is currently selected.
  const { modules, loading: modulesLoading } = useModuleSubscriptions();
  const [dismissed, setDismissed] = useState(false);
  // Which row's support popover is open — at most one at a time, keyed by row.key.
  const [openSupportFor, setOpenSupportFor] = useState(null);

  // ✅ ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS

  const effectiveBranchId = selectedBranchId || branchId;

  const currentBranch = branchStatuses.find((b) => b.branchId === effectiveBranchId);
  const expiringBranch = branchStatuses.find((b) => b.isSuspended || b.isExpired || b.isWithinWarningWindow);
  const targetBranch = expiringBranch || currentBranch;

  const branchName =
    branches?.find((b) => b.branchId === effectiveBranchId)?.name || targetBranch?.branchName || "";

  const baseAlert = useMemo(() => {
    if (!targetBranch) return null;
    if (targetBranch.isSuspended) return { key: "base", kind: "base", tone: "critical", reason: "suspended", ...targetBranch };
    if (targetBranch.isExpired) return { key: "base", kind: "base", tone: "critical", reason: "expired", ...targetBranch };
    if (targetBranch.isWithinWarningWindow)
      return { key: "base", kind: "base", tone: "warning", reason: "expiring", ...targetBranch };
    return null;
  }, [targetBranch]);

  // ── Every module (add-on) currently suspended, expired, or within the
  // warning window for the branch being worked on — not just the worst one.
  const moduleAlerts = useMemo(() => {
    return Object.entries(modules || {})
      .map(([moduleId, state]) => ({ moduleId, ...state, info: getModuleInfo(moduleId) }))
      .filter(
        (m) =>
          m.info &&
          (m.status === "suspended" ||
            m.status === "expired" ||
            (m.status === "active" && m.msRemaining != null && m.msRemaining <= MODULE_WARNING_WINDOW_MS))
      )
      .map((m) => ({
        key: `module:${m.moduleId}`,
        kind: "module",
        tone: m.status === "active" ? "warning" : "critical",
        reason: m.status === "active" ? "expiring" : m.status,
        ...m,
      }));
  }, [modules]);

  // ── One combined, stacked list — base subscription first (losing the
  // whole POS matters more than one add-on), then modules, each sorted
  // critical-before-warning and soonest-expiring first.
  const rows = useMemo(() => {
    const list = [...(baseAlert ? [baseAlert] : []), ...moduleAlerts];
    return list.sort((a, b) => {
      const rank = (r) => (r.tone === "critical" ? 0 : 1);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.kind !== b.kind) return a.kind === "base" ? -1 : 1;
      return (a.msRemaining ?? Infinity) - (b.msRemaining ?? Infinity);
    });
  }, [baseAlert, moduleAlerts]);

  const overallTone = rows.some((r) => r.tone === "critical") ? "critical" : rows.length ? "warning" : null;

  const supportMessageFor = (row) => {
    if (row.kind === "module") {
      const verb = row.reason === "suspended" ? "resolve" : "renew";
      return `Hi, I'd like to ${verb} the "${row.info.label}" module${
        branchName ? ` for ${branchName}` : ""
      }. Business ID: ${businessId || ""}`;
    }
    return `Hi, I'd like to renew POS access${branchName ? ` for ${branchName}` : ""}. Business ID: ${businessId || ""}`;
  };

  // ✅ NOW we can do conditional returns AFTER all hooks
  if (baseLoading || modulesLoading) return null;
  if (!rows.length) return null;
  if (dismissed) return null;

  return (
    <div className={`sub-countdown-bar sub-countdown-bar--${overallTone}`}>
      <div className="sub-countdown-bar-list">
        {rows.map((row) => {
          const message = supportMessageFor(row);
          return (
            <div className="sub-countdown-bar-row" key={row.key}>
              <div className="sub-countdown-bar-main">
                <span className={`sub-countdown-bar-icon sub-countdown-bar-icon--${row.tone}`}>
                  {row.tone === "critical" ? <AlertTriangle size={15} /> : <Clock size={15} />}
                </span>
                <span className="sub-countdown-bar-text">
                  {row.kind === "base" ? (
                    row.reason === "suspended" ? (
                      <>
                        Branch <strong>{row.branchName}</strong> is <strong>suspended</strong>. Contact support to
                        restore it.
                      </>
                    ) : row.reason === "expired" ? (
                      <>
                        Branch <strong>{row.branchName}</strong> subscription has <strong>expired</strong>. Contact
                        support to reactivate.
                      </>
                    ) : (
                      <>
                        Branch <strong>{row.branchName}</strong> subscription expires in{" "}
                        <strong>{formatCountdown(row.msRemaining)}</strong> — renew to avoid interruption.
                      </>
                    )
                  ) : row.reason === "suspended" ? (
                    <>
                      <strong>{row.info.label}</strong>
                      {branchName ? (
                        <>
                          {" "}
                          for <strong>{branchName}</strong>
                        </>
                      ) : null}{" "}
                      is <strong>suspended</strong>. Contact support to resolve it.
                    </>
                  ) : row.reason === "expired" ? (
                    <>
                      <strong>{row.info.label}</strong>
                      {branchName ? (
                        <>
                          {" "}
                          for <strong>{branchName}</strong>
                        </>
                      ) : null}{" "}
                      has <strong>expired</strong>. Contact support to reactivate.
                    </>
                  ) : (
                    <>
                      <strong>{row.info.label}</strong>
                      {branchName ? (
                        <>
                          {" "}
                          for <strong>{branchName}</strong>
                        </>
                      ) : null}{" "}
                      expires in <strong>{formatCountdown(row.msRemaining)}</strong> — renew to avoid interruption.
                    </>
                  )}
                </span>
              </div>

              <div className="sub-countdown-bar-support-wrap">
                <button
                  className="sub-countdown-bar-btn"
                  onClick={() => setOpenSupportFor((cur) => (cur === row.key ? null : row.key))}
                >
                  Contact Support
                </button>
                {openSupportFor === row.key && (
                  <div className="sub-countdown-bar-popover" onMouseLeave={() => setOpenSupportFor(null)}>
                    <a
                      className="sub-countdown-bar-popover-item"
                      href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                    <a
                      className="sub-countdown-bar-popover-item"
                      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                        row.kind === "module" ? `${row.info.label} Subscription Request` : "POS Subscription Request"
                      )}&body=${encodeURIComponent(message)}`}
                    >
                      <Mail size={14} /> Email
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button className="sub-countdown-bar-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}