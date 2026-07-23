// src/pages/Inventory/GRV.jsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Store, Plus, X, FileInput, Package, Trash2, Check, ChevronLeft,
  Search, FileText, Clock, User, MessageSquare, Truck, AlertTriangle, Sparkles,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatMoney } from '../utils/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/ReportsShared.css';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';
import { getModuleInfo } from '../utils/moduleCatalog';

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
async function generateNextSKU(apiFetch, businessId, branchId) {
  try {
    const res = await apiFetch(`/business/${businessId}/branches/${branchId}/products/next-sku`);
    return res.sku;
  } catch (error) {
    console.error('Error generating SKU:', error);
    return String(Date.now()).slice(-6);
  }
}

// ─── EXACT Android formatPriceInput ──────────────────────────────────
const formatPriceInput = (text) => {
  if (!text || text === '') return '0.00';
  const numericOnly = text.replace(/[^0-9]/g, '');
  if (!numericOnly) return '0.00';
  const cents = parseInt(numericOnly, 10);
  const dollars = Math.floor(cents / 100);
  const remainingCents = cents % 100;
  return `${dollars}.${remainingCents.toString().padStart(2, '0')}`;
};

function getCurrentStock(product) {
  return Number(product?.currentStock ?? product?.stock ?? product?.quantityOnHand ?? product?.qty ?? 0);
}

function getSellingPrice(product) {
  return Number(product?.sellingPrice ?? product?.price ?? 0);
}

function getItemStockBefore(it) {
  const v = it.stockBefore ?? it.previousStock ?? it.stockBeforeReceipt ?? it.openingStock;
  return v != null ? Number(v) : null;
}

function getItemStockAfter(it) {
  const v = it.stockAfter ?? it.newStock ?? it.stockAfterReceipt ?? it.closingStock;
  if (v != null) return Number(v);
  const before = getItemStockBefore(it);
  return before != null ? before + Number(it.quantityReceived || 0) : null;
}

function getItemSellingPriceAfter(it) {
  const v = it.sellingPrice ?? it.newSellingPrice ?? it.sellingPriceAfter;
  return v != null ? Number(v) : null;
}

function itemName(item) {
  return item.isNewProduct ? (item.newProduct?.name || '(unnamed)') : (item.product?.name || '');
}
function itemSku(item) {
  return item.isNewProduct ? (item.newProduct?.sku || '') : (item.product?.sku || '');
}
function itemCurrentStock(item) {
  return item.isNewProduct ? 0 : getCurrentStock(item.product);
}
function itemKeyOf(item) {
  return item.itemKey;
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

// ✅ NEW — thin inline progress bar for background product loading.
// Mirrors the same estimated-fill behavior used on the Products.jsx
// screen: percent grows (log-scaled) with loadedCount while loading is
// true, snaps to 100%/green on completion, then fades out shortly after.
const InlineLoadProgress = ({ loading, loadedCount }) => {
  const [percent, setPercent] = useState(0);
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      const estimated = loadedCount === 0
        ? 8
        : Math.min(92, 15 + Math.log2(loadedCount + 1) * 11);
      setPercent(estimated);
    } else if (visible) {
      setPercent(100);
      hideTimeoutRef.current = setTimeout(() => setVisible(false), 500);
    }
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadedCount]);

  if (!visible) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 170 }}>
      <div style={{ width: 70, height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 3,
          background: percent >= 100 ? '#16A34A' : 'linear-gradient(90deg, #234C6A 0%, #3B82F6 100%)',
          transition: 'width 0.35s ease, background 0.25s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>
        {percent >= 100 ? 'Loaded' : `Loading products… (${loadedCount})`}
      </span>
    </div>
  );
};

const ConfirmModal = ({ itemCount, newItemCount, onCancel, onConfirm, submitting }) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  }}>
    <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 420, maxWidth: '90vw', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={18} color="#D97706" />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Confirm stock update</div>
      </div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 20 }}>
        This will update stock levels for <strong>{itemCount} product{itemCount !== 1 ? 's' : ''}</strong>
        {newItemCount > 0 && <> ({newItemCount} of which {newItemCount !== 1 ? 'are' : 'is'} brand new and will be added to your catalog)</>}.
        This action can't be undone. Do you want to proceed?
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={submitting} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={submitting} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Saving...' : 'Yes, update stock'}
        </button>
      </div>
    </div>
  </div>
);

const emptyNewItemDraft = {
  name: '', sku: '', category: 'No Category', categoryId: 'no-category',
  unit: 'each', itemsPerUnit: '', barcode: '', description: '', lowStockThreshold: '0',
  sellingPrice: '0.00', costPrice: '0.00',
};

