// src/pages/Inventory/Products.jsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Store, Search, X, Package, Plus, Filter, Trash2, Edit2,
  AlertTriangle, Download, FileText, RefreshCw, Upload,
  CheckSquare, Square, ChevronLeft, FileDown, Lock,
  Image as ImageIcon,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatMoney, toApiDate, downloadCsv } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS as P } from '../utils/permissions';
import Button from '../components/common/Button';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import '../styles/ReportsShared.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadProductTemplate, downloadProductsForReimport } from '../utils/csvUtils';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';

const STOCK_STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'active_status', label: 'Active Products' },
  { value: 'inactive_status', label: 'Inactive Products' },
];

const PAGE_SIZE = 20;
// Server page size for the cursor loop below. Kept well under the
// backend's hard cap (500, see productController.getProducts) so no
// single request/response balloons back up to "the whole catalog at
// once," while still being large enough that a ~5k-product branch only
// takes a handful of round trips.
const SERVER_FETCH_PAGE_SIZE = 250;

// Module-level cache, OUTSIDE the component. Survives Products.jsx
// unmounting/remounting when you navigate to ProductForm and back (React
// state does not survive that; a module-scoped Map does, for the lifetime
// of the page/tab). Keyed by `${businessId}:${branchId}` so switching
// branches never mixes catalogs.
// products: array, categories: array, laybyeIds: Set, loadedAt: number,
// lastSyncAt: number — the newest product `updatedAt` we've seen for this
// branch. Once set, every subsequent fetchProducts() call takes the DELTA
// path (only products changed since lastSyncAt via /products/pull)
// instead of refetching the whole catalog.
const productsCache = new Map();

function getStockStatus(product) {
  if (!product.trackInventory) return 'in_stock';
  const stock = product.currentStock || 0;
  const threshold = product.lowStockThreshold || 0;
  if (stock <= 0) return 'out_of_stock';
  if (threshold > 0 && stock <= threshold) return 'low_stock';
  return 'in_stock';
}

