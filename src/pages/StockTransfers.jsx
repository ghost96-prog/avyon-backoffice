// src/pages/StockTransfers.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Store, Plus, X, ArrowLeftRight, Package, Trash2, Check, XCircle, Ban,
  ChevronLeft, Search, FileText, Clock, User, MessageSquare, Bell,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatMoney } from '../utils/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/ReportsShared.css';

const STATUS_CONFIG = {
  in_transit: { label: 'In Transit', bg: '#FEF3C7', color: '#0891B2' },
  completed: { label: 'Completed', bg: '#DCFCE7', color: '#16A34A' },
  rejected: { label: 'Rejected', bg: '#FEE2E2', color: '#EF4444' },
  cancelled: { label: 'Cancelled', bg: '#F1F5F9', color: '#64748B' },
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const Toast = ({ message, type, onClose, onClick }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    error: { bg: '#FEF2F2', border: '#FEE2E2', text: '#EF4444' },
    success: { bg: '#F0FDF4', border: '#DCFCE7', text: '#16A34A' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
    info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#0891B2' },
  };

  const style = colors[type] || colors.info;
  const clickable = typeof onClick === 'function';

  return (
    <div
      onClick={() => { if (clickable) onClick(); }}
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        padding: '12px 20px',
        borderRadius: 8,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        maxWidth: 400,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 14,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {clickable && <span style={{ fontSize: 11, fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap' }}>View →</span>}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: style.text, fontSize: 18 }}
      >
        ×
      </button>
    </div>
  );
};

// Accept/Reject Modal
// The receiving branch has its own separate product catalog, so accepting
// a transfer requires telling the backend which of THIS branch's products
// each incoming line item should add stock to (see productMapping in
// stockTransferController.acceptTransfer, which rejects with "No receiving
// product selected" if any item is left unmapped).
const AcceptModal = ({ transfer, onAccept, onReject, onClose, loading, apiFetch, businessId }) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [destProducts, setDestProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [mapping, setMapping] = useState({});

  useEffect(() => {
    if (!transfer?.toBranchId || !businessId) return;
    let cancelled = false;
    setProductsLoading(true);
    setProductsError(null);
    (async () => {
      try {
        const res = await apiFetch(`/business/${businessId}/branches/${transfer.toBranchId}/products?status=active`);
        const list = Array.isArray(res) ? res : (res?.data || []);
        if (cancelled) return;
        setDestProducts(list);

        // Default each item to a same-SKU match in this branch's catalog,
        // if one exists — the common case for a straightforward restock.
        const initialMapping = {};
        (transfer.items || []).forEach((item) => {
          const match = list.find((p) => p.sku && item.sku && p.sku.toUpperCase() === item.sku.toUpperCase());
          if (match) initialMapping[item.productId] = match.productId;
        });
        setMapping(initialMapping);
      } catch (e) {
        console.error('Load destination products for transfer accept error:', e);
        if (!cancelled) setProductsError('Could not load this store\'s products. You can still reject the transfer.');
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [transfer?.toBranchId, transfer?.items, businessId, apiFetch]);

  const allMapped = (transfer?.items || []).every((item) => !!mapping[item.productId]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        maxWidth: 500,
        width: '100%',
        maxHeight: '80vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>📦 Incoming Transfer</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          color: '#B45309',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Bell size={15} /> Action needed — this transfer is waiting for your store to accept or reject it.
        </div>

        <div style={{ marginBottom: 16 }}>
          <p><strong>From:</strong> {transfer?.fromBranchName}</p>
          <p><strong>To:</strong> {transfer?.toBranchName}</p>
          <p><strong>Items:</strong> {transfer?.items?.length || 0}</p>
          {transfer?.notes && <p><strong>Notes:</strong> {transfer.notes}</p>}
        </div>

        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 4 }}>Match each item to a product in your store:</h4>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>
            Stock will be added to whichever product you pick here. If an item doesn't exist yet in this store, create it first, then come back and accept.
          </div>

          {productsError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
              {productsError}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '6px', textAlign: 'left' }}>Incoming Item</th>
                <th style={{ padding: '6px', textAlign: 'right' }}>Qty</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Receive Into</th>
              </tr>
            </thead>
            <tbody>
              {transfer?.items?.map((item, i) => {
                const isMapped = !!mapping[item.productId];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '6px' }}>{item.productName} <span style={{ color: '#94A3B8', fontSize: 11 }}>{item.sku}</span></td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '6px' }}>
                      <select
                        value={mapping[item.productId] || ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [item.productId]: e.target.value || undefined }))}
                        disabled={productsLoading}
                        style={{
                          width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                          border: `1px solid ${isMapped ? '#E2E8F0' : '#FCA5A5'}`,
                          background: isMapped ? '#fff' : '#FEF2F2',
                        }}
                      >
                        <option value="">{productsLoading ? 'Loading products…' : 'Select a product'}</option>
                        {destProducts.map((p) => (
                          <option key={p.productId} value={p.productId}>
                            {p.name} ({p.sku}) — {p.currentStock ?? 0} in stock
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!allMapped && !productsLoading && (
            <div style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>
              Select a receiving product for every item before accepting.
            </div>
          )}
        </div>

        {!showReject ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              onClick={() => setShowReject(true)}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #EF4444', background: '#fff', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}
            >
              Reject
            </button>
            <button 
              onClick={() => onAccept(mapping)}
              disabled={loading || !allMapped || productsLoading}
              style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', background: (loading || !allMapped || productsLoading) ? '#94D3AE' : '#16A34A', color: '#fff', fontWeight: 600, cursor: (loading || !allMapped || productsLoading) ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Processing...' : 'Accept Transfer'}
            </button>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', display: 'block', marginBottom: 6 }}>Reason for rejection (optional)</label>
            <textarea 
              style={{ ...fieldInput(), minHeight: 60 }} 
              value={rejectReason} 
              onChange={(e) => setRejectReason(e.target.value)} 
              placeholder="e.g. Items damaged in transit" 
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={() => setShowReject(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={() => onReject(rejectReason)} disabled={loading} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {loading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function StockTransfers() {
  const { apiFetch, businessId, branches, branchId: contextBranchId, activeStaff, userProfile, baseCurrency } = useAppContext();
  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';
  const staffName = activeStaff?.name || userProfile?.name || userProfile?.email?.split('@')[0] || 'Owner';

  const [toast, setToast] = useState(null);
  const [view, setView] = useState('list');
  const [viewBranchId, setViewBranchId] = useState('');
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [notifiedIds, setNotifiedIds] = useState(new Set());
  const [pendingIncoming, setPendingIncoming] = useState([]);

  const showToast = (message, type = 'error', transfer = null) => {
    setToast({ message, type, transfer });
  };

  // Jump straight to a transfer's detail view (switching store context if needed)
  // and pop the accept/reject modal open, so clicking a notification takes you
  // right where you need to act.
  const navigateToTransfer = useCallback((t) => {
    if (!t) return;
    setViewBranchId(t.toBranchId);
    setSelectedTransfer(t);
    setView('detail');
    setShowModal(t.status === 'in_transit');
    setToast(null);
  }, []);

  useEffect(() => {
    if (branches?.length > 0 && !viewBranchId) {
      const initialBranchId = contextBranchId || branches[0].branchId;
      setViewBranchId(initialBranchId);
    }
  }, [branches, contextBranchId, viewBranchId]);

  const viewBranchName = branches?.find((b) => b.branchId === viewBranchId)?.name || 'Select Store';

  const fetchTransfers = useCallback(async () => {
    if (!businessId || !viewBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branchId: viewBranchId });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await apiFetch(`/business/${businessId}/stock-transfers?${params.toString()}`);
      const data = res?.data || [];
      setTransfers(data);
    } catch (e) {
      console.error('Fetch transfers error:', e);
      setError('Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, viewBranchId, statusFilter]);

  useEffect(() => {
    if (view === 'list' && viewBranchId) {
      fetchTransfers();
      const interval = setInterval(fetchTransfers, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchTransfers, view, viewBranchId]);

  // Cross-store watcher: regardless of which store you're currently viewing or
  // which page/tab you're on within this screen, poll every branch for
  // pending incoming transfers so a toast + persistent banner can surface
  // "Store B has a pending transfer" even if you're looking at Store A.
  const checkAllBranchesForIncoming = useCallback(async () => {
    if (!businessId || !branches?.length) return;
    try {
      const results = await Promise.all(
        branches.map(async (b) => {
          try {
            const res = await apiFetch(`/business/${businessId}/stock-transfers?branchId=${b.branchId}&status=in_transit`);
            return res?.data || [];
          } catch (e) {
            console.error(`Fetch incoming transfers for ${b.branchId} error:`, e);
            return [];
          }
        })
      );
      const allIncoming = results
        .flat()
        .filter((t) => t.status === 'in_transit' && branches.some((b) => b.branchId === t.toBranchId));

      setPendingIncoming(allIncoming);

      const newOnes = allIncoming.filter((t) => !notifiedIds.has(t.transferId));
      if (newOnes.length > 0) {
        const first = newOnes[0];
        const extra = newOnes.length > 1 ? ` (+${newOnes.length - 1} more pending)` : '';
        showToast(
          `📦 ${first.toBranchName} has a pending transfer from ${first.fromBranchName} (${first.items?.length || 0} items)${extra}`,
          'info',
          first
        );
        setNotifiedIds((prev) => {
          const next = new Set(prev);
          newOnes.forEach((t) => next.add(t.transferId));
          return next;
        });
      }
    } catch (e) {
      console.error('Cross-branch transfer check error:', e);
    }
  }, [apiFetch, businessId, branches, notifiedIds]);

  useEffect(() => {
    if (!businessId || !branches?.length) return;
    checkAllBranchesForIncoming();
    const interval = setInterval(checkAllBranchesForIncoming, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, branches]);

  const openDetail = (t) => {
    setSelectedTransfer(t);
    setView('detail');
    
    // If incoming and in_transit, show modal
    if (t.toBranchId === viewBranchId && t.status === 'in_transit') {
      setShowModal(true);
    }
  };

  const handleAccept = async (productMapping) => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    try {
      await apiFetch(`/business/${businessId}/stock-transfers/${selectedTransfer.transferId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ staffId, staffName, posId: 'web-dashboard', productMapping: productMapping || {} }),
      });
      showToast('Transfer accepted successfully!', 'success');
      setShowModal(false);
      setView('list');
      setPendingIncoming((prev) => prev.filter((p) => p.transferId !== selectedTransfer.transferId));
      await fetchTransfers();
    } catch (e) {
      showToast(e.message || 'Failed to accept transfer', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason) => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    try {
      await apiFetch(`/business/${businessId}/stock-transfers/${selectedTransfer.transferId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ staffId, staffName, posId: 'web-dashboard', reason: reason.trim() || null }),
      });
      showToast('Transfer rejected', 'warning');
      setShowModal(false);
      setView('list');
      setPendingIncoming((prev) => prev.filter((p) => p.transferId !== selectedTransfer.transferId));
      await fetchTransfers();
    } catch (e) {
      showToast(e.message || 'Failed to reject transfer', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedTransfer) return;
    if (!window.confirm('Cancel this transfer?')) return;
    setActionLoading(true);
    try {
      await apiFetch(`/business/${businessId}/stock-transfers/${selectedTransfer.transferId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ staffId, staffName, posId: 'web-dashboard' }),
      });
      showToast('Transfer cancelled', 'warning');
      setView('list');
      await fetchTransfers();
    } catch (e) {
      showToast(e.message || 'Failed to cancel transfer', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportPdf = useCallback(() => {
    if (!selectedTransfer) return;
    const t = selectedTransfer;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setTextColor('#0F172A');
    doc.text('Stock Transfer Record', pageWidth / 2, 16, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor('#64748B');
    doc.text(`Transfer ID: ${t.transferId}`, pageWidth / 2, 23, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor('#0F172A');
    let y = 34;
    const line = (label, value) => { doc.setTextColor('#64748B'); doc.text(label, 14, y); doc.setTextColor('#0F172A'); doc.text(String(value ?? '—'), 60, y); y += 7; };
    line('From Store:', t.fromBranchName);
    line('To Store:', t.toBranchName);
    line('Status:', (STATUS_CONFIG[t.status] || {}).label || t.status);
    line('Requested By:', t.requestedByName);
    line('Requested At:', fmtDateTime(t.requestedAt));
    if (t.respondedByName) line('Responded By:', t.respondedByName);
    if (t.respondedAt) line('Responded At:', fmtDateTime(t.respondedAt));
    if (t.notes) line('Notes:', t.notes);
    if (t.rejectionReason) line('Rejection Reason:', t.rejectionReason);

    autoTable(doc, {
      startY: y + 4,
      head: [['Product', 'SKU', 'Quantity', 'Unit']],
      body: t.items.map((it) => [it.productName, it.sku, String(it.quantity), it.unit]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: '#F1F5F9', textColor: '#0F172A', fontStyle: 'bold' },
    });

    doc.save(`transfer_${t.transferId}.pdf`);
  }, [selectedTransfer]);

  // Other-store pending transfers (excludes the store currently being viewed,
  // since those already show an "ACTION NEEDED" tag in the list below).
  const otherStorePending = useMemo(
    () => pendingIncoming.filter((t) => t.toBranchId !== viewBranchId),
    [pendingIncoming, viewBranchId]
  );

  const PendingBanner = () => {
    if (otherStorePending.length === 0) return null;
    return (
      <div style={{
        background: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#B45309', fontWeight: 700, fontSize: 13 }}>
          <Bell size={15} /> {otherStorePending.length} pending transfer{otherStorePending.length !== 1 ? 's' : ''} waiting on other stores
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {otherStorePending.map((t) => (
            <button
              key={t.transferId}
              onClick={() => navigateToTransfer(t)}
              style={{
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #FDE68A',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                color: '#78350F',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span><strong>{t.toBranchName}</strong> has a pending transfer from {t.fromBranchName} ({t.items?.length || 0} items)</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>Review →</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderList = () => (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} onClick={toast.transfer ? () => navigateToTransfer(toast.transfer) : undefined} />}
      <div className="reports-header">
        <div className="reports-header-left">
          <div>
            <div className="reports-header-title">Stock Transfers</div>
            <div className="reports-header-sub">Move stock between stores</div>
          </div>
        </div>
        <div className="reports-header-right">
          <div style={{ position: 'relative' }}>
            <button className="reports-store-selector" onClick={() => setStorePopoverOpen((v) => !v)}>
              <Store size={14} /> <span>{viewBranchName}</span>
            </button>
            {storePopoverOpen && (
              <div className="reports-filter-popover" style={{ right: 0, left: 'auto', top: '110%' }}>
                {(branches || []).map((b) => (
                  <button key={b.branchId} className={`reports-filter-option ${viewBranchId === b.branchId ? 'is-active' : ''}`}
                    onClick={() => { setViewBranchId(b.branchId); setStorePopoverOpen(false); }}>
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setView('create')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={15} /> New Transfer
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <PendingBanner />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUS_OPTIONS.map((opt) => (
          <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
            style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${statusFilter === opt.value ? '#0891B2' : '#E2E8F0'}`, background: statusFilter === opt.value ? '#EFF6FF' : '#fff', color: statusFilter === opt.value ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="reports-list-card">
        {loading ? (
          <div className="reports-empty"><div className="reports-empty-title">Loading transfers...</div></div>
        ) : transfers.length === 0 ? (
          <div className="reports-empty">
            <ArrowLeftRight size={32} />
            <div className="reports-empty-title">No transfers found</div>
            <div className="reports-empty-sub">Create a transfer to move stock between stores</div>
          </div>
        ) : (
          transfers.map((t) => {
            const status = STATUS_CONFIG[t.status] || STATUS_CONFIG.in_transit;
            const isIncoming = t.toBranchId === viewBranchId;
            const needsAction = isIncoming && t.status === 'in_transit';
            return (
              <div key={t.transferId} className="reports-list-item" onClick={() => openDetail(t)}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: status.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <ArrowLeftRight size={16} color={status.color} />
                </div>
                <div className="reports-list-item-info">
                  <div className="reports-list-item-title">
                    {t.fromBranchName} → {t.toBranchName}
                    {needsAction && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#0891B2', background: '#EFF6FF', padding: '2px 6px', borderRadius: 4 }}>ACTION NEEDED</span>}
                  </div>
                  <div className="reports-list-item-sub">
                    <span className="reports-list-item-badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                    <span>{t.items.length} item{t.items.length !== 1 ? 's' : ''}</span>
                    <span>{new Date(t.createdAt).toLocaleString()}</span>
                    <span>{t.requestedByName}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ── CREATE TRANSFER ──────────────────────────────────────────────────────
  const [createStep, setCreateStep] = useState(1);
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [createProducts, setCreateProducts] = useState([]);
  const [createCategories, setCreateCategories] = useState([]);
  const [createCategoryFilter, setCreateCategoryFilter] = useState('All');
  const [createSearch, setCreateSearch] = useState('');
  const [cart, setCart] = useState({});
  const [creating, setCreating] = useState(false);

  const isStepComplete = (step) => {
    if (step === 1) return fromBranchId && toBranchId && fromBranchId !== toBranchId;
    if (step === 2) return cartItems.some(item => item.quantity > 0);
    return false;
  };

  const openCreateFlow = () => {
    setCreateStep(1);
    const sourceBranchId = viewBranchId || (branches?.length > 0 ? branches[0].branchId : '');
    setFromBranchId(sourceBranchId);
    setToBranchId('');
    setTransferNotes('');
    setCart({});
    setCreateSearch('');
    setCreateCategoryFilter('All');
    setView('create');
  };

  useEffect(() => {
    if (view !== 'create' || !businessId) return;
    if (!fromBranchId && branches?.length > 0) {
      const sourceBranchId = viewBranchId || branches[0].branchId;
      setFromBranchId(sourceBranchId);
      return;
    }
    if (!fromBranchId) return;
    (async () => {
      try {
        const [prodRes, catRes] = await Promise.all([
          apiFetch(`/business/${businessId}/branches/${fromBranchId}/products?status=active`),
          apiFetch(`/business/${businessId}/branches/${fromBranchId}/categories`),
        ]);
        setCreateProducts(Array.isArray(prodRes) ? prodRes : []);
        setCreateCategories(Array.isArray(catRes) ? catRes : []);
      } catch (e) {
        console.error('Load products/categories for transfer error:', e);
      }
    })();
  }, [view, fromBranchId, businessId, apiFetch, branches, viewBranchId]);

  const filteredCreateProducts = useMemo(() => {
    let result = createProducts;
    if (createCategoryFilter !== 'All') result = result.filter((p) => p.category === createCategoryFilter);
    if (createSearch.trim()) {
      const q = createSearch.trim().toLowerCase();
      result = result.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    return result;
  }, [createProducts, createCategoryFilter, createSearch]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = cartItems.filter(item => item.quantity > 0).length;

  const toggleCart = (product) => {
    if (!cart[product.productId] && (product.currentStock ?? 0) <= 0) {
      showToast(`Cannot add ${product.name} - no stock available`, 'error');
      return;
    }
    setCart((prev) => {
      const next = { ...prev };
      if (next[product.productId]) delete next[product.productId];
      else next[product.productId] = { product, quantity: 1 };
      return next;
    });
  };

  const selectAllFiltered = () => {
    setCart((prev) => {
      const next = { ...prev };
      filteredCreateProducts.forEach((product) => {
        if (!next[product.productId] && (product.currentStock ?? 0) > 0) {
          next[product.productId] = { product, quantity: 1 };
        }
      });
      return next;
    });
  };

  const deselectAll = () => {
    setCart({});
  };

  const updateCartQty = (productId, qty) => {
    const product = cart[productId]?.product;
    if (qty === '' || qty === 0) {
      setCart((prev) => ({ ...prev, [productId]: { ...prev[productId], quantity: 0 } }));
      return;
    }
    const numQty = Number(qty);
    if (isNaN(numQty) || numQty < 0) return;
    if (product && numQty > (product.currentStock ?? 0)) {
      showToast(`Only ${product.currentStock ?? 0} of ${product.name} available`, 'error');
      setCart((prev) => ({ ...prev, [productId]: { ...prev[productId], quantity: product.currentStock ?? 0 } }));
      return;
    }
    setCart((prev) => ({ ...prev, [productId]: { ...prev[productId], quantity: numQty } }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const canGoToProducts = fromBranchId && toBranchId && fromBranchId !== toBranchId;
  const canGoToReview = cartItems.some(item => item.quantity > 0);

  const handleSendTransfer = useCallback(async () => {
    const validItems = cartItems.filter(({ quantity }) => quantity > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one item with a valid quantity', 'error');
      return;
    }
    for (const { product, quantity } of validItems) {
      if (quantity > (product.currentStock ?? 0)) { 
        showToast(`Only ${product.currentStock ?? 0} of ${product.name} available`, 'error');
        return; 
      }
    }
    setCreating(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/stock-transfers`, {
        method: 'POST',
        body: JSON.stringify({
          fromBranchId, toBranchId,
          items: validItems.map(({ product, quantity }) => ({ 
            productId: product.productId, 
            quantity: Number(quantity) 
          })),
          staffId, staffName, posId: 'web-dashboard', notes: transferNotes.trim() || null,
        }),
      });
      showToast('Transfer created successfully!', 'success');
      setView('list');
      await fetchTransfers();
      await checkAllBranchesForIncoming();
    } catch (e) {
      console.error('Create transfer error:', e);
      showToast(e.message || 'Failed to create transfer', 'error');
    } finally {
      setCreating(false);
    }
  }, [apiFetch, businessId, fromBranchId, toBranchId, cartItems, staffId, staffName, transferNotes, fetchTransfers, checkAllBranchesForIncoming]);

  const renderCreate = () => (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} onClick={toast.transfer ? () => navigateToTransfer(toast.transfer) : undefined} />}
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">New Stock Transfer</div>
            <div className="reports-header-sub">Step {createStep} of 3</div>
          </div>
        </div>
      </div>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { n: 1, label: 'Stores', disabled: false },
          { n: 2, label: 'Products', disabled: !canGoToProducts },
          { n: 3, label: `Review${cartCount ? ` (${cartCount})` : ''}`, disabled: !canGoToReview },
        ].map((s) => {
          const isActive = createStep === s.n;
          const isComplete = isStepComplete(s.n);
          const isDisabled = s.disabled;

          return (
            <button 
              key={s.n} 
              disabled={isDisabled} 
              onClick={() => !isDisabled && setCreateStep(s.n)}
              style={{
                flex: 1, 
                padding: '10px 14px', 
                borderRadius: 8, 
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                border: `1px solid ${isActive ? '#0891B2' : isComplete ? '#16A34A' : '#E2E8F0'}`,
                background: isActive ? '#EFF6FF' : isComplete ? '#F0FDF4' : '#fff',
                color: isDisabled ? '#CBD5E1' : isActive ? '#0891B2' : isComplete ? '#16A34A' : '#64748B',
                fontWeight: 700, 
                fontSize: 13, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: 8,
                position: 'relative',
              }}
            >
              <span style={{
                width: 20, 
                height: 20, 
                borderRadius: 10, 
                background: isActive ? '#0891B2' : isComplete ? '#16A34A' : '#E2E8F0',
                color: isActive || isComplete ? '#fff' : '#94A3B8', 
                fontSize: 11, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
              }}>
                {isComplete ? <Check size={12} /> : s.n}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {createStep === 1 && (
        <div className="reports-list-card" style={{ padding: 24, maxWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>From Store</label>
              <select style={fieldInput()} value={fromBranchId} onChange={(e) => { setFromBranchId(e.target.value); setCart({}); }}>
                <option value="">Select store</option>
                {(branches || []).map((b) => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>To Store</label>
              <select style={fieldInput()} value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
                <option value="">Select store</option>
                {(branches || []).filter((b) => b.branchId !== fromBranchId).map((b) => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
              </select>
            </div>
          </div>
          {fromBranchId && toBranchId && fromBranchId === toBranchId && (
            <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 12 }}>Source and destination store must differ.</div>
          )}
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea style={{ ...fieldInput(), minHeight: 70 }} value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="Optional — reason for transfer, courier details, etc." />
          <button onClick={() => setCreateStep(2)} disabled={!canGoToProducts}
            style={{ marginTop: 18, padding: '11px 24px', borderRadius: 8, border: 'none', background: canGoToProducts ? '#0891B2' : '#CBD5E1', color: '#fff', fontWeight: 700, cursor: canGoToProducts ? 'pointer' : 'not-allowed' }}>
            Next: Select Products
          </button>
        </div>
      )}

      {createStep === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="reports-list-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div className="reports-search" style={{ flex: 1 }}>
                <Search size={14} />
                <input placeholder="Search products or SKU" value={createSearch} onChange={(e) => setCreateSearch(e.target.value)} />
              </div>
              <select style={{ ...fieldInput(), width: 160 }} value={createCategoryFilter} onChange={(e) => setCreateCategoryFilter(e.target.value)}>
                <option value="All">All Categories</option>
                {createCategories.map((c) => <option key={c.categoryId} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={selectAllFiltered} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #0891B2', background: '#EFF6FF', color: '#0891B2', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> Select All
              </button>
              <button onClick={deselectAll} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #EF4444', background: '#FEF2F2', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <X size={14} /> Deselect All
              </button>
              <span style={{ fontSize: 12, color: '#64748B', marginLeft: 'auto', alignSelf: 'center' }}>{cartCount} selected</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', width: 30 }}>
                    <input 
                      type="checkbox" 
                      checked={filteredCreateProducts.length > 0 && filteredCreateProducts.every(p => cart[p.productId])}
                      onChange={(e) => {
                        if (e.target.checked) selectAllFiltered();
                        else deselectAll();
                      }}
                    />
                  </th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>In Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredCreateProducts.map((p) => {
                  const inCart = !!cart[p.productId];
                  const hasStock = (p.currentStock ?? 0) > 0;
                  return (
                    <tr key={p.productId} onClick={() => hasStock && toggleCart(p)} style={{ 
                      cursor: hasStock ? 'pointer' : 'not-allowed', 
                      background: inCart ? '#EFF6FF' : 'transparent', 
                      borderBottom: '1px solid #F1F5F9',
                      opacity: hasStock ? 1 : 0.5
                    }}>
                      <td style={{ padding: '8px 6px' }}><input type="checkbox" checked={inCart} readOnly disabled={!hasStock} /></td>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.name} <span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 11 }}>{p.sku}</span></td>
                      <td style={{ padding: '8px 6px', color: '#64748B' }}>{p.category}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{p.currentStock ?? 0}</td>
                    </tr>
                  );
                })}
                {filteredCreateProducts.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94A3B8' }}>No products found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="reports-list-card" style={{ padding: 16, position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Selected ({cartCount})</div>
              {cartCount > 0 && (
                <button onClick={deselectAll} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #EF4444', background: '#FEF2F2', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Trash2 size={14} /> Delete All
                </button>
              )}
            </div>
            {cartItems.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94A3B8', padding: '20px 0', textAlign: 'center' }}>No items selected yet</div>
            ) : (
              cartItems.map(({ product, quantity }) => (
                <div key={product.productId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
                  <span style={{ flex: 1, fontSize: 12 }}>{product.name}</span>
                  <input 
                    type="number" 
                    style={{ ...fieldInput(), width: 60, padding: '5px 6px' }}
                    value={quantity === 0 ? '' : quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        updateCartQty(product.productId, 0);
                      } else {
                        const num = Number(val);
                        if (!isNaN(num) && num >= 0) {
                          updateCartQty(product.productId, num);
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (!val || val <= 0) {
                        removeFromCart(product.productId);
                      } else if (val > (product.currentStock ?? 0)) {
                        showToast(`Only ${product.currentStock ?? 0} of ${product.name} available`, 'error');
                        updateCartQty(product.productId, product.currentStock ?? 0);
                      }
                    }}
                  />
                  <button onClick={() => removeFromCart(product.productId)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Trash2 size={13} color="#EF4444" /></button>
                </div>
              ))
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setCreateStep(1)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={() => setCreateStep(3)} disabled={!canGoToReview} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: canGoToReview ? '#0891B2' : '#CBD5E1', color: '#fff', fontWeight: 700, cursor: canGoToReview ? 'pointer' : 'not-allowed' }}>Review</button>
            </div>
          </div>
        </div>
      )}

      {createStep === 3 && (
        <div className="reports-list-card" style={{ padding: 20, maxWidth: 760 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>From</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{branches?.find((b) => b.branchId === fromBranchId)?.name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>To</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{branches?.find((b) => b.branchId === toBranchId)?.name}</div>
            </div>
          </div>
          {transferNotes && <div style={{ marginBottom: 16, fontSize: 13 }}><strong>Notes:</strong> {transferNotes}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 18 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>SKU</th>
                <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {cartItems.filter(item => item.quantity > 0).map(({ product, quantity }) => (
                <tr key={product.productId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{product.name}</td>
                  <td style={{ padding: '8px 6px', color: '#94A3B8' }}>{product.sku}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setCreateStep(2)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 700, cursor: 'pointer' }}>Back</button>
            <button onClick={handleSendTransfer} disabled={creating} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Sending...' : 'Send Transfer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  const renderDetail = () => {
    if (!selectedTransfer) return null;
    const t = selectedTransfer;
    const status = STATUS_CONFIG[t.status] || STATUS_CONFIG.in_transit;
    const isIncoming = t.toBranchId === viewBranchId;
    const canCancel = t.fromBranchId === viewBranchId && t.status === 'in_transit';
    const needsAcceptance = t.status === 'in_transit';

    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} onClick={toast.transfer ? () => navigateToTransfer(toast.transfer) : undefined} />}
        {showModal && (
          <AcceptModal 
            transfer={t}
            onAccept={handleAccept}
            onReject={handleReject}
            onClose={() => {
              setShowModal(false);
              setView('list');
            }}
            loading={actionLoading}
            apiFetch={apiFetch}
            businessId={businessId}
          />
        )}
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">{t.fromBranchName} → {t.toBranchName}</div>
              <div className="reports-header-sub">
                <span className="reports-list-item-badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
              </div>
            </div>
          </div>
          <div className="reports-header-right">
            {needsAcceptance && (
              <button
                onClick={() => setShowModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                <Bell size={14} /> Complete Transfer
              </button>
            )}
            <button onClick={handleExportPdf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <FileText size={14} /> Export PDF
            </button>
          </div>
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        {needsAcceptance && (
          <div style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            color: '#B45309',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            maxWidth: 700,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={15} /> This transfer is still in transit and needs {t.toBranchName} to accept or reject it to be completed.
            </span>
            <button
              onClick={() => setShowModal(true)}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Accept / Reject
            </button>
          </div>
        )}

        {/* Overview */}
        <div className="reports-list-card" style={{ padding: 24, maxWidth: 700 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Store size={11} /> From Store</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{t.fromBranchName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Store size={11} /> To Store</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{t.toBranchName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> Requested By</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{t.requestedByName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Requested At</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{fmtDateTime(t.requestedAt)}</div>
            </div>
            {t.respondedByName && (
              <>
                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Responded By</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{t.respondedByName}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Responded At</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{fmtDateTime(t.respondedAt)}</div>
                </div>
              </>
            )}
          </div>
          {t.notes && (
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}><MessageSquare size={11} /> Notes</div>
              <div style={{ fontSize: 13 }}>{t.notes}</div>
            </div>
          )}
          {t.rejectionReason && (
            <div style={{ background: '#FEF2F2', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#EF4444', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Rejection Reason</div>
              <div style={{ fontSize: 13, color: '#EF4444' }}>{t.rejectionReason}</div>
            </div>
          )}
          {canCancel && (
            <button onClick={handleCancel} disabled={actionLoading} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ban size={14} /> Cancel Transfer
            </button>
          )}
        </div>

        {/* Items table - always visible */}
        <div className="reports-list-card" style={{ padding: 20, maxWidth: 700, marginTop: 16 }}>
          <h4 style={{ marginBottom: 12 }}>Items ({t.items.length})</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>SKU</th>
                <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {t.items.map((it) => (
                <tr key={it.productId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{it.productName}</td>
                  <td style={{ padding: '8px 6px', color: '#94A3B8' }}>{it.sku}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{it.quantity}</td>
                  <td style={{ padding: '8px 6px', color: '#64748B' }}>{it.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (view === 'create') return renderCreate();
  if (view === 'detail') return renderDetail();
  return renderList();
}