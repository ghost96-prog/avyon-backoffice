// src/components/common/ToastStack.jsx
import React from 'react';
import { X, Package, CheckCircle2, XCircle } from 'lucide-react';

const ICONS = {
  stock_transfer_incoming: { Icon: Package, color: '#0891B2', bg: '#EFF6FF' },
  stock_transfer_accepted: { Icon: CheckCircle2, color: '#16A34A', bg: '#DCFCE7' },
  stock_transfer_rejected: { Icon: XCircle, color: '#EF4444', bg: '#FEE2E2' },
  stock_transfer_cancelled: { Icon: XCircle, color: '#64748B', bg: '#F1F5F9' },
};

export default function ToastStack({ toasts, onDismiss, onMarkRead }) {
  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 2000,
      display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360,
    }}>
      {toasts.map((t) => {
        const cfg = ICONS[t.type] || { Icon: Package, color: '#0891B2', bg: '#EFF6FF' };
        const { Icon } = cfg;
        return (
          <div
            key={t.notificationId}
            style={{
              background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              border: '1px solid #E2E8F0', padding: 14, display: 'flex', gap: 12,
              alignItems: 'flex-start', animation: 'toast-in 0.25s ease-out',
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 9, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} color={cfg.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{t.title}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 1.4 }}>{t.body}</div>
              <button
                onClick={() => onMarkRead(t.notificationId)}
                style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: '#0891B2', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Dismiss
              </button>
            </div>
            <button onClick={() => onDismiss(t.notificationId)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
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