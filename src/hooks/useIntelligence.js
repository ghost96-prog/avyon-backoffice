// src/hooks/useIntelligence.js
//
// Data layer for the dedicated Avyon Intelligence screen. Talks to the
// read-only /business/:businessId/intelligence/* endpoints
// (services/intelligenceEngine.js on the backend) — deterministic maths over
// Firestore data the app already trusts, no AI model, no writes.
//
// Owns three things the screen shouldn't have to think about:
//   1. PERIOD — Intelligence needs periods the Dashboard date picker doesn't
//      have (next week, next month, last 30 days…), so it keeps its own
//      persisted period state and never touches the Dashboard's saved range.
//      Dates are the owner's LOCAL calendar dates as YYYY-MM-DD strings
//      (never toISOString(), which shifts the day in zones ahead of UTC).
//   2. REQUEST RACES — flipping tab / period quickly must never let a slow
//      earlier response overwrite the one the owner is now looking at.
//   3. CACHE — answers are cached for 2 minutes per (tab, period, branch,
//      reorder settings) so going back to a tab is instant.
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from './useSelectedBranch';

const STORAGE_KEY = 'bo_intelligence_period';
const CACHE_TTL_MS = 2 * 60 * 1000;

// Used until /intelligence/tabs answers (and if it ever fails), so the tab
// strip is never empty. The server's list is authoritative once loaded.
export const FALLBACK_TABS = [
  { id: 'briefing', label: 'Briefing', question: 'What should I focus on?', icon: 'Sparkles' },
  { id: 'best_sellers', label: 'Best sellers', question: 'Which products are performing best?', icon: 'Trophy' },
  { id: 'reorder', label: 'Reorder', question: 'What should I reorder?', icon: 'PackagePlus' },
  { id: 'not_selling', label: 'Not selling', question: "Which products aren't selling?", icon: 'PackageX' },
  { id: 'losing_money', label: 'Losing money', question: 'Which products are losing me money?', icon: 'TrendingDown' },
  { id: 'potential_losses', label: 'Money at risk', question: 'What could I lose next?', icon: 'ShieldAlert' },
  { id: 'forecast', label: 'Forecast', question: "What's coming up?", icon: 'LineChart' },
];

// ── date helpers (local calendar) ───────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDateStr = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const prettyDate = (s) => { const d = fromDateStr(s); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export function formatRange(startDate, endDate) {
  const a = fromDateStr(startDate), b = fromDateStr(endDate);
  if (startDate === endDate) return `${MONTHS[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()}`;
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${MONTHS[a.getMonth()]} ${a.getDate()}${sameYear ? '' : `, ${a.getFullYear()}`} – ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
}

// Week = Sunday → Saturday, matching the rest of BackOffice and the backend.
export const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today', quick: true, group: 'Now' },
  { id: 'yesterday', label: 'Yesterday', quick: true, group: 'Past' },
  { id: 'this_week', label: 'This week', quick: true, group: 'Now' },
  { id: 'last_week', label: 'Last week', quick: true, group: 'Past' },
  { id: 'next_week', label: 'Next week', quick: true, group: 'Future' },
  { id: 'this_month', label: 'This month', quick: true, group: 'Now' },
  { id: 'last_month', label: 'Last month', group: 'Past' },
  { id: 'next_month', label: 'Next month', quick: true, group: 'Future' },
  { id: 'last_30', label: 'Last 30 days', group: 'Past' },
  { id: 'next_30', label: 'Next 30 days', group: 'Future' },
  { id: 'this_year', label: 'This year', quick: true, group: 'Now' },
  { id: 'last_year', label: 'Last year', group: 'Past' },
  { id: 'custom', label: 'Custom range…', group: 'Custom' },
];

export function resolvePreset(id, custom, now = new Date()) {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = t.getDay();
  let s = t, e = t;
  switch (id) {
    case 'today': break;
    case 'yesterday': s = e = addDays(t, -1); break;
    case 'this_week': s = addDays(t, -dow); e = addDays(s, 6); break;
    case 'last_week': s = addDays(t, -dow - 7); e = addDays(s, 6); break;
    case 'next_week': s = addDays(t, -dow + 7); e = addDays(s, 6); break;
    case 'this_month': s = new Date(t.getFullYear(), t.getMonth(), 1); e = new Date(t.getFullYear(), t.getMonth() + 1, 0); break;
    case 'last_month': s = new Date(t.getFullYear(), t.getMonth() - 1, 1); e = new Date(t.getFullYear(), t.getMonth(), 0); break;
    case 'next_month': s = new Date(t.getFullYear(), t.getMonth() + 1, 1); e = new Date(t.getFullYear(), t.getMonth() + 2, 0); break;
    case 'last_30': s = addDays(t, -30); e = addDays(t, -1); break;
    case 'next_30': s = addDays(t, 1); e = addDays(t, 30); break;
    case 'this_year': s = new Date(t.getFullYear(), 0, 1); e = new Date(t.getFullYear(), 11, 31); break;
    case 'last_year': s = new Date(t.getFullYear() - 1, 0, 1); e = new Date(t.getFullYear() - 1, 11, 31); break;
    case 'custom':
      s = custom?.startDate ? fromDateStr(custom.startDate) : t;
      e = custom?.endDate ? fromDateStr(custom.endDate) : t;
      break;
    default: break;
  }
  const opt = PERIOD_OPTIONS.find((o) => o.id === id);
  return { option: id, startDate: toDateStr(s), endDate: toDateStr(e), label: id === 'custom' ? formatRange(toDateStr(s), toDateStr(e)) : opt?.label || '' };
}

