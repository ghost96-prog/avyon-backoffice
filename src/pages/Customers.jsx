// src/pages/Customers.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Store, Search, X, UserPlus, Users, Trash2, Edit2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { formatMoney } from '../utils/exportUtils';
import '../styles/ReportsShared.css';

function formatPurchaseDate(dateValue) {
  try {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${date.toLocaleTimeString()}`;
  } catch {
    return String(dateValue);
  }
}

const emptyForm = { name: '', email: '', phone: '', address: '', notes: '' };

export default function Customers() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, userProfile } = useAppContext();

  // ✅ Use the shared selected branch hook with "All Stores" option
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailBranchId, setDetailBranchId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createBranchId, setCreateBranchId] = useState('');
  const [saving, setSaving] = useState(false);

  const staffId = userProfile?.uid || 'dashboard';

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  function parsePurchases(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  const fetchCustomers = useCallback(async () => {
    if (!businessId || !branches) return;
    setLoading(true);
    setError(null);
    try {
      const targetBranches = selectedBranchId === 'all' ? branches : branches.filter((b) => b.branchId === selectedBranchId);
      let all = [];
      await Promise.all(targetBranches.map(async (branch) => {
        try {
          const res = await apiFetch(`/business/${businessId}/branches/${branch.branchId}/customers`);
          const list = Array.isArray(res.data || res) ? (res.data || res) : [];
          all.push(...list.filter((c) => !c.isDeleted).map((c) => ({
            ...c,
            store: branch.name,
            branchId: branch.branchId,
            previousPurchases: parsePurchases(c.previousPurchases),
          })));
        } catch (e) { /* ignore */ }
      }));
      all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setCustomers(all);
    } catch (e) {
      console.error('Fetch customers error:', e);
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [businessId, branches, apiFetch, selectedBranchId]);

  useEffect(() => { if (businessId && branches) fetchCustomers(); }, [businessId, branches, selectedBranchId, fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.customerCode?.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const openDetail = (customer) => {
    setDetailCustomer({ ...customer, previousPurchases: parsePurchases(customer.previousPurchases) });
    setDetailBranchId(customer.branchId);
    setEditForm({ name: customer.name || '', email: customer.email || '', phone: customer.phone || '', address: customer.address || '', notes: customer.notes || '' });
    setIsEditing(false);
  };

  const closeDetail = () => { setDetailCustomer(null); setIsEditing(false); };

  const handleSaveEdit = useCallback(async () => {
    if (!editForm.name.trim() || !detailCustomer) return;
    setSaving(true);
    try {
      await apiFetch(`/business/${businessId}/branches/${detailBranchId}/customers/${detailCustomer.customerId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editForm, staffId }),
      });
      await fetchCustomers();
      setIsEditing(false);
      closeDetail();
    } catch (e) {
      console.error('Update customer error:', e);
      setError('Failed to update customer');
    } finally {
      setSaving(false);
    }
  }, [apiFetch, businessId, detailBranchId, detailCustomer, editForm, staffId, fetchCustomers]);

  const handleDelete = useCallback(async (customer) => {
    if (!window.confirm(`Delete "${customer.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${customer.branchId}/customers/${customer.customerId}`, {
        method: 'DELETE',
        body: JSON.stringify({ staffId }),
      });
      await fetchCustomers();
      if (detailCustomer?.customerId === customer.customerId) closeDetail();
    } catch (e) {
      console.error('Delete customer error:', e);
      setError('Failed to delete customer');
    }
  }, [apiFetch, businessId, staffId, fetchCustomers, detailCustomer]);

  const openCreateModal = () => {
    const defaultBranch = selectedBranchId !== 'all' ? selectedBranchId : (branches?.[0]?.branchId || '');
    setCreateBranchId(defaultBranch);
    setCreateForm(emptyForm);
    setCreateModalOpen(true);
  };

  const handleCreateCustomer = useCallback(async () => {
    if (!createForm.name.trim() || !createBranchId) return;
    setSaving(true);
    try {
      await apiFetch(`/business/${businessId}/branches/${createBranchId}/customers`, {
        method: 'POST',
        body: JSON.stringify({ ...createForm, posId: 'web-dashboard', staffId }),
      });
      setCreateModalOpen(false);
      await fetchCustomers();
    } catch (e) {
      console.error('Create customer error:', e);
      setError('Failed to create customer');
    } finally {
      setSaving(false);
    }
  }, [apiFetch, businessId, createBranchId, createForm, staffId, fetchCustomers]);

  if (loading) {
    return (
      <div className="reports-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#8b97a7' }}>Loading customers...</div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">Customers</div>
            <div className="reports-header-sub">Manage your customer database</div>
          </div>
        </div>
        <div className="reports-header-right">
          <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
            <Store size={14} /> <span>{selectedBranchName}</span>
          </button>
          <button
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <UserPlus size={15} /> New Customer
          </button>
        </div>
      </div>

      <div className="reports-toolbar" style={{ marginTop: 16 }}>
        <div className="reports-search">
          <Search size={14} />
          <input placeholder="Search by name, email, phone or code" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
        </div>
      </div>

      <div className="reports-list-card">
        {error ? (
          <div className="reports-empty">
            <div className="reports-empty-title">{error}</div>
            <button onClick={() => { setError(null); fetchCustomers(); }} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Retry</button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="reports-empty">
            <Users size={32} />
            <div className="reports-empty-title">No customers found</div>
            <div className="reports-empty-sub">Try a different search or add your first customer</div>
          </div>
        ) : (
          filteredCustomers.map((c) => (
            <div key={c.customerId} className="reports-list-item" onClick={() => openDetail(c)}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, fontWeight: 800, color: '#0891B2' }}>
                {c.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="reports-list-item-info">
                <div className="reports-list-item-title">{c.name}</div>
                <div className="reports-list-item-sub">
                  <span>{c.store}</span>
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.customerCode && <span>{c.customerCode}</span>}
                </div>
              </div>
              <div className="reports-list-item-right">
                <div className="reports-list-item-amount">{formatMoney(c.totalSpent || 0, baseCurrency)}</div>
                <div style={{ fontSize: 11, color: '#8b97a7' }}>{c.visits || 0} visits</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 8, marginLeft: 4 }}>
                <Trash2 size={16} color="#EF4444" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Store picker */}
      {storeModalOpen && (
        <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
          <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
            <div className="reports-modal-header">
              <span className="reports-modal-title">Select Store</span>
              <button className="reports-modal-close" onClick={() => setStoreModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="reports-modal-body" style={{ padding: '8px 4px' }}>
              {branchOptions.map((opt) => (
                <button key={opt.value} className={`reports-filter-option ${selectedBranchId === opt.value ? 'is-active' : ''}`}
                  onClick={() => { setSelectedBranchId(opt.value); setStoreModalOpen(false); }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Customer detail modal */}
      {detailCustomer && (
        <div className="reports-modal-overlay" onClick={closeDetail}>
          <div className="reports-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="reports-modal-header">
              <span className="reports-modal-title">Customer Details</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={() => setIsEditing((v) => !v)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Edit2 size={16} color="#0891B2" /></button>
                <button onClick={() => handleDelete(detailCustomer)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Trash2 size={16} color="#EF4444" /></button>
                <button className="reports-modal-close" onClick={closeDetail}><X size={18} /></button>
              </div>
            </div>
            <div className="reports-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {!isEditing ? (
                <>
                  <div className="reports-modal-row"><span className="reports-modal-row-label">Customer Code</span><span>{detailCustomer.customerCode || '—'}</span></div>
                  <div className="reports-modal-row"><span className="reports-modal-row-label">Name</span><span>{detailCustomer.name}</span></div>
                  <div className="reports-modal-row"><span className="reports-modal-row-label">Email</span><span>{detailCustomer.email || '—'}</span></div>
                  <div className="reports-modal-row"><span className="reports-modal-row-label">Phone</span><span>{detailCustomer.phone || '—'}</span></div>
                  <div className="reports-modal-row"><span className="reports-modal-row-label">Address</span><span>{detailCustomer.address || '—'}</span></div>

                  <hr className="reports-modal-divider" />
                  <div className="reports-modal-section-title">Notes / Comments</div>
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 8 }}>{detailCustomer.notes || 'No notes'}</div>

                  <hr className="reports-modal-divider" />
                  <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                    <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0891B2' }}>{detailCustomer.visits || 0}</div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Visits</div>
                    </div>
                    <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0891B2' }}>{formatMoney(detailCustomer.totalSpent || 0, baseCurrency)}</div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Total Spent</div>
                    </div>
                  </div>

                  <hr className="reports-modal-divider" />
                  <div className="reports-modal-section-title">Previous Purchases</div>
                  {(() => {
                    const purchases = parsePurchases(detailCustomer.previousPurchases);
                    if (purchases.length === 0) {
                      return <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 12 }}>No previous purchases</div>;
                    }
                    return purchases.map((p, i) => (
                      <div key={p.id || i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
                          <span>{formatPurchaseDate(p.date)}</span>
                          <span style={{ color: '#16A34A', fontWeight: 700 }}>{p.currencySymbol || '$'}{Number(p.total || 0).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                          <span>{p.items} item{p.items !== 1 ? 's' : ''}</span>
                          {p.receiptNumber && <span>Receipt: {p.receiptNumber}</span>}
                        </div>
                      </div>
                    ));
                  })()}
                </>
              ) : (
                <>
                  {['name', 'email', 'phone', 'address', 'notes'].map((field) => (
                    <div key={field} style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4, textTransform: 'capitalize' }}>
                        {field === 'name' ? 'Name *' : field}
                      </label>
                      <input
                        value={editForm[field]}
                        onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setIsEditing(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSaveEdit} disabled={saving || !editForm.name.trim()} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create customer modal */}
      {createModalOpen && (
        <div className="reports-modal-overlay" onClick={() => setCreateModalOpen(false)}>
          <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="reports-modal-header">
              <span className="reports-modal-title">New Customer</span>
              <button className="reports-modal-close" onClick={() => setCreateModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="reports-modal-body">
              <label style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>Store *</label>
              <select value={createBranchId} onChange={(e) => setCreateBranchId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }}>
                {(branches || []).map((b) => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
              </select>
              {['name', 'email', 'phone', 'address', 'notes'].map((field) => (
                <div key={field} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4, textTransform: 'capitalize' }}>
                    {field === 'name' ? 'Full Name *' : field}
                  </label>
                  <input
                    value={createForm[field]}
                    onChange={(e) => setCreateForm({ ...createForm, [field]: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <button
                onClick={handleCreateCustomer}
                disabled={saving || !createForm.name.trim() || !createBranchId}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}