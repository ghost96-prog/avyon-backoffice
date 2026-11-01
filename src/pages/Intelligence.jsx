// src/pages/Intelligence.jsx
//
// Avyon Intelligence — the dedicated screen. One tab per question an owner
// asks about the business ("What's performing best?", "What should I
// reorder?", "What isn't selling?", "What's losing me money?", …), all
// answerable for ANY period: today, last week, next month, this year, a
// custom range. The backend (services/intelligenceEngine.js) does the maths
// and writes the narrative; this screen only picks the period + tab and
// renders whatever comes back with one generic renderer.
//
// Presented as a briefing from Avyon, the assistant: it "walks through the
// account" while it works, then speaks the answer next to a cartoon of the
// situation, and the whole screen takes on the mood of the news.
//
// Same rules as before: deterministic arithmetic over the business's own data,
// not an AI model; read-only; nothing is ever written.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Calendar, ChevronDown, Store, Download, RefreshCw, Lock,
  HelpCircle, Check,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { BACKOFFICE_PERMISSIONS as P } from '../utils/permissions';
import { downloadCsv } from '../utils/exportUtils';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';
import { getModuleInfo } from '../utils/moduleCatalog';
import { useIntelligence, PERIOD_OPTIONS, formatRange } from '../hooks/useIntelligence';
import ResultView, { TAB_ICONS, moodOf } from '../components/intelligence/ResultView';
import ResultBoundary from '../components/intelligence/ResultBoundary';
import AvyonBot from '../components/intelligence/AvyonBot';
import Working from '../components/intelligence/Working';
import '../styles/ReportsShared.css';
import './Intelligence.css';

const GROUP_LABEL = { Past: 'Looking back', Now: 'Right now', Future: 'Looking ahead', Custom: '' };

