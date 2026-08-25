// src/pages/TopSellingItems.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  Store, 
  Download, 
  FileText, 
  Package, 
  DollarSign, 
  X,
  Lock,
  Search
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, formatNumber, downloadCsv, toApiDate } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import '../styles/ReportsShared.css';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
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
      `}</style>
    </div>
  );
}

const SORT_OPTIONS = [
  { id: 'sales', label: 'Sales ($)', icon: DollarSign },
  { id: 'qty', label: 'Quantity', icon: Package },
];

export default function TopSellingItems() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, hasBackofficePermission } = useAppContext();
  
  // ✅ Check permission
  const canViewReports = hasBackofficePermission(BACKOFFICE_PERMISSIONS.VIEW_SALES_REPORTS);
  
  const {
    startDate,
    endDate,
    selectedOption,
    handleOptionSelect,
    navigateDate,
    reload: reloadDateRange,
    loadFromStorage,
  } = useDateRange('today');

  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [topItems, setTopItems] = useState([]);
  const [stats, setStats] = useState({ totalProducts: 0, totalQty: 0, totalSales: 0, totalProfit: 0 });
  const [sortBy, setSortBy] = useState('sales');
  const [visibleCount, setVisibleCount] = useState(15);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  // ✅ NEW — search box state for filtering items by name/SKU
  const [itemSearch, setItemSearch] = useState('');

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const fetchTopItems = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('startDate', toApiDate(startDate));
      params.append('endDate', toApiDate(endDate));
      params.append('limit', '1000');
      if (selectedBranchId !== 'all') params.append('branchId', selectedBranchId);

      const data = await apiFetch(`/business/${businessId}/reports/top-items?${params.toString()}`);
      const items = data.items || [];
      setTopItems(items);

      const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
      const totalSales = items.reduce((sum, item) => sum + (item.revenue || 0), 0);
      const totalProfit = items.reduce((sum, item) => sum + (item.profit || 0), 0);
      setStats({
        totalProducts: items.length,
        totalQty,
        totalSales,
        totalProfit,
      });
    } catch (e) {
      console.error('Fetch top items error:', e);
      setError('Failed to load top selling items');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, apiFetch, startDate, endDate, selectedBranchId]);

  // ─── Reload persisted date range on focus ────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reloadDateRange();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadDateRange]);

  // ─── Reload persisted date range on browser back/forward ────────────────
  useEffect(() => {
    const handlePopState = () => {
      reloadDateRange();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [reloadDateRange]);

  // ─── Single source of truth for fetching ─────────────────────────────────
  useEffect(() => {
    if (businessId) {
      fetchTopItems();
    }
  }, [businessId, startDate, endDate, selectedBranchId, fetchTopItems]);

  const sortedItems = useMemo(() => {
    const copy = [...topItems];
    if (sortBy === 'sales') copy.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    else copy.sort((a, b) => (b.qty || 0) - (a.qty || 0));
    return copy;
  }, [topItems, sortBy]);

  // ✅ NEW — filters the sorted list by item name or SKU. Runs after
  // sorting so rank numbers stay meaningful, before the visibleCount slice
  // so "Load more" and the count label reflect the filtered results.
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return sortedItems;
    const q = itemSearch.trim().toLowerCase();
    return sortedItems.filter((item) =>
      item.name?.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q)
    );
  }, [sortedItems, itemSearch]);

  // ✅ NEW — reset how many rows are shown whenever the search term changes,
  // so a new search always starts from the top instead of showing a
  // truncated view left over from the previous filter/search.
  useEffect(() => {
    setVisibleCount(15);
  }, [itemSearch]);

  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + 15, filteredItems.length));
  }, [filteredItems.length]);

  const handleExportCsv = useCallback(async () => {
    if (isExporting || !topItems.length) return;
    setIsExporting(true);
    try {
      // ✅ Profit column added, mirrors the row now showing profit per item
      const header = ['Rank', 'Item', 'SKU', 'Quantity Sold', 'Revenue', 'Profit'];
      const rows = sortedItems.map((item, index) => [
        index + 1,
        item.name,
        item.sku || '',
        item.qty,
        (item.revenue || 0).toFixed(2),
        (item.profit || 0).toFixed(2),
      ]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      const filename = `top-selling-items_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`;
      downloadCsv(filename, [header, ...rows]);
    } catch (e) {
      console.error('CSV export error:', e);
    } finally {
      setIsExporting(false);
    }
  }, [sortedItems, topItems, selectedBranchId, selectedBranchName, startDate, endDate, isExporting]);

  // ─── PDF EXPORT ───────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !topItems.length) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });

      doc.setFontSize(14);
      doc.text('Top Selling Items', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      const branchLabel = selectedBranchId === 'all' ? 'All Stores' : selectedBranchName;
      doc.text(`${branchLabel} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      // ✅ Profit column added
      const tableHead = [['Rank', 'Item', 'SKU', 'Quantity Sold', 'Revenue', 'Profit']];
      const tableBody = sortedItems.map((item, index) => [
        index + 1,
        item.name,
        item.sku || '',
        item.qty,
        formatMoney(item.revenue, baseCurrency),
        formatMoney(item.profit, baseCurrency),
      ]);

      autoTable(doc, {
        startY: 58,
        head: tableHead,
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      // Summary section
      const finalY = doc.lastAutoTable.finalY + 20;
      doc.setFontSize(10);
      doc.setTextColor(20, 24, 30);
      doc.text(`Total Products: ${stats.totalProducts}`, 32, finalY);
      doc.text(`Total Units Sold: ${stats.totalQty}`, 32, finalY + 16);
      doc.text(`Total Revenue: ${formatMoney(stats.totalSales, baseCurrency)}`, 32, finalY + 32);
      doc.text(`Est. Profit: ${formatMoney(stats.totalProfit, baseCurrency)}`, 32, finalY + 48);

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`top-selling-items_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [sortedItems, topItems, stats, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf]);

  const renderStoreModal = () => {
    if (!storeModalOpen) return null;
    return (
      <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
        <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
          <div className="reports-modal-header">
            <span className="reports-modal-title">Select Store</span>
            <button className="reports-modal-close" onClick={() => setStoreModalOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="reports-modal-body" style={{ padding: '8px 4px' }}>
            {branchOptions.map((opt) => (
              <button
                key={opt.value}
                className={`reports-filter-option ${selectedBranchId === opt.value ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedBranchId(opt.value);
                  setStoreModalOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ✅ Access Denied
  if (!canViewReports) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view top selling items.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ─── Show loading bar instead of full screen spinner ──────────────────
  const showLoadingBar = loading || refreshing || isExporting || exportingPdf;

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
              <div className="reports-header-title">Top Selling Items</div>
              <div className="reports-header-sub">Best performing products by revenue</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} />
              <span>{selectedBranchName}</span>
            </button>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !topItems.length}>
              {isExporting ? 'Exporting...' : 'CSV'}
            </Button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !topItems.length} loading={exportingPdf}>
              PDF
            </Button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <DateRangeNav
            startDate={startDate}
            endDate={endDate}
            selectedOption={selectedOption}
            onNavigate={navigateDate}
            onOptionSelect={handleOptionSelect}
          />
        </div>

        <div className="reports-stats-row">
          <div className="reports-stat-card">
            <span className="reports-stat-label">Products</span>
            <span className="reports-stat-value">{stats.totalProducts}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Units Sold</span>
            <span className="reports-stat-value">{Number.isInteger(stats.totalQty) ? stats.totalQty : stats.totalQty.toFixed(1)}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Revenue</span>
            <span className="reports-stat-value">{formatMoney(stats.totalSales, baseCurrency)}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Est. Profit</span>
            <span className="reports-stat-value">{formatMoney(stats.totalProfit, baseCurrency)}</span>
          </div>
        </div>

        {/* ✅ NEW — search box to filter the item list below by name/SKU */}
        <div className="reports-search" style={{ marginBottom: 12 }}>
          <Search size={14} />
          <input
            placeholder="Search items by name or SKU..."
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
          />
          {itemSearch && (
            <button
              onClick={() => setItemSearch('')}
              aria-label="Clear search"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8b97a7', display: 'flex', alignItems: 'center', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#8b97a7', fontWeight: 500 }}>Sort by</span>
          <div style={{ display: 'flex', gap: 4, background: '#f0f2f5', borderRadius: 6, padding: 2 }}>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`reports-filter-option ${sortBy === opt.id ? 'is-active' : ''}`}
                onClick={() => setSortBy(opt.id)}
                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto' }}
              >
                <opt.icon size={12} style={{ marginRight: 4 }} />
                {opt.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#8b97a7', marginLeft: 'auto' }}>
            {visibleItems.length} of {filteredItems.length} items
          </span>
        </div>

        <div className="reports-list-card">
          {error ? (
            <div className="reports-empty">
              <span style={{ color: '#ef4444' }}>⚠️</span>
              <div className="reports-empty-title">{error}</div>
              <button onClick={() => fetchTopItems()} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="reports-empty">
              <Package size={32} />
              <div className="reports-empty-title">{itemSearch ? 'No matching items' : 'No items found'}</div>
              <div className="reports-empty-sub">{itemSearch ? 'Try a different search term' : 'Try a different date range or store'}</div>
            </div>
          ) : (
            <>
              {visibleItems.map((item, index) => (
                <div key={item.productId} className="reports-list-item">
                  <div style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#8b97a7' }}>
                    {index + 1}
                  </div>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={14} color="#b0b8c4" />
                    </div>
                  )}
                  <div className="reports-list-item-info">
                    <div className="reports-list-item-title">{item.name}</div>
                    <div className="reports-list-item-sub">
                      <span>SKU: {item.sku || '—'}</span>
                      <span>Qty: {item.qty}</span>
                    </div>
                  </div>
                  <div className="reports-list-item-right">
                    <div className="reports-list-item-amount">{formatMoney(item.revenue, baseCurrency)}</div>
                    {/* ✅ NEW — profit per item, shown under revenue like the mobile row */}
                    <div style={{ fontSize: 11, color: '#4CAF50', marginTop: 2, textAlign: 'right' }}>
                      {formatMoney(item.profit || 0, baseCurrency)} profit
                    </div>
                  </div>
                </div>
              ))}
              {visibleItems.length < filteredItems.length && (
                <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    onClick={handleLoadMore}
                    style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {renderStoreModal()}
      </div>
    </>
  );
}