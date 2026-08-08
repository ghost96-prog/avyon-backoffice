// src/components/dashboard/InsightModal.jsx
//
// The "launch brief" popup — shown once when the Dashboard mounts, powered
// by useInsights().launchBrief. Gives an at-a-glance "here's what happened"
// before the user even starts reading the charts underneath.
import React from 'react';
import { TrendingUp, TrendingDown, X, ArrowRight, Award } from 'lucide-react';
import { formatMoney } from '../../utils/exportUtils';
import './InsightModal.css';

const SEVERITY_ICON_TONE = {
  critical: 'danger',
  warning: 'warning',
  success: 'success',
  info: 'default',
};

export default function InsightModal({ brief, loading, currency, onClose, onInsightClick, onDismissInsight }) {
  if (loading || !brief) return null;

  const { todaySales, yesterdaySales, deltaPct, transactionsToday, topStaff, unreadInsights = [] } = brief;

  // Nothing worth a popup yet (e.g. business just opened, no sales, no
  // flagged insights) — skip the modal entirely rather than show an
  // empty shell.
  const hasContent = todaySales > 0 || unreadInsights.length > 0;
  if (!hasContent) return null;

  const trendUp = deltaPct != null && deltaPct >= 0;

  return (
    <div className="insight-modal-overlay" onClick={onClose}>
      <div className="insight-modal" onClick={(e) => e.stopPropagation()}>
        <button className="insight-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="insight-modal-header">
          <p className="insight-modal-eyebrow">Welcome back — here's what's happening</p>
          <h2 className="insight-modal-headline">
            {formatMoney(todaySales, currency)} <span className="insight-modal-headline-label">so far today</span>
          </h2>
          {deltaPct != null && (
            <div className={`insight-modal-delta insight-modal-delta--${trendUp ? 'up' : 'down'}`}>
              {trendUp ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              <span>
                {trendUp ? '+' : ''}
                {deltaPct.toFixed(1)}% vs yesterday ({formatMoney(yesterdaySales, currency)})
              </span>
            </div>
          )}
        </div>

        <div className="insight-modal-stats">
          <div className="insight-modal-stat">
            <span className="insight-modal-stat-value">{transactionsToday}</span>
            <span className="insight-modal-stat-label">Transactions today</span>
          </div>
          {topStaff && (
            <div className="insight-modal-stat">
              <span className="insight-modal-stat-value insight-modal-stat-value--with-icon">
                <Award size={16} />
                {topStaff.name}
              </span>
              <span className="insight-modal-stat-label">Top performer so far</span>
            </div>
          )}
        </div>

        {unreadInsights.length > 0 && (
          <div className="insight-modal-list">
            <p className="insight-modal-list-title">Needs your attention</p>
            {unreadInsights.map((insight) => (
              <div key={insight.insightId} className={`insight-modal-item insight-modal-item--${SEVERITY_ICON_TONE[insight.severity] || 'default'}`}>
                <div className="insight-modal-item-text">
                  <p className="insight-modal-item-title">{insight.title}</p>
                  <p className="insight-modal-item-body">{insight.body}</p>
                </div>
                <div className="insight-modal-item-actions">
                  {insight.actionable && (
                    <button
                      className="insight-modal-item-action"
                      onClick={() => onInsightClick && onInsightClick(insight)}
                    >
                      {insight.actionLabel || 'View'} <ArrowRight size={13} />
                    </button>
                  )}
                  <button
                    className="insight-modal-item-dismiss"
                    onClick={() => onDismissInsight && onDismissInsight(insight.insightId)}
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
