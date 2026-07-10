// src/pages/Receipts.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Store, Download, FileText, Search, X, Receipt, RefreshCw, AlertTriangle, Lock } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, formatNumber, downloadCsv, toApiDate } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import '../styles/ReportsShared.css';

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

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'partially_refunded', label: 'Partially Refunded' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'voided', label: 'Voided' },
];

const STATUS_COLORS = {
  completed: { bg: '#dcdffc', color: '#1f16a3' },
  partially_refunded: { bg: '#fef9c3', color: '#0891b2' },
  refunded: { bg: '#fef9c3', color: '#0891b2' },
  voided: { bg: '#fee2e2', color: '#ef4444' },
};

const METHOD_ICONS = {
  cash: { label: 'Cash', bg: '#dcfce7', color: '#16a34a' },
  card: { label: 'Card', bg: '#eff6ff', color: '#0891b2' },
  mobile: { label: 'Mobile Pay', bg: '#f5f3ff', color: '#7c3aed' },
};
const RECEIPT_TYPE_CONFIG = {
  sale: { label: 'Sale', bg: '#E0E7FF', color: '#6366F1' },
  laybye_deposit: { label: 'LAYBYE DEPOSIT', bg: '#effcdc', color: '#6366F1' },
  laybye_payment: { label: 'LAYBYE PAYMENT', bg: '#fcf6dc', color: '#0891b2' },
  laybye_final: { label: 'LAYBYE FINAL PAYMENT', bg: '#fce3dc', color: '#7C3AED' },
};

