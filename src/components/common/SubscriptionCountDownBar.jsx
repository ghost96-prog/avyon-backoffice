// src/components/common/SubscriptionCountdownBar.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { AlertTriangle, Clock, MessageCircle, Mail, X } from "lucide-react";
import { useBranchSubscriptions } from "../../hooks/useBranchSubscription";
import { useAppContext } from "../../context/AppContext";
import "./SubscriptionCountDownBar.css";

const SUPPORT_WHATSAPP_NUMBER = "263783556354";
const SUPPORT_EMAIL = "gkmangezi09@gmail.com";

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
  const { branchId, businessId } = useAppContext();
  const { branchStatuses, loading } = useBranchSubscriptions();
  const [dismissed, setDismissed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  // ✅ ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Find the current branch
  const currentBranch = branchStatuses.find((b) => b.branchId === branchId);
  
  // Find ANY branch that needs attention
  const expiringBranch = branchStatuses.find((b) => {
    if (b.isSuspended) return true;
    if (b.isExpired) return true;
    if (b.isWithinWarningWindow) return true;
    return false;
  });

  // Use the expiring branch if found, otherwise use current branch
  const targetBranch = expiringBranch || currentBranch;

  // ✅ useMemo MUST be called before any conditional return
  const supportMessage = useMemo(() => {
    const branchName = targetBranch?.branchName || "";
    return `Hi, I'd like to renew POS access${branchName ? ` for ${branchName}` : ""}. Business ID: ${businessId || ""}`;
  }, [targetBranch, businessId]);

  // ✅ NOW we can do conditional returns AFTER all hooks
  if (loading) {
    return null;
  }

  if (!targetBranch) {
    return null;
  }

  const { isSuspended, isExpired, isWithinWarningWindow, msRemaining, branchName } = targetBranch;

  // Determine if we should show the bar
  const shouldShow = !dismissed && (isSuspended || isExpired || isWithinWarningWindow);

  if (!shouldShow) {
    return null;
  }

  const tone = isSuspended || isExpired ? "critical" : "warning";

  return (
    <div className={`sub-countdown-bar sub-countdown-bar--${tone}`}>
      <div className="sub-countdown-bar-main">
        <span className="sub-countdown-bar-icon">
          {tone === "critical" ? <AlertTriangle size={16} /> : <Clock size={16} />}
        </span>
        <span className="sub-countdown-bar-text">
          {isSuspended ? (
            <>Branch <strong>{branchName}</strong> is <strong>suspended</strong>. Contact support to restore it.</>
          ) : isExpired ? (
            <>Branch <strong>{branchName}</strong> subscription has <strong>expired</strong>. Contact support to reactivate.</>
          ) : (
            <>Branch <strong>{branchName}</strong> subscription expires in <strong>{formatCountdown(msRemaining)}</strong> — renew to avoid interruption.</>
          )}
        </span>
      </div>

      <div className="sub-countdown-bar-actions">
        <div className="sub-countdown-bar-support-wrap">
          <button className="sub-countdown-bar-btn" onClick={() => setSupportOpen((v) => !v)}>
            Contact Support
          </button>
          {supportOpen && (
            <div className="sub-countdown-bar-popover" onMouseLeave={() => setSupportOpen(false)}>
              <a
                className="sub-countdown-bar-popover-item"
                href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(supportMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
              <a
                className="sub-countdown-bar-popover-item"
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("POS Subscription Request")}&body=${encodeURIComponent(supportMessage)}`}
              >
                <Mail size={14} /> Email
              </a>
            </div>
          )}
        </div>
        <button className="sub-countdown-bar-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}