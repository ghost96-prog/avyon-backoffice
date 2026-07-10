// src/pages/Inventory/StockTake.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Store, Plus, X, ClipboardCheck, Search, Check, ChevronLeft, FileText, Clock, User, MessageSquare, AlertTriangle, Trash2, Package } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatMoney } from '../utils/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/ReportsShared.css';

const STATUS_CONFIG = {
  draft: { label: 'In Progress', bg: '#FEF3C7', color: '#0891B2' },
  completed: { label: 'Completed', bg: '#DCFCE7', color: '#16A34A' },
};

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const Toast = ({ message, type, onClose }) => {
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

  return (
    <div style={{
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
    }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: style.text, fontSize: 18 }}>×</button>
    </div>
  );
};

// Confirmation modal for completing a stock take
const ConfirmCompleteModal = ({ itemCount, uncountedCount, onCancel, onConfirm, completing }) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  }}>
    <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 420, maxWidth: '90vw', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={18} color="#D97706" />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Complete Stock Take?</div>
      </div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 20 }}>
        This will reconcile stock levels for <strong>{itemCount} product{itemCount !== 1 ? 's' : ''}</strong>.
        {uncountedCount > 0 && (
          <> <strong style={{ color: '#EF4444' }}>{uncountedCount} item{uncountedCount !== 1 ? 's' : ''}</strong> haven't been counted and will be left unchanged.</>
        )}
        <br /><br />
        This action can't be undone. Do you want to proceed?
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={completing} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: completing ? 'not-allowed' : 'pointer' }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={completing} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#16A34A', color: '#fff', fontWeight: 700, cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.7 : 1 }}>
          {completing ? 'Completing...' : 'Yes, complete'}
        </button>
      </div>
    </div>
  </div>
);

