// src/pages/PurchaseOrders.jsx
//
// Purchase Orders — a NEW screen, separate from GRV.jsx (which is
// untouched apart from one small hand-off hook, see bottom of this file's
// comments). Flow:
//   1. Create a PO (pick a supplier, or create one inline), add items with
//      quantityOrdered + expected unit cost. Saves as 'draft'.
//   2. "Send to Supplier" flips it to 'sent' and opens a WhatsApp
//      click-to-chat link (wa.me) pre-filled with the order, using the
//      supplier's saved WhatsApp number.
//   3. When stock arrives, "Receive Stock" on a sent/partially_received PO
//      navigates to the existing GRV screen with the remaining
//      (ordered − received) quantities pre-filled, tagging the GRV with
//      this purchaseOrderId so receiving updates this PO automatically.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ClipboardList, Plus, X, Search, ChevronLeft, Truck, Send, PackageCheck,
  Trash2, MessageCircle, AlertTriangle, Ban,
  // ✅ NEW — same icon set GRV's "New Item Not In Catalog" modal uses
  Sparkles, Package, Tag, Hash, Barcode, FolderTree, DollarSign, Bell, Layers, TrendingUp, Percent,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';
import { formatMoney } from '../utils/exportUtils';
import ConfirmDialog from '../components/community/ConfirmDialog';
import { SupplierModal } from './Suppliers';
import '../styles/ReportsShared.css';

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

