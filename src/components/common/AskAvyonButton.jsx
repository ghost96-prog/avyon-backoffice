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
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, X, ChevronLeft, ArrowRight, Store, Building2,
  PackagePlus, TrendingDown, Wallet, UserCircle, Target, TrendingUp,
  UserCog, AlertTriangle, ArrowDownRight, Trophy, Users, ShieldAlert,
  ArrowLeftRight, PackageX, Gauge, HelpCircle, TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon, Minus, Circle, CheckCircle, AlertCircle,
  BarChart3, DollarSign, ShoppingBag, Package, Users as UsersIcon,
  Clock, Flame, Star, Zap, AlertOctagon, AlertCircle as AlertCircleIcon,
  ThumbsUp, ThumbsDown, Info,
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

const SEVERITY_META = {
  critical: { color: 'var(--danger)', soft: 'var(--danger-soft)', label: 'Needs attention', bg: 'var(--danger-bg)', icon: AlertOctagon },
  warning: { color: 'var(--warning)', soft: 'var(--warning-soft)', label: 'Worth a look', bg: 'var(--warning-bg)', icon: AlertCircleIcon },
  success: { color: 'var(--success)', soft: 'var(--success-soft)', label: 'Looking good', bg: 'var(--success-bg)', icon: CheckCircle },
  info: { color: 'var(--accent)', soft: 'var(--accent-soft)', label: 'Heads up', bg: 'var(--accent-bg)', icon: Info },
};

const TAG_META = {
  critical: { color: 'var(--danger)', soft: 'var(--danger-soft)', bg: 'var(--danger-bg)', icon: AlertOctagon },
  high: { color: 'var(--warning)', soft: 'var(--warning-soft)', bg: 'var(--warning-bg)', icon: AlertCircleIcon },
  medium: { color: 'var(--accent)', soft: 'var(--accent-soft)', bg: 'var(--accent-bg)', icon: Circle },
  low: { color: 'var(--ink-faint)', soft: 'var(--surface-sunken)', bg: 'var(--surface-sunken)', icon: Circle },
  up: { color: 'var(--success)', soft: 'var(--success-soft)', bg: 'var(--success-bg)', icon: TrendingUpIcon },
  down: { color: 'var(--danger)', soft: 'var(--danger-soft)', bg: 'var(--danger-bg)', icon: TrendingDownIcon },
  warning: { color: 'var(--warning)', soft: 'var(--warning-soft)', bg: 'var(--warning-bg)', icon: AlertCircleIcon },
};

// Color mapping for metric values
const getMetricColor = (value, label) => {
  if (typeof value === 'string' && value.includes('%')) {
    const num = parseFloat(value);
    if (num > 0) return 'var(--success)';
    if (num < 0) return 'var(--danger)';
    return 'var(--ink-faint)';
  }
  if (label?.toLowerCase().includes('score')) {
    const num = typeof value === 'number' ? value : parseInt(value);
    if (num >= 80) return 'var(--success)';
    if (num >= 50) return 'var(--warning)';
    return 'var(--danger)';
  }
  return 'var(--ink)';
};

function severityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META.info;
}

function tagMeta(tag) {
  return TAG_META[tag] || TAG_META.medium;
}

