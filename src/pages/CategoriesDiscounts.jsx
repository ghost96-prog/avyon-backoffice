// src/pages/Inventory/CategoriesDiscounts.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Store, Plus, X, Tag, Percent, Trash2, Search,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import '../styles/ReportsShared.css';

const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'fixed', label: 'Fixed Amount' },
];

// ─── Loading Bar Component ──────────────────────────────────────────────
function LoadingBar({ visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      zIndex: 9999,
      background: '#E2E8F0',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: '100%',
        background: 'linear-gradient(90deg, #234C6A 0%, #3B82F6 50%, #234C6A 100%)',
        animation: 'loadingBar 1.5s ease-in-out infinite',
        transformOrigin: '0% 50%',
      }} />
      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-100%) scaleX(0.3); }
          50% { transform: translateX(0%) scaleX(0.8); }
          100% { transform: translateX(100%) scaleX(0.3); }
        }
        @media (max-width: 768px) {
          .categories-container { padding: 0 8px; }
          .categories-header { flex-direction: column; align-items: stretch; gap: 12px; }
          .categories-header-left { flex-wrap: wrap; }
          .categories-header-right { flex-wrap: wrap; justify-content: flex-start; }
          .categories-toolbar { flex-wrap: wrap; gap: 8px; }
          .categories-search { flex: 1; min-width: 140px; }
          .category-item { padding: 12px; }
          .category-item-name { font-size: 14px; }
          .category-item-count { font-size: 12px; }
        }
        @media (max-width: 480px) {
          .category-item { padding: 10px; }
          .category-item-icon { width: 36px; height: 36px; }
          .category-item-actions { gap: 8px; }
        }
      `}</style>
    </div>
  );
}

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

export default function CategoriesDiscounts() {
  const { apiFetch, businessId, branches, baseCurrency, activeStaff, userProfile } = useAppContext();
  
  // ✅ Use the shared selected branch hook
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch();
  
  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';

  const [activeTab, setActiveTab] = useState('categories');
  const [storeModalOpen, setStoreModalOpen] = useState(false);

  const [categories, setCategories] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  const [discModalOpen, setDiscModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [discForm, setDiscForm] = useState({ name: '', type: 'percentage', value: '', active: true });
  const [discSaving, setDiscSaving] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteType, setDeleteType] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  // ── Fetch categories with product counts ──────────────────────────────
const fetchData = useCallback(async () => {
  if (!businessId || !selectedBranchId) return;
  setLoading(true);
  setError(null);
  try {
    const [catRes, discRes] = await Promise.all([
      apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`),
      apiFetch(`/business/${businessId}/branches/${selectedBranchId}/discounts`),
    ]);

    // Each category now arrives with productCount already computed by
    // the backend — no separate product fetch or client-side counting.
    setCategories(Array.isArray(catRes) ? catRes : []);
    setDiscounts(Array.isArray(discRes) ? discRes : []);
  } catch (e) {
    console.error('Fetch categories/discounts error:', e);
    setError('Failed to load data');
  } finally {
    setLoading(false);
  }
}, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.trim().toLowerCase();
    return categories.filter((c) => c.name?.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  const filteredDiscounts = useMemo(() => {
    if (!searchQuery.trim()) return discounts;
    const q = searchQuery.trim().toLowerCase();
    return discounts.filter((d) => d.name?.toLowerCase().includes(q));
  }, [discounts, searchQuery]);

  // ── Category handlers ──────────────────────────────────────────────────
  const openCategoryModal = (cat = null) => {
    setEditingCategory(cat);
    setCatName(cat?.name || '');
    setCatModalOpen(true);
  };

  const handleSaveCategory = useCallback(async () => {
    if (!catName.trim()) return;
    setCatSaving(true);
    setError(null);
    try {
      if (editingCategory) {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories/${editingCategory.categoryId}`, {
          method: 'PUT',
          body: JSON.stringify({ staffId, name: catName.trim() }),
        });
      } else {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`, {
          method: 'POST',
          body: JSON.stringify({ posId: 'web-dashboard', staffId, name: catName.trim() }),
        });
      }
      setCatModalOpen(false);
      await fetchData();
    } catch (e) {
      console.error('Save category error:', e);
      setError(e.message || 'Failed to save category');
    } finally {
      setCatSaving(false);
    }
  }, [apiFetch, businessId, selectedBranchId, staffId, catName, editingCategory, fetchData]);

  const openDeleteModal = useCallback((item, type) => {
    setDeleteItem(item);
    setDeleteType(type);
    setDeleteModalOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
      if (deleteType === 'category') {
        await apiFetch(
          `/business/${businessId}/branches/${selectedBranchId}/categories/${deleteItem.categoryId}?staffId=${encodeURIComponent(staffId)}&posId=web-dashboard`,
          { method: 'DELETE' }
        );
      } else {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/discounts/${deleteItem.discountId}`, {
          method: 'DELETE',
          body: JSON.stringify({ staffId }),
        });
      }
      setDeleteModalOpen(false);
      await fetchData();
    } catch (e) {
      console.error('Delete error:', e);
      setError(e.message || 'Failed to delete');
    } finally {
      setIsDeleting(false);
      setDeleteItem(null);
    }
  }, [apiFetch, businessId, selectedBranchId, staffId, deleteItem, deleteType, fetchData]);

  // ── Discount handlers ──────────────────────────────────────────────────
  const openDiscountModal = (disc = null) => {
    setEditingDiscount(disc);
    setDiscForm({
      name: disc?.name || '',
      type: disc?.type || 'percentage',
      value: disc ? String(disc.value) : '',
      active: disc?.active !== false,
    });
    setDiscModalOpen(true);
  };

  const handleSaveDiscount = useCallback(async () => {
    if (!discForm.name.trim()) { setError('Discount name is required'); return; }
    const numValue = parseFloat(discForm.value);
    if (isNaN(numValue) || numValue < 0) { setError('Enter a valid value'); return; }
    if (discForm.type === 'percentage' && numValue > 100) { setError('Percentage must be between 0 and 100'); return; }

    setDiscSaving(true);
    setError(null);
    try {
      if (editingDiscount) {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/discounts/${editingDiscount.discountId}`, {
          method: 'PUT',
          body: JSON.stringify({
            staffId,
            name: discForm.name.trim(),
            type: discForm.type,
            value: numValue,
            active: discForm.active,
          }),
        });
      } else {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/discounts`, {
          method: 'POST',
          body: JSON.stringify({
            posId: 'web-dashboard',
            staffId,
            name: discForm.name.trim(),
            type: discForm.type,
            value: numValue,
            active: discForm.active,
            currency: baseCurrency?.code || 'USD',
            currencySymbol: baseCurrency?.symbol || '$',
          }),
        });
      }
      setDiscModalOpen(false);
      await fetchData();
    } catch (e) {
      console.error('Save discount error:', e);
      setError(e.message || 'Failed to save discount');
    } finally {
      setDiscSaving(false);
    }
  }, [apiFetch, businessId, selectedBranchId, staffId, discForm, editingDiscount, baseCurrency, fetchData]);

  const handleToggleDiscountActive = useCallback(async (disc, e) => {
    if (e) e.stopPropagation();
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/discounts/${disc.discountId}`, {
        method: 'PUT',
        body: JSON.stringify({ staffId, active: !disc.active }),
      });
      await fetchData();
    } catch (e) {
      console.error('Toggle discount error:', e);
      setError(e.message || 'Failed to update discount');
    }
  }, [apiFetch, businessId, selectedBranchId, staffId, fetchData]);

  const handleItemClick = useCallback((item, type) => {
    if (type === 'category') {
      openCategoryModal(item);
    } else {
      openDiscountModal(item);
    }
  }, []);

  // ─── Show loading bar ──────────────────────────────────────────────────
