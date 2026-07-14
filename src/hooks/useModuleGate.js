// src/hooks/useModuleGate.js
//
// Shared gating helper for anything module-tied: the Sidebar (nav-level
// blocking) and any screen that gates individual write actions (Products).
// Wraps useModuleSubscriptions so consumers don't need to know about the
// cache/offline behavior — they just ask "can I do this?" and, if not,
// get a ready-to-render modal state.

import { useState, useCallback } from 'react';
import { useModuleSubscriptions } from './useModuleSubscriptions';

export function useModuleGate() {
  const { hasModuleAccess, getModuleState, loading } = useModuleSubscriptions();
  const [gateModalModuleId, setGateModalModuleId] = useState(null);

  /**
   * Wrap a nav click: if the item has a moduleId and the branch doesn't
   * have access, open the modal and return false (caller should not
   * navigate). Otherwise returns true (caller proceeds as normal).
   */
  const guardNavClick = useCallback((navItem) => {
    if (!navItem.moduleId) return true; // ungated item
    if (navItem.moduleGateMode !== 'block-nav') return true; // e.g. Products' 'allow-view'
    if (hasModuleAccess(navItem.moduleId)) return true;
    setGateModalModuleId(navItem.moduleId);
    return false;
  }, [hasModuleAccess]);

  /**
   * Wrap a specific in-screen action (e.g. "New Product", "Delete",
   * "Import"): if access is missing, open the modal and return false so
   * the caller skips the actual action.
   */
  const guardAction = useCallback((moduleId) => {
    if (hasModuleAccess(moduleId)) return true;
    setGateModalModuleId(moduleId);
    return false;
  }, [hasModuleAccess]);

  const closeGateModal = useCallback(() => setGateModalModuleId(null), []);

  return {
    loading,
    hasModuleAccess,
    getModuleState,
    guardNavClick,
    guardAction,
    gateModalModuleId,
    closeGateModal,
  };
}