// src/pages/Inventory/Products.jsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store, Search, X, Package, Plus, Filter, Trash2, Edit2,
  AlertTriangle, Download, FileText, RefreshCw, Upload,
  CheckSquare, Square, ChevronLeft, FileDown, Lock,
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

const STOCK_STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'active_status', label: 'Active Products' },
  { value: 'inactive_status', label: 'Inactive Products' },
];

const PAGE_SIZE = 20;

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
    in_stock: { label: 'In Stock', bg: '#DCFCE7', color: '#16A34A' },
    low_stock: { label: 'Low Stock', bg: '#FEF3C7', color: '#0891B2' },
    out_of_stock: { label: 'Out of Stock', bg: '#FEE2E2', color: '#EF4444' },
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
      `}</style>
    </div>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, activeStaff, userProfile, hasBackofficePermission } = useAppContext();

  // ✅ Check permissions
  const canManageItems = hasBackofficePermission(P.MANAGE_ITEMS);
  const canViewStock = hasBackofficePermission(P.VIEW_STOCK);

  // ✅ If no permission to manage items, show access denied
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

  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsTablet(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);

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

  useEffect(() => {
    if (!selectedBranchId && branches?.length) {
      setSelectedBranchId(branches[0].branchId);
    }
  }, [branches, selectedBranchId]);

  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  const fetchProducts = useCallback(async (isRefresh = false) => {
    if (!businessId || !selectedBranchId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products?status=all`),
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`),
      ]);
      setAllProducts(Array.isArray(productsRes) ? productsRes : []);
      setCategories(Array.isArray(categoriesRes) ? categoriesRes : []);
    } catch (e) {
      console.error('Fetch products error:', e);
      setError('Failed to load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, selectedBranchId, apiFetch]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
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
    setDeleteIds(Array.isArray(ids) ? ids : [ids]);
    setDeleteModalOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
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
      setSelectedIds(new Set());
      setDeleteModalOpen(false);
      await fetchProducts();
    } catch (e) {
      console.error('Delete products error:', e);
      setError('Failed to delete products');
    } finally {
      setIsDeleting(false);
      setDeleteIds([]);
    }
  }, [apiFetch, businessId, selectedBranchId, staffId, activeStaff, userProfile, fetchProducts, deleteIds]);

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
    navigate(`/inventory/products/${productId}/edit`, { state: { branchId: selectedBranchId } });
  }, [navigate, selectedBranchId, isSelectionMode]);

  const handleExportCsv = useCallback(() => {
    if (isExporting || !filteredProducts.length) return;
    setIsExporting(true);
    try {
      const branchTag = selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadProductsForReimport(filteredProducts, branchTag);
    } finally {
      setIsExporting(false);
    }
  }, [filteredProducts, selectedBranchName, isExporting]);

  const handleExportPdf = useCallback(() => {
    if (isExporting || !filteredProducts.length) return;
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
        // ✅ Only show stock if user has view_stock permission
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
              data.cell.styles.textColor = '#0891B2';
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
  }, [filteredProducts, selectedBranchName, baseCurrency, isExporting, canViewStock]);

  // ✅ Determine if stock column should be hidden
  const showStockColumn = canViewStock;

  // ─── Show loading bar instead of full screen spinner ──────────────────
  const showLoadingBar = loading || refreshing;

  // Desktop/Tablet Table View
  if (isTablet) {
    return (
      <>
        <LoadingBar visible={showLoadingBar} />
        <div className="reports-page">
          <div className="reports-header">
            <div className="reports-header-left">
              <button className="reports-header-back" onClick={() => navigate('/')}>
                <ChevronLeft size={18} />
              </button>
              <div>
                <div className="reports-header-title">Products</div>
                <div className="reports-header-sub">Manage your product catalog and stock levels</div>
              </div>
            </div>
            <div className="reports-header-right">
              <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
                <Store size={14} /> <span>{selectedBranchName}</span>
              </button>

              <Button variant="secondary" size="sm" icon={FileDown} onClick={downloadProductTemplate}>
                Template
              </Button>
              
              {/* ✅ Only show Import Stock if user has advanced inventory permission */}
              {hasBackofficePermission(P.ADVANCED_INVENTORY) && (
                <Button variant="secondary" size="sm" icon={Upload} onClick={() => navigate('/inventory/import-stock', { state: { branchId: selectedBranchId } })}>
                  Import Stock
                </Button>
              )}
              
              <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={isExporting || !filteredProducts.length}>
                PDF
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !filteredProducts.length}>
                CSV
              </Button>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => fetchProducts(true)} loading={refreshing}>
                Refresh
              </Button>
              <button
                onClick={() => navigate('/inventory/products/new', { state: { branchId: selectedBranchId } })}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                <Plus size={15} /> New Product
              </button>
            </div>
          </div>

          <div className="reports-toolbar" style={{ marginTop: 16 }}>
            <div className="reports-search">
              <Search size={14} />
              <input placeholder="Search by name, SKU or barcode" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
            </div>
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
                    {/* ✅ Only show Stock column if user has view_stock permission */}
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
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{p.name}</div>
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
                        {/* ✅ Only show stock if user has view_stock permission */}
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
                            onClick={(e) => openDeleteModal([p.productId], e)}
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
      </>
    );
  }

  // Mobile List View - same permissions applied
  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}>
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="reports-header-title">Products</div>
              <div className="reports-header-sub">Manage your product catalog</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
          </div>
        </div>

        <div className="reports-toolbar" style={{ marginTop: 16 }}>
          <div className="reports-search">
            <Search size={14} />
            <input placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/inventory/products/new', { state: { branchId: selectedBranchId } })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            <Plus size={14} /> New Product
          </button>
          {/* ✅ Only show Import Stock if user has advanced inventory permission */}
          {hasBackofficePermission(P.ADVANCED_INVENTORY) && (
            <button onClick={() => navigate('/inventory/import-stock', { state: { branchId: selectedBranchId } })}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              <Upload size={14} /> Import Stock
            </button>
          )}
          <button onClick={handleExportCsv} disabled={isExporting || !filteredProducts.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            <Download size={14} /> Export
          </button>
        </div>

        <div className="reports-list-card">
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
              {visibleProducts.map((p) => {
                const stockStatus = getStockStatus(p);
                const stockBadge = getStockBadge(stockStatus);
                const isSelected = selectedIds.has(p.productId);
                return (
                  <div 
                    key={p.productId} 
                    className="reports-list-item" 
                    style={{ 
                      background: isSelected ? '#EFF6FF' : '#fff',
                      cursor: isSelectionMode ? 'default' : 'pointer',
                    }}
                    onClick={() => handleProductClick(p.productId)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <button onClick={(e) => handleToggleSelect(p.productId, e)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                        {isSelected ? <CheckSquare size={18} color="#0891B2" /> : <Square size={18} color="#94A3B8" />}
                      </button>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F1F5F9', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={18} color="#CBD5E1" />}
                      </div>
                      <div className="reports-list-item-info">
                        <div className="reports-list-item-title">
                          {p.name} {p.status !== 'active' && <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', marginLeft: 6 }}>(Inactive)</span>}
                        </div>
                        <div className="reports-list-item-sub">
                          <span>SKU: {p.sku}</span>
                          <span>{p.category}</span>
                          <span className="reports-list-item-badge" style={{ background: stockBadge.bg, color: stockBadge.color }}>{stockBadge.label}</span>
                          {/* ✅ Only show stock if user has view_stock permission */}
                          {showStockColumn && (
                            <span>{p.trackInventory ? `${p.currentStock ?? 0} in stock` : 'Not tracked'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="reports-list-item-right">
                      <div className="reports-list-item-amount">{formatMoney(p.sellingPrice || 0, baseCurrency)}</div>
                    </div>
                    <button 
                      onClick={(e) => openDeleteModal([p.productId], e)}
                      style={{ 
                        border: 'none', 
                        background: 'none', 
                        cursor: 'pointer', 
                        padding: 8,
                        opacity: isSelectionMode ? 0.5 : 1,
                      }}
                      disabled={isSelectionMode}
                    >
                      <Trash2 size={15} color="#EF4444" />
                    </button>
                  </div>
                );
              })}
              {visibleProducts.length < filteredProducts.length && (
                <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                    Load more ({filteredProducts.length - visibleProducts.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
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
    </>
  );
}