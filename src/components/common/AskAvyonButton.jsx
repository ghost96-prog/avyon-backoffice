// src/components/common/AskAvyonButton.jsx
//
// The floating "Ask Avyon" button — bottom-right, like a live-chat bubble,
// rendered once in DashboardLayout so it floats over every screen.
//
// Tap-only fixed questions, NOT free-text chat, and NOT an AI model —
// every answer comes back from services/askAvyonEngine.js on the backend,
// which is plain arithmetic over the business's real Firestore data.
// This component's only job is to render whatever "smart card" shape
// that engine hands back (headline / metrics / ranked items /
// recommendation / a button that jumps to the relevant report screen).
//
// Visual system lives in AskAvyonButton.css under --av-* tokens:
//   - a brand gradient (indigo → violet → cyan) is Avyon's one signature
//     element — used on the FAB and the header badge, nowhere else, so it
//     stays meaningful instead of decorative.
//   - severity colors (critical/warning/success/info) drive the answer
//     badge, summary panel, and item tags.
//   - category colors (inventory/sales/profit/customers/staff/stores/
//     overview) tint each question's icon chip in the tap list, so a
//     16-question list is scannable by type at a glance.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, X, ChevronLeft, ChevronDown, ArrowRight, Store, Building2,
  PackagePlus, TrendingDown, Wallet, UserCircle, Target, TrendingUp,
  UserCog, AlertTriangle, ArrowDownRight, Trophy, Users, ShieldAlert,
  ArrowLeftRight, PackageX, Gauge, HelpCircle, TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon, Circle, CheckCircle2, AlertOctagon,
  AlertCircle,
} from 'lucide-react';
import { useAskAvyon } from '../../hooks/useAskAvyon';
import './AskAvyonButton.css';

// Maps the `icon` key the backend sends (services/askAvyonEngine.js's
// QUESTION_REGISTRY) to an actual lucide-react component. Falls back to a
// generic question-mark icon for anything unmapped, so a new backend
// question never renders blank.
const ICON_MAP = {
  PackagePlus, TrendingDown, Wallet, UserCircle, Store, Target, TrendingUp,
  UserCog, AlertTriangle, ArrowDownRight, Trophy, Users, ShieldAlert,
  ArrowLeftRight, PackageX, Gauge,
};

function QuestionIcon({ name, size = 16, ...props }) {
  const Icon = ICON_MAP[name] || HelpCircle;
  return <Icon size={size} {...props} />;
}

// ── Severity — drives the answer badge, summary panel, and item tags ──────
const SEVERITY_META = {
  critical: { color: 'var(--av-critical)', soft: 'var(--av-critical-bg)', border: 'var(--av-critical-border)', label: 'Needs attention', icon: AlertOctagon },
  warning: { color: 'var(--av-warning)', soft: 'var(--av-warning-bg)', border: 'var(--av-warning-border)', label: 'Worth a look', icon: AlertCircle },
  success: { color: 'var(--av-success)', soft: 'var(--av-success-bg)', border: 'var(--av-success-border)', label: 'Looking good', icon: CheckCircle2 },
  info: { color: 'var(--av-info)', soft: 'var(--av-info-bg)', border: 'var(--av-info-border)', label: 'Heads up', icon: AlertCircle },
};

// ── Item tags (ranked-list rows within an answer) ──────────────────────────
const TAG_META = {
  critical: { color: 'var(--av-critical)', bg: 'var(--av-critical-bg)', icon: AlertOctagon, text: 'Critical' },
  high: { color: 'var(--av-warning)', bg: 'var(--av-warning-bg)', icon: AlertCircle, text: 'High' },
  medium: { color: 'var(--av-info)', bg: 'var(--av-info-bg)', icon: Circle, text: 'Medium' },
  low: { color: 'var(--av-ink-faint)', bg: 'var(--av-surface-sunken)', icon: Circle, text: 'Low' },
  up: { color: 'var(--av-success)', bg: 'var(--av-success-bg)', icon: TrendingUpIcon, text: 'Rising' },
  down: { color: 'var(--av-critical)', bg: 'var(--av-critical-bg)', icon: TrendingDownIcon, text: 'Falling' },
  warning: { color: 'var(--av-warning)', bg: 'var(--av-warning-bg)', icon: AlertCircle, text: 'Worth a look' },
};

// ── Category colors — one per question category, tints the icon chip in
// the tap list so owners can scan 16 questions by type. ────────────────────
const CATEGORY_META = {
  overview: { color: 'var(--av-cat-overview)', bg: 'var(--av-cat-overview-bg)', label: 'Overview' },
  inventory: { color: 'var(--av-cat-inventory)', bg: 'var(--av-cat-inventory-bg)', label: 'Inventory' },
  sales: { color: 'var(--av-cat-sales)', bg: 'var(--av-cat-sales-bg)', label: 'Sales' },
  profit: { color: 'var(--av-cat-profit)', bg: 'var(--av-cat-profit-bg)', label: 'Profit' },
  customers: { color: 'var(--av-cat-customers)', bg: 'var(--av-cat-customers-bg)', label: 'Customers' },
  staff: { color: 'var(--av-cat-staff)', bg: 'var(--av-cat-staff-bg)', label: 'Staff' },
  stores: { color: 'var(--av-cat-stores)', bg: 'var(--av-cat-stores-bg)', label: 'Stores' },
};

function severityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META.info;
}

function tagMeta(tag) {
  return TAG_META[tag] || TAG_META.medium;
}

function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.overview;
}

// Business-health sub-scores (Sales/Profit/Inventory/Operations) are the
// only 0–100 "score" metrics Avyon returns — color those specifically
// rather than guessing at any plain number, so an ordinary count like
// "Customers this week: 118" never gets mistaken for a good/bad score.
function scoreModifier(value) {
  if (typeof value !== 'number') return '';
  if (value >= 80) return 'ask-avyon-metric--good';
  if (value >= 50) return 'ask-avyon-metric--mid';
  return 'ask-avyon-metric--bad';
}

export default function AskAvyonButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const {
    isMultiStore,
    branches,
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
  } = useAskAvyon();

  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (open) loadQuestions();
    // Re-pull questions when the branch scope changes too, since which
    // multi-branch-only questions are relevant depends on it — but this
    // never reorders what's already on screen (see QuestionList below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedBranchId, viewAllBranches]);

  const handleToggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (!next) {
        reset();
        setShowAll(false);
      }
      return next;
    });
  }, [reset]);

  const handleBack = useCallback(() => {
    reset();
    setShowAll(false);
  }, [reset]);

  const handleAction = useCallback(() => {
    if (!answer?.actionRoute) return;
    setOpen(false);
    reset();
    navigate(answer.actionRoute);
  }, [answer, navigate, reset]);

  // "Show more" never reshuffles the questions the owner is already
  // looking at — it just reveals whatever's in the full registry that
  // isn't already in the suggested set, appended below in registry order.
  const suggestedIds = new Set(suggested.map((q) => q.id));
  const extraQuestions = allQuestions.filter((q) => !suggestedIds.has(q.id));
  const questionList = showAll ? [...suggested, ...extraQuestions] : suggested;
  const inAnswerView = asking || answer || error;

  return (
    <>
      <button
        type="button"
        className={`ask-avyon-fab ${open ? 'ask-avyon-fab--open' : ''}`}
        onClick={handleToggle}
        aria-label="Ask Avyon"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div className="ask-avyon-panel">
          <div className="ask-avyon-panel-header">
            <div className="ask-avyon-panel-title">
              {inAnswerView ? (
                <button type="button" className="ask-avyon-back" onClick={handleBack} aria-label="Back to questions">
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <span className="ask-avyon-brand-badge"><Sparkles size={13} /></span>
              )}
              <span>{inAnswerView ? 'Avyon Intelligence' : 'Ask Avyon'}</span>
            </div>
            {isMultiStore && (
              <BranchSwitcher
                branches={branches}
                selectedBranchId={selectedBranchId}
                viewAllBranches={viewAllBranches}
                onChange={changeBranch}
              />
            )}
          </div>

          <div className="ask-avyon-panel-body">
            {!inAnswerView && (
              <QuestionList
                loading={suggestedLoading}
                questions={questionList}
                showAll={showAll}
                hasMore={extraQuestions.length > 0}
                onToggleShowAll={() => setShowAll((s) => !s)}
                onSelect={askQuestion}
              />
            )}
            {asking && <AnswerSkeleton />}
            {!asking && error && (
              <div className="ask-avyon-error">
                <AlertOctagon size={22} />
                <p>{error}</p>
                <button type="button" onClick={handleBack}>Try another question</button>
              </div>
            )}
            {!asking && !error && answer && <AnswerCard answer={answer} onAction={handleAction} />}
          </div>
        </div>
      )}
    </>
  );
}

