// src/hooks/useBranchNotifications.js
//
// Polls GET .../notifications for a given branch and surfaces new,
// unread ones as toasts. Used app-wide (mounted once in DashboardLayout)
// so an incoming stock transfer notification pops up no matter which
// page the user is currently on — not just on the Transfers screen.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

const POLL_INTERVAL_MS = 15000;

export function useBranchNotifications(branchId) {
  const { apiFetch, businessId } = useAppContext();
  const [toasts, setToasts] = useState([]);
  const seenIdsRef = useRef(new Set());
  const isFirstPollRef = useRef(true);

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
      const res = await apiFetch(`/business/${businessId}/branches/${branchId}/notifications?unreadOnly=true&limit=20`);
      const list = res?.notifications || [];

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
    seenIdsRef.current = new Set();
    setToasts([]);
    if (!branchId) return;

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [branchId, poll]);

  return { toasts, dismissToast, markRead };
}