export default function Receipts() {
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

  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [allReceipts, setAllReceipts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusPopup, setStatusPopup] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const parseReceipt = useCallback((r, branchName) => {
    let totals = {};
    let payments = [];
    let items = [];
    try {
      totals = typeof r.totals === 'string' ? JSON.parse(r.totals) : (r.totals || {});
      payments = typeof r.payments === 'string' ? JSON.parse(r.payments) : (r.payments || []);
      items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    } catch (e) { /* ignore */ }
    const payment = payments[0];
    return {
      ...r,
      id: r.receiptId || r.id,
      store: branchName || r.store || 'Store',
      method: payment?.method || r.method || 'cash',
      total: totals.grandTotal || totals.total || r.total || 0,
      totals,
      payments,
      items,
      customerName: r.customerName || 'Walk-in Customer',
      cashierName: r.cashierName || 'Admin',
      status: r.status || 'completed',
      createdAt: r.createdAt || Date.now(),
      receiptNumber: r.receiptNumber || `REC-${String(r.receiptId || r.id).slice(-6)}`,
      currencySymbol: r.currencySymbol || '$',
    };
  }, []);

  const fetchReceipts = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      params.append('startDate', String(start.getTime()));
      params.append('endDate', String(end.getTime()));
      if (statusFilter !== 'all') params.append('status', statusFilter);

      let allData = [];

      if (selectedBranchId === 'all') {
        const branchesData = await apiFetch(`/business/${businessId}/branches`);
        for (const branch of branchesData) {
          try {
            const response = await apiFetch(`/business/${businessId}/branches/${branch.branchId}/receipts?${params.toString()}`);
            const list = Array.isArray(response.data || response) ? (response.data || response) : [];
            allData = [...allData, ...list.map(r => parseReceipt(r, branch.name))];
          } catch (e) { /* ignore */ }
        }
      } else {
        const response = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/receipts?${params.toString()}`);
        const list = Array.isArray(response.data || response) ? (response.data || response) : [];
        const branchName = branches.find(b => b.branchId === selectedBranchId)?.name || 'Store';
        allData = list.map(r => parseReceipt(r, branchName));
      }

      allData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAllReceipts(allData);
    } catch (e) {
      console.error('Fetch receipts error:', e);
      setError('Failed to load receipts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, apiFetch, startDate, endDate, selectedBranchId, statusFilter, parseReceipt]);

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
      fetchReceipts();
    }
  }, [businessId, startDate, endDate, selectedBranchId, statusFilter, fetchReceipts]);

  const filteredReceipts = useMemo(() => {
    let result = allReceipts;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(r =>
        r.receiptNumber?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.cashierName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allReceipts, searchQuery]);

  const receiptStats = useMemo(() => {
    const total = filteredReceipts.length;
    const totalSales = filteredReceipts.reduce((sum, r) => sum + (r.total || 0), 0);
    const completedCount = filteredReceipts.filter(r => r.status === 'completed').length;
    const refundedCount = filteredReceipts.filter(r => r.status === 'refunded' || r.status === 'partially_refunded').length;
    return { total, totalSales, completedCount, refundedCount };
  }, [filteredReceipts]);

  const visibleReceipts = useMemo(() => filteredReceipts.slice(0, visibleCount), [filteredReceipts, visibleCount]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + 20, filteredReceipts.length));
  }, [filteredReceipts.length]);

  const handleReceiptClick = useCallback((receipt) => {
    setSelectedReceipt(receipt);
    setModalOpen(true);
  }, []);

  const handleExportCsv = useCallback(async () => {
    if (isExporting || !filteredReceipts.length) return;
    setIsExporting(true);
    try {
      const header = ['Receipt #', 'Store', 'Date', 'Customer', 'Cashier', 'Method', 'Status', 'Total'];
      const rows = filteredReceipts.map(r => [
        r.receiptNumber,
        r.store,
        new Date(r.createdAt).toLocaleString(),
        r.customerName,
        r.cashierName,
        r.method || 'cash',
        r.status,
        (r.total || 0).toFixed(2),
      ]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      const filename = `receipts_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`;
      downloadCsv(filename, [header, ...rows]);
    } catch (e) {
      console.error('CSV export error:', e);
    } finally {
      setIsExporting(false);
    }
  }, [filteredReceipts, selectedBranchId, selectedBranchName, startDate, endDate, isExporting]);

  // ─── PDF EXPORT ───────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !filteredReceipts.length) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });

      doc.setFontSize(14);
      doc.text('Receipts Report', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      const branchLabel = selectedBranchId === 'all' ? 'All Stores' : selectedBranchName;
      doc.text(`${branchLabel} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      const tableHead = [['Receipt #', 'Store', 'Date', 'Customer', 'Cashier', 'Method', 'Status', 'Total']];
      const tableBody = filteredReceipts.map(r => [
        r.receiptNumber,
        r.store,
        new Date(r.createdAt).toLocaleString(),
        r.customerName,
        r.cashierName,
        r.method || 'cash',
        r.status || 'completed',
        formatMoney(r.total, baseCurrency),
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
      doc.text(`Total Receipts: ${receiptStats.total}`, 32, finalY);
      doc.text(`Completed: ${receiptStats.completedCount}`, 32, finalY + 16);
      doc.text(`Refunded: ${receiptStats.refundedCount}`, 32, finalY + 32);
      doc.text(`Total Sales: ${formatMoney(receiptStats.totalSales, baseCurrency)}`, 32, finalY + 48);

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`receipts_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [filteredReceipts, receiptStats, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf]);

  const renderStoreModal = () => {
    if (!storeModalOpen) return null;
    return (
      <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
        <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
          <div className="reports-modal-header">
            <span className="reports-modal-title">Select Store</span>
            <button className="reports-modal-close" onClick={() => setStoreModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="reports-modal-body" style={{ padding: '8px 4px' }}>
            {branchOptions.map((opt) => (
              <button
                key={opt.value}
                className={`reports-filter-option ${selectedBranchId === opt.value ? 'is-active' : ''}`}
                onClick={() => { setSelectedBranchId(opt.value); setStoreModalOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderReceiptDetail = () => {
    if (!selectedReceipt) return null;
    const r = selectedReceipt;
    const status = STATUS_COLORS[r.status] || STATUS_COLORS.completed;
    const method = METHOD_ICONS[r.method] || METHOD_ICONS.cash;
    const statusLabel = r.status?.charAt(0).toUpperCase() + r.status?.slice(1) || 'Completed';
    const receiptType = r.receiptType || 'sale';
    const typeConfig = RECEIPT_TYPE_CONFIG[receiptType] || RECEIPT_TYPE_CONFIG.sale;
    const isLaybyeReceipt = ['laybye_deposit', 'laybye_payment', 'laybye_final'].includes(receiptType);
    const isSynced = r.syncStatus === 'synced';
    const sym = r.currencySymbol || '$';

    return (
      <div className="reports-modal" style={{ maxWidth: 480 }}>
        <div className="reports-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="reports-modal-title">{r.receiptNumber}</span>
            <span className={`reports-list-item-badge ${r.status}`} style={{ background: status.bg, color: status.color }}>
              {statusLabel}
            </span>
            <span
              className="reports-list-item-badge"
              style={{ background: isSynced ? '#DCFCE7' : '#FEF3C7', color: isSynced ? '#16A34A' : '#0891B2' }}
            >
              {isSynced ? '✓ Synced' : '☁ Unsynced'}
            </span>
            {isLaybyeReceipt && (
              <span className="reports-list-item-badge" style={{ background: typeConfig.bg, color: typeConfig.color }}>
                {typeConfig.label}
              </span>
            )}
          </div>
          <button className="reports-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
        </div>

        <div className="reports-modal-body">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#5e6f8a', marginBottom: 4 }}>
            <span>{new Date(r.createdAt).toLocaleString()}</span>
            <span>Cashier: {r.cashierName}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#5e6f8a', marginBottom: 12 }}>
            <span>Customer: {r.customerName}</span>
            {r.shiftNumber && <span>Shift #{r.shiftNumber}</span>}
          </div>

          <hr className="reports-modal-divider" />
          <div className="reports-modal-section">
            <div className="reports-modal-section-title">Items ({r.items?.length || 0})</div>
            {r.items?.map((item, i) => {
              const unitPrice = item.unitPrice ?? item.customPrice ?? item.price ?? 0;
              const lineTotal = item.finalSubtotal ?? (unitPrice * (item.qty ?? 1));
              return (
                <div key={item.id ?? i} className="reports-modal-row" style={{ alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    {item.image ? (
                      <img src={item.image} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', background: '#F1F5F9' }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: '#F1F5F9' }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>
                        {item.qty} × {sym}{Number(unitPrice).toFixed(2)}{item.unit && item.unit !== 'each' ? ` / ${item.unit}` : ''}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{sym}{Number(lineTotal).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          <hr className="reports-modal-divider" />

          <div className="reports-modal-row"><span className="reports-modal-row-label">Subtotal</span><span>{sym}{Number(r.totals?.lineTotal ?? r.totals?.subtotal ?? 0).toFixed(2)}</span></div>
          {(r.totals?.totalDiscount || 0) > 0 && (
            <div className="reports-modal-row"><span className="reports-modal-row-label">Discount</span><span style={{ color: '#16a34a' }}>-{sym}{Number(r.totals.totalDiscount).toFixed(2)}</span></div>
          )}
          {(r.totals?.tax || 0) > 0 && (
            <div className="reports-modal-row"><span className="reports-modal-row-label">Tax</span><span>{sym}{Number(r.totals.tax).toFixed(2)}</span></div>
          )}
          <div className="reports-modal-row" style={{ fontWeight: 700, fontSize: 15, borderTop: '1px solid #f0f2f5', paddingTop: 6, marginTop: 4 }}>
            <span>Total</span>
            <span>{sym}{Number(r.totals?.grandTotal ?? r.totals?.total ?? 0).toFixed(2)}</span>
          </div>

          <hr className="reports-modal-divider" />
          <div className="reports-modal-section-title">Payment Method</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: method.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: method.color, fontSize: 14 }}>●</span>
            </div>
            <span style={{ flex: 1, fontSize: 13, color: '#334155', fontWeight: 500 }}>
              {method.label}{r.payments?.[0]?.reference ? `  ···· ${r.payments[0].reference}` : ''}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{sym}{Number(r.payments?.[0]?.amount ?? r.totals?.grandTotal ?? 0).toFixed(2)}</span>
          </div>

          <div className="reports-modal-row"><span className="reports-modal-row-label">Total Paid</span><span>{sym}{Number(r.totals?.paid ?? r.payments?.[0]?.amount ?? 0).toFixed(2)}</span></div>
          <div className="reports-modal-row"><span className="reports-modal-row-label" style={{ color: '#16a34a' }}>Change</span><span style={{ color: '#16a34a' }}>{sym}{Number(r.totals?.change ?? 0).toFixed(2)}</span></div>
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
          <p>You don't have permission to view receipts.</p>
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
            <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Receipts</div>
              <div className="reports-header-sub">View all sales transactions</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !filteredReceipts.length}>
              {isExporting ? 'Exporting...' : 'CSV'}
            </Button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !filteredReceipts.length} loading={exportingPdf}>
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
          <div className="reports-stat-card"><span className="reports-stat-label">Receipts</span><span className="reports-stat-value">{receiptStats.total}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Completed</span><span className="reports-stat-value">{receiptStats.completedCount}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Refunded</span><span className="reports-stat-value">{receiptStats.refundedCount}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Total Sales</span><span className="reports-stat-value">{formatMoney(receiptStats.totalSales, baseCurrency)}</span></div>
        </div>

        <div className="reports-toolbar">
          <div className="reports-search">
            <Search size={14} />
            <input
              placeholder="Search receipt, customer or cashier"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="reports-filter-btn" onClick={() => setStatusPopup(!statusPopup)}>
              {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}
            </button>
            {statusPopup && (
              <div className="reports-filter-popover">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`reports-filter-option ${statusFilter === opt.value ? 'is-active' : ''}`}
                    onClick={() => { setStatusFilter(opt.value); setStatusPopup(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => fetchReceipts(true)} loading={refreshing}>
            Refresh
          </Button>
        </div>

        <div className="reports-list-card">
          {error ? (
            <div className="reports-empty">
              <AlertTriangle size={32} color="#ef4444" />
              <div className="reports-empty-title">{error}</div>
              <button onClick={() => fetchReceipts()} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : visibleReceipts.length === 0 ? (
            <div className="reports-empty">
              <Receipt size={32} />
              <div className="reports-empty-title">No receipts found</div>
              <div className="reports-empty-sub">Try a different date range or filter</div>
            </div>
          ) : (
            <>
              {visibleReceipts.map(r => {
                const status = STATUS_COLORS[r.status] || STATUS_COLORS.completed;
                const method = METHOD_ICONS[r.method] || METHOD_ICONS.cash;
                return (
                  <div key={r.id} className="reports-list-item" onClick={() => handleReceiptClick(r)}>
                    <div className="reports-list-item-info">
                      <div className="reports-list-item-title">{r.receiptNumber}</div>
                      <div className="reports-list-item-sub">
                        <span>{r.store}</span>
                        <span>{new Date(r.createdAt).toLocaleString()}</span>
                        <span className={`reports-list-item-badge ${r.status}`} style={{ background: status.bg, color: status.color }}>
                          {r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                        </span>
                        <span style={{ background: method.bg, color: method.color, padding: '0 6px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{method.label}</span>
                      </div>
                    </div>
                    <div className="reports-list-item-right">
                      <div className="reports-list-item-amount">{formatMoney(r.total, baseCurrency)}</div>
                      <div style={{ fontSize: 11, color: '#8b97a7' }}>{r.customerName}</div>
                    </div>
                  </div>
                );
              })}
              {visibleReceipts.length < filteredReceipts.length && (
                <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button onClick={handleLoadMore} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                    Load more ({filteredReceipts.length - visibleReceipts.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {storeModalOpen && renderStoreModal()}
        {modalOpen && (
          <div className="reports-modal-overlay" onClick={() => setModalOpen(false)}>
            {renderReceiptDetail()}
          </div>
        )}
      </div>
    </>
  );
}