// src/hooks/useBranchSubscriptions.js
import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

const WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function formatCountdown(msRemaining) {
  if (msRemaining === null || msRemaining === undefined || msRemaining <= 0) return null;
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d:${hours}h:${minutes}m:${seconds}s`;
}

function deriveBranchStatus(branch) {
  const msRemaining =
    typeof branch.accessExpiresAt === 'number' ? branch.accessExpiresAt - Date.now() : null;

  const isSuspended = branch.status === 'suspended' || branch.subscriptionStatus === 'suspended';
  const isExpired =
    !isSuspended &&
    (branch.subscriptionStatus === 'expired' || (msRemaining !== null && msRemaining <= 0));

  const hasAccess = !isSuspended && !isExpired;
  const isWithinWarningWindow = msRemaining !== null && msRemaining > 0 && msRemaining <= WARNING_WINDOW_MS;

  return {
    branchId: branch.branchId,
    branchName: branch.name,
    subscriptionStatus: isSuspended ? 'suspended' : isExpired ? 'expired' : branch.subscriptionStatus,
    accessExpiresAt: branch.accessExpiresAt || null,
    msRemaining,
    countdownText: formatCountdown(msRemaining),
    hasAccess,
    isExpired,
    isSuspended,
    isWithinWarningWindow,
    suspendedReason: branch.suspendedReason || null,
  };
}

export function useBranchSubscriptions() {
  const { businessId, apiFetch } = useAppContext();
  const [rawBranches, setRawBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    try {
      const data = await apiFetch(`/business/${businessId}/branches`);
      setRawBranches(data || []);
    } catch (e) {
      console.warn('useBranchSubscriptions: failed to load branches:', e.message);
    } finally {
      setLoading(false);
    }
  }, [businessId, apiFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Real-time: recompute every second
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const branchStatuses = rawBranches.map((b) => deriveBranchStatus(b));

  return { branchStatuses, loading, refresh, _now: now };
}

export function useBranchSubscription(branchId) {
  const { branchStatuses, loading, refresh } = useBranchSubscriptions();
  const branch = branchStatuses.find((b) => b.branchId === branchId) || null;
  return { branch, loading, refresh };
}