// ── Period bar ──────────────────────────────────────────────────────────────
function PeriodBar({ period, onSelect, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(period.startDate);
  const [to, setTo] = useState(period.endDate);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCustomOpen(false); } };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setCustomOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const quick = PERIOD_OPTIONS.filter((o) => o.quick);
  const groups = ['Past', 'Now', 'Future'].map((g) => ({ g, items: PERIOD_OPTIONS.filter((o) => o.group === g) }));
  const tooLong = from && to && (new Date(to) - new Date(from)) / 86400000 + 1 > 400;
  const invalid = !from || !to || tooLong;

  const applyCustom = () => {
    if (invalid) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    onSelect('custom', { startDate: a, endDate: b });
    setOpen(false); setCustomOpen(false);
  };

  return (
    <div className="ix-period">
      <div className="ix-chips" role="group" aria-label="Period">
        {quick.map((o) => (
          <button key={o.id} type="button" className={`ix-pchip ${period.option === o.id ? 'is-active' : ''} ${o.group === 'Future' ? 'is-future' : ''}`}
            onClick={() => onSelect(o.id)} aria-pressed={period.option === o.id}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="ix-period-right" ref={ref}>
        <div className="ix-range">
          <button type="button" className="ix-range-arrow" onClick={() => onNavigate(-1)} aria-label="Previous period"><ChevronLeft size={16} /></button>
          <button type="button" className="ix-range-label" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}>
            <Calendar size={14} />
            <span>{formatRange(period.startDate, period.endDate)}</span>
            <ChevronDown size={13} />
          </button>
          <button type="button" className="ix-range-arrow" onClick={() => onNavigate(1)} aria-label="Next period"><ChevronRight size={16} /></button>
        </div>

        {open && (
          <div className="ix-popover" role="dialog" aria-label="Choose period">
            {!customOpen ? (
              <>
                {groups.map(({ g, items }) => (
                  <div key={g} className="ix-pop-group">
                    <div className="ix-pop-title">{GROUP_LABEL[g]}</div>
                    {items.map((o) => (
                      <button key={o.id} type="button" className={`ix-pop-item ${period.option === o.id ? 'is-active' : ''}`} onClick={() => { onSelect(o.id); setOpen(false); }}>
                        {o.label}{period.option === o.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                ))}
                <button type="button" className={`ix-pop-item ix-pop-custom ${period.option === 'custom' ? 'is-active' : ''}`}
                  onClick={() => { setFrom(period.startDate); setTo(period.endDate); setCustomOpen(true); }}>
                  Custom range…
                </button>
              </>
            ) : (
              <div className="ix-custom">
                <div className="ix-pop-title">Custom range</div>
                <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                {tooLong && <p className="ix-custom-err">Pick 400 days or fewer.</p>}
                <div className="ix-custom-actions">
                  <button type="button" className="ix-ghost" onClick={() => setCustomOpen(false)}>Back</button>
                  <button type="button" className="ix-apply" onClick={applyCustom} disabled={invalid}>Apply</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Topic rail ──────────────────────────────────────────────────────────────
function TopicRail({ tabs, active, onChange, severity }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(i + 1) % tabs.length].id); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(i - 1 + tabs.length) % tabs.length].id); }
  };
  return (
    <nav className="ix-rail" aria-label="What would you like to know?">
      <p className="ix-rail-title">What would you like to know?</p>
      <div className="ix-rail-list" role="tablist" aria-orientation="horizontal" onKeyDown={onKey}>
        {tabs.map((t) => {
          const Icon = TAB_ICONS[t.icon] || HelpCircle;
          const sev = severity[t.id];
          const on = active === t.id;
          return (
            <button key={t.id} id={`ix-tab-${t.id}`} type="button" role="tab" aria-selected={on} aria-controls="ix-panel"
              tabIndex={on ? 0 : -1} className={`ix-topic-tab ${on ? 'is-active' : ''}`} onClick={() => onChange(t.id)}>
              <span className="ix-topic-tab-icon"><Icon size={16} /></span>
              <span className="ix-topic-tab-label">{t.label}</span>
              {sev && sev !== 'success' && sev !== 'info' && (
                <i className={`ix-dot ix-dot-${sev}`} aria-label={sev === 'critical' ? 'needs attention' : 'worth a look'} />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── CSV of the first table in the current answer ───────────────────────────
function exportFirstTable(result) {
  const t = (result?.sections || []).find((s) => s.kind === 'table' && s.rows?.length);
  if (!t) return;
  const cell = (c, row) => {
    const v = row[c.key];
    if (c.type === 'product') return row.sub ? `${v} (${row.sub})` : v;
    if (v && typeof v === 'object') return v.text;
    return v ?? '';
  };
  const header = t.columns.map((c) => c.label);
  const body = t.rows.map((r) => t.columns.map((c) => cell(c, r)));
  downloadCsv(`intelligence_${result.tab}_${result.period.startDate}_to_${result.period.endDate}.csv`, [header, ...body]);
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Intelligence() {
  const navigate = useNavigate();
  const { hasBackofficePermission, activeStaff } = useAppContext();
  const canView = hasBackofficePermission(P.VIEW_SALES_REPORTS);
  const { guardAction, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();
  const hasAnalytics = hasModuleAccess('analytics');

  const intel = useIntelligence({ enabled: hasAnalytics && canView });
  const {
    tabs, activeTab, setActiveTab, tabSeverity, period, selectOption, navigatePeriod, settings, setSettings,
    result, loading, refreshing, error, refresh, selectedBranchId, setSelectedBranchId, branchOptions, isMultiStore,
  } = intel;

  // Back to wherever the owner came from (TopBar / floating button / a deep link);
  // if this page was opened directly with nothing behind it, fall back to the dashboard.
  const goBack = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  }, [navigate]);

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const branchName = selectedBranchId === 'all' ? 'All stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || 'Store';
  const activeMeta = tabs.find((t) => t.id === activeTab);
  const showSkeleton = loading && (!result || result.tab !== activeTab);
  const hasTable = (result?.sections || []).some((s) => s.kind === 'table' && s.rows?.length);

  const goTab = useCallback((id) => { setActiveTab(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [setActiveTab]);

  // the whole screen takes on the mood of the answer (calm while working)
  const showAnswer = !!result && !showSkeleton && !(error && !loading);
  const mood = error && !loading ? 'sad' : showAnswer ? moodOf(result) : 'calm';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (activeStaff?.name || '').trim().split(' ')[0];

  // ── gated / denied states ──
  if (!hasAnalytics) {
    const info = getModuleInfo('analytics');
    return (
      <div className="ix-page ix-mood-calm">
        <button type="button" className="ix-back" onClick={goBack} aria-label="Go back">
          <ArrowLeft size={18} /><span>Back</span>
        </button>
        <div className="ix-locked">
          <AvyonBot mood="calm" locked size={150} title="Avyon, waiting for access" />
          <div className="ix-locked-copy">
            <h2>I need the {info?.label || 'Analytics'} module to get started</h2>
            <p>With it I can tell you what is selling best, what to reorder, what is gathering dust, where you are losing money and what is coming next for <strong>{branchName}</strong>.</p>
            <button type="button" className="ix-apply" onClick={() => guardAction('analytics')}>Subscribe now</button>
          </div>
        </div>
        {gateModalModuleId && <ModuleSubscriptionModal moduleId={gateModalModuleId} moduleState={getModuleState(gateModalModuleId)} onClose={closeGateModal} />}
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access denied</h2>
          <p>You don't have permission to view business intelligence.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ix-page ix-mood-${mood}`}>
      <header className="ix-header">
        <div className="ix-title">
          <button type="button" className="ix-back ix-back--icon" onClick={goBack} aria-label="Go back" title="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>Avyon Intelligence</h1>
            <p>{greeting}{firstName ? `, ${firstName}` : ''}. Ask me anything about your business, past or future.</p>
          </div>
        </div>
        <div className="ix-header-actions">
          {isMultiStore && (
            <button type="button" className="ix-btn" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /><span>{branchName}</span>
            </button>
          )}
          <button type="button" className="ix-btn" onClick={() => exportFirstTable(result)} disabled={!hasTable}>
            <Download size={14} /><span>CSV</span>
          </button>
          <button type="button" className="ix-btn" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'ix-spin' : ''} /><span>Refresh</span>
          </button>
        </div>
      </header>

      <PeriodBar period={period} onSelect={selectOption} onNavigate={navigatePeriod} />

      <div className="ix-shell">
        <TopicRail tabs={tabs} active={activeTab} onChange={setActiveTab} severity={tabSeverity} />

        <main id="ix-panel" role="tabpanel" aria-labelledby={`ix-tab-${activeTab}`} className={`ix-main ${loading && !showSkeleton ? 'ix-dim' : ''}`}>
          {error && !loading ? (
            <div className="ix-error" role="alert">
              <AvyonBot mood="sad" size={120} title="Avyon, apologetic" />
              <div className="ix-error-copy">
                <h2>I could not finish that one</h2>
                <p>{error}</p>
                <button type="button" className="ix-apply" onClick={refresh}>Try again</button>
              </div>
            </div>
          ) : showSkeleton ? (
            <Working tab={activeTab} range={formatRange(period.startDate, period.endDate)} where={branchName} name={firstName} />
          ) : result ? (
            <ResultBoundary resetKey={`${activeTab}|${period.startDate}|${period.endDate}|${selectedBranchId}`} onRetry={refresh}>
              <ResultView
                key={`${activeTab}|${period.startDate}|${period.endDate}|${selectedBranchId}`}
                result={result}
                question={activeMeta?.question}
                settings={settings}
                onSettingsChange={setSettings}
                onGoTab={goTab}
                onNavigate={navigate}
              />
            </ResultBoundary>
          ) : null}
        </main>
      </div>

      {storeModalOpen && (
        <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
          <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
            <div className="reports-modal-header"><span className="reports-modal-title">Select store</span></div>
            <div className="reports-modal-body" style={{ padding: '8px 4px' }}>
              {branchOptions.map((opt) => (
                <button key={opt.value} className={`reports-filter-option ${selectedBranchId === opt.value ? 'is-active' : ''}`}
                  onClick={() => { setSelectedBranchId(opt.value); setStoreModalOpen(false); }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}