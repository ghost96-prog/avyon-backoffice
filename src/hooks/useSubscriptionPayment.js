// src/hooks/useSubscriptionPayment.js
//
// State machine behind SubscriptionPayModal: load plans → pick plan + EcoCash
// number → wait for the PIN prompt to be approved → success / failed.
//
// The server owns the truth. We never send an amount (only a planId) and
// never decide a payment succeeded ourselves — we poll the server, which
// verifies with ZB. Closing the modal doesn't cancel anything: the payment
// keeps settling server-side, and reopening + tapping Pay resumes it.

import { useState, useRef, useCallback, useEffect } from "react";

const POLL_MS = 3000;
const SLOW_POLL_MS = 8000; // after the "taking longer" threshold
const TERMINAL = ["paid", "failed", "cancelled", "expired", "review"];

// `moduleId` set → pay for that add-on module of the branch (same flow as the
// base subscription, different server path); otherwise the base subscription.
export function useSubscriptionPayment({ apiFetch, businessId, branchId, moduleId = null, onPaid }) {
  const base = moduleId
    ? `/business/${businessId}/branches/${branchId}/modules/${moduleId}/subscription`
    : `/business/${businessId}/branches/${branchId}/subscription`;

  // loading | select | waiting | success | failed | review | blocked | error
  const [phase, setPhase] = useState("loading");
  const [plans, setPlans] = useState(null);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectionTrouble, setConnectionTrouble] = useState(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const data = await apiFetch(`${base}/plans`);
      setPlans(data);
      setPhase(data.canPay ? "select" : "blocked");
    } catch (e) {
      setError(e.message || "Couldn't load subscription plans.");
      setPhase("error");
    }
  }, [apiFetch, base]);

  useEffect(() => {
    load();
  }, [load]);

  const settle = useCallback((p) => {
    setPayment(p);
    if (p.status === "paid") {
      setPhase("success");
      onPaidRef.current?.(p);
    } else if (p.status === "review") setPhase("review");
    else if (TERMINAL.includes(p.status)) setPhase("failed");
    else setPhase("waiting");
  }, []);

  const pay = useCallback(
    async ({ planId, phone }) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const p = await apiFetch(`${base}/pay/ecocash`, {
          method: "POST",
          body: JSON.stringify({ planId, phone }),
        });
        settle(p);
      } catch (e) {
        setError(e.message || "Couldn't start the payment. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [apiFetch, base, settle, submitting]
  );

  // ── Poll while waiting ──────────────────────────────────────────────
  const orderRef = payment?.orderReference;
  useEffect(() => {
    if (phase !== "waiting" || !orderRef) return undefined;
    let stopped = false;
    let timer;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const p = await apiFetch(`${base}/payments/${orderRef}`);
        if (stopped) return;
        setConnectionTrouble(false);
        if (TERMINAL.includes(p.status)) {
          settle(p);
          return;
        }
        setPayment((prev) => ({ ...prev, ...p }));
      } catch {
        // A dropped request ≠ a failed payment. Keep trying, say so quietly.
        if (!stopped) setConnectionTrouble(true);
      }
      if (stopped) return;
      const slow = Date.now() - startedAt > (payment?.waitMs || 180000);
      timer = setTimeout(tick, slow ? SLOW_POLL_MS : POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, orderRef, apiFetch, base, settle]);

  const cancel = useCallback(async () => {
    if (!orderRef) return;
    try {
      const p = await apiFetch(`${base}/payments/${orderRef}/cancel`, { method: "POST" });
      if (p.status === "paid") settle(p); // approved a heartbeat before cancelling
      else {
        setPayment(null);
        setPhase("select");
      }
    } catch (e) {
      setError(e.message || "Couldn't cancel the payment.");
    }
  }, [apiFetch, base, orderRef, settle]);

  const tryAgain = useCallback(() => {
    setPayment(null);
    setError(null);
    setPhase("select");
  }, []);

  return { phase, plans, payment, error, submitting, connectionTrouble, pay, cancel, tryAgain, reload: load };
}
