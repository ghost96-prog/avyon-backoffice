// src/components/subscription/SubscriptionPayHost.jsx
//
// Owns the EcoCash renewal modal. Two ways it opens:
//   1. the "subscription-pay:open" window event (countdown bar's Renew now;
//      detail.moduleId/moduleLabel → pay for that add-on module instead)
//   2. automatically ONCE per browser session per branch when a branch has
//      expired — dismissable, and never again until the next session.
// Suspended branches never auto-open (renewal is blocked server-side).

import React, { useEffect, useState } from "react";
import { useAppContext } from "../../context/AppContext";
import { useBranchSubscriptions } from "../../hooks/useBranchSubscription";
import SubscriptionPayModal from "./SubscriptionPayModal";

const SEEN_PREFIX = "avyon.payPrompt.";

export default function SubscriptionPayHost() {
  const { branchId, selectedBranchId } = useAppContext();
  const { branchStatuses, loading } = useBranchSubscriptions();
  const [openFor, setOpenFor] = useState(null);
  // Set when paying for an add-on module instead of the base subscription.
  const [moduleTarget, setModuleTarget] = useState(null); // { moduleId, moduleLabel } | null

  useEffect(() => {
    const onOpen = (e) => {
      setModuleTarget(
        e.detail?.moduleId
          ? { moduleId: e.detail.moduleId, moduleLabel: e.detail.moduleLabel || null }
          : null
      );
      setOpenFor(e.detail?.branchId || selectedBranchId || branchId || null);
    };
    window.addEventListener("subscription-pay:open", onOpen);
    return () => window.removeEventListener("subscription-pay:open", onOpen);
  }, [branchId, selectedBranchId]);

  // One-time-per-session prompt for the branch being worked on.
  useEffect(() => {
    if (loading || openFor) return;
    const target = branchStatuses.find((b) => b.branchId === (selectedBranchId || branchId));
    if (!target || !target.isExpired || target.isSuspended) return;
    const key = `${SEEN_PREFIX}${target.branchId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked — skip auto-prompt rather than nag every render */
      return;
    }
    setOpenFor(target.branchId);
  }, [loading, branchStatuses, selectedBranchId, branchId, openFor]);

  if (!openFor) return null;
  const close = () => {
    setOpenFor(null);
    setModuleTarget(null);
  };
  return (
    <SubscriptionPayModal
      key={`${openFor}:${moduleTarget?.moduleId || "base"}`}
      branchId={openFor}
      moduleId={moduleTarget?.moduleId || null}
      moduleLabel={moduleTarget?.moduleLabel || null}
      onClose={close}
    />
  );
}
