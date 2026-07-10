// src/components/pin/SubscriptionBadge.jsx
import React, { useEffect, useState, useCallback } from "react";
import { Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import "./SubscriptionBadge.css";

export default function SubscriptionBadge({ compact = false }) {
  const { apiFetch, businessId, branchId } = useAppContext();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!businessId || !branchId) return;
    try {
      const data = await apiFetch(`/business/${businessId}/branches/${branchId}/access-status`);
      setStatus(data);
    } catch (e) {
      console.warn("SubscriptionBadge: failed to load access status:", e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, branchId]);

  useEffect(() => {
    load();
    // Keep the countdown honest while the gate sits open
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !status) return null;

  const { subscriptionStatus, countdown, hasAccess } = status;

  let tone = "ok";
  let Icon = ShieldCheck;
  let label = "Active";

  if (subscriptionStatus === "trial") {
    tone = "trial";
    Icon = Clock;
    label = compact ? countdown : `Trial · ${countdown} left`;
  } else if (subscriptionStatus === "active") {
    tone = "ok";
    Icon = ShieldCheck;
    label = compact ? "Active" : `Active · ${countdown} left`;
  } else if (subscriptionStatus === "suspended") {
    tone = "danger";
    Icon = AlertTriangle;
    label = "Suspended";
  } else {
    tone = "danger";
    Icon = AlertTriangle;
    label = "Expired";
  }

  if (!hasAccess && subscriptionStatus !== "suspended") {
    tone = "danger";
    Icon = AlertTriangle;
    label = "Expired";
  }

  return (
    <div className={`subscription-badge subscription-badge-${tone} ${compact ? "compact" : ""}`}>
      <Icon size={compact ? 11 : 13} />
      <span>{label}</span>
    </div>
  );
}