// Real branch picker — lists every branch by name plus an "All branches"
// option, defaulting to whatever's already selected app-wide. Picking a
// branch here calls the same shared setter as every other screen's
// switcher, so the rest of the app follows along.
//
// NOTE: this repo's shared branch-switcher UI wasn't available to reuse
// directly here, so this is a self-contained dropdown styled to match.
// Swap it for the shared component if you'd rather not maintain two.
function BranchSwitcher({ branches, selectedBranchId, viewAllBranches, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const currentLabel = viewAllBranches
    ? 'All branches'
    : branches.find((b) => b.branchId === selectedBranchId)?.name || 'Select branch';

  return (
    <div className="ask-avyon-branch-switcher" ref={rootRef}>
      <button
        type="button"
        className={`ask-avyon-branch-trigger ${open ? 'ask-avyon-branch-trigger--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {viewAllBranches ? <Building2 size={13} /> : <Store size={13} />}
        <span>{currentLabel}</span>
        <ChevronDown size={13} className="ask-avyon-branch-chevron" />
      </button>
      {open && (
        <div className="ask-avyon-branch-menu">
          <button
            type="button"
            className={`ask-avyon-branch-option ${viewAllBranches ? 'active' : ''}`}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            <Building2 size={14} /> All branches
          </button>
          {branches.map((b) => (
            <button
              key={b.branchId}
              type="button"
              className={`ask-avyon-branch-option ${!viewAllBranches && b.branchId === selectedBranchId ? 'active' : ''}`}
              onClick={() => { onChange(b.branchId); setOpen(false); }}
            >
              <Store size={14} /> {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionList({ loading, questions, showAll, hasMore, onToggleShowAll, onSelect }) {
  if (loading && !questions.length) {
    return (
      <div className="ask-avyon-question-list">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="ask-avyon-question-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <>
      <p className="ask-avyon-prompt-label">What would you like to know?</p>
      <div className="ask-avyon-question-list">
        {questions.map((q) => {
          const cat = categoryMeta(q.category);
          return (
            <button key={q.id} type="button" className="ask-avyon-question" onClick={() => onSelect(q.id)}>
              <span className="ask-avyon-question-icon" style={{ color: cat.color, background: cat.bg }}>
                <QuestionIcon name={q.icon} size={17} />
              </span>
              <span className="ask-avyon-question-text">
                <span className="ask-avyon-question-label">{q.label}</span>
                <span className="ask-avyon-question-category" style={{ color: cat.color }}>{cat.label}</span>
              </span>
              <ArrowRight size={15} className="ask-avyon-question-arrow" />
            </button>
          );
        })}
      </div>
      {hasMore && (
        <button type="button" className="ask-avyon-show-more" onClick={onToggleShowAll}>
          {showAll ? 'Show fewer questions' : 'Show all questions'}
          <ChevronDown size={13} className={showAll ? 'ask-avyon-show-more-chevron--up' : ''} />
        </button>
      )}
    </>
  );
}

function AnswerSkeleton() {
  return (
    <div className="ask-avyon-answer-skeleton">
      <div className="skel-line skel-line--wide" />
      <div className="skel-line skel-line--full" />
      <div className="skel-line skel-line--full" />
      <div className="skel-metrics">
        <div className="skel-metric" />
        <div className="skel-metric" />
        <div className="skel-metric" />
      </div>
    </div>
  );
}

function AnswerCard({ answer, onAction }) {
  const sev = severityMeta(answer.severity);
  const SeverityIcon = sev.icon;
  const isScoreCard = answer.title === "What's my business health score?";

  return (
    <div className="ask-avyon-answer">
      <div className="ask-avyon-answer-top">
        <span className="ask-avyon-answer-icon" style={{ color: sev.color, background: sev.soft, borderColor: sev.border }}>
          <QuestionIcon name={answer.icon} size={18} />
        </span>
        <div className="ask-avyon-answer-badge" style={{ color: sev.color, background: sev.soft, borderColor: sev.border }}>
          <SeverityIcon size={13} />
          {sev.label}
        </div>
      </div>

      <h3 className="ask-avyon-answer-headline">{answer.headline}</h3>

      {answer.summary && (
        <p
          className="ask-avyon-answer-summary"
          style={{ background: sev.soft, borderColor: sev.border, borderLeftColor: sev.color }}
        >
          {answer.summary}
        </p>
      )}

      {Array.isArray(answer.metrics) && answer.metrics.length > 0 && (
        <div className="ask-avyon-metrics">
          {answer.metrics.map((m, i) => (
            <div key={i} className={`ask-avyon-metric ${isScoreCard ? scoreModifier(m.value) : ''}`}>
              <div className="ask-avyon-metric-value">{m.value}</div>
              <div className="ask-avyon-metric-label">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(answer.items) && answer.items.length > 0 && (
        <div className="ask-avyon-items">
          {answer.items.map((it, i) => {
            const tm = it.tag ? tagMeta(it.tag) : null;
            const TagIcon = tm?.icon || Circle;
            return (
              <div
                key={i}
                className="ask-avyon-item"
                style={tm ? { background: tm.bg, borderLeftColor: tm.color } : undefined}
              >
                <div className="ask-avyon-item-main">
                  <span className="ask-avyon-item-label">{it.label}</span>
                  {it.detail && <span className="ask-avyon-item-detail">{it.detail}</span>}
                </div>
                <div className="ask-avyon-item-right">
                  {it.value != null && (
                    <span
                      className="ask-avyon-item-value"
                      style={it.tag === 'up' ? { color: 'var(--av-success)' } : it.tag === 'down' ? { color: 'var(--av-critical)' } : undefined}
                    >
                      {it.value}
                    </span>
                  )}
                  {tm && (
                    <span className="ask-avyon-item-tag" style={{ color: tm.color, background: '#ffffffb3' }}>
                      <TagIcon size={11} />
                      {tm.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {answer.recommendation && (
        <div className="ask-avyon-recommendation">
          <span className="ask-avyon-recommendation-icon"><Sparkles size={13} /></span>
          <div>
            <p className="ask-avyon-recommendation-eyebrow">Avyon suggests</p>
            <p className="ask-avyon-recommendation-text">{answer.recommendation}</p>
          </div>
        </div>
      )}

      {answer.actionRoute && (
        <button
          type="button"
          className="ask-avyon-action-btn"
          onClick={onAction}
          style={{ background: sev.color }}
        >
          {answer.actionLabel || 'Open report'}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}