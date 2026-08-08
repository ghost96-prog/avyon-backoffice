// src/hooks/useInsights.js
//
// Sibling to useBranchNotifications: same polling shape, but points at
// the insights feed (business-intelligence events — sales milestones,
// conflict sales, refunds, laybye events, shift closes, branch-overtake
// comparisons) instead of the operational notification queue.
//
// BUSINESS-WIDE, not branch-scoped: polls GET /business/:businessId/insights
// (a collectionGroup feed spanning every branch), not the old per-branch
// /business/:businessId/branches/:branchId/insights. That's what makes
// this fire regardless of which branch is currently selected AND
// regardless of which screen the user is on — it only depends on
// businessId, which resolves as soon as the user's logged in, before
// they've even picked a branch anywhere.
//
// Toast behavior:
//   - `toasts` is a STACK — every unread insight currently in play is in
//     the array at once, rendered one after another (visually stacked),
//     not doled out one-at-a-time.
//   - An insight is marked read the moment it's pulled off the server
//     feed and added to the stack — not when the toast is dismissed.
//     That means it can never be re-shown by a later poll or by this
//     hook remounting (e.g. navigating away from and back to a page),
//     because the server will no longer return it as unread.
//   - `seenIdsRef` is an additional in-memory guard for the current
//     mount, so a toast can't be added twice between two overlapping
//     polls.
//   - Each insight carries its own `branchId` (it can come from any
//     branch under the business), so read/dismiss calls are made against
//     THAT branch's endpoint, not a single branch passed into the hook.
//   - There's no launch-brief / modal concept here — insights are
//     toast-only.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

const POLL_INTERVAL_MS = 15000;
const MAX_STACKED_TOASTS = 5;

export function useInsights() {
  const { apiFetch, businessId } = useAppContext();
  const [toasts, setToasts] = useState([]);
  const seenIdsRef = useRef(new Set());

  const markReadOnServer = useCallback(
    (insight) => {
      if (!businessId || !insight?.branchId || !insight?.insightId) return;
      apiFetch(
        `/business/${businessId}/branches/${insight.branchId}/insights/${insight.insightId}/read`,
        { method: 'POST' }
      ).catch((e) => console.error('markInsightRead error:', e));
    },
    [apiFetch, businessId]
  );

  const dismissOnServer = useCallback(
    (insight) => {
      if (!businessId || !insight?.branchId || !insight?.insightId) return;
      apiFetch(
        `/business/${businessId}/branches/${insight.branchId}/insights/${insight.insightId}/dismiss`,
        { method: 'POST' }
      ).catch((e) => console.error('dismissInsight error:', e));
    },
    [apiFetch, businessId]
  );

  // Removes a toast from the stack (by id) and dismisses it server-side
  // using ITS OWN branchId, so it's fully retired and can't reappear.
  const dismissToast = useCallback(
    (insightId) => {
      setToasts((prev) => {
        const target = prev.find((t) => t.insightId === insightId);
        if (target) dismissOnServer(target);
        return prev.filter((t) => t.insightId !== insightId);
      });
    },
    [dismissOnServer]
  );

  const enqueue = useCallback(
    (insight) => {
      if (seenIdsRef.current.has(insight.insightId)) return;
      seenIdsRef.current.add(insight.insightId);
      // Mark read the moment it's added to the stack, not when it's
      // dismissed — so a toast that never gets interacted with (tab
      // closed, navigated away) still can't come back and toast again
      // later.
      markReadOnServer(insight);
      setToasts((prev) => [insight, ...prev].slice(0, MAX_STACKED_TOASTS));
    },
    [markReadOnServer]
  );

  const poll = useCallback(async () => {
    if (!businessId) return;
    try {
      const res = await apiFetch(`/business/${businessId}/insights?unreadOnly=true&limit=20`);
      (res?.insights || []).forEach(enqueue);
    } catch (e) {
      // Silent — polling failures shouldn't be noisy
    }
  }, [apiFetch, businessId, enqueue]);

  useEffect(() => {
    seenIdsRef.current = new Set();
    setToasts([]);
    if (!businessId) return undefined;

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  return { toasts, dismissToast, markRead: dismissToast };
}