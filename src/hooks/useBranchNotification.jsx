// src/hooks/useBranchNotifications.js
//
// Polls GET .../notifications for a given branch and surfaces new,
// unread ones as toasts. Used app-wide (mounted once in DashboardLayout)
// so an incoming stock transfer notification pops up no matter which
// page the user is currently on — not just on the Transfers screen.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

// Polling cost: Firestore bills per document returned, and this runs for every open
// app all day. So each poll sends `since` (a cursor = the newest thing already seen)
// and the server returns only what is NEW (usually nothing, billed as 1 read) instead
// of re-reading the whole unread pile every time. 30s is plenty for a toast, and polls
// pause while the tab is hidden.
const POLL_INTERVAL_MS = 30000;
const CURSOR_OVERLAP_MS = 5000; // small overlap so nothing created mid-request is missed (seenIds dedupes)

export function useBranchNotifications(branchId) {
  const { apiFetch, businessId } = useAppContext();
  const [toasts, setToasts] = useState([]);
  const seenIdsRef = useRef(new Set());
  const isFirstPollRef = useRef(true);
  const sinceRef = useRef(null); // newest createdAt (server clock) already seen

  const dismissToast = useCallback((notificationId) => {
    setToasts((prev) => prev.filter((t) => t.notificationId !== notificationId));
  }, []);

  const markRead = useCallback(async (notificationId) => {
    dismissToast(notificationId);
    if (!businessId || !branchId) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${branchId}/notifications/${notificationId}/read`, { method: 'POST' });
    } catch (e) {
      console.error('markNotificationRead error:', e);
    }
  }, [apiFetch, businessId, branchId, dismissToast]);

  const poll = useCallback(async () => {
    if (!businessId || !branchId) return;
    try {
      // First poll only needs to learn "now" (it never toasts the backlog), so ask for 1 doc.
      // After that, ask only for notifications newer than the cursor.
      const first = isFirstPollRef.current;
      const res = await apiFetch(
        first
          ? `/business/${businessId}/branches/${branchId}/notifications?unreadOnly=true&limit=1`
          : `/business/${businessId}/branches/${branchId}/notifications?unreadOnly=true&limit=20&since=${sinceRef.current || 0}`
      );
      const list = res?.notifications || [];
      const newest = list.reduce((m, n) => Math.max(m, n.createdAt || 0), 0);
      const serverNow = typeof res?.serverTime === 'number' ? res.serverTime : Date.now();
      sinceRef.current = Math.max(sinceRef.current || 0, newest, serverNow - CURSOR_OVERLAP_MS);

      // First poll after mount just seeds "already seen" — don't toast
      // every unread notification that existed before this page loaded.
      if (isFirstPollRef.current) {
        list.forEach((n) => seenIdsRef.current.add(n.notificationId));
        isFirstPollRef.current = false;
        return;
      }

      const fresh = list.filter((n) => !seenIdsRef.current.has(n.notificationId));
      if (fresh.length > 0) {
        fresh.forEach((n) => seenIdsRef.current.add(n.notificationId));
        setToasts((prev) => [...fresh, ...prev].slice(0, 5));
      }
    } catch (e) {
      // Silent — polling failures shouldn't be noisy
    }
  }, [apiFetch, businessId, branchId]);

  useEffect(() => {
    isFirstPollRef.current = true;
    sinceRef.current = null;
    seenIdsRef.current = new Set();
    setToasts([]);
    if (!branchId) return;

    poll();
    // no polling while the tab is hidden; catch up the moment it is visible again
    const interval = setInterval(() => { if (!document.hidden) poll(); }, POLL_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [branchId, poll]);

  return { toasts, dismissToast, markRead };
}