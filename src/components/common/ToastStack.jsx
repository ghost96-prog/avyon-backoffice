// src/components/common/ToastStack.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Package, CheckCircle2, XCircle } from 'lucide-react';

const ICONS = {
  stock_transfer_incoming: { Icon: Package, color: '#0891B2', bg: '#EFF6FF' },
  stock_transfer_accepted: { Icon: CheckCircle2, color: '#16A34A', bg: '#DCFCE7' },
  stock_transfer_rejected: { Icon: XCircle, color: '#EF4444', bg: '#FEE2E2' },
  stock_transfer_cancelled: { Icon: XCircle, color: '#64748B', bg: '#F1F5F9' },
};

const STACK_WIDTH = 360;
const MAX_VISIBLE_HEIGHT = 420;

export default function ToastStack({ toasts, onDismiss, onMarkRead }) {
  const navigate = useNavigate();
  if (!toasts.length) return null;

  const handleClearAll = () => {
    toasts.forEach((t) => onDismiss(t.notificationId));
  };

  return (
    <div
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 2000,
        display: 'flex', flexDirection: 'column', gap: 8,
        width: STACK_WIDTH, maxWidth: 'calc(100vw - 40px)',
        boxSizing: 'border-box',
      }}
    >
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

      <div
        className="toast-stack-scroll"
        style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          maxHeight: MAX_VISIBLE_HEIGHT, overflowY: 'auto', overflowX: 'hidden',
          width: '100%', boxSizing: 'border-box', paddingRight: 2,
        }}
      >
        {toasts.map((t) => {
          const cfg = ICONS[t.type] || { Icon: Package, color: '#0891B2', bg: '#EFF6FF' };
          const { Icon } = cfg;
          const transferId = t.data?.transferId;
          const isActionableTransfer = t.type === 'stock_transfer_incoming' && transferId;
          const handleReview = () => {
            onMarkRead(t.notificationId);
            navigate(`/inventory/transfers?transferId=${transferId}`);
          };
          return (
            <div
              key={t.notificationId}
              onClick={isActionableTransfer ? handleReview : undefined}
              style={{
                position: 'relative', isolation: 'isolate',
                width: '100%', boxSizing: 'border-box',
                background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                border: '1px solid #E2E8F0', padding: 14, display: 'flex', gap: 12,
                alignItems: 'flex-start', animation: 'toast-in 0.25s ease-out',
                cursor: isActionableTransfer ? 'pointer' : 'default',
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
                  {isActionableTransfer && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReview(); }}
                      style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Review
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onMarkRead(t.notificationId); }}
                    style={{ fontSize: 11, fontWeight: 600, color: '#0891B2', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onDismiss(t.notificationId); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                <X size={14} color="#94A3B8" />
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .toast-stack-scroll {
          scrollbar-width: thin;
          scrollbar-color: #CBD5E1 transparent;
        }
        .toast-stack-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .toast-stack-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 3px;
        }
        .toast-stack-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}