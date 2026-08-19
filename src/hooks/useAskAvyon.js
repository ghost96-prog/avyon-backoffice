// src/hooks/useAskAvyon.js
//
// Data layer for the floating "Ask Avyon" button. Talks to the read-only
// /business/:businessId/ask-avyon/* endpoints (services/askAvyonEngine.js
// on the backend) — no AI model, no writes, just deterministic math over
// Firestore data the app already trusts.
//
// Shape mirrors useInsights.js: a stable hook owning fetch/cache state,
// with the panel component staying dumb about where the data comes from.
//
// Scope: "store" (the currently-selected branch) vs "all" (every branch
// on the business). Only relevant/shown when the business has 2+ branches
// — resolved here from AppContext's `branches` list, not guessed by the
// caller.
import { useState, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';

export function useAskAvyon() {
  const { apiFetch, businessId, selectedBranchId, branches } = useAppContext();

  const isMultiStore = (branches || []).length > 1;

  const [scope, setScope] = useState('store'); // 'store' | 'all'
  const [suggested, setSuggested] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  // Cache answers per (questionId + scope) for the life of the session so
  // re-tapping a question the owner already asked feels instant instead of
  // re-hitting Firestore every time.
  const cacheRef = useRef(new Map());

  const scopedBranchId = scope === 'store' ? selectedBranchId : null;

  const loadQuestions = useCallback(async () => {
    if (!businessId) return;
    setSuggestedLoading(true);
    setError(null);
    try {
      const qs = scopedBranchId ? `?branchId=${scopedBranchId}` : '';
      const [suggestedRes, allRes] = await Promise.all([
        apiFetch(`/business/${businessId}/ask-avyon/suggested${qs}`),
        // Full list only needs fetching once per mount — cheap, static.
        allQuestions.length ? Promise.resolve({ questions: allQuestions }) : apiFetch(`/business/${businessId}/ask-avyon/questions`),
      ]);
      setSuggested(suggestedRes?.questions || []);
      if (!allQuestions.length) setAllQuestions(allRes?.questions || []);
    } catch (e) {
      console.error('loadQuestions (Ask Avyon) error:', e);
      setError('Could not load questions right now.');
    } finally {
      setSuggestedLoading(false);
    }
  }, [apiFetch, businessId, scopedBranchId, allQuestions]);

  const askQuestion = useCallback(
    async (questionId) => {
      if (!businessId || !questionId) return;
      const cacheKey = `${questionId}:${scope}:${scopedBranchId || 'all'}`;
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
          body: JSON.stringify({ questionId, branchId: scopedBranchId || undefined }),
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
    [apiFetch, businessId, scope, scopedBranchId]
  );

  // Scope changes invalidate the currently-shown answer (it was computed
  // for the old scope) and re-pull the suggested ordering, which can
  // legitimately differ per-branch vs business-wide.
  const changeScope = useCallback(
    (nextScope) => {
      if (nextScope === scope) return;
      setScope(nextScope);
      setAnswer(null);
    },
    [scope]
  );

  const reset = useCallback(() => {
    setAnswer(null);
    setError(null);
  }, []);

  return {
    isMultiStore,
    scope,
    changeScope,
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