// ✅ Same field-fallback chain GRV.jsx uses to read stock off a product —
// this was previously checking p.quantity / p.stockQuantity, neither of
// which is a real field on your product objects, so it always showed "—".
function getCurrentStock(product) {
  return Number(product?.currentStock ?? product?.stock ?? product?.quantityOnHand ?? product?.qty ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ NEW — "New Item Not In Catalog" modal, lifted verbatim from GRV.jsx so
// creating an item here is the exact same experience: same fields (name,
// SKU with live availability check, barcode, category, unit, selling/cost
// price with live margin, low-stock threshold), same auto-generated SKU,
// same validation. This is NOT the stripped-down name+unit popup from
// before — it's the real thing.
// ═══════════════════════════════════════════════════════════════════════════

const formatPriceInput = (text) => {
  if (!text || text === '') return '0.00';
  const numericOnly = text.replace(/[^0-9]/g, '');
  if (!numericOnly) return '0.00';
  const cents = parseInt(numericOnly, 10);
  const dollars = Math.floor(cents / 100);
  const remainingCents = cents % 100;
  return `${dollars}.${remainingCents.toString().padStart(2, '0')}`;
};

const emptyNewItemDraft = {
  name: '', sku: '', category: 'No Category', categoryId: 'no-category',
  unit: 'each', itemsPerUnit: '', barcode: '', description: '', lowStockThreshold: '0',
  sellingPrice: '0.00', costPrice: '0.00',
};

async function generateNextSKU(apiFetch, businessId, branchId) {
  try {
    const res = await apiFetch(`/business/${businessId}/branches/${branchId}/products/next-sku`);
    return res.sku;
  } catch (error) {
    console.error('Error generating SKU:', error);
    return String(Date.now()).slice(-6);
  }
}

const ModalSection = ({ icon: Icon, title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={12} color="#0891B2" />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
    </div>
    {children}
  </div>
);

const FieldLabel = ({ children, required }) => (
  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
    {children}{required && <span style={{ color: '#EF4444' }}> *</span>}
  </label>
);

const IconInput = ({ icon: Icon, ...props }) => (
  <div style={{ position: 'relative' }}>
    <Icon size={14} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    <input {...props} style={{ ...fieldInput(), paddingLeft: 34, ...(props.style || {}) }} />
  </div>
);

const NewItemModal = ({ draft, setDraft, categories, baseCurrency, skuCheck, onCancel, onAdd, ctaLabel }) => {
  const trimmedSku = draft.sku.trim();
  const skuIsCheckedValue = skuCheck.sku === trimmedSku;
  const skuTaken = skuIsCheckedValue && skuCheck.exists;
  const skuChecking = skuIsCheckedValue && skuCheck.checking;
  const canAdd = draft.name.trim().length > 0 && trimmedSku.length > 0 && !skuTaken && !skuChecking;
  const currencySymbol = baseCurrency?.symbol || '$';

  const sellingNum = Number(draft.sellingPrice) || 0;
  const costNum = Number(draft.costPrice) || 0;
  const margin = sellingNum > 0 ? ((sellingNum - costNum) / sellingNum) * 100 : null;
  const marginColor = margin == null ? '#94A3B8' : margin < 0 ? '#EF4444' : margin < 15 ? '#D97706' : '#16A34A';

  return (
    <div className="reports-modal-overlay" onClick={onCancel} style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(2px)' }}>
      <div className="reports-modal" style={{ maxWidth: 520, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 48px rgba(15,23,42,0.28)', border: '1px solid #EEF2F7' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0891B2 0%, #234C6A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>New Item</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>Not in your catalog yet — add it on the fly</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', flexShrink: 0, background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div className="reports-modal-body" style={{ padding: '22px 24px 24px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#0891B2', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 12px', marginBottom: 20 }}>
            <Package size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>This will be created as a new product in your catalog once it's received against this purchase order.</span>
          </div>

          <ModalSection icon={Tag} title="Basic Info">
            <div style={{ marginBottom: 10 }}>
              <FieldLabel required>Product Name</FieldLabel>
              <IconInput icon={Package} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Sparkling Water 500ml" autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <FieldLabel required>SKU</FieldLabel>
                <IconInput icon={Hash} value={draft.sku} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} placeholder="Auto-generated" style={skuTaken ? { borderColor: '#EF4444' } : undefined} />
                {trimmedSku && (
                  <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                    {skuChecking ? <span style={{ color: '#94A3B8' }}>Checking availability…</span>
                      : skuTaken ? <span style={{ color: '#EF4444' }}>This SKU already exists — use a different one</span>
                      : skuIsCheckedValue ? <span style={{ color: '#16A34A' }}>SKU available</span> : null}
                  </div>
                )}
              </div>
              <div>
                <FieldLabel>Barcode</FieldLabel>
                <IconInput icon={Barcode} value={draft.barcode} onChange={(e) => setDraft((d) => ({ ...d, barcode: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </ModalSection>

          <ModalSection icon={FolderTree} title="Organization">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select style={fieldInput()} value={draft.categoryId} onChange={(e) => {
                  const cat = categories.find((c) => c.categoryId === e.target.value);
                  setDraft((d) => ({ ...d, categoryId: e.target.value, category: cat?.name || 'No Category' }));
                }}>
                  <option value="no-category">No Category</option>
                  {categories.filter((c) => c.categoryId !== 'no-category').map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Unit</FieldLabel>
                <select style={fieldInput()} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}>
                  <option value="each">Each</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="meter">Meter (m)</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                </select>
              </div>
            </div>
          </ModalSection>

          <ModalSection icon={DollarSign} title="Pricing">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: margin != null ? 10 : 0 }}>
              <div>
                <FieldLabel required>Selling Price</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ padding: '8px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 40, textAlign: 'center' }}>{currencySymbol}</span>
                  <input style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} value={draft.sellingPrice} onChange={(e) => setDraft((d) => ({ ...d, sellingPrice: formatPriceInput(e.target.value) }))} placeholder="0.00" />
                </div>
              </div>
              <div>
                <FieldLabel>Cost Price</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ padding: '8px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 40, textAlign: 'center' }}>{currencySymbol}</span>
                  <input style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} value={draft.costPrice} onChange={(e) => setDraft((d) => ({ ...d, costPrice: formatPriceInput(e.target.value) }))} placeholder="0.00" />
                </div>
              </div>
            </div>
            {margin != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: marginColor }}>
                <TrendingUp size={13} /><span>Margin: {margin.toFixed(1)}%</span><Percent size={11} style={{ opacity: 0.6 }} />
              </div>
            )}
          </ModalSection>

          <ModalSection icon={Bell} title="Inventory">
            <FieldLabel>Low Stock Alert</FieldLabel>
            <IconInput icon={Layers} type="number" min="0" value={draft.lowStockThreshold} onChange={(e) => setDraft((d) => ({ ...d, lowStockThreshold: e.target.value }))} placeholder="0" />
          </ModalSection>

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button onClick={onCancel} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={onAdd} disabled={!canAdd} title={skuTaken ? 'This SKU already exists — choose a different one' : undefined} style={{
              flex: 1, padding: '11px 18px', borderRadius: 10, border: 'none',
              background: canAdd ? 'linear-gradient(135deg, #0891B2 0%, #0E7490 100%)' : '#CBD5E1',
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: canAdd ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: canAdd ? '0 6px 16px rgba(8,145,178,0.28)' : 'none',
            }}>
              <Plus size={15} /> {ctaLabel || 'Add to Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Toast = ({ message, type, onClose }) => {
  const styles = {
    error: { bg: '#FEF2F2', border: '#FEE2E2', text: '#EF4444' },
    success: { bg: '#F0FDF4', border: '#DCFCE7', text: '#16A34A' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  };
  const style = styles[type] || styles.error;
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: style.bg, border: `1px solid ${style.border}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxWidth: 380 }}>
      <span style={{ color: style.text, fontSize: 14, fontWeight: 500 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: style.text, fontSize: 18, marginLeft: 'auto' }}>×</button>
    </div>
  );
};

const STATUS_CONFIG = {
  draft: { label: 'Draft', bg: '#F1F5F9', color: '#475569' },
  sent: { label: 'Sent', bg: '#EFF6FF', color: '#0891B2' },
  partially_received: { label: 'Partially Received', bg: '#FFFBEB', color: '#D97706' },
  fully_received: { label: 'Fully Received', bg: '#F0FDF4', color: '#16A34A' },
  cancelled: { label: 'Cancelled', bg: '#FEF2F2', color: '#EF4444' },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

export default function PurchaseOrders() {
  const { apiFetch, businessId, activeStaff, userProfile, baseCurrency } = useAppContext();
  const { selectedBranchId } = useSelectedBranch();
  const navigate = useNavigate();
  const { guardAction, gateModalModuleId, closeGateModal } = useModuleGate();
  const staffId = activeStaff?.staffId || userProfile?.uid;
  const staffName = activeStaff?.name || userProfile?.name || 'Owner';

  const [view, setView] = useState('list'); // 'list' | 'create' | 'detail'
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'error') => setToast({ message, type });

  const fetchPos = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/purchase-orders`);
      setPos(res.data || []);
    } catch (e) {
      showToast(e.message || 'Failed to load purchase orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => { fetchPos(); }, [fetchPos]);

  const filtered = useMemo(() => {
    let result = pos;
    if (statusFilter !== 'all') result = result.filter((p) => p.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => p.poNumber?.toLowerCase().includes(q) || p.supplierName?.toLowerCase().includes(q));
    }
    return result;
  }, [pos, statusFilter, searchQuery]);

  // ── Suppliers (for the picker inside Create) ────────────────────────────
  const [suppliers, setSuppliers] = useState([]);
  const fetchSuppliers = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/suppliers`);
      setSuppliers((res.data || []).filter((s) => !s.isDeleted));
    } catch (e) {
      showToast(e.message || 'Failed to load suppliers', 'error');
    }
  }, [apiFetch, businessId, selectedBranchId]);

  // ── Products (for the item picker inside Create) ────────────────────────
  // ⚠️ FIXED — this used to fire a single request with `limit=500`, which
  // was just a guess and silently truncated the catalog on any business
  // with more than ~500 active products. The endpoint is actually
  // cursor-paginated ({ products, count, hasMore, nextCursor }), same as
  // GRV.jsx's product loader, so we walk it the same way here.
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoadedCount, setProductsLoadedCount] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const PRODUCTS_PAGE_SIZE = 250;

  const fetchProducts = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setProductsLoading(true);
    setProductsLoadedCount(0);
    setProducts([]);
    try {
      let cursor = null;
      let hasMore = true;
      let accumulated = [];
      while (hasMore) {
        const params = new URLSearchParams({ status: 'active', limit: String(PRODUCTS_PAGE_SIZE) });
        if (cursor) params.append('cursor', cursor);
        const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products?${params.toString()}`);
        accumulated = accumulated.concat(res.products || []);
        hasMore = !!res.hasMore;
        cursor = res.nextCursor || null;
        setProducts([...accumulated].sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())));
        setProductsLoadedCount(accumulated.length);
        if (!cursor) break;
      }
    } catch (e) {
      showToast(e.message || 'Failed to load products', 'error');
    } finally {
      setProductsLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [products, productSearch]);

  // ✅ NEW — used both in the picker (already inline via getCurrentStock)
  // and in the Order Items cart panel, so an already-added line still
  // shows how much stock exists right now, same as GRV's review step.
  const productStockById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.productId, getCurrentStock(p)])),
    [products]
  );

  // ── Create flow state ────────────────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState({}); // keyed by productId (or `n:sku`)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [newSupplierDraft, setNewSupplierDraft] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [creating, setCreating] = useState(false);

  // ✅ NEW — real "New Item Not In Catalog" flow, same as GRV's.
  const [categories, setCategories] = useState([]);
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemDraft, setNewItemDraft] = useState(emptyNewItemDraft);
  const [skuCheck, setSkuCheck] = useState({ sku: '', checking: false, exists: false });
  const skuCheckTimerRef = useRef(null);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, it) => sum + (Number(it.quantityOrdered) || 0) * (Number(it.unitCost) || 0), 0),
    [cartItems]
  );

  // Checks the cart itself (instant) for a SKU already used by another line
  // in this order — the same check GRV does before ever hitting the server.
  const isSkuTakenInCart = useCallback((sku) => {
    const normalized = sku.trim().toUpperCase();
    if (!normalized) return false;
    return cartItems.some((item) => (item.sku || '').trim().toUpperCase() === normalized);
  }, [cartItems]);

  const fetchCategories = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`);
      setCategories(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error('Load categories error:', e);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  const openCreateFlow = () => {
    if (!guardAction('advanced_inventory')) return;
    setSupplierId('');
    setNotes('');
    setCart({});
    setProductSearch('');
    fetchSuppliers();
    fetchProducts();
    fetchCategories();
    setView('create');
  };

  const addProductToCart = (product) => {
    setCart((prev) => ({
      ...prev,
      [product.productId]: {
        key: product.productId, productId: product.productId, sku: product.sku,
        productName: product.name, unit: product.unit || 'each',
        quantityOrdered: 1, unitCost: Number(product.costPrice || 0).toFixed(2),
        isNewProduct: false,
      },
    }));
  };

  // Same as GRV's openNewItemModal: fetch a fresh auto-generated SKU each
  // time the modal opens, and reset the availability check.
  const openNewItemModal = useCallback(async () => {
    const newSku = await generateNextSKU(apiFetch, businessId, selectedBranchId);
    setNewItemDraft({ ...emptyNewItemDraft, sku: newSku });
    setSkuCheck({ sku: '', checking: false, exists: false });
    setNewItemModalOpen(true);
  }, [apiFetch, businessId, selectedBranchId]);

  // Same debounced live SKU-availability check GRV runs while its modal is open.
  useEffect(() => {
    if (!newItemModalOpen) return;
    const sku = newItemDraft.sku.trim();
    if (!sku) {
      setSkuCheck({ sku: '', checking: false, exists: false });
      return;
    }
    if (skuCheckTimerRef.current) clearTimeout(skuCheckTimerRef.current);
    if (isSkuTakenInCart(sku)) {
      setSkuCheck({ sku, checking: false, exists: true });
      return;
    }
    setSkuCheck((prev) => ({ ...prev, sku, checking: true }));
    skuCheckTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products/sku-check?sku=${encodeURIComponent(sku)}`);
        setSkuCheck({ sku, checking: false, exists: !!res?.exists });
      } catch (e) {
        console.error('SKU check error:', e);
        setSkuCheck({ sku, checking: false, exists: false });
        showToast('Could not verify SKU availability — check your connection', 'warning');
      }
    }, 400);
    return () => { if (skuCheckTimerRef.current) clearTimeout(skuCheckTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newItemDraft.sku, newItemModalOpen, apiFetch, businessId, selectedBranchId, isSkuTakenInCart]);

  const addNewItemToCart = () => {
    const sku = newItemDraft.sku.trim();
    if (!newItemDraft.name.trim()) return showToast('Product name is required', 'error');
    if (!sku) return showToast('SKU is required', 'error');
    if (isSkuTakenInCart(sku) || (skuCheck.sku === sku && skuCheck.exists) || (skuCheck.sku === sku && skuCheck.checking)) {
      showToast(`SKU "${sku.toUpperCase()}" already exists — please use a different SKU`, 'error');
      return;
    }
    const key = `n:${sku.toUpperCase()}`;
    setCart((prev) => ({
      ...prev,
      [key]: {
        key, productId: null, sku: sku.toUpperCase(), productName: newItemDraft.name.trim(),
        unit: newItemDraft.unit || 'each', quantityOrdered: 1,
        unitCost: newItemDraft.costPrice || '0.00',
        isNewProduct: true, newProduct: { ...newItemDraft, sku: sku.toUpperCase() },
      },
    }));
    setNewItemModalOpen(false);
    setSkuCheck({ sku: '', checking: false, exists: false });
  };

  const updateCartField = (key, field, value) => setCart((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  const removeFromCart = (key) => setCart((prev) => { const n = { ...prev }; delete n[key]; return n; });


  const saveSupplierInline = async () => {
    if (!newSupplierDraft.name.trim()) return showToast('Supplier name is required', 'error');
    if (!newSupplierDraft.phone.trim()) return showToast('A phone number is required', 'error');
    setSavingSupplier(true);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/suppliers`, {
        method: 'POST', body: JSON.stringify({ ...newSupplierDraft, staffId, staffName }),
      });
      showToast('Supplier added', 'success');
      setSupplierModalOpen(false);
      await fetchSuppliers();
      setSupplierId(res.supplierId);
    } catch (e) {
      showToast(e.message || 'Failed to add supplier', 'error');
    } finally {
      setSavingSupplier(false);
    }
  };

  const createPurchaseOrder = async () => {
    if (!supplierId) return showToast('Select a supplier first', 'error');
    if (cartItems.length === 0) return showToast('Add at least one item', 'error');
    setCreating(true);
    try {
      const items = cartItems.map((it) => ({
        productId: it.productId, isNewProduct: it.isNewProduct, newProduct: it.newProduct || null,
        sku: it.sku, productName: it.productName,
        quantityOrdered: Number(it.quantityOrdered) || 0, unitCost: Number(it.unitCost) || 0,
      }));
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/purchase-orders`, {
        method: 'POST', body: JSON.stringify({ supplierId, items, notes: notes.trim() || null, staffId, staffName }),
      });
      showToast('Purchase order created', 'success');
      setView('list');
      fetchPos();
    } catch (e) {
      showToast(e.message || 'Failed to create purchase order', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ── Detail / send / receive / cancel ─────────────────────────────────────
  const [selectedPo, setSelectedPo] = useState(null);
  const [detailStockById, setDetailStockById] = useState({}); // ✅ NEW — live current stock per line, fetched on open
  const [sending, setSending] = useState(false);
  const [cancelPending, setCancelPending] = useState(null);
  const [deletePending, setDeletePending] = useState(null);

  const openDetail = async (po) => {
    setSelectedPo(po);
    setDetailStockById({});
    setView('detail');
    try {
      const full = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/purchase-orders/${po.purchaseOrderId}`);
      setSelectedPo(full);

      // ✅ NEW — the PO only stores what was ordered/received, not live
      // stock (that changes independently of this order), so fetch each
      // existing-catalog line's product to show current stock next to it,
      // same context GRV gives when reviewing items.
      const productIds = [...new Set((full.items || []).filter((it) => it.productId).map((it) => it.productId))];
      if (productIds.length > 0) {
        const results = await Promise.all(productIds.map(async (id) => {
          try {
            const p = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products/${id}`);
            return [id, getCurrentStock(p)];
          } catch (e) {
            return [id, null]; // product may have been deleted since the PO was created
          }
        }));
        setDetailStockById(Object.fromEntries(results));
      }
    } catch (e) {
      showToast(e.message || 'Failed to load purchase order', 'error');
    }
  };

  const sendToSupplier = async () => {
    setSending(true);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/purchase-orders/${selectedPo.purchaseOrderId}/send`, {
        method: 'POST', body: JSON.stringify({ staffId }),
      });
      window.open(res.whatsappLink, '_blank', 'noopener,noreferrer');
      showToast('Order sent — opening WhatsApp', 'success');
      openDetail({ purchaseOrderId: selectedPo.purchaseOrderId });
      fetchPos();
    } catch (e) {
      showToast(e.message || 'Failed to send purchase order', 'error');
    } finally {
      setSending(false);
    }
  };

  const cancelPo = async () => {
    if (!cancelPending) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/purchase-orders/${cancelPending.purchaseOrderId}/cancel`, {
        method: 'POST', body: JSON.stringify({ staffId }),
      });
      showToast('Purchase order cancelled', 'success');
      setCancelPending(null);
      setView('list');
      fetchPos();
    } catch (e) {
      showToast(e.message || 'Failed to cancel', 'error');
      setCancelPending(null);
    }
  };

  const deletePo = async () => {
    if (!deletePending) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/purchase-orders/${deletePending.purchaseOrderId}`, { method: 'DELETE' });
      showToast('Draft deleted', 'success');
      setDeletePending(null);
      setView('list');
      fetchPos();
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
      setDeletePending(null);
    }
  };

  // The ONE hand-off to the existing (untouched) GRV screen: we build the
  // remaining-to-receive lines and pass them via navigation state. GRV.jsx
  // reads `location.state.fromPurchaseOrder` on mount to pre-fill its own
  // cart, exactly as if someone had picked those items by hand — the
  // actual receiving logic is 100% the existing grvController code path.
  const receiveStock = (po) => {
    const remainingItems = (po.items || [])
      .map((it) => ({ ...it, remaining: (it.quantityOrdered || 0) - (it.quantityReceived || 0) }))
      .filter((it) => it.remaining > 0);
    if (remainingItems.length === 0) {
      showToast('Everything on this order has already been received', 'warning');
      return;
    }
    navigate('/inventory/grv', {
      state: {
        fromPurchaseOrder: {
          purchaseOrderId: po.purchaseOrderId,
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          items: remainingItems,
        },
      },
    });
  };

  // ── CREATE VIEW ──────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
          <h1 style={{ margin: 0, fontSize: 20 }}>New Purchase Order</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginTop: 20, alignItems: 'start' }}>
          <div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Supplier *</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <select style={fieldInput()} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Select a supplier…</option>
                  {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
                </select>
                <button
                  onClick={() => { setNewSupplierDraft({ name: '', email: '', phone: '', address: '', notes: '' }); setSupplierModalOpen(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> New Supplier
                </button>
              </div>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', margin: '16px 0 8px' }}>Notes</label>
              <textarea style={fieldInput({ minHeight: 60, resize: 'vertical' })} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — delivery instructions, etc." />
            </div>

            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
                  <input style={fieldInput({ paddingLeft: 36 })} placeholder="Search products to add…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                </div>
                <button onClick={openNewItemModal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <Plus size={14} /> Item Not In Catalog
                </button>
              </div>
              {productsLoading && (
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>
                  Loading products… {productsLoadedCount} loaded so far
                </div>
              )}
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 8 }}>
                {filteredProducts.slice(0, 100).map((p) => (
                  <div key={p.productId} onClick={() => addProductToCart(p)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #F8FAFC', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8' }}>{p.sku} · Stock: {getCurrentStock(p)}</div>
                    </div>
                    {cart[p.productId] && <span style={{ color: '#16A34A', fontSize: 12, fontWeight: 700, alignSelf: 'center' }}>Added</span>}
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No products found.</div>
                )}
                {filteredProducts.length > 100 && (
                  <div style={{ padding: '10px 12px', textAlign: 'center', color: '#94A3B8', fontSize: 12, borderTop: '1px solid #F8FAFC' }}>
                    Showing first 100 of {filteredProducts.length} matches — refine your search to narrow it down.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, position: 'sticky', top: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Order Items ({cartItems.length})</h3>
            {cartItems.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Add items from the picker on the left.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                {cartItems.map((it) => (
                  <div key={it.key} style={{ border: '1px solid #F1F5F9', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{it.productName}{it.isNewProduct && <span style={{ color: '#D97706', fontSize: 11, marginLeft: 6 }}>(new)</span>}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          {it.isNewProduct ? 'Not in catalog yet' : `Current stock: ${productStockById[it.productId] ?? 0}`}
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(it.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><Trash2 size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>Qty</div>
                        <input type="number" min="1" style={fieldInput({ padding: '6px 8px' })} value={it.quantityOrdered} onChange={(e) => updateCartField(it.key, 'quantityOrdered', e.target.value)} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>Unit Cost</div>
                        <input type="number" min="0" step="0.01" style={fieldInput({ padding: '6px 8px' })} value={it.unitCost} onChange={(e) => updateCartField(it.key, 'unitCost', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 14, paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Estimated Total</span><span>{formatMoney(cartTotal)}</span>
            </div>
            <button
              onClick={createPurchaseOrder} disabled={creating}
              style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 10, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.7 : 1 }}
            >
              {creating ? 'Saving…' : 'Save Purchase Order'}
            </button>
          </div>
        </div>

        {supplierModalOpen && (
          <SupplierModal draft={newSupplierDraft} setDraft={setNewSupplierDraft} saving={savingSupplier} onCancel={() => setSupplierModalOpen(false)} onSave={saveSupplierInline} isEditing={false} />
        )}

        {newItemModalOpen && (
          <NewItemModal
            draft={newItemDraft}
            setDraft={setNewItemDraft}
            categories={categories}
            baseCurrency={baseCurrency}
            skuCheck={skuCheck}
            onCancel={() => setNewItemModalOpen(false)}
            onAdd={addNewItemToCart}
            ctaLabel="Add to Order"
          />
        )}

        {gateModalModuleId && <ModuleSubscriptionModal moduleId={gateModalModuleId} onClose={closeGateModal} />}
      </div>
    );
  }

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (view === 'detail' && selectedPo) {
    const po = selectedPo;
    const canSend = po.status === 'draft';
    const canReceive = po.status === 'sent' || po.status === 'partially_received';
    const canCancel = po.status !== 'fully_received' && po.status !== 'cancelled';
    const canDelete = po.status === 'draft';

    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>{po.poNumber} <StatusPill status={po.status} /></h1>
            <div style={{ fontSize: 13, color: '#64748B' }}>{po.supplierName}</div>
          </div>
          {canSend && (
            <button onClick={() => sendToSupplier()} disabled={sending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              <MessageCircle size={16} /> {sending ? 'Sending…' : 'Send to Supplier'}
            </button>
          )}
          {canReceive && (
            <button onClick={() => receiveStock(po)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              <PackageCheck size={16} /> Receive Stock
            </button>
          )}
          {canCancel && (
            <button onClick={() => setCancelPending(po)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}>
              <Ban size={14} /> Cancel
            </button>
          )}
          {canDelete && (
            <button onClick={() => setDeletePending(po)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              <Trash2 size={14} /> Delete Draft
            </button>
          )}
        </div>

        {po.notes && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginTop: 16, fontSize: 13, color: '#475569' }}>{po.notes}</div>
        )}

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, marginTop: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 16px', background: '#F8FAFC', fontSize: 12, fontWeight: 700, color: '#64748B' }}>
            <div>ITEM</div><div>CURRENT STOCK</div><div>ORDERED</div><div>RECEIVED</div><div>UNIT COST</div>
          </div>
          {(po.items || []).map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 16px', borderTop: '1px solid #F1F5F9', fontSize: 14, alignItems: 'center' }}>
              <div>{it.productName}{it.isNewProduct && <span style={{ color: '#D97706', fontSize: 11, marginLeft: 6 }}>(new)</span>}</div>
              <div style={{ color: '#64748B' }}>
                {it.isNewProduct ? '—' : detailStockById[it.productId] === undefined ? '…' : detailStockById[it.productId] === null ? 'deleted' : detailStockById[it.productId]}
              </div>
              <div>{it.quantityOrdered} {it.unit}</div>
              <div style={{ color: (it.quantityReceived || 0) >= it.quantityOrdered ? '#16A34A' : (it.quantityReceived || 0) > 0 ? '#D97706' : '#94A3B8', fontWeight: 600 }}>
                {it.quantityReceived || 0} / {it.quantityOrdered}
              </div>
              <div>{formatMoney(it.unitCost || 0)}</div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', borderTop: '1px solid #F1F5F9', fontWeight: 700 }}>
            Total: {formatMoney(po.totalCost || 0)}
          </div>
        </div>

        {po.linkedGrvIds && po.linkedGrvIds.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#94A3B8' }}>
            Received via {po.linkedGrvIds.length} GRV{po.linkedGrvIds.length > 1 ? 's' : ''} so far.
          </div>
        )}

        {cancelPending && (
          <ConfirmDialog title="Cancel this purchase order?" message={`${cancelPending.poNumber} will be marked cancelled. This can't be undone.`} confirmLabel="Cancel Order" onCancel={() => setCancelPending(null)} onConfirm={cancelPo} />
        )}
        {deletePending && (
          <ConfirmDialog title="Delete this draft?" message={`${deletePending.poNumber} will be permanently deleted.`} confirmLabel="Delete" onCancel={() => setDeletePending(null)} onConfirm={deletePo} />
        )}
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ClipboardList size={20} />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Purchase Orders</h1>
          <div style={{ fontSize: 13, color: '#64748B' }}>Orders placed with your suppliers</div>
        </div>
        <button onClick={openCreateFlow} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} /> New Purchase Order
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', maxWidth: 300 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
          <input style={fieldInput({ paddingLeft: 36 })} placeholder="Search by PO # or supplier…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <select style={fieldInput({ width: 200 })} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partially_received">Partially Received</option>
          <option value="fully_received">Fully Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: '#64748B', fontSize: 14 }}>Loading purchase orders…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px dashed #E2E8F0', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          No purchase orders yet.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((p) => (
            <div key={p.purchaseOrderId} onClick={() => openDetail(p)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Truck size={17} color="#0891B2" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.poNumber} — {p.supplierName}</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>{(p.items || []).length} item(s) · {new Date(p.createdAt).toLocaleDateString()}</div>
              </div>
              <div style={{ fontWeight: 600 }}>{formatMoney(p.totalCost || 0)}</div>
              <StatusPill status={p.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}