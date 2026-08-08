// src/components/common/InsightToastStack.jsx
//
// Sibling to ToastStack.jsx — kept as its own component so insight popups
// (business intelligence: milestones, conflicts, nudges) never mix with
// operational notifications (stock transfers). Positioned bottom-right so
// the two stacks never overlap on screen even when both are showing.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, TrendingUp, AlertTriangle, Clock3, Sparkles, ShoppingCart, RotateCcw, HandCoins, Lock, GitCompareArrows } from 'lucide-react';

const ICONS = {
  sales_milestone: { Icon: TrendingUp, color: '#1C9D6C', bg: '#E4F7EF' },
  large_sale: { Icon: ShoppingCart, color: '#1C9D6C', bg: '#E4F7EF' },
  conflict_sale: { Icon: AlertTriangle, color: '#D64545', bg: '#FBE9E9' },
  laybye_nudge: { Icon: Clock3, color: '#B8720A', bg: '#FDF1DE' },
  refund_processed: { Icon: RotateCcw, color: '#B8720A', bg: '#FDF1DE' },
  laybye_created: { Icon: HandCoins, color: '#357ABD', bg: '#EAF1FA' },
  laybye_payment: { Icon: HandCoins, color: '#357ABD', bg: '#EAF1FA' },
  laybye_completed: { Icon: HandCoins, color: '#1C9D6C', bg: '#E4F7EF' },
  shift_closed: { Icon: Lock, color: '#357ABD', bg: '#EAF1FA' },
  branch_overtake: { Icon: GitCompareArrows, color: '#1C9D6C', bg: '#E4F7EF' },
};

export default function InsightToastStack({ toasts, onDismiss, onMarkRead }) {
  const navigate = useNavigate();
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 2000,
        display: 'flex', flexDirection: 'column-reverse', gap: 10, maxWidth: 360,
      }}
    >
      {toasts.map((t) => {
        const cfg = ICONS[t.type] || { Icon: Sparkles, color: '#357ABD', bg: '#EAF1FA' };
        const { Icon } = cfg;
        return (
          <div
            key={t.insightId}
            style={{
              background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              border: '1px solid #E2E8F0', padding: 14, display: 'flex', gap: 12,
              alignItems: 'flex-start', animation: 'insight-toast-in 0.25s ease-out',
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 9, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} color={cfg.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{t.title}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 1.4 }}>{t.body}</div>
              <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                {t.actionable && t.actionRoute && (
                  <button
                    onClick={() => { onMarkRead(t.insightId); navigate(t.actionRoute); }}
                    style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {t.actionLabel || 'View'}
                  </button>
                )}
                <button
                  onClick={() => onMarkRead(t.insightId)}
                  style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button onClick={() => onDismiss(t.insightId)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
              <X size={14} color="#94A3B8" />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes insight-toast-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}