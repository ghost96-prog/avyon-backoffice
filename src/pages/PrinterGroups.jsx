// src/pages/PrinterGroups.jsx
//
// Back-office settings for ORDER PRINTING (kitchen / bar / etc. tickets).
//
// Model: a branch has any number of PRINTER GROUPS (e.g. "Kitchen", "Bar").
// Each group owns a set of product categories. A category belongs to at
// most one group. The POS's order printer is then assigned a group in POS
// settings, and prints only the items whose category is in that group.
//
// Stored on the branch settings doc (same one that holds the receipt
// header/footer):  { orderPrintingEnabled, printerGroups: [{id,name,categoryIds}] }
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Store, Plus, X, Printer, Trash2, Pencil, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import '../styles/ReportsShared.css';

const fieldInput = (props) => ({
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 14, boxSizing: 'border-box', ...props,
});

const newGroupId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function PrinterGroups() {
  const { apiFetch, businessId, branches, activeStaff, userProfile } = useAppContext();
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch();
  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';

  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [storeModalOpen, setStoreModalOpen] = useState(false);

  // group editor modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // group being edited, or null for new
  const [formName, setFormName] = useState('');
  const [formCats, setFormCats] = useState([]);

  // delete
  const [deleteTarget, setDeleteTarget] = useState(null);

  const selectedBranchName =
    branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';
  const basePath = `/business/${businessId}/branches/${selectedBranchId}`;

  const fetchData = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const [catRes, settingsRes] = await Promise.all([
        apiFetch(`${basePath}/categories`),
        apiFetch(`${basePath}/settings`),
      ]);
      setCategories(Array.isArray(catRes) ? catRes : []);
      setGroups(Array.isArray(settingsRes?.printerGroups) ? settingsRes.printerGroups : []);
      setEnabled(settingsRes?.orderPrintingEnabled === true);
    } catch (e) {
      console.error('Fetch printer groups error:', e);
      setError('Failed to load printer settings');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId, basePath]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Persist. The backend replaces the whole printerGroups list, so we always
  // send the full next list. Returns true on success.
  const persist = useCallback(async (patch) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${basePath}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ staffId, ...patch }),
      });
      if (res?.settings) {
        setGroups(Array.isArray(res.settings.printerGroups) ? res.settings.printerGroups : []);
        setEnabled(res.settings.orderPrintingEnabled === true);
      }
      return true;
    } catch (e) {
      console.error('Save printer settings error:', e);
      setError(e.message || 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  }, [apiFetch, basePath, staffId]);

  const catById = useMemo(() => {
    const m = new Map();
    categories.forEach((c) => m.set(c.categoryId || c.id, c));
    return m;
  }, [categories]);

  // categoryId -> name of the group that already owns it
  const ownerOf = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => (g.categoryIds || []).forEach((cid) => m.set(cid, g)));
    return m;
  }, [groups]);

  const unassigned = useMemo(
    () => categories.filter((c) => !ownerOf.has(c.categoryId || c.id)),
    [categories, ownerOf]
  );

  const openModal = (group = null) => {
    setEditing(group);
    setFormName(group?.name || '');
    setFormCats(group?.categoryIds ? [...group.categoryIds] : []);
    setModalOpen(true);
  };

  const toggleCat = (cid) =>
    setFormCats((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  const handleSaveGroup = async () => {
    const name = formName.trim();
    if (!name) return;
    const dup = groups.some(
      (g) => g.id !== editing?.id && g.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (dup) { setError(`A printer group named "${name}" already exists`); return; }

    const next = editing
      ? groups.map((g) => (g.id === editing.id ? { ...g, name, categoryIds: formCats } : g))
      : [...groups, { id: newGroupId(), name, categoryIds: formCats }];

    if (await persist({ printerGroups: next })) setModalOpen(false);
  };

  const handleDeleteGroup = async () => {
    if (!deleteTarget) return;
    const next = groups.filter((g) => g.id !== deleteTarget.id);
    if (await persist({ printerGroups: next })) setDeleteTarget(null);
  };

  const handleToggleEnabled = async () => {
    const prev = enabled;
    setEnabled(!prev); // optimistic
    if (!(await persist({ orderPrintingEnabled: !prev }))) setEnabled(prev);
  };

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <div>
            <div className="reports-header-title">Printer Groups</div>
            <div className="reports-header-sub">
              Choose which categories print on each order printer (kitchen, bar, etc.)
            </div>
          </div>
        </div>
        <div className="reports-header-right">
          <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
            <Store size={14} /> <span>{selectedBranchName}</span>
          </button>
          <button
            onClick={() => openModal()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            <Plus size={15} /> New Group
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
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Print order tickets</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            When on, POS devices at this store print an order ticket on the order printer at the same time as the receipt.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: enabled ? '#0891B2' : '#64748B', cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={enabled} disabled={loading || saving} onChange={handleToggleEnabled} />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>

      {!loading && groups.length > 0 && unassigned.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            {unassigned.length} categor{unassigned.length === 1 ? 'y is' : 'ies are'} not in any group and won't print on an order ticket:{' '}
            {unassigned.map((c) => c.name).join(', ')}
          </span>
        </div>
      )}

      <div className="reports-list-card">
        {loading ? (
          <div className="reports-empty"><div className="reports-empty-sub">Loading…</div></div>
        ) : groups.length === 0 ? (
          <div className="reports-empty">
            <Printer size={32} />
            <div className="reports-empty-title">No printer groups yet</div>
            <div className="reports-empty-sub">Create a group like "Kitchen" and pick the categories it should print</div>
          </div>
        ) : (
          groups.map((g) => {
            const names = (g.categoryIds || []).map((cid) => catById.get(cid)?.name).filter(Boolean);
            return (
              <div
                key={g.id}
                className="reports-list-item"
                style={{ cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #F1F5F9', backgroundColor: '#fff' }}
                onClick={() => openModal(g)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Printer size={18} color="#0891B2" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {names.length === 0 ? 'No categories' : names.join(', ')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                  <button title="Edit group" onClick={(e) => { e.stopPropagation(); openModal(g); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: '#64748B', display: 'flex' }}>
                    <Pencil size={16} />
                  </button>
                  <button title="Delete group" onClick={(e) => { e.stopPropagation(); setDeleteTarget(g); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: '#EF4444', display: 'flex' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteGroup}
        title="Delete Printer Group"
        message={`Delete "${deleteTarget?.name || ''}"? Its categories will stop printing on order tickets until added to another group.`}
        confirmText="Delete Group"
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
          <div className="reports-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="reports-modal-header">
              <span className="reports-modal-title">{editing ? 'Edit Printer Group' : 'New Printer Group'}</span>
              <button className="reports-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="reports-modal-body">
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Group Name</label>
              <input style={fieldInput()} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Kitchen" autoFocus />

              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', margin: '14px 0 6px' }}>
                Categories ({formCats.length} selected)
              </label>
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                {categories.length === 0 && (
                  <div style={{ padding: 14, fontSize: 13, color: '#94A3B8' }}>No categories in this store yet.</div>
                )}
                {categories.map((c) => {
                  const cid = c.categoryId || c.id;
                  const owner = ownerOf.get(cid);
                  const takenElsewhere = owner && owner.id !== editing?.id;
                  return (
                    <label key={cid}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid #F1F5F9', fontSize: 13, cursor: takenElsewhere ? 'not-allowed' : 'pointer', opacity: takenElsewhere ? 0.5 : 1 }}>
                      <input type="checkbox" disabled={takenElsewhere} checked={formCats.includes(cid)} onChange={() => toggleCat(cid)} />
                      <span style={{ flex: 1 }}>{c.name}</span>
                      {takenElsewhere && <span style={{ fontSize: 11, color: '#94A3B8' }}>in {owner.name}</span>}
                    </label>
                  );
                })}
              </div>

              <button onClick={handleSaveGroup} disabled={saving || !formName.trim()}
                style={{ width: '100%', marginTop: 16, padding: 11, borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving || !formName.trim() ? 0.7 : 1 }}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