export default function AskAvyonButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const {
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
  } = useAskAvyon();

  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (open) loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

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

  const questionList = showAll ? allQuestions : suggested;
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
                <Sparkles size={16} className="ask-avyon-title-icon" />
              )}
              <span>{inAnswerView ? 'Avyon Intelligence' : 'Ask Avyon'}</span>
            </div>
            {isMultiStore && (
              <div className="ask-avyon-scope-toggle">
                <button
                  type="button"
                  className={scope === 'store' ? 'active' : ''}
                  onClick={() => changeScope('store')}
                >
                  <Store size={13} /> This store
                </button>
                <button
                  type="button"
                  className={scope === 'all' ? 'active' : ''}
                  onClick={() => changeScope('all')}
                >
                  <Building2 size={13} /> All stores
                </button>
              </div>
            )}
          </div>

          <div className="ask-avyon-panel-body">
            {!inAnswerView && (
              <QuestionList
                loading={suggestedLoading}
                questions={questionList}
                showAll={showAll}
                onToggleShowAll={() => setShowAll((s) => !s)}
                onSelect={askQuestion}
              />
            )}
            {asking && <AnswerSkeleton />}
            {!asking && error && (
              <div className="ask-avyon-error">
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

function QuestionList({ loading, questions, showAll, onToggleShowAll, onSelect }) {
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
        {questions.map((q) => (
          <button key={q.id} type="button" className="ask-avyon-question" onClick={() => onSelect(q.id)}>
            <span className="ask-avyon-question-icon"><QuestionIcon name={q.icon} size={17} /></span>
            <span className="ask-avyon-question-label">{q.label}</span>
            <ArrowRight size={14} className="ask-avyon-question-arrow" />
          </button>
        ))}
      </div>
      <button type="button" className="ask-avyon-show-more" onClick={onToggleShowAll}>
        {showAll ? 'Show fewer questions' : 'Show all questions'}
      </button>
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
  
  // Render trend indicator for metric values
  const renderTrend = (value, label) => {
    if (typeof value === 'string' && value.includes('%')) {
      const num = parseFloat(value);
      if (num > 0) return <TrendingUpIcon size={14} className="trend-up" style={{ color: 'var(--success)' }} />;
      if (num < 0) return <TrendingDownIcon size={14} className="trend-down" style={{ color: 'var(--danger)' }} />;
      return <Minus size={14} className="trend-neutral" style={{ color: 'var(--ink-faint)' }} />;
    }
    if (label?.toLowerCase().includes('score')) {
      const num = typeof value === 'number' ? value : parseInt(value);
      if (num >= 80) return <CheckCircle size={14} style={{ color: 'var(--success)' }} />;
      if (num >= 50) return <AlertCircle size={14} style={{ color: 'var(--warning)' }} />;
      return <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />;
    }
    return null;
  };

  // Get tag icon
  const getTagIcon = (tag) => {
    const meta = tagMeta(tag);
    const Icon = meta.icon || Circle;
    return <Icon size={12} style={{ color: meta.color }} />;
  };

  return (
    <div className="ask-avyon-answer">
      <div className="ask-avyon-answer-top">
        <span className="ask-avyon-answer-icon" style={{ color: sev.color, background: sev.soft }}>
          <QuestionIcon name={answer.icon} size={18} />
        </span>
        <div className="ask-avyon-answer-badge" style={{ color: sev.color, background: sev.bg || sev.soft }}>
          <SeverityIcon size={14} style={{ marginRight: '4px' }} />
          {sev.label}
        </div>
      </div>
      
      <h3 className="ask-avyon-answer-headline" style={{ color: sev.color }}>
        {answer.headline}
      </h3>
      
      {answer.summary && (
        <p className="ask-avyon-answer-summary" style={{ 
          background: sev.bg || sev.soft,
          borderLeft: `3px solid ${sev.color}`,
          padding: '10px 14px',
          borderRadius: '6px',
          marginTop: '8px',
        }}>
          {answer.summary}
        </p>
      )}

      {Array.isArray(answer.metrics) && answer.metrics.length > 0 && (
        <div className="ask-avyon-metrics">
          {answer.metrics.map((m, i) => {
            const color = getMetricColor(m.value, m.label);
            const trend = renderTrend(m.value, m.label);
            return (
              <div key={i} className="ask-avyon-metric" style={{ 
                background: 'var(--surface)',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${color}30`,
              }}>
                <div className="ask-avyon-metric-value" style={{ 
                  color: color,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  {trend}
                  <span>{m.value}</span>
                </div>
                <div className="ask-avyon-metric-label" style={{ 
                  color: 'var(--ink-faint)',
                  fontSize: '12px',
                  marginTop: '4px',
                }}>
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {Array.isArray(answer.items) && answer.items.length > 0 && (
        <div className="ask-avyon-items">
          {answer.items.map((it, i) => {
            const tm = tagMeta(it.tag);
            const TagIcon = tm.icon || Circle;
            return (
              <div key={i} className="ask-avyon-item" style={{
                background: it.tag ? tm.bg || tm.soft : 'var(--surface)',
                borderLeft: it.tag ? `3px solid ${tm.color}` : 'none',
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '6px',
              }}>
                <div className="ask-avyon-item-main">
                  <span className="ask-avyon-item-label" style={{ fontWeight: 500 }}>{it.label}</span>
                  {it.detail && (
                    <span className="ask-avyon-item-detail" style={{ 
                      color: 'var(--ink-faint)',
                      fontSize: '12px',
                      display: 'block',
                      marginTop: '2px',
                    }}>
                      {it.detail}
                    </span>
                  )}
                </div>
                <div className="ask-avyon-item-right">
                  {it.value != null && (
                    <span className="ask-avyon-item-value" style={{ 
                      fontWeight: 600,
                      color: it.tag === 'up' ? 'var(--success)' : 
                             it.tag === 'down' ? 'var(--danger)' : 'var(--ink)',
                    }}>
                      {it.value}
                    </span>
                  )}
                  {it.tag && (
                    <span className="ask-avyon-item-tag" style={{ 
                      color: tm.color, 
                      background: tm.soft,
                      padding: '2px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      marginLeft: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      <TagIcon size={12} style={{ color: tm.color }} />
                      {it.tag === 'up' ? 'Rising' :
                       it.tag === 'down' ? 'Falling' :
                       it.tag === 'critical' ? 'Critical' :
                       it.tag === 'high' ? 'High' :
                       it.tag === 'medium' ? 'Medium' :
                       it.tag === 'low' ? 'Low' :
                       it.tag === 'warning' ? 'Warning' : it.tag}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {answer.recommendation && (
        <div className="ask-avyon-recommendation" style={{
          background: 'var(--accent-bg)',
          border: `1px solid ${sev.color}30`,
          padding: '12px 16px',
          borderRadius: '8px',
          marginTop: '12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}>
          <Sparkles size={14} style={{ color: sev.color, marginTop: '2px', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', lineHeight: 1.5 }}>{answer.recommendation}</span>
        </div>
      )}

      {answer.actionRoute && (
        <button type="button" className="ask-avyon-action-btn" onClick={onAction} style={{
          background: sev.color,
          color: '#fff',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          marginTop: '12px',
          width: '100%',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}>
          {answer.actionLabel || 'Open report'}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}