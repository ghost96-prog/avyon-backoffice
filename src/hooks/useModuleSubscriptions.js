// src/hooks/useModuleSubscriptions.js
//
// Fetches /business/:businessId/branches/:branchId/module-access-status
// and exposes each of the 3 add-on modules' live state for the CURRENT
// branch, with an offline-safe local cache (see moduleSubscriptionCache.js).
//
// Consumers (Products.jsx, navConfig gating, the "not subscribed" modal)
// use hasModuleAccess(moduleId) / getModuleState(moduleId) rather than
// reading raw fetch state directly, so they automatically get the
// fallback-to-cache behavior for free.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { readCache, writeCache, reresolveAgainstClock, STALE_AFTER_MS } from '../utils/moduleSubscriptionCache';

const EMPTY_MODULES = {
  inventory_mgmt: { status: 'inactive', hasAccess: false, accessExpiresAt: null, msRemaining: null },
  advanced_inventory: { status: 'inactive', hasAccess: false, accessExpiresAt: null, msRemaining: null },
  analytics: { status: 'inactive', hasAccess: false, accessExpiresAt: null, msRemaining: null },
};

export function useModuleSubscriptions() {
  const { apiFetch, businessId, branchId, selectedBranchId } = useAppContext();
  // ✅ Track whichever branch is actually being viewed/acted on right now
  // (set by any in-page store switcher), not the static home/login branch.
  // Falls back to the home branch only before a selection has resolved
  // (e.g. very first render, before AppContext's branches list loads).
  const branchId_ = selectedBranchId || branchId;

  const [modules, setModules] = useState(EMPTY_MODULES);
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false); // true = showing cached data, last live fetch failed
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  // Guards against a slow request from a previous branch landing after
  // the user has already switched branches.
  const requestBranchRef = useRef(null);

  const hydrateFromCache = useCallback((forBranchId) => {
    const cached = readCache(forBranchId);
    if (!cached) return false;
    setModules(reresolveAgainstClock(cached.modules));
    setLastFetchedAt(cached.fetchedAt);
    setIsStale(true); // cache is only ever shown when we don't have a fresh live result yet
    return true;
  }, []);

  const fetchLive = useCallback(async () => {
    if (!businessId || !branchId_) return;
    requestBranchRef.current = branchId_;
    const thisBranchId = branchId_;

    // Show cache immediately (if any) while the live fetch is in flight,
    // so there's no "everything looks inactive" flash on every reload.
    const hadCache = hydrateFromCache(thisBranchId);
    // ✅ If we just switched to a branch with no cache of its own, don't
    // leave the PREVIOUS branch's module state on screen while the live
    // fetch is in flight — that's what let a stale "has access"/"gated"
    // result briefly (or, on a failed fetch, indefinitely) apply to the
    // wrong branch. Reset to the safe "no access proven yet" default.
    if (!hadCache) setModules(EMPTY_MODULES);
    setLoading(!hadCache);

    try {
      const data = await apiFetch(
        `/business/${businessId}/branches/${thisBranchId}/module-access-status`
      );
      // Stale response guard — branch changed mid-flight.
      if (requestBranchRef.current !== thisBranchId) return;

      const normalized = {};
      for (const [moduleId, mod] of Object.entries(data.modules || {})) {
        normalized[moduleId] = {
          status: mod.status,
          hasAccess: mod.hasAccess,
          accessExpiresAt: mod.accessExpiresAt,
          msRemaining: mod.msRemaining,
        };
      }

      setModules(normalized);
      setIsStale(false);
      setLastFetchedAt(Date.now());
      writeCache(thisBranchId, normalized);
    } catch (error) {
      // ✅ THE IMPORTANT PART: a failed fetch NEVER downgrades a
      // cached "active" module to "expired"/"inactive". We already
      // hydrated from cache above (if any existed); just mark it stale
      // and move on. If there was no cache at all (e.g. very first load
      // ever, no connectivity), modules stay at the safe EMPTY_MODULES
      // default (hasAccess: false) — nothing is granted that wasn't
      // already proven, but nothing paid-for is falsely revoked either.
      console.error('module-access-status fetch failed (using cache if available):', error.message);
      setIsStale(true);
    } finally {
      if (requestBranchRef.current === thisBranchId) setLoading(false);
    }
  }, [apiFetch, businessId, branchId_, hydrateFromCache]);

  useEffect(() => {
    fetchLive();
    // Re-check the wall clock periodically even without a network call,
    // so a module that's ACTUALLY expired flips locally without waiting
    // for the next full refresh (this never re-activates anything — see
    // reresolveAgainstClock).
    const clockTick = setInterval(() => {
      setModules((prev) => reresolveAgainstClock(prev));
    }, 60 * 1000);
    return () => clearInterval(clockTick);
  }, [fetchLive]);

  const hasModuleAccess = useCallback(
    (moduleId) => !!modules[moduleId]?.hasAccess,
    [modules]
  );

  const getModuleState = useCallback(
    (moduleId) => modules[moduleId] || EMPTY_MODULES[moduleId] || null,
    [modules]
  );

  const cacheAgeMs = lastFetchedAt ? Date.now() - lastFetchedAt : null;
  const cacheIsVeryOld = cacheAgeMs != null && cacheAgeMs > STALE_AFTER_MS;

  return {
    modules,
    loading,
    isStale,        // true = last live fetch failed, showing cached/clock-resolved data
    cacheIsVeryOld,  // true = even the cache itself is old (informational only, doesn't block access)
    hasModuleAccess,
    getModuleState,
    refresh: fetchLive,
  };
}