const showLoadingBar = loading || catSaving || discSaving || isDeleting;
  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page categories-container">
        <div className="reports-header categories-header">
          <div className="reports-header-left categories-header-left">
            <div>
              <div className="reports-header-title">Categories & Discounts</div>
              <div className="reports-header-sub">Organize products and manage promotional discounts</div>
            </div>
          </div>
          <div className="reports-header-right categories-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            {activeTab === 'categories' ? (
              <button onClick={() => openCategoryModal()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <Plus size={15} /> New Category
              </button>
            ) : (
              <button onClick={() => openDiscountModal()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <Plus size={15} /> New Discount
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('categories')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: `1px solid ${activeTab === 'categories' ? '#0891B2' : '#E2E8F0'}`, background: activeTab === 'categories' ? '#EFF6FF' : '#fff', color: activeTab === 'categories' ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Tag size={14} /> Categories ({categories.length})
          </button>
          <button onClick={() => setActiveTab('discounts')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: `1px solid ${activeTab === 'discounts' ? '#0891B2' : '#E2E8F0'}`, background: activeTab === 'discounts' ? '#EFF6FF' : '#fff', color: activeTab === 'discounts' ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Percent size={14} /> Discounts ({discounts.length})
          </button>
        </div>

        <div className="reports-toolbar categories-toolbar">
          <div className="reports-search categories-search">
            <Search size={14} />
            <input placeholder={`Search ${activeTab}`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
          </div>
        </div>

        <div className="reports-list-card">
          {activeTab === 'categories' ? (
            filteredCategories.length === 0 ? (
              <div className="reports-empty">
                <Tag size={32} />
                <div className="reports-empty-title">No categories found</div>
                <div className="reports-empty-sub">Create your first category to organize products</div>
              </div>
            ) : (
      filteredCategories.map((c) => {
  const count = c.productCount || 0;
  const isNoCategory = c.name === 'No Category';
                return (
                  <div 
                    key={c.categoryId || c.id} 
                    className="reports-list-item category-item"
                    style={{ 
                      cursor: 'pointer',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: '#fff',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    onClick={() => handleItemClick(c, 'category')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      {/* Category Icon - first letter */}
                      <div 
                        className="category-item-icon"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: '#EFF6FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: '#BFDBFE',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ 
                          fontSize: 16, 
                          fontWeight: '700', 
                          color: '#0891B2',
                          textTransform: 'uppercase',
                        }}>
                          {c.name.charAt(0)}
                        </span>
                      </div>
                      
                      {/* Category Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div 
                          className="category-item-name"
                          style={{ 
                            fontSize: 14, 
                            fontWeight: '600', 
                            color: '#0F172A',
                            marginBottom: 2,
                          }}
                        >
                          {c.name}
                        </div>
                      <div 
  className="category-item-count"
  style={{ 
    fontSize: 12, 
    color: '#94A3B8',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }}
>
  <span>{count}</span>
  <span>product{count !== 1 ? 's' : ''}</span>
  {isNoCategory && (
    <span style={{ 
      fontSize: 10, 
      color: '#94A3B8', 
      background: '#F1F5F9', 
      padding: '1px 8px', 
      borderRadius: 4,
      marginLeft: 4,
    }}>
      Default
    </span>
  )}
</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div 
                      className="category-item-actions"
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 12,
                        flexShrink: 0,
                      }}
                    >
                      {!isNoCategory && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleItemClick(c, 'category'); }}
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              padding: 4,
                              color: '#64748B',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Edit category"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openDeleteModal(c, 'category'); }} 
                            style={{ 
                              border: 'none', 
                              background: 'none', 
                              cursor: 'pointer', 
                              padding: 4,
                              color: '#EF4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Delete category"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            filteredDiscounts.length === 0 ? (
              <div className="reports-empty">
                <Percent size={32} />
                <div className="reports-empty-title">No discounts found</div>
                <div className="reports-empty-sub">Create a discount to offer at checkout</div>
              </div>
            ) : (
              filteredDiscounts.map((d) => (
                <div 
                  key={d.discountId} 
                  className="reports-list-item" 
                  style={{ 
                    cursor: 'pointer',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #F1F5F9',
                    backgroundColor: d.active ? '#fff' : '#F8FAFC',
                    opacity: d.active ? 1 : 0.6,
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = d.active ? '#F8FAFC' : '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = d.active ? '#fff' : '#F8FAFC'}
                  onClick={() => handleItemClick(d, 'discount')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      width: 40, 
                      height: 40, 
                      borderRadius: 20, 
                      background: d.active ? '#DCFCE7' : '#F1F5F9',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Percent size={16} color={d.active ? '#16A34A' : '#94A3B8'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: 14, 
                        fontWeight: '600', 
                        color: d.active ? '#0F172A' : '#94A3B8',
                        marginBottom: 2,
                      }}>
                        {d.name}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8,
                        flexWrap: 'wrap',
                      }}>
                        <span style={{ 
                          fontSize: 11,
                          color: d.active ? '#64748B' : '#94A3B8',
                        }}>
                          {d.type === 'percentage' ? `${d.value}% off` : `${d.currencySymbol || '$'}${Number(d.value).toFixed(2)} off`}
                        </span>
                        <span className="reports-list-item-badge" style={{ 
                          background: d.active ? '#DCFCE7' : '#F1F5F9', 
                          color: d.active ? '#16A34A' : '#94A3B8',
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}>
                          {d.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button 
                      onClick={(e) => handleToggleDiscountActive(d, e)} 
                      style={{ 
                        fontSize: 11, 
                        fontWeight: 600, 
                        padding: '4px 10px', 
                        borderRadius: 6, 
                        border: '1px solid #E2E8F0', 
                        background: '#fff', 
                        cursor: 'pointer', 
                        color: '#64748B',
                      }}
                    >
                      {d.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); openDeleteModal(d, 'discount'); }} 
                      style={{ 
                        border: 'none', 
                        background: 'none', 
                        cursor: 'pointer', 
                        padding: 4,
                        color: '#EF4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <ConfirmDeleteModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title={`Delete ${deleteType === 'category' ? 'Category' : 'Discount'}`}
          message={`Are you sure you want to delete "${deleteItem?.name || ''}"? ${deleteType === 'category' ? 'Products using this category will show as "No Category".' : 'This action cannot be undone.'}`}
          confirmText={`Delete ${deleteType === 'category' ? 'Category' : 'Discount'}`}
          isDeleting={isDeleting}
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
                  <button key={b.branchId} className={`reports-filter-option ${selectedBranchId === b.branchId ? 'is-active' : ''}`}
                    onClick={() => { setSelectedBranchId(b.branchId); setStoreModalOpen(false); }}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {catModalOpen && (
          <div className="reports-modal-overlay" onClick={() => setCatModalOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">{editingCategory ? 'Edit Category' : 'New Category'}</span>
                <button className="reports-modal-close" onClick={() => setCatModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body">
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Category Name</label>
                <input style={fieldInput()} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Beverages" autoFocus />
                <button onClick={handleSaveCategory} disabled={catSaving || !catName.trim()}
                  style={{ width: '100%', marginTop: 14, padding: 11, borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: catSaving ? 0.7 : 1 }}>
                  {catSaving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </div>
          </div>
        )}

        {discModalOpen && (
          <div className="reports-modal-overlay" onClick={() => setDiscModalOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">{editingDiscount ? 'Edit Discount' : 'New Discount'}</span>
                <button className="reports-modal-close" onClick={() => setDiscModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body">
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Discount Name</label>
                <input style={fieldInput()} value={discForm.name} onChange={(e) => setDiscForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Staff Discount" autoFocus />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Type</label>
                    <select style={fieldInput()} value={discForm.type} onChange={(e) => setDiscForm((f) => ({ ...f, type: e.target.value }))}>
                      {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                      Value {discForm.type === 'percentage' ? '(%)' : `(${baseCurrency?.symbol || '$'})`}
                    </label>
                    <input type="number" step="0.01" min="0" max={discForm.type === 'percentage' ? 100 : undefined}
                      style={fieldInput()} value={discForm.value} onChange={(e) => setDiscForm((f) => ({ ...f, value: e.target.value }))} />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={discForm.active} onChange={(e) => setDiscForm((f) => ({ ...f, active: e.target.checked }))} />
                  Active (available for use at checkout)
                </label>

                <button onClick={handleSaveDiscount} disabled={discSaving || !discForm.name.trim()}
                  style={{ width: '100%', marginTop: 16, padding: 11, borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: discSaving ? 0.7 : 1 }}>
                  {discSaving ? 'Saving...' : editingDiscount ? 'Save Changes' : 'Create Discount'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}