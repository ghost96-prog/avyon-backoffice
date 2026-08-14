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

export default function ToastStack({ toasts, onDismiss, onMarkRead }) {
  const navigate = useNavigate();
  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 2000,
      display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360,
    }}>
      {toasts.map((t) => {
        const cfg = ICONS[t.type] || { Icon: Package, color: '#0891B2', bg: '#EFF6FF' };
        const { Icon } = cfg;
        // ✅ NEW — an incoming transfer request is actionable: clicking it
        // (or its "Review" button) takes the owner straight to the
        // Transfers screen with ?transferId=... in the URL, which
        // StockTransfers.jsx picks up on mount to jump into the detail
        // view and auto-open the Accept/Reject modal for that transfer.
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
              background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              border: '1px solid #E2E8F0', padding: 14, display: 'flex', gap: 12,
              alignItems: 'flex-start', animation: 'toast-in 0.25s ease-out',
              cursor: isActionableTransfer ? 'pointer' : 'default',
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
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}