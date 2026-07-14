// src/hooks/useSelectedBranch.js
//
// Thin convenience wrapper around AppContext's shared, persisted
// `selectedBranchId` (see AppContext.jsx) — the single source of truth for
// "which branch is the user actively looking at/acting on right now."
//
// Use this in ANY screen that has its own in-page store switcher, instead
// of a local `useState('')`. That's what makes:
//   1) the choice shared across screens + persisted across reloads
//   2) module gating (useModuleGate/useModuleSubscriptions) and every other
//      branch-aware bit of UI (TopBar, ModuleSubscriptionModal,
//      SubscriptionCountdownBar) immediately reflect the switch
// — without each screen having to know any of that's happening.
//
// Two flavors, matching the two reference implementations:
//
//   useSelectedBranch()                 // Products-style: always exactly
//                                        // one real branch, no "All" option.
//
//   useSelectedBranch({ allowAll: true }) // Dashboard-style: local "All
//                                          // Stores" sentinel that the
//                                          // shared value can't represent;
//                                          // picking a REAL branch here
//                                          // still writes through to the
//                                          // shared value so other screens
//                                          // (and gating) see it too.

import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

export function useSelectedBranch({ allowAll = false } = {}) {
  const {
    selectedBranchId: sharedBranchId,
    setSelectedBranchId: setSharedBranchId,
    branches,
  } = useAppContext();

  // Called unconditionally regardless of `allowAll` (never behind a
  // condition) — it's just unused in the plain-passthrough case, which
  // keeps this hook's own hook-call order identical on every render.
  const [localBranchId, setLocalBranchId] = useState(() => (allowAll ? sharedBranchId || 'all' : null));

  const setSelectedBranchId = useCallback(
    (value) => {
      if (allowAll) {
        setLocalBranchId(value);
        if (value !== 'all') setSharedBranchId(value); // only a real branch updates the shared/gated value
      } else {
        setSharedBranchId(value);
      }
    },
    [allowAll, setSharedBranchId]
  );

  return {
    selectedBranchId: allowAll ? localBranchId : sharedBranchId,
    setSelectedBranchId,
    branches,
  };
}