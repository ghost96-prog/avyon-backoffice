// src/components/subscription/SubscriptionPayModal.jsx
//
// Pay a branch's subscription with EcoCash (ZB Smile&Pay). Opened from the
// countdown bar's "Renew now" and automatically once per session when a
// branch has expired (see SubscriptionPayHost).
//
// The header is a small ledger: when access ends today → when it will end
// after the selected plan. It updates live as the plan changes, so the owner
// always sees exactly what they're buying.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Smartphone, ShieldCheck, AlertTriangle, MessageCircle, RotateCcw, Clock } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { useSubscriptionPayment } from "../../hooks/useSubscriptionPayment";
import "./SubscriptionPayModal.css";

const SUPPORT_WHATSAPP_NUMBER = "263783556354";
const DAY = 24 * 60 * 60 * 1000;

const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function normalisePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("263")) d = `0${d.slice(3)}`;
  return d.slice(0, 10);
}
const formatPhone = (raw) => {
  const d = normalisePhone(raw);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" ");
};
const phoneValid = (raw) => /^07[78]\d{7}$/.test(normalisePhone(raw));

function mmss(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function describeNow(branch) {
  if (!branch) return "—";
  const now = Date.now();
  if (!branch.hasAccess) {
    if (!branch.accessExpiresAt) return "Not active";
    const days = Math.floor((now - branch.accessExpiresAt) / DAY);
    if (days < 1) return "Expired today";
    return `Expired ${days} ${days === 1 ? "day" : "days"} ago`;
  }
  return fmtDate(branch.accessExpiresAt);
}

export default function SubscriptionPayModal({ branchId, moduleId = null, moduleLabel = null, onClose }) {
  const { apiFetch, businessId, businessName, branches } = useAppContext();
  const branchName = branches?.find((b) => b.branchId === branchId)?.name || "";

  const sub = useSubscriptionPayment({
    apiFetch,
    businessId,
    branchId,
    moduleId,
    onPaid: () => {
      window.dispatchEvent(new Event("branch-subscriptions:refresh"));
      if (moduleId) window.dispatchEvent(new Event("module-subscriptions:refresh"));
    },
  });
  const { phase, plans, payment, error, submitting, connectionTrouble } = sub;

  const [planId, setPlanId] = useState(null);
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef(null);

  // Default to the first plan once they load.
  useEffect(() => {
    if (plans?.plans?.length && !planId) setPlanId(plans.plans[0].id);
  }, [plans, planId]);

  // Esc closes (a pending payment keeps settling server-side).
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Live elapsed clock while waiting.
  const startedAt = useRef(null);
  const [, force] = useState(0);
  useEffect(() => {
    if (phase !== "waiting") {
      startedAt.current = null;
      return undefined;
    }
    if (!startedAt.current) startedAt.current = Date.now() - (payment?.elapsedMs || 0);
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase, payment?.elapsedMs]);

  const money = useMemo(() => {
    const cur = plans?.currency || "USD";
    const f = new Intl.NumberFormat("en-US", { style: "currency", currency: cur });
    return (n) => f.format(n);
  }, [plans?.currency]);

  const selected = plans?.plans?.find((p) => p.id === planId) || null;
  const afterDate = selected
    ? Math.max(plans?.branch?.accessExpiresAt || 0, Date.now()) + selected.days * DAY
    : null;
  const elapsed = startedAt.current ? Date.now() - startedAt.current : 0;
  const slow = phase === "waiting" && elapsed > (payment?.waitMs || 180000);
  const phoneOk = phoneValid(phone);
  const showPhoneError = touched && phone && !phoneOk;

  const subjectName = moduleId ? moduleLabel || "this module" : "your subscription";

  const supportUrl = (text) =>
    `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
      `${text}${moduleLabel ? ` Module: ${moduleLabel}.` : ""}${branchName ? ` Branch: ${branchName}.` : ""}${businessName ? ` Business: ${businessName}.` : ""} Business ID: ${businessId || ""}`
    )}`;

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!selected || !phoneOk || submitting) return;
    sub.pay({ planId: selected.id, phone: normalisePhone(phone) });
  };

  const title =
    phase === "success"
      ? "Payment received"
      : phase === "waiting"
        ? "Approve on your phone"
        : phase === "failed"
          ? "Payment not completed"
          : phase === "review"
            ? "We're checking your payment"
            : phase === "blocked"
              ? "Renewal unavailable"
              : moduleId
                ? `Pay for ${moduleLabel || "module"}`
                : "Renew subscription";

  return (
    <div
      className="spm-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase !== "waiting") onClose?.();
      }}
    >
      <div
        className="spm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spm-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        {/* ── Header / ledger ───────────────────────────────────────── */}
        <header className="spm-head">
          <button className="spm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
          <h2 id="spm-title" className="spm-title">
            {title}
          </h2>
          {branchName && (
            <p className="spm-branch">{moduleId ? `${moduleLabel || "Module"} · ${branchName}` : branchName}</p>
          )}

          {plans && (phase === "select" || phase === "waiting" || phase === "success") && (
            <div className="spm-ledger" aria-live="polite">
              <div className="spm-ledger-cell">
                <span className="spm-ledger-label">{phase === "success" ? "Was" : "Access"}</span>
                <span className={`spm-ledger-value ${plans.branch?.hasAccess ? "" : "spm-ledger-value--warn"}`}>
                  {describeNow(plans.branch)}
                </span>
              </div>
              <svg className="spm-ledger-arrow" width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
                <path d="M0 6h25M20 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="spm-ledger-cell spm-ledger-cell--after">
                <span className="spm-ledger-label">Active until</span>
                <span className="spm-ledger-value">
                  {phase === "success" && payment?.newExpiresAt
                    ? fmtDate(payment.newExpiresAt)
                    : afterDate
                      ? fmtDate(afterDate)
                      : "—"}
                </span>
              </div>
            </div>
          )}
        </header>

        {plans?.environment === "sandbox" && (
          <div className="spm-testbar">Test mode: no real money is charged.</div>
        )}

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="spm-body">
          {phase === "loading" && (
            <div className="spm-center" role="status">
              <span className="spm-spinner" />
              <p className="spm-muted">Loading plans…</p>
            </div>
          )}

          {phase === "error" && (
            <div className="spm-center">
              <AlertTriangle size={28} className="spm-ico-danger" />
              <p className="spm-lead">Couldn't load plans</p>
              <p className="spm-muted">{error}</p>
              <button className="spm-btn spm-btn--primary" onClick={sub.reload}>
                <RotateCcw size={16} /> Try again
              </button>
            </div>
          )}

          {phase === "blocked" && (
            <div className="spm-center">
              <AlertTriangle size={28} className="spm-ico-danger" />
              <p className="spm-lead">
                {moduleId ? "This module can't be renewed online" : "This branch can't be renewed online"}
              </p>
              <p className="spm-muted">{plans?.blockedReason}</p>
              <a
                className="spm-btn spm-btn--whatsapp"
                href={supportUrl(moduleId ? "Hi, I need help restoring my add-on module." : "Hi, I need help restoring my branch.")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={16} /> Message support
              </a>
            </div>
          )}

          {phase === "select" && plans && (
            <form onSubmit={submit} noValidate>
              <fieldset className="spm-plans">
                <legend className="spm-legend">Choose a plan</legend>
                {plans.plans.map((p) => (
                  <label key={p.id} className={`spm-plan ${planId === p.id ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="plan"
                      value={p.id}
                      checked={planId === p.id}
                      onChange={() => setPlanId(p.id)}
                    />
                    <span className="spm-plan-radio" aria-hidden="true" />
                    <span className="spm-plan-main">
                      <span className="spm-plan-name">{p.label}</span>
                      <span className="spm-plan-sub">
                        {p.months > 1 ? `${money(p.perMonth)} a month` : "Billed monthly"}
                      </span>
                    </span>
                    {p.savings > 0 && <span className="spm-save">Save {money(p.savings)}</span>}
                    <span className="spm-plan-price">{money(p.price)}</span>
                  </label>
                ))}
              </fieldset>

              <label className="spm-field" htmlFor="spm-phone">
                <span className="spm-legend">EcoCash number</span>
                <span className={`spm-input ${showPhoneError ? "has-error" : ""}`}>
                  <span className="spm-input-prefix">
                    <Smartphone size={15} /> +263
                  </span>
                  <input
                    id="spm-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="077 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    onBlur={() => setTouched(true)}
                    aria-invalid={showPhoneError}
                    aria-describedby="spm-phone-help"
                  />
                </span>
                <span id="spm-phone-help" className={`spm-help ${showPhoneError ? "spm-help--error" : ""}`}>
                  {showPhoneError
                    ? "Enter an EcoCash number starting 077 or 078."
                    : "We'll send a PIN prompt to this phone. Nothing is charged until you approve it."}
                </span>
              </label>

              {error && (
                <div className="spm-alert" role="alert">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="spm-btn spm-btn--primary spm-btn--block" disabled={!selected || submitting}>
                {submitting ? (
                  <>
                    <span className="spm-spinner spm-spinner--sm" /> Sending request…
                  </>
                ) : (
                  <>Pay {selected ? money(selected.price) : ""} with EcoCash</>
                )}
              </button>

              <p className="spm-foot">
                <ShieldCheck size={14} /> Processed securely by ZB Smile&amp;Pay. We never see your PIN.
              </p>
            </form>
          )}

          {phase === "waiting" && (
            <div className="spm-wait" role="status" aria-live="polite">
              <div className="spm-phone" aria-hidden="true">
                <svg viewBox="0 0 96 120" width="96" height="120">
                  <rect x="14" y="4" width="68" height="112" rx="12" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  <rect x="24" y="22" width="48" height="52" rx="6" className="spm-phone-screen" />
                  <rect x="30" y="32" width="36" height="4" rx="2" className="spm-phone-line" />
                  <rect x="30" y="42" width="28" height="4" rx="2" className="spm-phone-line" />
                  <rect x="30" y="56" width="20" height="8" rx="3" className="spm-phone-cursor" />
                  <circle cx="48" cy="98" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <p className="spm-lead">Enter your EcoCash PIN</p>
              <p className="spm-muted spm-wait-text">
                A prompt for <strong>{money(payment?.amount || 0)}</strong> was sent to{" "}
                <strong>{payment?.phoneMasked || "your phone"}</strong>. Approve it there; this page updates by
                itself.
              </p>
              <p className="spm-timer" aria-label="Time waiting">
                <Clock size={14} /> {mmss(elapsed)}
              </p>
              {connectionTrouble && <p className="spm-muted spm-trouble">Connection lost. Still trying…</p>}
              {slow && (
                <div className="spm-note">
                  Taking longer than usual. You can close this: we keep checking and will update {subjectName} as
                  soon as the payment goes through.
                </div>
              )}
              <div className="spm-actions">
                <button className="spm-btn spm-btn--ghost" onClick={sub.cancel}>
                  Cancel payment
                </button>
                {slow && (
                  <button className="spm-btn spm-btn--secondary" onClick={onClose}>
                    Close
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === "success" && (
            <div className="spm-center spm-success">
              <svg className="spm-check" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                <circle cx="32" cy="32" r="29" className="spm-check-ring" />
                <path d="M20 33l8 8 16-17" className="spm-check-tick" />
              </svg>
              <p className="spm-lead">
                {payment?.appliedWhileHeld
                  ? "Payment received"
                  : moduleId
                    ? `${moduleLabel || "Module"} is active`
                    : `${branchName || "Your branch"} is active`}
              </p>
              <p className="spm-muted">
                {payment?.appliedWhileHeld
                  ? `${moduleId ? "This module is" : "This branch is"} currently suspended, so your payment is held and applies as soon as support restores it.`
                  : `${moduleId ? `${moduleLabel || "The module"} runs` : "Your subscription runs"} until ${payment?.newExpiresAt ? fmtDate(payment.newExpiresAt) : "the new date"}. A receipt was added to your notifications.`}
              </p>
              <p className="spm-ref">Ref {payment?.orderReference}</p>
              <button className="spm-btn spm-btn--primary spm-btn--block" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {phase === "failed" && (
            <div className="spm-center">
              <AlertTriangle size={28} className="spm-ico-danger" />
              <p className="spm-lead">{payment?.status === "cancelled" ? "Payment cancelled" : "Payment didn't go through"}</p>
              <p className="spm-muted">{payment?.message || "No money was taken. You can try again."}</p>
              <div className="spm-actions">
                <button className="spm-btn spm-btn--primary" onClick={sub.tryAgain}>
                  <RotateCcw size={16} /> Try again
                </button>
                <button className="spm-btn spm-btn--secondary" onClick={onClose}>
                  Close
                </button>
              </div>
              <p className="spm-ref">Ref {payment?.orderReference}</p>
            </div>
          )}

          {phase === "review" && (
            <div className="spm-center">
              <Clock size={28} className="spm-ico-warn" />
              <p className="spm-lead">Support is looking at this payment</p>
              <p className="spm-muted">{payment?.message}</p>
              <a
                className="spm-btn spm-btn--whatsapp"
                href={supportUrl(`Hi, please check my EcoCash payment. Reference: ${payment?.orderReference}.`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={16} /> Message support
              </a>
              <p className="spm-ref">Ref {payment?.orderReference}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
