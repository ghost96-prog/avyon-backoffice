// src/pages/Suppliers.jsx
//
// Supplier directory: create/edit suppliers (name, email, phone/WhatsApp,
// address, notes) and view each supplier's order history (rolled up from
// Purchase Orders). Modeled after Customers.jsx / GRV.jsx conventions —
// same inline-style helpers, same Toast pattern, same useAppContext wiring.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Truck, Plus, X, Search, Phone, Mail, MapPin, MessageCircle,
  ChevronLeft, ClipboardList, Edit2, Trash2,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { formatMoney } from '../utils/exportUtils';
import ConfirmDialog from '../components/community/ConfirmDialog';
import '../styles/ReportsShared.css';

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}
function fieldLabel() {
  return { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 };
}

const Toast = ({ message, type, onClose }) => {
  const styles = {
    error: { bg: '#FEF2F2', border: '#FEE2E2', text: '#EF4444' },
    success: { bg: '#F0FDF4', border: '#DCFCE7', text: '#16A34A' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  };
  const style = styles[type] || styles.error;
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
      background: style.bg, border: `1px solid ${style.border}`, borderRadius: 8,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxWidth: 380,
    }}>
      <span style={{ color: style.text, fontSize: 14, fontWeight: 500 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: style.text, fontSize: 18, marginLeft: 'auto' }}>×</button>
    </div>
  );
};

const emptySupplierDraft = { name: '', email: '', phone: '', address: '', notes: '' };

