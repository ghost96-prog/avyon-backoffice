// src/components/common/ConfirmDeleteModal.jsx
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import '../../styles/ReportsShared.css';

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Item',
  message = 'Are you sure you want to delete this item? This action cannot be undone.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isDeleting = false,
  count = 1,
}) {
  if (!isOpen) return null;

  return (
    <div className="reports-modal-overlay" onClick={onClose}>
      <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="reports-modal-header" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ 
              width: 36, 
              height: 36, 
              borderRadius: '50%', 
              background: '#FEF2F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <AlertTriangle size={18} color="#EF4444" />
            </div>
            <span className="reports-modal-title" style={{ fontSize: 16 }}>{title}</span>
          </div>
          <button className="reports-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        
        <div className="reports-modal-body" style={{ padding: '20px 24px' }}>
          <p style={{ 
            fontSize: 14, 
            color: '#475569', 
            lineHeight: 1.5,
            marginBottom: 8,
          }}>
            {message}
          </p>
          {count > 1 && (
            <p style={{ 
              fontSize: 13, 
              color: '#EF4444', 
              fontWeight: 600,
              marginTop: 4,
            }}>
              This will delete {count} items.
            </p>
          )}
          
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            marginTop: 20,
            justifyContent: 'flex-end',
          }}>
            <button
              onClick={onClose}
              disabled={isDeleting}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #E2E8F0',
                background: '#fff',
                color: '#475569',
                fontWeight: 600,
                fontSize: 13,
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                opacity: isDeleting ? 0.5 : 1,
              }}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: '#EF4444',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                opacity: isDeleting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {isDeleting ? (
                <>
                  <span className="spinner" style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Deleting...
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