function getStockBadge(status) {
  const map = {
    in_stock: { label: 'In Stock', bg: '#DCFCE7', color: '#16A34A', indicator: '#22C55E' },
    low_stock: { label: 'Low Stock', bg: '#FEF9C3', color: '#D97706', indicator: '#F59E0B' },
    out_of_stock: { label: 'Out of Stock', bg: '#FEF2F2', color: '#EF4444', indicator: '#EF4444' },
  };
  return map[status] || map.in_stock;
}

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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .products-container { padding: 0 8px; }
          .products-header { flex-direction: column; align-items: stretch; gap: 12px; }
          .products-header-left { flex-wrap: wrap; }
          .products-header-right { flex-wrap: wrap; justify-content: flex-start; }
          .products-toolbar { flex-wrap: wrap; gap: 8px; }
          .products-search { flex: 1; min-width: 140px; }
          .products-stats { display: none; }
        }
        @media (max-width: 480px) {
          .products-mobile-list { padding: 0; }
          .product-item { padding: 10px 12px; min-height: 72px; }
          .product-item-image { width: 40px; height: 40px; }
          .product-item-name { font-size: 13px; }
          .product-item-price { font-size: 13px; }
        }
      `}</style>
    </div>
  );
}

// ✅ FIXED — this is now a REAL filling bar, not an indeterminate sliding
// segment. There's no reliable total item count up front (the backend
// only reports hasMore per page, not a grand total), so the percentage
// while loading is an estimate that grows with loadedCount and is capped
// below 100 — reserving the final stretch to 100% for when the load
// actually completes. On completion it snaps to 100% (green), holds
// briefly, then fades out. This directly replaces the old version, which
// just slid a segment back and forth forever and never reached 100%.
function InlineLoadProgress({ loading, loadingMore, loadedCount }) {
  const isActive = loading || loadingMore;
  const [percent, setPercent] = useState(0);
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    if (isActive) {
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
  }, [isActive, loadedCount]);

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
        {percent >= 100 ? 'Loaded' : loading ? 'Loading products…' : `Loading more… (${loadedCount})`}
      </span>
    </div>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    apiFetch, businessId, branches, baseCurrency, activeStaff, userProfile, hasBackofficePermission,
    selectedBranchId, setSelectedBranchId,
  } = useAppContext();
  const { guardAction, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();
  const canWriteInventory = hasModuleAccess('inventory_mgmt');
  const canManageItems = hasBackofficePermission(P.MANAGE_ITEMS);
  const canViewStock = hasBackofficePermission(P.VIEW_STOCK);

  if (!canManageItems) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to manage products.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const [error, setError] = useState(null);

  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [laybyeProductIds, setLaybyeProductIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusPopup, setStatusPopup] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [categoryPopup, setCategoryPopup] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const isSelectionMode = selectedIds.size > 0;

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  const cacheKey = businessId && selectedBranchId ? `${businessId}:${selectedBranchId}` : null;

  // ✅ NEW — holds a savedProduct handed back via navigation state until
  // it's actually been merged into the real (cached or freshly-fetched)
  // list. Captured once, at construction time, from whatever
  // location.state looked like on THIS mount — Products.jsx fully
  // remounts on every navigation back from ProductForm, so this is safe
  // and avoids depending on a stale closure over location.state.
  const pendingSavedProductRef = useRef(location.state?.savedProduct || null);

  const writeCache = useCallback((patch) => {
    if (!cacheKey) return;
    const existing = productsCache.get(cacheKey) || {};
    productsCache.set(cacheKey, { ...existing, ...patch, loadedAt: Date.now() });
  }, [cacheKey]);

  // ✅ REWRITTEN — fetchProducts now has two modes, chosen automatically
  // based on whether we already have a `lastSyncAt` cached for this branch:
  //
  //   1. FULL LOAD  — the very first time a branch is loaded (no cached
  //      lastSyncAt yet). Walks /products with cursor pagination exactly
  //      as before, and additionally tracks the newest `updatedAt` seen
  //      across every product returned, storing it as lastSyncAt.
  //
  //   2. DELTA LOAD — every subsequent call (Refresh button, or the
  //      background sync fired on remount/"focus"). Instead of refetching
  //      the whole catalog, it calls /products/pull?since=<lastSyncAt>,
  //      which returns ONLY products that changed (created/updated/
  //      deleted) since that timestamp, and merges just those into the
  //      existing list — upserting changed ones, dropping ones that came
  //      back deleted. Untouched products are never re-fetched.
  const fetchProducts = useCallback(async (isManualRefresh = false) => {
    if (!businessId || !selectedBranchId) return;

    const cached = productsCache.get(cacheKey);
    const since = cached?.lastSyncAt || 0;
    const isDelta = since > 0;

    if (isManualRefresh) {
      setRefreshing(true);
    } else if (!isDelta) {
      // Only show the full-page loading state for a genuine first load.
      // A background delta sync (triggered silently on remount) shouldn't
      // flash the big loading UI.
      setLoading(true);
    }
    setError(null);

    try {
      const [categoriesRes, laybyesRes] = await Promise.all([
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`),
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/laybyes/pull?since=0&includeCompleted=false`),
      ]);
      const categoriesArr = Array.isArray(categoriesRes) ? categoriesRes : [];
      setCategories(categoriesArr);

      const ids = new Set();
      (laybyesRes?.laybyes || []).forEach((lb) => {
        (lb.items || []).forEach((it) => {
          if (it.productId) ids.add(it.productId);
        });
      });
      setLaybyeProductIds(ids);

      if (!isDelta) {
        // ─── FULL LOAD (first time for this branch) ───────────────────────
        let cursor = null;
        let hasMore = true;
        let accumulated = [];
        let firstBatch = true;
        let maxUpdatedAt = 0;

        while (hasMore) {
          const params = new URLSearchParams();
          params.append('status', 'all');
          params.append('limit', String(SERVER_FETCH_PAGE_SIZE));
          if (cursor) params.append('cursor', cursor);

          const data = await apiFetch(
            `/business/${businessId}/branches/${selectedBranchId}/products?${params.toString()}`
          );

          accumulated = accumulated.concat(data.products || []);
          (data.products || []).forEach((p) => {
            if ((p.updatedAt || 0) > maxUpdatedAt) maxUpdatedAt = p.updatedAt;
          });
          hasMore = !!data.hasMore;
          cursor = data.nextCursor || null;

          const sorted = [...accumulated].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setAllProducts(sorted);

          if (firstBatch) {
            setLoading(false);
            firstBatch = false;
          }
          setIsLoadingMoreProducts(hasMore);

          if (!cursor) break;
        }

        writeCache({
          products: accumulated.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
          categories: categoriesArr,
          laybyeIds: ids,
          lastSyncAt: maxUpdatedAt || Date.now(),
        });
      } else {
        // ─── DELTA LOAD — only fetch products changed since last sync ─────
        let sinceCursor = since;
        let hasMore = true;
        let changed = [];
        let maxUpdatedAt = since;

        while (hasMore) {
          const params = new URLSearchParams();
          params.append('since', String(sinceCursor));
          params.append('includeDeleted', 'true');

          const data = await apiFetch(
            `/business/${businessId}/branches/${selectedBranchId}/products/pull?${params.toString()}`
          );

          changed = changed.concat(data.products || []);
          (data.products || []).forEach((p) => {
            if ((p.updatedAt || 0) > maxUpdatedAt) maxUpdatedAt = p.updatedAt;
          });
          hasMore = !!data.hasMore;
          sinceCursor = data.nextSince || sinceCursor;

          if (!hasMore) break;
        }

        if (changed.length > 0) {
          setAllProducts((prev) => {
            const map = new Map(prev.map((p) => [p.productId, p]));
            changed.forEach((p) => {
              if (p.status === 'deleted') {
                map.delete(p.productId);
              } else {
                map.set(p.productId, p);
              }
            });
            const merged = Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            writeCache({ products: merged, categories: categoriesArr, laybyeIds: ids, lastSyncAt: maxUpdatedAt });
            return merged;
          });
        } else {
          writeCache({ categories: categoriesArr, laybyeIds: ids, lastSyncAt: maxUpdatedAt });
        }
      }
    } catch (e) {
      console.error('Fetch products error:', e);
      setError('Failed to load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsLoadingMoreProducts(false);
    }
  }, [businessId, selectedBranchId, apiFetch, writeCache, cacheKey]);

  // ✅ Combined mount effect. Order is always: (1) load the REAL base list
  // — from cache if we have it, otherwise a full fetch — THEN (2) merge
  // any pending savedProduct on top of that real list. When a cache
  // already exists, we render it INSTANTLY (no network wait) and then fire
  // a silent background delta sync (fetchProducts(false), which auto-picks
  // the delta path since lastSyncAt is cached) to pick up anything that
  // changed elsewhere — without ever refetching the whole catalog.
  useEffect(() => {
    if (!businessId || !selectedBranchId) return;

    const key = `${businessId}:${selectedBranchId}`;
    const cached = productsCache.get(key);

    const applyPending = (list) => {
      const saved = pendingSavedProductRef.current;
      if (!saved) return list;
      const idx = list.findIndex((p) => p.productId === saved.productId);
      let next;
      if (idx === -1) next = [...list, saved];
      else {
        next = [...list];
        next[idx] = { ...next[idx], ...saved };
      }
      return next.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    };

    // Clear the router's savedProduct state right away so browser
    // back/forward never re-applies a stale merge.
    if (pendingSavedProductRef.current) {
      window.history.replaceState({}, document.title);
    }

    if (cached) {
      const merged = applyPending(cached.products || []);
      setAllProducts(merged);
      setCategories(cached.categories || []);
      setLaybyeProductIds(cached.laybyeIds || new Set());
      setLoading(false);
      setError(null);
      if (pendingSavedProductRef.current) {
        writeCache({ products: merged });
        pendingSavedProductRef.current = null;
      }
      // ✅ Screen "focus" (remount) — sync only what changed since the
      // last load instead of refetching the whole catalog. fetchProducts
      // detects the cached lastSyncAt and automatically takes the delta
      // path (silent — no full-page loading state).
      fetchProducts(false);
    } else {
      fetchProducts().then(() => {
        if (!pendingSavedProductRef.current) return;
        setAllProducts((prev) => {
          const merged = applyPending(prev);
          writeCache({ products: merged });
          return merged;
        });
        pendingSavedProductRef.current = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, selectedBranchId]);

  useEffect(() => { 
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
  }, [searchQuery, statusFilter, categoryFilter, selectedBranchId]);

  const filteredProducts = useMemo(() => {
    let result = allProducts;

    if (statusFilter === 'active_status') result = result.filter((p) => p.status === 'active');
    else if (statusFilter === 'inactive_status') result = result.filter((p) => p.status !== 'active' && p.status !== 'deleted');
    else if (['in_stock', 'low_stock', 'out_of_stock'].includes(statusFilter)) {
      result = result.filter((p) => getStockStatus(p) === statusFilter);
    }

    if (categoryFilter !== 'All') {
      result = result.filter((p) => p.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
      );
    }

    result = result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return result.filter((p) => p.status !== 'deleted');
  }, [allProducts, statusFilter, categoryFilter, searchQuery]);

  const visibleProducts = useMemo(() => filteredProducts.slice(0, visibleCount), [filteredProducts, visibleCount]);

  const openDeleteModal = useCallback((ids, e) => {
    if (e) e.stopPropagation();
    if (!guardAction('inventory_mgmt')) return;
    setDeleteIds(Array.isArray(ids) ? ids : [ids]);
    setDeleteModalOpen(true);
  }, [guardAction]);

  const handleConfirmDelete = useCallback(async () => {
    if (!guardAction('inventory_mgmt')) {
      setDeleteModalOpen(false);
      return;
    }
    setIsDeleting(true);
    try {
      await Promise.all(deleteIds.map(id => 
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products/${id}`, {
          method: 'DELETE',
          body: JSON.stringify({
            staffId,
            cashierName: activeStaff?.name || userProfile?.name || 'Owner',
            posId: 'web-dashboard',
          }),
        })
      ));
      setAllProducts((prev) => {
        const next = prev.filter((p) => !deleteIds.includes(p.productId));
        writeCache({ products: next });
        return next;
      });
      setSelectedIds(new Set());
      setDeleteModalOpen(false);
    } catch (e) {
      console.error('Delete products error:', e);
      setError('Failed to delete products');
    } finally {
      setIsDeleting(false);
      setDeleteIds([]);
    }
  }, [apiFetch, businessId, selectedBranchId, staffId, activeStaff, userProfile, deleteIds, guardAction, writeCache]);

  const handleToggleSelect = useCallback((id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === visibleProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleProducts.map(p => p.productId)));
    }
  }, [selectedIds.size, visibleProducts]);

  const handleCancelSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleProductClick = useCallback((productId) => {
    if (isSelectionMode) return;
    if (!guardAction('inventory_mgmt')) return;
    navigate(`/inventory/products/${productId}/edit`, { state: { branchId: selectedBranchId } });
  }, [navigate, selectedBranchId, isSelectionMode, guardAction]);

  const handleExportCsv = useCallback(() => {
    if (isExporting || !filteredProducts.length) return;
    if (!guardAction('inventory_mgmt')) return;
    setIsExporting(true);
    try {
      const branchTag = selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadProductsForReimport(filteredProducts, branchTag);
    } finally {
      setIsExporting(false);
    }
  }, [filteredProducts, selectedBranchName, isExporting, guardAction]);

  const handleExportPdf = useCallback(() => {
    if (isExporting || !filteredProducts.length) return;
    if (!guardAction('inventory_mgmt')) return;
    setIsExporting(true);

    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(16);
      doc.setTextColor('#0F172A');
      doc.text(`Products - ${selectedBranchName}`, pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor('#64748B');
      doc.text(`Generated: ${new Date().toLocaleString()} | ${baseCurrency?.code || 'USD'}`, pageWidth / 2, 22, { align: 'center' });

      const tableData = filteredProducts.map((p) => [
        p.name || '',
        p.sku || '',
        p.category || '',
        p.status === 'active' ? 'Active' : 'Inactive',
        getStockStatus(p).replace('_', ' ').toUpperCase(),
        canViewStock ? (p.trackInventory ? String(p.currentStock || 0) : '—') : '🔒 Restricted',
        formatMoney(p.sellingPrice || 0, baseCurrency),
        formatMoney(p.costPrice || 0, baseCurrency),
      ]);

      autoTable(doc, {
        head: [['Name', 'SKU', 'Category', 'Status', 'Stock Level', 'Stock', 'Price', 'Cost']],
        body: tableData,
        startY: 30,
        theme: 'striped',
        headStyles: {
          fillColor: '#F1F5F9',
          textColor: '#0F172A',
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 7,
          textColor: '#1E293B',
        },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 25 },
          2: { cellWidth: 25 },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 25, halign: 'center' },
          5: { cellWidth: 20, halign: 'center' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 22, halign: 'right' },
        },
        margin: { left: 10, right: 10 },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 4) {
            const status = data.cell.raw;
            if (status === 'IN STOCK') {
              data.cell.styles.textColor = '#16A34A';
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'LOW STOCK') {
              data.cell.styles.textColor = '#D97706';
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'OUT OF STOCK') {
              data.cell.styles.textColor = '#EF4444';
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: function(data) {
          doc.setFontSize(8);
          doc.setTextColor('#94A3B8');
          const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
          const totalPages = doc.internal.getNumberOfPages();
          doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 15, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
        },
      });

      doc.save(`products_${selectedBranchName.toLowerCase().replace(/\s+/g, '-')}_${toApiDate(new Date())}.pdf`);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [filteredProducts, selectedBranchName, baseCurrency, isExporting, canViewStock, guardAction]);

  const handleDownloadTemplate = useCallback(() => {
    if (!guardAction('inventory_mgmt')) return;
    downloadProductTemplate();
  }, [guardAction]);

  const showStockColumn = canViewStock;
  const showLoadingBar = loading || refreshing;

  const MobileProductItem = ({ product, isSelected, onToggleSelect, onPress, onDelete, }) => {
    const stockStatus = getStockStatus(product);
    const statusStyle = getStockBadge(stockStatus);
    const isActive = product.status === 'active';
    const stock = product.currentStock || 0;
    const unit = product.unit || 'each';
    
    const stockDisplayText = product.trackInventory 
      ? `${stock} ${unit !== 'each' ? unit : 'unit'}${stock !== 1 ? 's' : ''} in stock`
      : 'Not tracked';
    
    const priceDisplayText = formatMoney(product.sellingPrice || 0, baseCurrency);

    return (
      <div
        className="product-item"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '1px solid #F1F5F9',
          backgroundColor: isSelected ? '#EFF6FF' : '#fff',
          minHeight: '72px',
          gap: '10px',
          cursor: isSelectionMode ? 'default' : 'pointer',
          opacity: !isActive ? 0.6 : 1,
        }}
        onClick={() => onPress(product.productId)}
      >
        <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={(e) => onToggleSelect(product.productId, e)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          >
            {isSelected ? (
              <CheckSquare size={18} color="#0891B2" />
            ) : (
              <Square size={18} color="#94A3B8" />
            )}
          </button>
        </div>

        <div
          className="product-item-image"
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            overflow: 'hidden',
            backgroundColor: '#F8FAFC',
            borderWidth: 1,
            borderColor: '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <ImageIcon size={24} color="#CBD5E1" />
          )}
        </div>
        {laybyeProductIds.has(product.productId) && (
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 12,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: '#D97706',
            border: '1.5px solid #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Package size={9} color="#fff" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              className="product-item-name"
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: !isActive ? '#94A3B8' : '#0F172A',
                flex: 1,
              }}
            >
              {product.name || 'Unknown'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{ fontSize: 11, color: '#64748B', fontWeight: '500' }}>
              {stockDisplayText}
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: '700',
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
              }}
            >
              {statusStyle.label}
            </span>
            {!isActive && (
              <span style={{ fontSize: 10, color: '#94A3B8' }}>Inactive</span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 65 }}>
          <span
            className="product-item-price"
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: !isActive ? '#94A3B8' : '#1E293B',
            }}
          >
            {priceDisplayText}
          </span>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 12,
            height: 12,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            backgroundColor: statusStyle.indicator,
            borderWidth: 1.5,
            borderColor: '#fff',
          }}
        />

        {isSelectionMode && isSelected && (
          <button
            onClick={(e) => onDelete([product.productId], e)}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 4,
              marginLeft: 4,
            }}
          >
            <Trash2 size={15} color="#EF4444" />
          </button>
        )}
      </div>
    );
  };

  const renderLoadingMoreFooter = () => {
    if (!isLoadingMoreProducts) return null;
    return (
      <div style={{ padding: '10px 16px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>Loading more products…</span>
      </div>
    );
  };

  if (!isMobile) {
    return (
      <>
        <LoadingBar visible={showLoadingBar} />
        <div className="reports-page products-container">
          <div className="reports-header products-header">
            <div className="reports-header-left products-header-left">
              <button className="reports-header-back" onClick={() => navigate('/')}>
                <ChevronLeft size={18} />
              </button>
              <div>
                <div className="reports-header-title">Products</div>
                <div className="reports-header-sub">Manage your product catalog and stock levels</div>
              </div>
            </div>
            <div className="reports-header-right products-header-right">
              <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
                <Store size={14} /> <span>{selectedBranchName}</span>
              </button>

              <Button variant="secondary" size="sm" icon={FileDown} onClick={handleDownloadTemplate}>
                Template
              </Button>
              
              {hasBackofficePermission(P.ADVANCED_INVENTORY) && (
                <Button variant="secondary" size="sm" icon={Upload} 
                onClick={() => {
                  if (!guardAction('inventory_mgmt')) return;
                  navigate('/inventory/import-stock', { state: { branchId: selectedBranchId } });
                }}>
                  Import Stock
                </Button>
              )}
              
              <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={isExporting || !filteredProducts.length}>
                PDF
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !filteredProducts.length}>
                CSV
              </Button>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => fetchProducts(true)} disabled={refreshing}>
                Refresh
              </Button>
              <button
                onClick={() => {
                  if (!guardAction('inventory_mgmt')) return;
                  navigate('/inventory/products/new', { state: { branchId: selectedBranchId } });
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                <Plus size={15} /> New Product
              </button>
            </div>
          </div>

          <div className="reports-toolbar products-toolbar" style={{ marginTop: 16 }}>
            <div className="reports-search products-search">
              <Search size={14} />
              <input placeholder="Search by name, SKU or barcode" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
            </div>

            <InlineLoadProgress loading={loading} loadingMore={isLoadingMoreProducts} loadedCount={allProducts.length} />

            <div style={{ position: 'relative' }}>
              <button className="reports-filter-btn" onClick={() => setStatusPopup(!statusPopup)}>
                <Filter size={13} /> {STOCK_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}
              </button>
              {statusPopup && (
                <div className="reports-filter-popover">
                  {STOCK_STATUS_OPTIONS.map((opt) => (
                    <button key={opt.value} className={`reports-filter-option ${statusFilter === opt.value ? 'is-active' : ''}`}
                      onClick={() => { setStatusFilter(opt.value); setStatusPopup(false); }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="reports-filter-btn" onClick={() => setCategoryPopup(!categoryPopup)}>
                {categoryFilter}
              </button>
              {categoryPopup && (
                <div className="reports-filter-popover">
                  <button className={`reports-filter-option ${categoryFilter === 'All' ? 'is-active' : ''}`} onClick={() => { setCategoryFilter('All'); setCategoryPopup(false); }}>All</button>
                  {categories.map((c) => (
                    <button key={c.categoryId} className={`reports-filter-option ${categoryFilter === c.name ? 'is-active' : ''}`}
                      onClick={() => { setCategoryFilter(c.name); setCategoryPopup(false); }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isSelectionMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{selectedIds.size} selected</span>
                <button onClick={handleCancelSelection} style={{ padding: '4px 12px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                  Cancel
                </button>
                <button onClick={() => openDeleteModal([...selectedIds])} style={{ padding: '4px 12px', border: '1px solid #FEE2E2', borderRadius: 6, background: '#FEF2F2', color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>
                  Delete
                </button>
              </div>
            )}
          </div>

          <div className="reports-list-card" style={{ overflowX: 'auto' }}>
            {error ? (
              <div className="reports-empty">
                <AlertTriangle size={32} color="#ef4444" />
                <div className="reports-empty-title">{error}</div>
                <button onClick={() => fetchProducts()} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Retry</button>
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="reports-empty">
                <Package size={32} />
                <div className="reports-empty-title">No products found</div>
                <div className="reports-empty-sub">Try a different search or filter, or add your first product</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', width: 40 }}>
                      <button onClick={handleSelectAll} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                        {selectedIds.size === visibleProducts.length && visibleProducts.length > 0 ? 
                          <CheckSquare size={18} color="#0891B2" /> : 
                          <Square size={18} color="#94A3B8" />
                        }
                      </button>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Product</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>SKU</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Status</th>
                    {showStockColumn && (
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Stock</th>
                    )}
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Price</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Cost</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', width: 50 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => {
                    const stockStatus = getStockStatus(p);
                    const stockBadge = getStockBadge(stockStatus);
                    const isSelected = selectedIds.has(p.productId);
                    return (
                      <tr 
                        key={p.productId} 
                        style={{ 
                          borderBottom: '1px solid #F1F5F9', 
                          background: isSelected ? '#EFF6FF' : '#fff',
                          cursor: isSelectionMode ? 'default' : 'pointer',
                        }}
                        onClick={() => handleProductClick(p.productId)}
                      >
                        <td style={{ padding: '10px 12px' }}>
                          <button onClick={(e) => handleToggleSelect(p.productId, e)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                            {isSelected ? <CheckSquare size={18} color="#0891B2" /> : <Square size={18} color="#94A3B8" />}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#F1F5F9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={14} color="#CBD5E1" />}
                            </div>
                            <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{p.name}</div>
  {laybyeProductIds.has(p.productId) && (
    <span style={{ fontSize: 9, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: 4 }}>
      On Laybye
    </span>
  )}
</div>
{p.status !== 'active' && <div style={{ fontSize: 10, color: '#94A3B8' }}>Inactive</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{p.sku || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{p.category || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span className="reports-list-item-badge" style={{ background: stockBadge.bg, color: stockBadge.color }}>
                            {stockBadge.label}
                          </span>
                        </td>
                        {showStockColumn && (
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: '#475569' }}>
                            {p.trackInventory ? p.currentStock || 0 : '—'}
                          </td>
                        )}
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                          {formatMoney(p.sellingPrice || 0, baseCurrency)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: '#475569' }}>
                          {formatMoney(p.costPrice || 0, baseCurrency)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button 
                            onClick={(e) => {
                              if (!guardAction('inventory_mgmt')) return;
                              openDeleteModal([p.productId], e);
                            }}
                            style={{ 
                              border: 'none', 
                              background: 'none', 
                              cursor: 'pointer', 
                              padding: 4,
                              opacity: isSelectionMode ? 0.5 : 1,
                            }}
                            disabled={isSelectionMode}
                          >
                            <Trash2 size={15} color="#EF4444" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {visibleProducts.length < filteredProducts.length && (
              <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                  Load more ({filteredProducts.length - visibleProducts.length} remaining)
                </button>
              </div>
            )}
            {renderLoadingMoreFooter()}
          </div>

          <ConfirmDeleteModal
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            onConfirm={handleConfirmDelete}
            title={`Delete ${deleteIds.length > 1 ? 'Products' : 'Product'}`}
            message={`Are you sure you want to delete ${deleteIds.length > 1 ? `these ${deleteIds.length} products` : 'this product'}? This action cannot be undone.`}
            confirmText={deleteIds.length > 1 ? `Delete ${deleteIds.length} Products` : 'Delete Product'}
            isDeleting={isDeleting}
            count={deleteIds.length}
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
        </div>

        {gateModalModuleId && (
          <ModuleSubscriptionModal
            moduleId={gateModalModuleId}
            moduleState={getModuleState(gateModalModuleId)}
            onClose={closeGateModal}
          />
        )}
      </>
    );
  }

  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page products-container products-mobile-list">
        <div className="reports-header products-header">
          <div className="reports-header-left products-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}>
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="reports-header-title">Products</div>
              <div className="reports-header-sub">Manage your product catalog</div>
            </div>
          </div>
          <div className="reports-header-right products-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 12px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="reports-search products-search" style={{ flex: 1, minWidth: 120 }}>
              <Search size={14} />
              <input placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
            </div>
            <InlineLoadProgress loading={loading} loadingMore={isLoadingMoreProducts} loadedCount={allProducts.length} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button 
              onClick={() => {
                if (!guardAction('inventory_mgmt')) return;
                navigate('/inventory/products/new', { state: { branchId: selectedBranchId } });
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
            >
              <Plus size={14} /> New Product
            </button>
            <button 
              onClick={handleExportCsv} 
              disabled={isExporting || !filteredProducts.length}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: isExporting || !filteredProducts.length ? 0.5 : 1 }}
            >
              <Download size={14} /> Export
            </button>
            <button 
              onClick={() => fetchProducts(true)} 
              disabled={refreshing}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                padding: '6px 14px', 
                borderRadius: 8, 
                border: '1px solid #E2E8F0', 
                background: refreshing ? '#F1F5F9' : '#F8FAFC', 
                color: refreshing ? '#94A3B8' : '#475569', 
                fontWeight: 600, 
                fontSize: 12, 
                cursor: refreshing ? 'default' : 'pointer',
              }}
            >
              {refreshing ? (
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
              ) : (
                <RefreshCw size={14} />
              )}
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {hasBackofficePermission(P.ADVANCED_INVENTORY) && (
              <Button
                variant="secondary" size="sm" icon={Upload}
                onClick={() => {
                  if (!guardAction('inventory_mgmt')) return;
                  navigate('/inventory/import-stock', { state: { branchId: selectedBranchId } });
                }}
              >
                Import Stock
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <button className="reports-filter-btn" onClick={() => setStatusPopup(!statusPopup)} style={{ fontSize: 12 }}>
                <Filter size={13} /> {STOCK_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}
              </button>
              {statusPopup && (
                <div className="reports-filter-popover" style={{ maxWidth: 180 }}>
                  {STOCK_STATUS_OPTIONS.map((opt) => (
                    <button key={opt.value} className={`reports-filter-option ${statusFilter === opt.value ? 'is-active' : ''}`}
                      onClick={() => { setStatusFilter(opt.value); setStatusPopup(false); }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="reports-filter-btn" onClick={() => setCategoryPopup(!categoryPopup)} style={{ fontSize: 12 }}>
                {categoryFilter}
              </button>
              {categoryPopup && (
                <div className="reports-filter-popover" style={{ maxWidth: 180 }}>
                  <button className={`reports-filter-option ${categoryFilter === 'All' ? 'is-active' : ''}`} onClick={() => { setCategoryFilter('All'); setCategoryPopup(false); }}>All</button>
                  {categories.map((c) => (
                    <button key={c.categoryId} className={`reports-filter-option ${categoryFilter === c.name ? 'is-active' : ''}`}
                      onClick={() => { setCategoryFilter(c.name); setCategoryPopup(false); }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="reports-list-card" style={{ padding: 0, overflow: 'hidden' }}>
          {error ? (
            <div className="reports-empty">
              <AlertTriangle size={32} color="#ef4444" />
              <div className="reports-empty-title">{error}</div>
              <button onClick={() => fetchProducts()} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Retry</button>
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="reports-empty">
              <Package size={32} />
              <div className="reports-empty-title">No products found</div>
              <div className="reports-empty-sub">Try a different search or add your first product</div>
            </div>
          ) : (
            <>
              {visibleProducts.map((p) => (
                <MobileProductItem
                  key={p.productId}
                  product={p}
                  isSelected={selectedIds.has(p.productId)}
                  onToggleSelect={handleToggleSelect}
                  onPress={handleProductClick}
                  onDelete={openDeleteModal}
                />
              ))}
              {visibleProducts.length < filteredProducts.length && (
                <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                    Load more ({filteredProducts.length - visibleProducts.length} remaining)
                  </button>
                </div>
              )}
              {renderLoadingMoreFooter()}
            </>
          )}
        </div>

        {gateModalModuleId && (
          <ModuleSubscriptionModal
            moduleId={gateModalModuleId}
            moduleState={getModuleState(gateModalModuleId)}
            onClose={closeGateModal}
          />
        )}

        <ConfirmDeleteModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title={`Delete ${deleteIds.length > 1 ? 'Products' : 'Product'}`}
          message={`Are you sure you want to delete ${deleteIds.length > 1 ? `these ${deleteIds.length} products` : 'this product'}? This action cannot be undone.`}
          confirmText={deleteIds.length > 1 ? `Delete ${deleteIds.length} Products` : 'Delete Product'}
          isDeleting={isDeleting}
          count={deleteIds.length}
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
      </div>
    </>
  );
}