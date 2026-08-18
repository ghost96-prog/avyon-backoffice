// src/components/common/InsightToastStack.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, TrendingUp, Clock3, Sparkles, ShoppingCart, RotateCcw, HandCoins, Lock, GitCompareArrows } from 'lucide-react';

const ICONS = {
  sales_milestone: { Icon: TrendingUp, color: '#1C9D6C', bg: '#E4F7EF' },
  large_sale: { Icon: ShoppingCart, color: '#1C9D6C', bg: '#E4F7EF' },
  laybye_nudge: { Icon: Clock3, color: '#B8720A', bg: '#FDF1DE' },
  refund_processed: { Icon: RotateCcw, color: '#B8720A', bg: '#FDF1DE' },
  laybye_created: { Icon: HandCoins, color: '#357ABD', bg: '#EAF1FA' },
  laybye_payment: { Icon: HandCoins, color: '#357ABD', bg: '#EAF1FA' },
  laybye_completed: { Icon: HandCoins, color: '#1C9D6C', bg: '#E4F7EF' },
  shift_closed: { Icon: Lock, color: '#357ABD', bg: '#EAF1FA' },
  branch_overtake: { Icon: GitCompareArrows, color: '#1C9D6C', bg: '#E4F7EF' },
};

const STACK_WIDTH = 360;
const MAX_VISIBLE_HEIGHT = 420;

export default function InsightToastStack({ toasts, onDismiss, onMarkRead }) {
  const navigate = useNavigate();
  if (!toasts.length) return null;

  const handleClearAll = () => {
    toasts.forEach((t) => onMarkRead(t.insightId));
  };

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 2000,
        display: 'flex', flexDirection: 'column', gap: 8,
        width: STACK_WIDTH, maxWidth: 'calc(100vw - 40px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="insight-toast-stack-scroll"
        style={{
          display: 'flex', flexDirection: 'column-reverse', gap: 10,
          maxHeight: MAX_VISIBLE_HEIGHT, overflowY: 'auto', overflowX: 'hidden',
          width: '100%', boxSizing: 'border-box', paddingRight: 2,
        }}
      >
        {toasts.map((t) => {
          const cfg = ICONS[t.type] || { Icon: Sparkles, color: '#357ABD', bg: '#EAF1FA' };
          const { Icon } = cfg;
          return (
            <div
              key={t.insightId}
              style={{
                position: 'relative', isolation: 'isolate',
                width: '100%', boxSizing: 'border-box',
                background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                border: '1px solid #E2E8F0', padding: 14, display: 'flex', gap: 12,
                alignItems: 'flex-start', animation: 'insight-toast-in 0.25s ease-out',
                flexShrink: 0, flexGrow: 0, minHeight: 0,
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
      </div>

      {toasts.length > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          padding: '0 2px', width: '100%', boxSizing: 'border-box', flexShrink: 0,
        }}>
          <button
            onClick={handleClearAll}
            style={{
              fontSize: 11, fontWeight: 600, color: '#64748B',
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8,
              padding: '5px 10px', cursor: 'pointer',
            }}
          >
            Clear all ({toasts.length})
          </button>
        </div>
      )}

      <style>{`
        @keyframes insight-toast-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .insight-toast-stack-scroll {
          scrollbar-width: thin;
          scrollbar-color: #CBD5E1 transparent;
        }
        .insight-toast-stack-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .insight-toast-stack-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 3px;
        }
        .insight-toast-stack-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}