export default function StockTake() {
  const { apiFetch, businessId, branches, activeStaff, userProfile, baseCurrency } = useAppContext();
  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';
  const staffName = activeStaff?.name || userProfile?.name || userProfile?.email?.split('@')[0] || 'Owner';

  const [toast, setToast] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'detail'
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stockTakes, setStockTakes] = useState([]);

  const [detailTake, setDetailTake] = useState(null);
  const [countedValues, setCountedValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);

  // Create flow state
  const [createStep, setCreateStep] = useState(1);
  const [createProducts, setCreateProducts] = useState([]);
  const [createCategories, setCreateCategories] = useState([]);
  const [selectAll, setSelectAll] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [createCategoryFilter, setCreateCategoryFilter] = useState('All');

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!selectedBranchId && branches?.length) setSelectedBranchId(branches[0].branchId);
  }, [branches, selectedBranchId]);

  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  const fetchStockTakes = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-takes`);
      setStockTakes(res?.data || []);
    } catch (e) {
      console.error('Fetch stock takes error:', e);
      setError('Failed to load stock takes');
      showToast('Failed to load stock takes', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => {
    if (view === 'list') fetchStockTakes();
  }, [fetchStockTakes, view]);

  const openDetail = (st) => {
    setDetailTake(st);
    const initial = {};
    st.items.forEach((i) => { 
      initial[i.productId] = i.countedQty !== null && i.countedQty !== undefined ? String(i.countedQty) : ''; 
    });
    setCountedValues(initial);
    setItemSearch('');
    setConfirmCompleteOpen(false);
    setView('detail');
  };

  const filteredDetailItems = useMemo(() => {
    if (!detailTake) return [];
    let items = detailTake.items;
    if (itemSearch.trim()) {
      const q = itemSearch.trim().toLowerCase();
      items = items.filter((i) => 
        i.productName?.toLowerCase().includes(q) || 
        i.sku?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [detailTake, itemSearch]);

  const handleSaveCounts = useCallback(async () => {
    if (!detailTake) return;
    setSaving(true);
    setError(null);
    try {
      const items = Object.entries(countedValues)
        .filter(([, v]) => v !== '')
        .map(([productId, v]) => ({ productId, countedQty: Number(v) }));
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-takes/${detailTake.stockTakeId}`, {
        method: 'PUT',
        body: JSON.stringify({ items, staffId }),
      });
      await fetchStockTakes();
      const refreshed = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-takes/${detailTake.stockTakeId}`);
      setDetailTake(refreshed);
      showToast('Counts saved successfully', 'success');
    } catch (e) {
      console.error('Save counts error:', e);
      setError(e.message || 'Failed to save counts');
      showToast(e.message || 'Failed to save counts', 'error');
    } finally {
      setSaving(false);
    }
  }, [apiFetch, businessId, selectedBranchId, detailTake, countedValues, staffId, fetchStockTakes]);

  const handleComplete = useCallback(async () => {
    if (!detailTake) return;
    const uncounted = detailTake.items.filter((i) => {
      const val = countedValues[i.productId];
      return val === '' || val === undefined || val === null;
    });
    
    if (uncounted.length > 0) {
      setConfirmCompleteOpen(true);
      return;
    }
    
    await doComplete();
  }, [detailTake, countedValues]);

  const doComplete = useCallback(async () => {
    if (!detailTake) return;
    
    setCompleting(true);
    setError(null);
    try {
      const items = Object.entries(countedValues)
        .filter(([, v]) => v !== '')
        .map(([productId, v]) => ({ productId, countedQty: Number(v) }));
      
      if (items.length > 0) {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-takes/${detailTake.stockTakeId}`, {
          method: 'PUT',
          body: JSON.stringify({ items, staffId }),
        });
      }
      
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-takes/${detailTake.stockTakeId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ staffId, staffName, posId: 'web-dashboard' }),
      });
      
      showToast('Stock take completed successfully!', 'success');
      setConfirmCompleteOpen(false);
      setView('list');
      await fetchStockTakes();
    } catch (e) {
      console.error('Complete stock take error:', e);
      setError(e.message || 'Failed to complete stock take');
      showToast(e.message || 'Failed to complete stock take', 'error');
    } finally {
      setCompleting(false);
    }
  }, [apiFetch, businessId, selectedBranchId, detailTake, countedValues, staffId, staffName, fetchStockTakes]);

  const handleExportPdf = useCallback(() => {
    if (!detailTake) return;
    const st = detailTake;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setTextColor('#0F172A');
    doc.text('Stock Take Report', pageWidth / 2, 16, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor('#64748B');
    doc.text(`${st.stockTakeNumber}`, pageWidth / 2, 23, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor('#0F172A');
    let y = 34;
    const line = (label, value) => { doc.setTextColor('#64748B'); doc.text(label, 14, y); doc.setTextColor('#0F172A'); doc.text(String(value ?? '—'), 60, y); y += 7; };
    const status = STATUS_CONFIG[st.status] || STATUS_CONFIG.draft;
    line('Status:', status.label);
    line('Started By:', st.startedByName);
    line('Started At:', fmtDateTime(st.createdAt));
    if (st.completedAt) line('Completed At:', fmtDateTime(st.completedAt));
    if (st.completedByName) line('Completed By:', st.completedByName);
    if (st.notes) line('Notes:', st.notes);

    const countedCount = st.items.filter((i) => i.countedQty !== null && i.countedQty !== undefined).length;
    line('Items Counted:', `${countedCount} / ${st.items.length}`);

    let totalVarianceCost = 0;
    let totalVarianceSell = 0;
    st.items.forEach((i) => {
      if (i.countedQty !== null && i.countedQty !== undefined) {
        const variance = i.countedQty - i.systemQty;
        const costPrice = i.costPrice || 0;
        const sellPrice = i.sellingPrice || 0;
        totalVarianceCost += variance * costPrice;
        totalVarianceSell += variance * sellPrice;
      }
    });

    doc.setTextColor('#0F172A');
    doc.setFontSize(11);
    doc.text(`Variance (Cost): ${formatMoney(totalVarianceCost, baseCurrency)}`, pageWidth - 14, y + 10, { align: 'right' });
    doc.text(`Variance (Sell): ${formatMoney(totalVarianceSell, baseCurrency)}`, pageWidth - 14, y + 17, { align: 'right' });

    autoTable(doc, {
      startY: y + 25,
      head: [['Product', 'SKU', 'System Qty', 'Counted Qty', 'Variance', 'Cost Price', 'Sell Price', 'Variance (Cost)', 'Variance (Sell)']],
      body: st.items.map((it) => {
        const counted = it.countedQty !== null && it.countedQty !== undefined ? it.countedQty : null;
        const variance = counted !== null ? counted - it.systemQty : null;
        const costPrice = it.costPrice || 0;
        const sellPrice = it.sellingPrice || 0;
        const varianceCost = variance !== null ? variance * costPrice : null;
        const varianceSell = variance !== null ? variance * sellPrice : null;
        
        return [
          it.productName,
          it.sku,
          String(it.systemQty),
          counted !== null ? String(counted) : '—',
          variance !== null ? String(variance) : '—',
          formatMoney(costPrice, baseCurrency),
          formatMoney(sellPrice, baseCurrency),
          varianceCost !== null ? formatMoney(varianceCost, baseCurrency) : '—',
          varianceSell !== null ? formatMoney(varianceSell, baseCurrency) : '—',
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: '#F1F5F9', textColor: '#0F172A', fontStyle: 'bold' },
    });

    const finalY = doc.lastAutoTable?.finalY || y + 30;
    doc.setFontSize(10);
    doc.setTextColor('#64748B');
    doc.text(`Generated on ${new Date().toLocaleString()}`, 14, finalY + 10);

    doc.save(`stock_take_${st.stockTakeNumber}.pdf`);
  }, [detailTake, baseCurrency]);

  // ── CREATE FLOW ────────────────────────────────────────────────────────────

  const openCreateFlow = () => {
    setCreateStep(1);
    setSelectAll(true);
    setSelectedProductIds(new Set());
    setCreateNotes('');
    setProductSearch('');
    setCreateCategoryFilter('All');
    setError(null);
    setView('create');
  };

  useEffect(() => {
    if (view !== 'create' || !businessId || !selectedBranchId) return;
    (async () => {
      try {
        const [prodRes, catRes] = await Promise.all([
          apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products?status=active`),
          apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`),
        ]);
        setCreateProducts(Array.isArray(prodRes) ? prodRes.filter((p) => p.trackInventory) : []);
        setCreateCategories(Array.isArray(catRes) ? catRes : []);
      } catch (e) {
        console.error('Load products for stock take error:', e);
        showToast('Failed to load products', 'error');
      }
    })();
  }, [view, businessId, selectedBranchId, apiFetch]);

  const filteredCreateProducts = useMemo(() => {
    let result = createProducts;
    if (createCategoryFilter !== 'All') {
      result = result.filter((p) => p.category === createCategoryFilter);
    }
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      result = result.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    return result;
  }, [createProducts, createCategoryFilter, productSearch]);

  const toggleProduct = (productId) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
    // If we're in "Count All Products" mode and user deselects a product, switch to "Select Specific"
    if (selectAll) {
      setSelectAll(false);
    }
  };

  const selectAllFiltered = () => {
    setSelectedProductIds(new Set(filteredCreateProducts.map((p) => p.productId)));
  };

  const deselectAll = () => {
    setSelectedProductIds(new Set());
  };

  // Remove a single product from the review list
  const removeProductFromReview = (productId) => {
    // If in "Count All Products" mode, switching to "Select Specific"
    if (selectAll) {
      setSelectAll(false);
      // Keep all products except the one being removed
      const allIds = new Set(createProducts.map(p => p.productId));
      allIds.delete(productId);
      setSelectedProductIds(allIds);
      showToast('Product removed. Switching to "Select Specific Products" mode.', 'info');
    } else {
      // Just remove from selected set
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      showToast('Product removed from stock take', 'info');
    }
  };

  const isStepComplete = (step) => {
    if (step === 1) {
      if (selectAll) return true;
      return selectedProductIds.size > 0;
    }
    return false;
  };

  const canGoToReview = isStepComplete(1);

  const handleCreateStockTake = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const productIds = selectAll ? undefined : Array.from(selectedProductIds);
      if (!selectAll && (!productIds || productIds.length === 0)) { 
        setError('Select at least one product, or choose "count all"'); 
        setCreating(false); 
        return; 
      }

      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-takes`, {
        method: 'POST',
        body: JSON.stringify({ productIds, notes: createNotes.trim() || null, staffId, staffName, posId: 'web-dashboard' }),
      });
      showToast('Stock take created successfully!', 'success');
      setView('list');
      await fetchStockTakes();
    } catch (e) {
      console.error('Create stock take error:', e);
      setError(e.message || 'Failed to create stock take');
      showToast(e.message || 'Failed to create stock take', 'error');
    } finally {
      setCreating(false);
    }
  }, [apiFetch, businessId, selectedBranchId, selectAll, selectedProductIds, createNotes, staffId, staffName, fetchStockTakes]);

  const detailTotals = useMemo(() => {
    if (!detailTake) return { totalVarianceCost: 0, totalVarianceSell: 0, totalSystemValue: 0, totalCountedValue: 0 };
    
    let totalVarianceCost = 0;
    let totalVarianceSell = 0;
    let totalSystemValue = 0;
    let totalCountedValue = 0;
    
    detailTake.items.forEach((it) => {
      const counted = it.countedQty !== null && it.countedQty !== undefined ? it.countedQty : null;
      const costPrice = it.costPrice || 0;
      const sellPrice = it.sellingPrice || 0;
      
      totalSystemValue += it.systemQty * costPrice;
      
      if (counted !== null) {
        totalCountedValue += counted * costPrice;
        const variance = counted - it.systemQty;
        totalVarianceCost += variance * costPrice;
        totalVarianceSell += variance * sellPrice;
      }
    });
    
    return { totalVarianceCost, totalVarianceSell, totalSystemValue, totalCountedValue };
  }, [detailTake]);

  // ── LIST VIEW ─────────────────────────────────────────────────────────────

  const renderList = () => (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      
      <div className="reports-header">
        <div className="reports-header-left">
          <div>
            <div className="reports-header-title">Stock Take</div>
            <div className="reports-header-sub">Physical counts and stock reconciliation</div>
          </div>
        </div>
        <div className="reports-header-right">
          <div style={{ position: 'relative' }}>
            <button className="reports-store-selector" onClick={() => setStorePopoverOpen((v) => !v)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            {storePopoverOpen && (
              <div className="reports-filter-popover" style={{ right: 0, left: 'auto', top: '110%' }}>
                {(branches || []).map((b) => (
                  <button key={b.branchId} className={`reports-filter-option ${selectedBranchId === b.branchId ? 'is-active' : ''}`}
                    onClick={() => { setSelectedBranchId(b.branchId); setStorePopoverOpen(false); }}>
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={openCreateFlow} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={15} /> New Stock Take
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div className="reports-list-card">
        {loading ? (
          <div className="reports-empty"><div className="reports-empty-title">Loading stock takes...</div></div>
        ) : stockTakes.length === 0 ? (
          <div className="reports-empty">
            <ClipboardCheck size={32} />
            <div className="reports-empty-title">No stock takes found</div>
            <div className="reports-empty-sub">Start a physical count to reconcile your inventory</div>
          </div>
        ) : (
          stockTakes.map((st) => {
            const status = STATUS_CONFIG[st.status] || STATUS_CONFIG.draft;
            const countedCount = st.items.filter((i) => i.countedQty !== null && i.countedQty !== undefined).length;
            const hasVariances = st.items.some((i) => {
              if (i.countedQty === null || i.countedQty === undefined) return false;
              return i.countedQty !== i.systemQty;
            });
            return (
              <div key={st.stockTakeId} className="reports-list-item" onClick={() => openDetail(st)}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: status.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <ClipboardCheck size={16} color={status.color} />
                </div>
                <div className="reports-list-item-info">
                  <div className="reports-list-item-title">
                    {st.stockTakeNumber}
                    {hasVariances && st.status === 'completed' && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FFFBEB', padding: '2px 6px', borderRadius: 4 }}>VARIANCES</span>
                    )}
                  </div>
                  <div className="reports-list-item-sub">
                    <span className="reports-list-item-badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                    <span>{countedCount} / {st.items.length} counted</span>
                    <span>{new Date(st.createdAt).toLocaleString()}</span>
                    <span>{st.startedByName}</span>
                  </div>
                </div>
                <div className="reports-list-item-right">
                  {st.status === 'completed' && (
                    <div style={{ fontSize: 11, color: '#64748B', textAlign: 'right' }}>
                      {st.completedAt && fmtDateTime(st.completedAt)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ── CREATE VIEW ───────────────────────────────────────────────────────────

  const renderCreate = () => {
    // Get the products to display in review
    const reviewProducts = selectAll 
      ? createProducts 
      : createProducts.filter(p => selectedProductIds.has(p.productId));

    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">New Stock Take</div>
              <div className="reports-header-sub">Step {createStep} of 2 — {selectedBranchName}</div>
            </div>
          </div>
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { n: 1, label: 'Select Products', disabled: false },
            { n: 2, label: `Review${reviewProducts.length > 0 ? ` (${reviewProducts.length})` : ''}`, disabled: !canGoToReview },
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div className="reports-list-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => setSelectAll(true)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${selectAll ? '#0891B2' : '#E2E8F0'}`, background: selectAll ? '#EFF6FF' : '#fff', color: selectAll ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Count All Products
                </button>
                <button onClick={() => setSelectAll(false)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${!selectAll ? '#0891B2' : '#E2E8F0'}`, background: !selectAll ? '#EFF6FF' : '#fff', color: !selectAll ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Select Specific Products
                </button>
              </div>

              {!selectAll && (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <div className="reports-search" style={{ flex: 1 }}>
                      <Search size={14} />
                      <input placeholder="Search by name or SKU" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
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
                    <span style={{ fontSize: 12, color: '#64748B', marginLeft: 'auto', alignSelf: 'center' }}>{selectedProductIds.size} selected</span>
                  </div>

                  <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                    {filteredCreateProducts.map((p) => (
                      <div key={p.productId} onClick={() => toggleProduct(p.productId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selectedProductIds.has(p.productId) ? '#EFF6FF' : '#fff' }}>
                        <input type="checkbox" checked={selectedProductIds.has(p.productId)} readOnly />
                        <div style={{ flex: 1, fontSize: 13 }}>{p.name} <span style={{ color: '#94A3B8', fontSize: 11 }}>{p.sku}</span></div>
                        <span style={{ fontSize: 11, color: '#64748B' }}>{p.currentStock ?? 0} in system</span>
                      </div>
                    ))}
                    {filteredCreateProducts.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>No products found</div>}
                  </div>
                </>
              )}

              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea style={{ ...fieldInput(), minHeight: 60 }} value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} placeholder="Optional" />
              </div>

              <button onClick={() => setCreateStep(2)} disabled={!canGoToReview}
                style={{ marginTop: 16, width: '100%', padding: '11px 24px', borderRadius: 8, border: 'none', background: canGoToReview ? '#0891B2' : '#CBD5E1', color: '#fff', fontWeight: 700, cursor: canGoToReview ? 'pointer' : 'not-allowed' }}>
                Next: Review
              </button>
            </div>
          </div>
        )}

        {createStep === 2 && (
          <div className="reports-list-card" style={{ padding: 20, maxWidth: 820 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Store</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{selectedBranchName}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Products</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                  {selectAll ? 'All Products' : `${reviewProducts.length} selected`}
                </div>
              </div>
            </div>
            {createNotes && <div style={{ marginBottom: 16, fontSize: 13 }}><strong>Notes:</strong> {createNotes}</div>}
            
            <div style={{ fontSize: 13, marginBottom: 12, color: '#64748B' }}>
              This will create a stock take with the following products. You'll be able to enter counted quantities after creation.
              {!selectAll && reviewProducts.length === 0 && (
                <span style={{ color: '#EF4444', display: 'block', marginTop: 4 }}>⚠️ No products selected. Please go back and select products.</span>
              )}
            </div>

            {reviewProducts.length > 0 && (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 18 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                        <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', width: 30 }}></th>
                        <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>SKU</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Current Stock</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Cost Price</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Sell Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewProducts.map((p) => (
                        <tr key={p.productId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          </td>
                          <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.name}</td>
                          <td style={{ padding: '8px 6px', color: '#94A3B8' }}>{p.sku}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#64748B' }}>{p.currentStock ?? 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatMoney(p.costPrice || 0, baseCurrency)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatMoney(p.sellingPrice || 0, baseCurrency)}</td>
                            <button 
                              onClick={() => removeProductFromReview(p.productId)}
                              style={{ 
                                border: 'none', 
                                background: 'none', 
                                cursor: 'pointer',
                                padding: 4,
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#EF4444',
                                hover: { background: '#FEF2F2' }
                              }}
                              title="Remove product from stock take"
                            >
                              <Trash2 size={16} />
                            </button>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectAll && (
                  <div style={{ 
                    fontSize: 12, 
                    color: '#64748B', 
                    background: '#F8FAFC', 
                    padding: '8px 12px', 
                    borderRadius: 6,
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span>💡 Remove a product by clicking the trash icon. This will switch to "Select Specific Products" mode.</span>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCreateStep(1)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 700, cursor: 'pointer' }}>Back</button>
              <button 
                onClick={handleCreateStockTake} 
                disabled={creating || reviewProducts.length === 0} 
                style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: (creating || reviewProducts.length === 0) ? '#CBD5E1' : '#0891B2', color: '#fff', fontWeight: 700, cursor: (creating || reviewProducts.length === 0) ? 'not-allowed' : 'pointer', opacity: (creating || reviewProducts.length === 0) ? 0.7 : 1 }}>
                {creating ? 'Creating...' : 'Start Stock Take'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── DETAIL VIEW ───────────────────────────────────────────────────────────

  const renderDetail = () => {
    if (!detailTake) return null;
    const st = detailTake;
    const status = STATUS_CONFIG[st.status] || STATUS_CONFIG.draft;

    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">{st.stockTakeNumber}</div>
              <div className="reports-header-sub">
                <span className="reports-list-item-badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
              </div>
            </div>
          </div>
          <div className="reports-header-right">
            <button onClick={handleExportPdf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <FileText size={14} /> Export PDF
            </button>
          </div>
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        {/* Overview */}
        <div className="reports-list-card" style={{ padding: 24, maxWidth: 700 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> Started By</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{st.startedByName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Started At</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{fmtDateTime(st.createdAt)}</div>
            </div>
            {st.completedAt && (
              <>
                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> Completed By</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{st.completedByName || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Completed At</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{fmtDateTime(st.completedAt)}</div>
                </div>
              </>
            )}
          </div>
          {st.notes && (
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}><MessageSquare size={11} /> Notes</div>
              <div style={{ fontSize: 13 }}>{st.notes}</div>
            </div>
          )}
        </div>

        {/* Items table */}
        <div className="reports-list-card" style={{ padding: 20, maxWidth: 820, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Items ({st.items.length})</h4>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              {st.items.filter(i => i.countedQty !== null && i.countedQty !== undefined).length} counted
            </div>
          </div>

          <input style={{ ...fieldInput(), marginBottom: 12 }} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items by name or SKU..." />

          {/* Totals bar */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: 12, 
            marginBottom: 12, 
            padding: '10px 14px', 
            background: '#F8FAFC', 
            borderRadius: 8,
            fontSize: 12
          }}>
            <div>
              <span style={{ color: '#64748B' }}>System Value:</span>{' '}
              <strong>{formatMoney(detailTotals.totalSystemValue, baseCurrency)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748B' }}>Counted Value:</span>{' '}
              <strong>{formatMoney(detailTotals.totalCountedValue, baseCurrency)}</strong>
            </div>
            <div style={{ color: detailTotals.totalVarianceCost !== 0 ? '#D97706' : '#16A34A' }}>
              <span style={{ color: '#64748B' }}>Variance (Cost):</span>{' '}
              <strong>{formatMoney(detailTotals.totalVarianceCost, baseCurrency)}</strong>
            </div>
            <div style={{ color: detailTotals.totalVarianceSell !== 0 ? '#D97706' : '#16A34A' }}>
              <span style={{ color: '#64748B' }}>Variance (Sell):</span>{' '}
              <strong>{formatMoney(detailTotals.totalVarianceSell, baseCurrency)}</strong>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'center' }}>System</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'center' }}>Counted</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'center' }}>Variance</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Cost Price</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Variance (Cost)</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Variance (Sell)</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetailItems.map((item) => {
                  const countedVal = countedValues[item.productId] ?? '';
                  const counted = countedVal !== '' ? Number(countedVal) : null;
                  const variance = counted !== null ? counted - item.systemQty : null;
                  const costPrice = item.costPrice || 0;
                  const sellPrice = item.sellingPrice || 0;
                  const varianceCost = variance !== null ? variance * costPrice : null;
                  const varianceSell = variance !== null ? variance * sellPrice : null;
                  const hasVariance = variance !== null && variance !== 0;
                  
                  return (
                    <tr key={item.productId} style={{ 
                      borderBottom: '1px solid #F1F5F9',
                      background: hasVariance && st.status === 'completed' ? '#FFFBEB' : 'transparent',
                    }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                        {item.productName}
                        <span style={{ color: '#94A3B8', fontSize: 10, display: 'block' }}>{item.sku}</span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', color: '#64748B' }}>{item.systemQty}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <input
                          type="number" 
                          min="0"
                          style={{ 
                            ...fieldInput(), 
                            padding: '4px 6px', 
                            width: 70,
                            textAlign: 'center',
                            background: st.status !== 'draft' ? '#F8FAFC' : '#fff',
                            borderColor: st.status !== 'draft' ? '#E2E8F0' : '#E2E8F0',
                          }}
                          value={countedVal}
                          onChange={(e) => setCountedValues((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                          disabled={st.status !== 'draft'}
                          placeholder="—"
                        />
                      </td>
                      <td style={{ 
                        padding: '8px 6px', 
                        textAlign: 'center', 
                        fontWeight: 700, 
                        color: variance === null ? '#CBD5E1' : variance === 0 ? '#16A34A' : variance > 0 ? '#16A34A' : '#EF4444' 
                      }}>
                        {variance === null ? '—' : (variance > 0 ? `+${variance}` : variance)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#64748B' }}>{formatMoney(costPrice, baseCurrency)}</td>
                      <td style={{ 
                        padding: '8px 6px', 
                        textAlign: 'right', 
                        fontWeight: 600,
                        color: varianceCost === null ? '#CBD5E1' : varianceCost === 0 ? '#64748B' : varianceCost > 0 ? '#16A34A' : '#EF4444'
                      }}>
                        {varianceCost !== null ? formatMoney(varianceCost, baseCurrency) : '—'}
                      </td>
                      <td style={{ 
                        padding: '8px 6px', 
                        textAlign: 'right', 
                        fontWeight: 600,
                        color: varianceSell === null ? '#CBD5E1' : varianceSell === 0 ? '#64748B' : varianceSell > 0 ? '#16A34A' : '#EF4444'
                      }}>
                        {varianceSell !== null ? formatMoney(varianceSell, baseCurrency) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {st.status === 'draft' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 12, borderTop: '1px solid #E2E8F0' }}>
              <button onClick={handleSaveCounts} disabled={saving}
                style={{ flex: 1, padding: 11, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Progress'}
              </button>
              <button onClick={handleComplete} disabled={completing}
                style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', background: '#16A34A', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: completing ? 0.7 : 1 }}>
                <Check size={15} /> {completing ? 'Completing...' : 'Complete & Reconcile'}
              </button>
            </div>
          )}
        </div>

        {/* Confirm Complete Modal */}
        {confirmCompleteOpen && detailTake && (
          <ConfirmCompleteModal
            itemCount={detailTake.items.length}
            uncountedCount={detailTake.items.filter((i) => {
              const val = countedValues[i.productId];
              return val === '' || val === undefined || val === null;
            }).length}
            onCancel={() => setConfirmCompleteOpen(false)}
            onConfirm={doComplete}
            completing={completing}
          />
        )}
      </div>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  if (view === 'create') return renderCreate();
  if (view === 'detail') return renderDetail();
  return renderList();
}