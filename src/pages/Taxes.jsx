// src/pages/Taxes.jsx
//
// Back-office tax setup (Loyverse-style "Taxes" page), per store.
//
// A store has a master "Enable tax" switch and a list of taxes, e.g.
//   VAT 15.5% (standard) · Zero Rated 0% · Exempt
// Products then switch ONE of these on (Product form). Prices are always treated
// as tax-inclusive: whatever price is entered already contains the tax.
//
// Stored on the branch settings doc: { taxEnabled, taxes: [{ id, name, rate, kind }] }
// The first time tax is switched on, the server creates the three standard taxes.
import React, { useState, useCallback, useEffect } from 'react';
import { Store, Plus, X, Percent, Trash2, Pencil, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import '../styles/ReportsShared.css';

const fieldInput = (props) => ({
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 14, boxSizing: 'border-box', ...props,
});

const KIND_LABEL = { standard: 'Standard rate', zero: 'Zero-rated (0%)', exempt: 'VAT exempt' };

export default function Taxes() {
  const { apiFetch, businessId, branches, activeStaff, userProfile } = useAppContext();
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch();
  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';

  const [enabled, setEnabled] = useState(false);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [storeModalOpen, setStoreModalOpen] = useState(false);

  // editor modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // tax being edited, or null for new
  const [formName, setFormName] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formExempt, setFormExempt] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const selectedBranchName =
    branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';
  const basePath = `/business/${businessId}/branches/${selectedBranchId}`;

  const fetchData = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const st = await apiFetch(`${basePath}/settings`);
      setEnabled(st?.taxEnabled === true);
      setTaxes(Array.isArray(st?.taxes) ? st.taxes : []);
    } catch (e) {
      console.error('Fetch taxes error:', e);
      setError('Failed to load tax settings');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId, basePath]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleEnabled = async (e) => {
    const next = e.target.checked;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${basePath}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ staffId, taxEnabled: next }),
      });
      setEnabled(res?.settings?.taxEnabled === true);
      // the server creates the 3 standard taxes the first time tax is switched on
      if (Array.isArray(res?.settings?.taxes)) setTaxes(res.settings.taxes);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const openModal = (tax = null) => {
    setEditing(tax);
    setFormName(tax?.name || '');
    setFormRate(tax ? String(tax.rate) : '');
    setFormExempt(tax?.kind === 'exempt');
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    const rate = formExempt ? 0 : parseFloat(formRate);
    if (!name) { setError('Enter a tax name'); return; }
    if (!formExempt && (isNaN(rate) || rate < 0 || rate > 100)) { setError('Enter a rate between 0 and 100'); return; }

    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({ staffId, name, rate, kind: formExempt ? 'exempt' : undefined });
      if (editing) {
        await apiFetch(`${basePath}/taxes/${editing.id}`, { method: 'PUT', body });
      } else {
        await apiFetch(`${basePath}/taxes`, { method: 'POST', body });
      }
      setModalOpen(false);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to save tax');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`${basePath}/taxes/${deleteTarget.id}?staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await fetchData();
    } catch (err) {
      // e.g. "This tax is assigned to products..."
      setDeleteTarget(null);
      setError(err.message || 'Failed to delete tax');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reports-page">
      <div className="reports-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 className="reports-title" style={{ margin: 0 }}>Taxes</h1>
          <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 2 }}>
            Set up the taxes products can use. Prices always include tax.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="reports-filter-btn" onClick={() => setStoreModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            <Store size={15} /> {selectedBranchName}
          </button>
          <button onClick={() => openModal()} disabled={!enabled || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !enabled || saving ? 0.5 : 1 }}>
            <Plus size={15} /> New Tax
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Master switch */}
      <div className="reports-list-card" style={{ marginBottom: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Enable tax</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            For VAT-registered / fiscalised stores. When on, products can be given a tax and receipts show the tax included in the total.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: enabled ? '#0891B2' : '#64748B', cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={enabled} disabled={loading || saving} onChange={handleToggleEnabled} />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>

      {!loading && enabled && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            ZIMRA needs an HS code on every fiscal item: a full 8-digit code for zero-rated and exempt items, and at least the first 4 digits for standard-rate items. Set it on each category.
          </span>
        </div>
      )}

      <div className="reports-list-card">
        {loading ? (
          <div className="reports-empty"><div className="reports-empty-sub">Loading…</div></div>
        ) : !enabled ? (
          <div className="reports-empty">
            <Percent size={32} />
            <div className="reports-empty-title">Tax is off for this store</div>
            <div className="reports-empty-sub">Switch it on above to set up VAT, zero-rated and exempt taxes</div>
          </div>
        ) : taxes.length === 0 ? (
          <div className="reports-empty">
            <Percent size={32} />
            <div className="reports-empty-title">No taxes yet</div>
            <div className="reports-empty-sub">Add a tax, then switch it on for the products it applies to</div>
          </div>
        ) : (
          taxes.map((t) => (
            <div key={t.id} className="reports-list-item"
              style={{ cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #F1F5F9', backgroundColor: '#fff' }}
              onClick={() => openModal(t)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Percent size={18} color="#0891B2" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
                    {t.name}{t.kind === 'standard' ? ` · ${t.rate}%` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{KIND_LABEL[t.kind] || ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                <button title="Edit tax" onClick={(e) => { e.stopPropagation(); openModal(t); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: '#64748B', display: 'flex' }}>
                  <Pencil size={16} />
                </button>
                <button title="Delete tax" onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: '#EF4444', display: 'flex' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Tax"
        message={`Delete "${deleteTarget?.name || ''}"? A tax that products still use can't be deleted.`}
        confirmText="Delete Tax"
        isDeleting={saving}
      />

      {storeModalOpen && (
        <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
          <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
            <div className="reports-modal-header">
              <span className="reports-modal-title">Select Store</span>
              <button className="reports-modal-close" onClick={() => setStoreModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="reports-modal-body" style={{ padding: '8px 4px' }}>
              {(branches || []).map((b) => (
                <button key={b.branchId}
                  className={`reports-filter-option ${selectedBranchId === b.branchId ? 'is-active' : ''}`}
                  onClick={() => { setSelectedBranchId(b.branchId); setStoreModalOpen(false); }}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="reports-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="reports-modal-header">
              <span className="reports-modal-title">{editing ? 'Edit Tax' : 'New Tax'}</span>
              <button className="reports-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="reports-modal-body">
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Name</label>
              <input style={fieldInput()} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. VAT" maxLength={30} autoFocus />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 4px', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={formExempt} onChange={(e) => { setFormExempt(e.target.checked); if (e.target.checked) setFormRate('0'); }} />
                VAT exempt
              </label>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>
                Exempt items carry no VAT and are reported to ZIMRA as exempt.
              </div>

              {!formExempt && (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Rate (%)</label>
                  <input type="number" step="0.01" min="0" max="100" style={fieldInput()} value={formRate} onChange={(e) => setFormRate(e.target.value)} placeholder="15.5   (0 = zero-rated)" />
                </>
              )}

              {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 10 }}>{error}</div>}

              <button onClick={handleSave} disabled={saving || !formName.trim()}
                style={{ width: '100%', marginTop: 16, padding: 11, borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving || !formName.trim() ? 0.7 : 1 }}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Tax'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
