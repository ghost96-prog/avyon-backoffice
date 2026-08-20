// src/hooks/useAskAvyon.js
//
// Data layer for the floating "Ask Avyon" button. Talks to the read-only
// /business/:businessId/ask-avyon/* endpoints (services/askAvyonEngine.js
// on the backend) — no AI model, no writes, just deterministic math over
// Firestore data the app already trusts.
//
// Branch scope: this hook does NOT keep its own idea of "which branch" —
// it reads `selectedBranchId` straight from AppContext, the same shared,
// persisted value every other screen's branch switcher (Dashboard,
// Products, etc) reads and writes. Picking a different branch inside Ask
// Avyon calls `setSelectedBranchId`, so the rest of the app follows along
// too — it's one switcher, not a separate one that happens to look similar.
//
// The only state local to this hook is whether the owner is currently
// asking about "All branches" (aggregated across the whole business) —
// that's a view the rest of the app doesn't have a screen for, so it can't
// live in the shared selectedBranchId.
import { useState, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';

// Minutes to ADD to a UTC instant to get this browser's local wall-clock
// time (positive east of UTC, negative west) — the inverse sign of the
// native Date.getTimezoneOffset(). Sent on every Ask Avyon request so the
// backend resolves "today" / "this week" the same way the date-range
// picker already does (off the browser's local clock), instead of always
// using server UTC.
function getTzOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

export function useAskAvyon() {
  const { apiFetch, businessId, selectedBranchId, setSelectedBranchId, branches } = useAppContext();

  const isMultiStore = (branches || []).length > 1;

  const [viewAllBranches, setViewAllBranches] = useState(false);
  const [suggested, setSuggested] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  // Cache answers per (questionId + branch) for the life of the session so
  // re-tapping a question the owner already asked feels instant instead of
  // re-hitting Firestore every time.
  const cacheRef = useRef(new Map());

  const scopedBranchId = viewAllBranches ? null : selectedBranchId;

  const loadQuestions = useCallback(async () => {
    if (!businessId) return;
    setSuggestedLoading(true);
    setError(null);
    try {
      const qs = scopedBranchId ? `?branchId=${scopedBranchId}&tzOffsetMinutes=${getTzOffsetMinutes()}` : `?tzOffsetMinutes=${getTzOffsetMinutes()}`;
      const [suggestedRes, allRes] = await Promise.all([
        apiFetch(`/business/${businessId}/ask-avyon/suggested${qs}`),
        // Full registry list — cheap and static per multi-store status, but
        // re-fetched on branch/scope change too since which multi-branch-
        // only questions are included depends on isMultiStore.
        apiFetch(`/business/${businessId}/ask-avyon/questions`),
      ]);
      setSuggested(suggestedRes?.questions || []);
      setAllQuestions(allRes?.questions || []);
    } catch (e) {
      console.error('loadQuestions (Ask Avyon) error:', e);
      setError('Could not load questions right now.');
    } finally {
      setSuggestedLoading(false);
    }
  }, [apiFetch, businessId, scopedBranchId]);

  const askQuestion = useCallback(
    async (questionId) => {
      if (!businessId || !questionId) return;
      const cacheKey = `${questionId}:${scopedBranchId || 'all'}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setAnswer(cached);
        return;
      }
      setAsking(true);
      setError(null);
      setAnswer(null);
      try {
        const res = await apiFetch(`/business/${businessId}/ask-avyon/ask`, {
          method: 'POST',
          body: JSON.stringify({ questionId, branchId: scopedBranchId || undefined, tzOffsetMinutes: getTzOffsetMinutes() }),
        });
        cacheRef.current.set(cacheKey, res.answer);
        setAnswer(res.answer);
      } catch (e) {
        console.error('askQuestion (Ask Avyon) error:', e);
        setError(e.message || 'Avyon could not work that out right now.');
      } finally {
        setAsking(false);
      }
    },
    [apiFetch, businessId, scopedBranchId]
  );

  // Switching branch here moves the whole app to that branch (same setter
  // the Dashboard/Products switchers use), not just this panel. Picking
  // "All branches" is local-only — there's no shared "all branches" mode
  // elsewhere in the app for this to drive.
  const changeBranch = useCallback(
    (branchId) => {
      if (branchId === 'all') {
        setViewAllBranches(true);
        setAnswer(null);
        return;
      }
      setViewAllBranches(false);
      if (branchId !== selectedBranchId) {
        setSelectedBranchId(branchId);
      }
      setAnswer(null);
    },
    [selectedBranchId, setSelectedBranchId]
  );

  const reset = useCallback(() => {
    setAnswer(null);
    setError(null);
  }, []);

  return {
    isMultiStore,
    branches: branches || [],
    selectedBranchId,
    viewAllBranches,
    changeBranch,
    suggested,
    allQuestions,
    suggestedLoading,
    loadQuestions,
    answer,
    asking,
    error,
    askQuestion,
    reset,
  };
}