const NewItemModal = ({ draft, setDraft, categories, baseCurrency, onCancel, onAdd }) => {
  const canAdd = draft.name.trim().length > 0 && draft.sku.trim().length > 0;
  const currencySymbol = baseCurrency?.symbol || '$';

  return (
    <div className="reports-modal-overlay" onClick={onCancel}>
      <div className="reports-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="reports-modal-header">
          <span className="reports-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={16} color="#0891B2" /> New Item
          </span>
          <button className="reports-modal-close" onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="reports-modal-body">
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
            Not in your catalog yet? Add it here — it'll be created as a new product and stocked with the quantity you received.
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Product Name *</label>
            <input style={fieldInput()} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Sparkling Water 500ml" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>SKU *</label>
              <input style={fieldInput()} value={draft.sku} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} placeholder="Auto-generated" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Barcode</label>
              <input style={fieldInput()} value={draft.barcode} onChange={(e) => setDraft((d) => ({ ...d, barcode: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Category</label>
              <select
                style={fieldInput()}
                value={draft.categoryId}
                onChange={(e) => {
                  const cat = categories.find((c) => c.categoryId === e.target.value);
                  setDraft((d) => ({ ...d, categoryId: e.target.value, category: cat?.name || 'No Category' }));
                }}
              >
                <option value="no-category">No Category</option>
                {categories.filter((c) => c.categoryId !== 'no-category').map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Unit</label>
              <select style={fieldInput()} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}>
                <option value="each">Each</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="meter">Meter (m)</option>
                <option value="box">Box</option>
                <option value="pack">Pack</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Selling Price *</label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                <span style={{ padding: '8px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 40, textAlign: 'center' }}>
                  {currencySymbol}
                </span>
                <input 
                  style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} 
                  value={draft.sellingPrice} 
                  onChange={(e) => setDraft((d) => ({ ...d, sellingPrice: formatPriceInput(e.target.value) }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Cost Price</label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                <span style={{ padding: '8px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 40, textAlign: 'center' }}>
                  {currencySymbol}
                </span>
                <input 
                  style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} 
                  value={draft.costPrice} 
                  onChange={(e) => setDraft((d) => ({ ...d, costPrice: formatPriceInput(e.target.value) }))}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Low Stock Alert</label>
            <input type="number" min="0" style={fieldInput()} value={draft.lowStockThreshold} onChange={(e) => setDraft((d) => ({ ...d, lowStockThreshold: e.target.value }))} />
          </div>
          <button
            onClick={onAdd}
            disabled={!canAdd}
            style={{ width: '100%', marginTop: 14, padding: 11, borderRadius: 8, border: 'none', background: canAdd ? '#0891B2' : '#CBD5E1', color: '#fff', fontWeight: 700, cursor: canAdd ? 'pointer' : 'not-allowed' }}
          >
            Add to GRV
          </button>
        </div>
      </div>
    </div>
  );
};

const GRV_STATUS_CONFIG = {
  completed: { label: 'Completed', bg: '#DCFCE7', color: '#16A34A' },
};

// ✅ NEW — how many product rows we mount into the DOM at once for the
// picker table. Independent of GRV_PRODUCTS_PAGE_SIZE below, which is the
// NETWORK page size (how many products come back per API call). This is
// the RENDER page size — even once thousands of products have loaded into
// createProducts, only this many rows actually get put in the DOM,
// growing as the user scrolls the table. Keeps the table snappy on large
// catalogs regardless of how much data has already been fetched.
const RENDER_PAGE_SIZE = 60;
// Start loading the next slice this many px before the true bottom of the
// scrollable table, so it feels seamless rather than a visible pop-in.
const SCROLL_LOAD_THRESHOLD_PX = 160;

export default function GRV() {
  const { apiFetch, businessId, branches, baseCurrency, activeStaff, userProfile } = useAppContext();
  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';
  const staffName = activeStaff?.name || userProfile?.name || userProfile?.email?.split('@')[0] || 'Owner';

  // ─── MODULE GATING ───────────────────────────────────────────────────
  const { guardAction, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();

  const [toast, setToast] = useState(null);
  const [view, setView] = useState('list');
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grvs, setGrvs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Check access for the CURRENTLY SELECTED branch
  const hasAccess = hasModuleAccess('advanced_inventory');

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!selectedBranchId && branches?.length) setSelectedBranchId(branches[0].branchId);
  }, [branches, selectedBranchId]);

  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  const fetchGrvs = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/grv`);
      setGrvs(res?.data || []);
    } catch (e) {
      console.error('Fetch GRVs error:', e);
      setError('Failed to load GRVs');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => {
    if (view === 'list' && hasAccess) {
      fetchGrvs();
    } else if (view === 'list' && !hasAccess) {
      setLoading(false);
      setGrvs([]);
    }
  }, [fetchGrvs, view, hasAccess]);

  const filteredGrvs = useMemo(() => {
    if (!searchQuery.trim()) return grvs;
    const q = searchQuery.trim().toLowerCase();
    return grvs.filter((g) => g.supplierName?.toLowerCase().includes(q) || g.grvNumber?.toLowerCase().includes(q));
  }, [grvs, searchQuery]);

  const openDetail = (g) => {
    setView('detail');
    setSelectedGrv(g);
  };

  const [selectedGrv, setSelectedGrv] = useState(null);

  const handleExportPdf = useCallback(() => {
    if (!selectedGrv) return;
    const g = selectedGrv;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setTextColor('#0F172A');
    doc.text('Goods Received Voucher', pageWidth / 2, 16, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor('#64748B');
    doc.text(`${g.grvNumber}`, pageWidth / 2, 23, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor('#0F172A');
    let y = 34;
    const line = (label, value) => { doc.setTextColor('#64748B'); doc.text(label, 14, y); doc.setTextColor('#0F172A'); doc.text(String(value ?? '—'), 60, y); y += 7; };
    line('Supplier:', g.supplierName);
    if (g.supplierInvoiceNumber) line('Invoice #:', g.supplierInvoiceNumber);
    line('Received By:', g.receivedByName);
    line('Received At:', fmtDateTime(g.receivedAt));
    if (g.notes) line('Notes:', g.notes);

    autoTable(doc, {
      startY: y + 4,
      head: [['Product', 'SKU', 'Qty', 'Stock Before', 'New Stock', 'Unit Cost', 'Selling Price', 'Line Total']],
      body: g.items.map((it) => {
        const stockBefore = getItemStockBefore(it);
        const stockAfter = getItemStockAfter(it);
        const sellingPrice = getItemSellingPriceAfter(it);
        return [
          it.productName, it.sku, String(it.quantityReceived),
          stockBefore != null ? String(stockBefore) : '—',
          stockAfter != null ? String(stockAfter) : '—',
          formatMoney(it.unitCost, baseCurrency),
          sellingPrice != null ? formatMoney(sellingPrice, baseCurrency) : '—',
          formatMoney(it.lineTotal, baseCurrency),
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: '#F1F5F9', textColor: '#0F172A', fontStyle: 'bold' },
    });

    const finalY = doc.lastAutoTable?.finalY || y + 20;
    doc.setFontSize(11);
    doc.setTextColor('#0F172A');
    doc.text(`Total: ${formatMoney(g.totalCost, baseCurrency)}`, pageWidth - 14, finalY + 10, { align: 'right' });

    doc.save(`grv_${g.grvNumber}.pdf`);
  }, [selectedGrv, baseCurrency]);

  // ── CREATE GRV ────────────────────────────────────────────────────────────
  const [createStep, setCreateStep] = useState(1);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [updateCostPrice, setUpdateCostPrice] = useState(true);
  const [updateSellingPrice, setUpdateSellingPrice] = useState(false);
  const [createProducts, setCreateProducts] = useState([]);
  const [createCategories, setCreateCategories] = useState([]);
  const [createCategoryFilter, setCreateCategoryFilter] = useState('All');
  const [createSearch, setCreateSearch] = useState('');
  const [cart, setCart] = useState({});
  const [creating, setCreating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemDraft, setNewItemDraft] = useState(emptyNewItemDraft);
  // ✅ NEW — drives the inline progress bar while the product picker loads
  const [createProductsLoading, setCreateProductsLoading] = useState(false);
  const [createProductsLoadedCount, setCreateProductsLoadedCount] = useState(0);
  // ✅ NEW — how many rows of the (already-loaded) product list are
  // actually rendered right now. Grows as the user scrolls the table.
  const [visibleProductCount, setVisibleProductCount] = useState(RENDER_PAGE_SIZE);

  const isStepComplete = (step) => {
    if (step === 1) return supplierName.trim().length > 0;
    if (step === 2) return cartItems.some((item) => Number(item.quantityReceived) > 0);
    return false;
  };

  const openCreateFlow = () => {
    // ✅ Guard the action
    if (!guardAction('advanced_inventory')) return;
    setCreateStep(1);
    setSupplierName('');
    setInvoiceNumber('');
    setNotes('');
    setUpdateCostPrice(true);
    setUpdateSellingPrice(false);
    setCart({});
    setCreateSearch('');
    setCreateCategoryFilter('All');
    setError(null);
    setConfirmOpen(false);
    setNewItemModalOpen(false);
    setVisibleProductCount(RENDER_PAGE_SIZE);
    setView('create');
  };

  // ✅ FIXED — /business/.../products now returns a paginated object
  // ({ products, count, hasMore, nextCursor }), not a raw array. The old
  // code did `Array.isArray(prodRes) ? prodRes : []`, which was ALWAYS
  // false against that object, so createProducts silently stayed empty
  // and the product picker showed nothing. This now walks cursor
  // pagination — same pattern as Products.jsx / InventoryScreen.js — so
  // the picker fills in page by page instead of trying to pull the whole
  // (~5k item) catalog in a single request. createProductsLoading /
  // createProductsLoadedCount feed the InlineLoadProgress bar below.
  //
  // ✅ NEW — this is purely the NETWORK-side pagination (how many products
  // are fetched into memory). It's independent from visibleProductCount /
  // RENDER_PAGE_SIZE above, which controls how many of those loaded
  // products are actually rendered as table rows at once.
  const GRV_PRODUCTS_PAGE_SIZE = 250;

useEffect(() => {
  if (view !== 'create' || !businessId || !selectedBranchId) return;
  let cancelled = false;
  (async () => {
    setCreateProductsLoading(true);
    setCreateProductsLoadedCount(0);
    setCreateProducts([]);
    try {
      const catRes = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`);
      if (!cancelled) setCreateCategories(Array.isArray(catRes) ? catRes : []);

      let cursor = null;
      let hasMore = true;
      let accumulated = [];
      while (hasMore && !cancelled) {
        const params = new URLSearchParams();
        params.append('status', 'active');
        params.append('limit', String(GRV_PRODUCTS_PAGE_SIZE));
        if (cursor) params.append('cursor', cursor);
        const data = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products?${params.toString()}`);
        accumulated = accumulated.concat(data.products || []);
        hasMore = !!data.hasMore;
        cursor = data.nextCursor || null;
        if (!cancelled) {
          // Sort accumulated products alphabetically by name
          const sorted = [...accumulated].sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
          setCreateProducts(sorted);
          setCreateProductsLoadedCount(accumulated.length);
        }
        if (!cursor) break;
      }
    } catch (e) {
      console.error('Load products/categories for GRV error:', e);
    } finally {
      if (!cancelled) setCreateProductsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [view, businessId, selectedBranchId, apiFetch]);

  const filteredCreateProducts = useMemo(() => {
    let result = createProducts;
    if (createCategoryFilter !== 'All') result = result.filter((p) => p.category === createCategoryFilter);
    if (createSearch.trim()) {
      const q = createSearch.trim().toLowerCase();
      result = result.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    return result;
  }, [createProducts, createCategoryFilter, createSearch]);

  // ✅ NEW — a new search/category filter changes WHICH rows should be
  // visible, so the render window resets to the top. Reset does NOT
  // depend on createProducts itself, since that array grows continuously
  // as network pages arrive — resetting on every page landing would keep
  // yanking the user back to the top of the table mid-scroll.
  useEffect(() => {
    setVisibleProductCount(RENDER_PAGE_SIZE);
  }, [createSearch, createCategoryFilter]);

  // ✅ NEW — only the first `visibleProductCount` filtered rows are
  // actually rendered into the table. This is what keeps the DOM light
  // even once createProducts holds thousands of items.
  const renderedCreateProducts = useMemo(
    () => filteredCreateProducts.slice(0, visibleProductCount),
    [filteredCreateProducts, visibleProductCount]
  );

  // ✅ NEW — grows the render window as the user scrolls near the bottom
  // of the table's scroll container. Independent of network pagination —
  // this only ever reveals rows that are already sitting in
  // filteredCreateProducts; it never triggers a new API call itself.
  const handleProductTableScroll = useCallback((e) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < SCROLL_LOAD_THRESHOLD_PX) {
      setVisibleProductCount((prev) => {
        if (prev >= filteredCreateProducts.length) return prev;
        return Math.min(prev + RENDER_PAGE_SIZE, filteredCreateProducts.length);
      });
    }
  }, [filteredCreateProducts.length]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = cartItems.filter((item) => Number(item.quantityReceived) > 0).length;
  const newItemCount = cartItems.filter((item) => item.isNewProduct && Number(item.quantityReceived) > 0).length;

  const toggleCart = (product) => {
    const key = `p:${product.productId}`;
    setCart((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = {
          itemKey: key,
          isNewProduct: false,
          product,
          newProduct: null,
          quantityReceived: 1,
          unitCost: Number(product.costPrice || 0).toFixed(2),
          sellingPrice: getSellingPrice(product).toFixed(2),
        };
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setCart((prev) => {
      const next = { ...prev };
      filteredCreateProducts.forEach((product) => {
        const key = `p:${product.productId}`;
        if (!next[key]) {
          next[key] = {
            itemKey: key,
            isNewProduct: false,
            product,
            newProduct: null,
            quantityReceived: 1,
            unitCost: Number(product.costPrice || 0).toFixed(2),
            sellingPrice: getSellingPrice(product).toFixed(2),
          };
        }
      });
      return next;
    });
  };

  const deselectAll = () => setCart({});

  const updateCartField = (itemKey, field, value) => {
    setCart((prev) => ({ ...prev, [itemKey]: { ...prev[itemKey], [field]: value } }));
  };

  const removeFromCart = (itemKey) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
  };

  const openNewItemModal = useCallback(async () => {
    const newSku = await generateNextSKU(apiFetch, businessId, selectedBranchId);
    setNewItemDraft({ ...emptyNewItemDraft, sku: newSku });
    setNewItemModalOpen(true);
  }, [apiFetch, businessId, selectedBranchId]);

  const addNewItemToCart = () => {
    const key = `n:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCart((prev) => ({
      ...prev,
      [key]: {
        itemKey: key,
        isNewProduct: true,
        product: null,
        newProduct: { ...newItemDraft },
        quantityReceived: 1,
        unitCost: newItemDraft.costPrice || '0.00',
        sellingPrice: newItemDraft.sellingPrice || '0.00',
      },
    }));
    setNewItemModalOpen(false);
  };

  const canGoToProducts = supplierName.trim().length > 0;
  const canGoToReview = cartItems.some((item) => Number(item.quantityReceived) > 0);

  const totalCost = useMemo(
    () => cartItems.reduce((s, i) => s + (Number(i.quantityReceived) || 0) * (Number(i.unitCost) || 0), 0),
    [cartItems]
  );

  const newStockFor = useCallback((item) => {
    const current = itemCurrentStock(item);
    const qty = Number(item.quantityReceived) || 0;
    return current + qty;
  }, []);

  const requestCreateGrv = useCallback(() => {
    // ✅ Guard the action
    if (!guardAction('advanced_inventory')) return;
    
    const validItems = cartItems.filter((i) => Number(i.quantityReceived) > 0);
    if (!supplierName.trim()) {
      showToast('Supplier name is required', 'error');
      return;
    }
    if (validItems.length === 0) {
      showToast('Add at least one item with a valid quantity', 'error');
      return;
    }
    for (const it of validItems) {
      const label = itemName(it);
      if (Number(it.unitCost) < 0) {
        showToast(`Unit cost for ${label} can't be negative`, 'error');
        return;
      }
      if (it.sellingPrice !== '' && it.sellingPrice != null && Number(it.sellingPrice) < 0) {
        showToast(`Selling price for ${label} can't be negative`, 'error');
        return;
      }
      if (it.isNewProduct) {
        if (!it.newProduct?.name?.trim()) { showToast('A new item is missing a name', 'error'); return; }
        if (!it.newProduct?.sku?.trim()) { showToast('A new item is missing a SKU', 'error'); return; }
      }
    }
    setConfirmOpen(true);
  }, [cartItems, supplierName, guardAction]);

  const handleCreateGrv = useCallback(async () => {
    const validItems = cartItems.filter((i) => Number(i.quantityReceived) > 0);

    setCreating(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/grv`, {
        method: 'POST',
        body: JSON.stringify({
          supplierName: supplierName.trim(),
          supplierInvoiceNumber: invoiceNumber.trim() || null,
          items: validItems.map((item) => {
            const base = {
              quantityReceived: Number(item.quantityReceived),
              unitCost: Number(item.unitCost) || 0,
              sellingPrice: item.sellingPrice !== '' && item.sellingPrice != null ? Number(item.sellingPrice) : undefined,
            };
            if (item.isNewProduct) {
              return {
                ...base,
                isNewProduct: true,
                newProduct: {
                  sku: item.newProduct.sku.trim(),
                  name: item.newProduct.name.trim(),
                  category: item.newProduct.category,
                  categoryId: item.newProduct.categoryId,
                  unit: item.newProduct.unit || 'each',
                  itemsPerUnit: item.newProduct.itemsPerUnit ? Number(item.newProduct.itemsPerUnit) : 1,
                  barcode: item.newProduct.barcode || null,
                  description: item.newProduct.description || null,
                  lowStockThreshold: Number(item.newProduct.lowStockThreshold) || 0,
                },
              };
            }
            return { ...base, productId: item.product.productId };
          }),
          notes: notes.trim() || null,
          updateCostPrice,
          updateSellingPrice,
          staffId, staffName, posId: 'web-dashboard',
        }),
      });
      showToast('GRV recorded successfully!', 'success');
      setConfirmOpen(false);
      setView('list');
      await fetchGrvs();
    } catch (e) {
      console.error('Create GRV error:', e);
      showToast(e.message || 'Failed to record GRV', 'error');
    } finally {
      setCreating(false);
    }
  }, [apiFetch, businessId, selectedBranchId, supplierName, invoiceNumber, notes, updateCostPrice, updateSellingPrice, cartItems, staffId, staffName, fetchGrvs]);

  // ─── ACCESS DENIED ──────────────────────────────────────────────────
  if (!hasAccess) {
    const moduleInfo = getModuleInfo('advanced_inventory');
    return (
      <div className="reports-page">
        {/* ✅ Store selector ALWAYS visible, even when access denied */}
        <div className="reports-header">
          <div className="reports-header-left">
            <div>
              <div className="reports-header-title">GRV (Goods Received)</div>
              <div className="reports-header-sub">Record stock deliveries from suppliers</div>
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
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={32} color="#EF4444" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
              {moduleInfo?.label || 'Module'} Required
            </h2>
            <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>
              You need the <strong>{moduleInfo?.label || 'Advanced Inventory Management'}</strong> module to access GRV features for <strong>{selectedBranchName}</strong>.
              Please subscribe to unlock this functionality.
            </p>
            <div style={{ marginTop: 16, fontSize: 13, color: '#94A3B8' }}>
              {moduleInfo?.price && (
                <span>Price: {moduleInfo.price}{moduleInfo.period || '/month'}</span>
              )}
            </div>
          </div>
        </div>

        {/* ✅ Module gate modal */}
        {gateModalModuleId && (
          <ModuleSubscriptionModal
            moduleId={gateModalModuleId}
            moduleState={getModuleState(gateModalModuleId)}
            onClose={closeGateModal}
          />
        )}
      </div>
    );
  }

  // ─── LIST VIEW ─────────────────────────────────────────────────────────────
  const renderList = () => (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="reports-header">
        <div className="reports-header-left">
          <div>
            <div className="reports-header-title">GRV (Goods Received)</div>
            <div className="reports-header-sub">Record stock deliveries from suppliers</div>
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
            <Plus size={15} /> New GRV
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div className="reports-toolbar" style={{ marginBottom: 16 }}>
        <div className="reports-search">
          <Search size={14} />
          <input placeholder="Search by supplier or GRV number" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
        </div>
      </div>

      <div className="reports-list-card">
        {loading ? (
          <div className="reports-empty"><div className="reports-empty-title">Loading GRVs...</div></div>
        ) : filteredGrvs.length === 0 ? (
          <div className="reports-empty">
            <FileInput size={32} />
            <div className="reports-empty-title">No GRVs found</div>
            <div className="reports-empty-sub">Record your first goods received voucher</div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-view">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>GRV Number</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Supplier</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Items</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Received By</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrvs.map((g) => {
                    const status = GRV_STATUS_CONFIG[g.status] || GRV_STATUS_CONFIG.completed;
                    return (
                      <tr key={g.grvId} onClick={() => openDetail(g)} style={{ cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{g.grvNumber}</td>
                        <td style={{ padding: '10px 14px' }}>{g.supplierName}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="reports-list-item-badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>{g.items.length} item{g.items.length !== 1 ? 's' : ''}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{new Date(g.createdAt).toLocaleString()}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{g.receivedByName}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{formatMoney(g.totalCost, baseCurrency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="mobile-card-view">
              {filteredGrvs.map((g) => {
                const status = GRV_STATUS_CONFIG[g.status] || GRV_STATUS_CONFIG.completed;
                return (
                  <div key={g.grvId} onClick={() => openDetail(g)} style={{ 
                    padding: '12px 14px', 
                    borderBottom: '1px solid #F1F5F9',
                    cursor: 'pointer',
                    background: '#fff',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {g.grvNumber}
                        </div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#0F172A' }}>{g.supplierName}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          <span className="reports-list-item-badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                          <span style={{ fontSize: 11, color: '#94A3B8' }}>{g.items.length} item{g.items.length !== 1 ? 's' : ''}</span>
                          {g.supplierInvoiceNumber && <span style={{ fontSize: 11, color: '#94A3B8' }}>Invoice: {g.supplierInvoiceNumber}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          {new Date(g.createdAt).toLocaleString()} • {g.receivedByName}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{formatMoney(g.totalCost, baseCurrency)}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>ID: {g.grvId?.slice(-6)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ✅ Module gate modal */}
      {gateModalModuleId && (
        <ModuleSubscriptionModal
          moduleId={gateModalModuleId}
          moduleState={getModuleState(gateModalModuleId)}
          onClose={closeGateModal}
        />
      )}
    </div>
  );

  // ─── CREATE VIEW ───────────────────────────────────────────────────────────
  const renderCreate = () => (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {confirmOpen && (
        <ConfirmModal
          itemCount={cartCount}
          newItemCount={newItemCount}
          submitting={creating}
          onCancel={() => !creating && setConfirmOpen(false)}
          onConfirm={handleCreateGrv}
        />
      )}
      {newItemModalOpen && (
        <NewItemModal
          draft={newItemDraft}
          setDraft={setNewItemDraft}
          categories={createCategories}
          baseCurrency={baseCurrency}
          onCancel={() => setNewItemModalOpen(false)}
          onAdd={addNewItemToCart}
        />
      )}
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">New GRV</div>
            <div className="reports-header-sub">Step {createStep} of 3 — {selectedBranchName}</div>
          </div>
        </div>
      </div>

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { n: 1, label: 'Details', disabled: false },
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
                minWidth: '80px',
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
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Supplier Name *</label>
              <input style={fieldInput()} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Acme Distributors" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Invoice Number</label>
              <input style={fieldInput()} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={updateCostPrice} onChange={(e) => setUpdateCostPrice(e.target.checked)} />
            Update product cost price to match this delivery
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={updateSellingPrice} onChange={(e) => setUpdateSellingPrice(e.target.checked)} />
            Update product selling price too
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea style={{ ...fieldInput(), minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — delivery condition, courier, etc." />
          <button onClick={() => setCreateStep(2)} disabled={!canGoToProducts}
            style={{ marginTop: 18, padding: '11px 24px', borderRadius: 8, border: 'none', background: canGoToProducts ? '#0891B2' : '#CBD5E1', color: '#fff', fontWeight: 700, cursor: canGoToProducts ? 'pointer' : 'not-allowed' }}>
            Next: Select Products
          </button>
        </div>
      )}

      {createStep === 2 && (
        <div className="grv-products-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: '1.6fr 1fr', 
          gap: 16, 
          alignItems: 'start' 
        }}>
          <div className="reports-list-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="reports-search" style={{ flex: 1, minWidth: '150px' }}>
                <Search size={14} />
                <input placeholder="Search products or SKU" value={createSearch} onChange={(e) => setCreateSearch(e.target.value)} />
              </div>
              <select style={{ ...fieldInput(), width: 160 }} value={createCategoryFilter} onChange={(e) => setCreateCategoryFilter(e.target.value)}>
                <option value="All">All Categories</option>
                {createCategories.map((c) => <option key={c.categoryId} value={c.name}>{c.name}</option>)}
              </select>
              <InlineLoadProgress loading={createProductsLoading} loadedCount={createProductsLoadedCount} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button onClick={selectAllFiltered} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #0891B2', background: '#EFF6FF', color: '#0891B2', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> Select All
              </button>
              <button onClick={deselectAll} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #EF4444', background: '#FEF2F2', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <X size={14} /> Deselect All
              </button>
              <button onClick={openNewItemModal} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #0891B2', background: '#fff', color: '#0891B2', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Sparkles size={14} /> New Item Not In Catalog
              </button>
              <span style={{ fontSize: 12, color: '#64748B', marginLeft: 'auto', alignSelf: 'center' }}>{cartCount} selected</span>
            </div>

            {/* ✅ NEW — fixed-height, scrollable table body. onScroll grows
                visibleProductCount as the user nears the bottom, so only a
                bounded number of <tr> rows are ever mounted regardless of
                how many products have loaded into createProducts. */}
            <div
              style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 460, border: '1px solid #F1F5F9', borderRadius: 8 }}
              onScroll={handleProductTableScroll}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: '400px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', textAlign: 'left', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                    <th style={{ padding: '8px 6px', width: 30 }}>
                      <input
                        type="checkbox"
                        checked={filteredCreateProducts.length > 0 && filteredCreateProducts.every((p) => cart[`p:${p.productId}`])}
                        onChange={(e) => {
                          if (e.target.checked) selectAllFiltered();
                          else deselectAll();
                        }}
                      />
                    </th>
                    <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                    <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', display: 'none', '@media (min-width: 481px)': { display: 'table-cell' } }}>Category</th>
                    <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Stock</th>
                    <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {renderedCreateProducts.map((p) => {
                    const inCart = !!cart[`p:${p.productId}`];
                    return (
                      <tr key={p.productId} onClick={() => toggleCart(p)} style={{
                        cursor: 'pointer',
                        background: inCart ? '#EFF6FF' : 'transparent',
                        borderBottom: '1px solid #F1F5F9',
                      }}>
                        <td style={{ padding: '8px 6px' }}><input type="checkbox" checked={inCart} readOnly /></td>
                        <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                          <div>{p.name}</div>
                          <div style={{ color: '#94A3B8', fontWeight: 400, fontSize: 11 }}>{p.sku}</div>
                        </td>
                        <td style={{ padding: '8px 6px', color: '#64748B', display: 'none', '@media (min-width: 481px)': { display: 'table-cell' } }}>{p.category}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#64748B' }}>{getCurrentStock(p)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatMoney(p.costPrice || 0, baseCurrency)}</td>
                      </tr>
                    );
                  })}
                  {filteredCreateProducts.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#94A3B8' }}>{createProductsLoading ? 'Loading products…' : 'No products found'}</td></tr>
                  )}
                  {visibleProductCount < filteredCreateProducts.length && (
                    <tr>
                      <td colSpan={5} style={{ padding: '10px 6px', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
                        Scroll for more — showing {renderedCreateProducts.length} of {filteredCreateProducts.length}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
              <>
                {cartItems.map((item) => {
                  const { quantityReceived, unitCost, sellingPrice } = item;
                  const currentStock = itemCurrentStock(item);
                  const key = itemKeyOf(item);
                  return (
                    <div key={key} style={{ padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
                          {itemName(item)}
                          {item.isNewProduct && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#0891B2', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '1px 5px' }}>NEW</span>
                          )}
                        </span>
                        <button onClick={() => removeFromCart(key)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Trash2 size={13} color="#EF4444" /></button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min="1"
                          style={{ ...fieldInput(), width: 50, padding: '5px 6px' }}
                          value={quantityReceived}
                          onChange={(e) => updateCartField(key, 'quantityReceived', e.target.value)}
                          placeholder="Qty"
                          title="Quantity received"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          style={{ ...fieldInput(), width: 65, padding: '5px 6px' }}
                          value={unitCost}
                          onChange={(e) => updateCartField(key, 'unitCost', e.target.value)}
                          placeholder="Cost"
                          title={`Unit cost (${baseCurrency?.code || 'USD'})`}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          style={{ ...fieldInput(), width: 65, padding: '5px 6px' }}
                          value={sellingPrice}
                          onChange={(e) => updateCartField(key, 'sellingPrice', e.target.value)}
                          placeholder="Sell"
                          title={`Selling price (${baseCurrency?.code || 'USD'})`}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: '#16A34A', marginTop: 4, fontWeight: 600 }}>
                        New stock: {currentStock} + {Number(quantityReceived) || 0} = {newStockFor(item)}
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#0F172A', padding: '10px 0 0' }}>
                  <span>Total</span>
                  <span>{formatMoney(totalCost, baseCurrency)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setCreateStep(1)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={() => setCreateStep(3)} disabled={!canGoToReview} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: canGoToReview ? '#0891B2' : '#CBD5E1', color: '#fff', fontWeight: 700, cursor: canGoToReview ? 'pointer' : 'not-allowed' }}>Review</button>
            </div>
          </div>
        </div>
      )}

      {createStep === 3 && (
        <div className="reports-list-card" style={{ padding: 20, maxWidth: 940 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Supplier</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{supplierName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Invoice #</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{invoiceNumber || '—'}</div>
            </div>
          </div>
          {notes && <div style={{ marginBottom: 16, fontSize: 13 }}><strong>Notes:</strong> {notes}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 18, minWidth: '500px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>SKU</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Quantity</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Current Stock</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#16A34A', textTransform: 'uppercase', textAlign: 'right' }}>New Stock</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Selling Price</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {cartItems.filter((item) => Number(item.quantityReceived) > 0).map((item) => {
                  const { quantityReceived, unitCost, sellingPrice } = item;
                  const key = itemKeyOf(item);
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                        {itemName(item)}
                        {item.isNewProduct && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#0891B2', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '1px 5px' }}>NEW</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px', color: '#94A3B8' }}>{itemSku(item)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{quantityReceived}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#64748B' }}>{itemCurrentStock(item)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{newStockFor(item)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatMoney(unitCost, baseCurrency)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{sellingPrice !== '' && sellingPrice != null ? formatMoney(sellingPrice, baseCurrency) : '—'}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{formatMoney(Number(quantityReceived) * Number(unitCost), baseCurrency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>{formatMoney(totalCost, baseCurrency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {updateCostPrice && (
            <div style={{ fontSize: 12, color: '#0891B2', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              Product cost prices will be updated to match this delivery.
            </div>
          )}
          {updateSellingPrice && (
            <div style={{ fontSize: 12, color: '#0891B2', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              Product selling prices will be updated as entered above.
            </div>
          )}
          {newItemCount > 0 && (
            <div style={{ fontSize: 12, color: '#0891B2', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
              {newItemCount} item{newItemCount !== 1 ? 's' : ''} marked NEW will be added to your product catalog.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setCreateStep(2)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 700, cursor: 'pointer' }}>Back</button>
            <button onClick={requestCreateGrv} disabled={creating} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Saving...' : 'Record GRV'}
            </button>
          </div>
        </div>
      )}

      {/* ✅ Module gate modal */}
      {gateModalModuleId && (
        <ModuleSubscriptionModal
          moduleId={gateModalModuleId}
          moduleState={getModuleState(gateModalModuleId)}
          onClose={closeGateModal}
        />
      )}
    </div>
  );

  // ─── DETAIL VIEW ───────────────────────────────────────────────────────────
  const renderDetail = () => {
    if (!selectedGrv) return null;
    const g = selectedGrv;
    const status = GRV_STATUS_CONFIG[g.status] || GRV_STATUS_CONFIG.completed;

    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">{g.grvNumber}</div>
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

        <div className="reports-list-card" style={{ padding: 24, maxWidth: 700 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Truck size={11} /> Supplier</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{g.supplierName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Invoice #</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{g.supplierInvoiceNumber || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} /> Received By</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{g.receivedByName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> Received At</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{fmtDateTime(g.receivedAt)}</div>
            </div>
          </div>
          {g.notes && (
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}><MessageSquare size={11} /> Notes</div>
              <div style={{ fontSize: 13 }}>{g.notes}</div>
            </div>
          )}
        </div>

        <div className="reports-list-card" style={{ padding: 20, maxWidth: 900, marginTop: 16 }}>
          <h4 style={{ marginBottom: 12 }}>Items ({g.items.length})</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: '500px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase' }}>SKU</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Quantity</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Stock Before</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#16A34A', textTransform: 'uppercase', textAlign: 'right' }}>New Stock</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Selling Price</th>
                  <th style={{ padding: '8px 6px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => {
                  const stockBefore = getItemStockBefore(it);
                  const stockAfter = getItemStockAfter(it);
                  const sellingPrice = getItemSellingPriceAfter(it);
                  return (
                    <tr key={it.productId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                        {it.productName}
                        {it.isNewProduct && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#0891B2', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '1px 5px' }}>NEW</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px', color: '#94A3B8' }}>{it.sku}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{it.quantityReceived}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#64748B' }}>{stockBefore != null ? stockBefore : '—'}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{stockAfter != null ? stockAfter : '—'}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatMoney(it.unitCost, baseCurrency)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{sellingPrice != null ? formatMoney(sellingPrice, baseCurrency) : '—'}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{formatMoney(it.lineTotal, baseCurrency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>{formatMoney(g.totalCost, baseCurrency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ✅ Module gate modal */}
        {gateModalModuleId && (
          <ModuleSubscriptionModal
            moduleId={gateModalModuleId}
            moduleState={getModuleState(gateModalModuleId)}
            onClose={closeGateModal}
          />
        )}
      </div>
    );
  };

  if (view === 'create') return renderCreate();
  if (view === 'detail') return renderDetail();
  return renderList();
}