export default function Suppliers() {
  const { apiFetch, businessId, activeStaff, userProfile } = useAppContext();
  const { selectedBranchId } = useSelectedBranch();
  const staffId = activeStaff?.staffId || userProfile?.uid;
  const staffName = activeStaff?.name || userProfile?.name || 'Owner';

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'error') => setToast({ message, type });

  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [draft, setDraft] = useState(emptySupplierDraft);
  const [saving, setSaving] = useState(false);

  const [deletePending, setDeletePending] = useState(null);

  const fetchSuppliers = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/suppliers`);
      setSuppliers(res.data || []);
    } catch (e) {
      showToast(e.message || 'Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const filtered = useMemo(() => {
    let result = suppliers.filter((s) => !s.isDeleted);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [suppliers, searchQuery]);

  const openCreateModal = () => {
    setEditingSupplierId(null);
    setDraft(emptySupplierDraft);
    setModalOpen(true);
  };

  const openEditModal = (supplier) => {
    setEditingSupplierId(supplier.supplierId);
    setDraft({
      name: supplier.name || '', email: supplier.email || '',
      phone: supplier.phone || '', address: supplier.address || '',
      notes: supplier.notes || '',
    });
    setModalOpen(true);
  };

  const openDetail = useCallback(async (supplier) => {
    setView('detail');
    setSelectedSupplier(supplier);
    setLoadingDetail(true);
    try {
      const full = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/suppliers/${supplier.supplierId}`);
      setSelectedSupplier(full);
    } catch (e) {
      showToast(e.message || 'Failed to load supplier details', 'error');
    } finally {
      setLoadingDetail(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  const saveSupplier = async () => {
    if (!draft.name.trim()) return showToast('Supplier name is required', 'error');
    if (!draft.phone.trim()) return showToast('A phone number is required (used to send orders via WhatsApp)', 'error');
    setSaving(true);
    try {
      const body = { ...draft, staffId, staffName };
      if (editingSupplierId) {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/suppliers/${editingSupplierId}`, {
          method: 'PUT', body: JSON.stringify(body),
        });
        showToast('Supplier updated', 'success');
      } else {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/suppliers`, {
          method: 'POST', body: JSON.stringify(body),
        });
        showToast('Supplier added', 'success');
      }
      setModalOpen(false);
      fetchSuppliers();
    } catch (e) {
      showToast(e.message || 'Failed to save supplier', 'error');
    } finally {
      setSaving(false);
    }
  };


  const confirmDelete = async () => {
    if (!deletePending) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/suppliers/${deletePending.supplierId}`, { method: 'DELETE' });
      showToast('Supplier removed', 'success');
      setDeletePending(null);
      if (view === 'detail') setView('list');
      fetchSuppliers();
    } catch (e) {
      showToast(e.message || 'Failed to delete supplier', 'error');
      setDeletePending(null);
    }
  };

  // ── DETAIL VIEW ────────────────────────────────────────────────────────
  if (view === 'detail' && selectedSupplier) {
    const s = selectedSupplier;
    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>{s.name}</h1>
            <div style={{ fontSize: 13, color: '#64748B' }}>Supplier profile & order history</div>
          </div>
          <button onClick={() => openEditModal(s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            <Edit2 size={14} /> Edit
          </button>
          <button onClick={() => setDeletePending(s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}>
            <Trash2 size={14} /> Remove
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>TOTAL ORDERS</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{s.totalOrders || 0}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>TOTAL SPENT</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{formatMoney(s.totalSpent || 0)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>LAST ORDER</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{s.lastOrderAt ? new Date(s.lastOrderAt).toLocaleDateString() : '—'}</div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Phone size={16} color="#64748B" />
              <span>{s.phone || '—'}</span>
              {s.phone && (
                <span title="Used for Send to Supplier on WhatsApp" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, color: '#16A34A' }}>
                  <MessageCircle size={13} />
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Mail size={16} color="#64748B" /><span>{s.email || '—'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, gridColumn: '1 / -1' }}>
              <MapPin size={16} color="#64748B" /><span>{s.address || '—'}</span>
            </div>
            {s.notes && (
              <div style={{ gridColumn: '1 / -1', fontSize: 13, color: '#64748B', background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
                {s.notes}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClipboardList size={16} /> Order History
          </h3>
          {loadingDetail ? (
            <div style={{ color: '#64748B', fontSize: 14 }}>Loading…</div>
          ) : !s.orderHistory || s.orderHistory.length === 0 ? (
            <div style={{ color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px dashed #E2E8F0', borderRadius: 12, padding: 24, textAlign: 'center' }}>
              No purchase orders with this supplier yet.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
              {s.orderHistory.map((po) => (
                <div key={po.purchaseOrderId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ fontWeight: 600, minWidth: 110 }}>{po.poNumber}</div>
                  <div style={{ fontSize: 13, color: '#64748B', flex: 1 }}>{po.itemCount} item(s) · {formatMoney(po.totalCost || 0)}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{new Date(po.createdAt).toLocaleDateString()}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#EFF6FF', color: '#0891B2', textTransform: 'capitalize' }}>
                    {(po.status || '').replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <SupplierModal draft={draft} setDraft={setDraft} saving={saving} onCancel={() => setModalOpen(false)} onSave={saveSupplier} isEditing={!!editingSupplierId} />
        )}
        {deletePending && (
          <ConfirmDialog
            title="Remove supplier?"
            message={`"${deletePending.name}" will be removed from your active supplier list. Past purchase orders keep their history.`}
            confirmLabel="Remove"
            onCancel={() => setDeletePending(null)}
            onConfirm={confirmDelete}
          />
        )}
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Truck size={20} />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Suppliers</h1>
          <div style={{ fontSize: 13, color: '#64748B' }}>Who you buy stock from</div>
        </div>
        <button onClick={openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} /> New Supplier
        </button>
      </div>

      <div style={{ position: 'relative', maxWidth: 340, margin: '16px 0' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
        <input
          style={fieldInput({ paddingLeft: 36 })}
          placeholder="Search suppliers…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ color: '#64748B', fontSize: 14 }}>Loading suppliers…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px dashed #E2E8F0', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          {searchQuery ? 'No suppliers match your search.' : 'No suppliers yet — add your first one to start creating purchase orders.'}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((s) => (
            <div
              key={s.supplierId}
              onClick={() => openDetail(s)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Truck size={17} color="#0891B2" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 12 }}>
                  {s.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} />{s.phone}</span>}
                  {s.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={11} />{s.email}</span>}
                </div>
              </div>
              {s.phone && (
                <span title="WhatsApp number on file" style={{ color: '#16A34A' }}>
                  <MessageCircle size={16} />
                </span>
              )}
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.totalOrders || 0} orders</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>{formatMoney(s.totalSpent || 0)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <SupplierModal draft={draft} setDraft={setDraft} saving={saving} onCancel={() => setModalOpen(false)} onSave={saveSupplier} isEditing={!!editingSupplierId} />
      )}
      {deletePending && (
        <ConfirmDialog
          title="Remove supplier?"
          message={`"${deletePending.name}" will be removed from your active supplier list. Past purchase orders keep their history.`}
          confirmLabel="Remove"
          onCancel={() => setDeletePending(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

// ── Create/Edit modal, exported so PurchaseOrders.jsx can reuse it for
// the "+ New Supplier" shortcut from inside PO creation. ───────────────────
export function SupplierModal({ draft, setDraft, saving, onCancel, onSave, isEditing }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 460, maxWidth: '92vw', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{isEditing ? 'Edit Supplier' : 'New Supplier'}</h3>
          <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={fieldLabel()}>Supplier Name *</label>
            <input style={fieldInput()} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Delta Beverages" />
          </div>
          <div>
            <label style={fieldLabel()}>Phone / WhatsApp Number *</label>
            <input style={fieldInput()} value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="+263 77 123 4567" />
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Include the country code — this is what "Send to Supplier" uses on WhatsApp.</div>
          </div>
          <div>
            <label style={fieldLabel()}>Email</label>
            <input style={fieldInput()} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label style={fieldLabel()}>Address</label>
            <input style={fieldInput()} value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label style={fieldLabel()}>Notes</label>
            <textarea style={fieldInput({ minHeight: 60, resize: 'vertical' })} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Payment terms, delivery days, etc." />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: '11px 18px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{ flex: 1, padding: '11px 18px', borderRadius: 10, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}