// Step a period back/forward by its own length (calendar-aware for months/years).
export function shiftPeriod(period, dir) {
  const s = fromDateStr(period.startDate), e = fromDateStr(period.endDate);
  const monthLike = period.option === 'this_month' || period.option === 'last_month' || period.option === 'next_month';
  const yearLike = period.option === 'this_year' || period.option === 'last_year';
  let ns, ne;
  if (monthLike) { ns = new Date(s.getFullYear(), s.getMonth() + dir, 1); ne = new Date(s.getFullYear(), s.getMonth() + dir + 1, 0); }
  else if (yearLike) { ns = new Date(s.getFullYear() + dir, 0, 1); ne = new Date(s.getFullYear() + dir, 11, 31); }
  else { const len = Math.round((e - s) / 86400000) + 1; ns = addDays(s, dir * len); ne = addDays(e, dir * len); }
  const a = toDateStr(ns), b = toDateStr(ne);
  return { option: 'custom', startDate: a, endDate: b, label: formatRange(a, b) };
}

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!PERIOD_OPTIONS.some((o) => o.id === d.option)) return null;
    // Presets are re-resolved against today's date (a "This week" saved last
    // week must not stay frozen on last week's dates). Custom keeps its dates.
    return resolvePreset(d.option, d, new Date());
  } catch { return null; }
}

export function useIntelligence({ enabled = true } = {}) {
  const { apiFetch, businessId, branches } = useAppContext();
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });

  const [tabs, setTabs] = useState(FALLBACK_TABS);
  const [activeTab, setActiveTab] = useState('briefing');
  const [period, setPeriodState] = useState(() => readStored() || resolvePreset('this_week'));
  const [settings, setSettings] = useState({ leadTimeDays: 7, safetyDays: 3 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // severity per tab, learned from the Briefing's cards so the tab strip can
  // show a coloured dot before the owner has opened each tab
  const [tabSeverity, setTabSeverity] = useState({});

  const cacheRef = useRef(new Map());
  const reqRef = useRef(0);

  const setPeriod = useCallback((p) => {
    setPeriodState(p);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ option: p.option, startDate: p.startDate, endDate: p.endDate })); } catch { /* storage unavailable */ }
  }, []);
  const selectOption = useCallback((id, custom) => setPeriod(resolvePreset(id, custom)), [setPeriod]);
  const navigatePeriod = useCallback((dir) => setPeriod(shiftPeriod(period, dir)), [period, setPeriod]);

  // tab list (server is the source of truth; fallback until it answers)
  useEffect(() => {
    if (!businessId || !enabled) return;
    let alive = true;
    apiFetch(`/business/${businessId}/intelligence/tabs`)
      .then((r) => { if (alive && Array.isArray(r?.tabs) && r.tabs.length) setTabs(r.tabs); })
      .catch(() => { /* keep fallback */ });
    return () => { alive = false; };
  }, [apiFetch, businessId, enabled]);

  const branchParam = selectedBranchId && selectedBranchId !== 'all' ? selectedBranchId : null;

  const load = useCallback(async ({ force = false } = {}) => {
    if (!businessId || !enabled) return;
    const key = [activeTab, period.startDate, period.endDate, branchParam || 'all', settings.leadTimeDays, settings.safetyDays].join('|');
    const hit = cacheRef.current.get(key);
    if (hit && !force && Date.now() - hit.at < CACHE_TTL_MS) {
      setResult(hit.result); setError(null); setLoading(false); return;
    }
    const myReq = ++reqRef.current;
    force && result ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/business/${businessId}/intelligence/analyze`, {
        method: 'POST',
        body: JSON.stringify({
          tab: activeTab, startDate: period.startDate, endDate: period.endDate, today: toDateStr(new Date()),
          branchId: branchParam || undefined, label: period.label,
          leadTimeDays: settings.leadTimeDays, safetyDays: settings.safetyDays,
        }),
      });
      if (myReq !== reqRef.current) return; // a newer request superseded this one
      cacheRef.current.set(key, { at: Date.now(), result: res.result });
      setResult(res.result);
      const cards = res.result?.sections?.find((s) => s.kind === 'cards')?.cards;
      if (cards) setTabSeverity(Object.fromEntries(cards.map((c) => [c.tab, c.severity])));
    } catch (e) {
      if (myReq !== reqRef.current) return;
      console.error('Intelligence load error:', e);
      setError(e.message || 'Avyon could not work that out right now.');
    } finally {
      if (myReq === reqRef.current) { setLoading(false); setRefreshing(false); }
    }
    // `result` intentionally omitted: it only picks the spinner style
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, businessId, enabled, activeTab, period.startDate, period.endDate, period.label, branchParam, settings.leadTimeDays, settings.safetyDays]);

  useEffect(() => { load(); }, [load]);

  // A different branch or period means the briefing's per-tab dots are stale.
  useEffect(() => { setTabSeverity({}); }, [period.startDate, period.endDate, branchParam]);

  // Coming back to the tab after a while → refresh quietly.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const periodMode = result?.period?.mode || null;
  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );

  return {
    tabs, activeTab, setActiveTab, tabSeverity,
    period, selectOption, navigatePeriod,
    settings, setSettings,
    result, loading, refreshing, error, refresh: () => load({ force: true }),
    selectedBranchId, setSelectedBranchId, branchOptions, isMultiStore: (branches || []).length > 1,
    periodMode,
  };
}
