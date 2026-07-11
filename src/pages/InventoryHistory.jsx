// src/pages/Inventory/InventoryHistory.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Store, Search, X, History, Filter, Download, FileText, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, toApiDate, downloadCsv } from '../utils/exportUtils';
import '../styles/ReportsShared.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Loading Bar Component (Loyverse style) ──────────────────────────────
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

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'sale', label: 'Sale' },
  { value: 'refund', label: 'Refund' },
  { value: 'stock_addition', label: 'Stock Addition' },
  { value: 'stock_reduction', label: 'Stock Reduction' },
  { value: 'initial_stock', label: 'Initial Stock' },
  { value: 'grv_received', label: 'GRV Received' },
  { value: 'transfer_out', label: 'Transfer Out' },
  { value: 'transfer_in', label: 'Transfer In' },
  { value: 'transfer_reversed', label: 'Transfer Reversed' },
  { value: 'stock_take_adjustment', label: 'Stock Take Adjustment' },
  { value: 'stock_take', label: 'Stock Take' },
];

// Android-style colors and badges - EXACT matches for all types
const TYPE_STYLES = {
  sale: { bg: '#FEF2F2', color: '#EF4444', label: 'SALE' },
  refund: { bg: '#ECFDF5', color: '#16A34A', label: 'REFUND' },
  stock_addition: { bg: '#ECFDF5', color: '#16A34A', label: 'STOCK ADD' },
  stock_reduction: { bg: '#FEF2F2', color: '#EF4444', label: 'STOCK REDUCE' },
  initial_stock: { bg: '#EFF6FF', color: '#6366F1', label: 'INITIAL STOCK' },
  grv_received: { bg: '#ECFDF5', color: '#16A34A', label: 'GRV' },
  transfer_out: { bg: '#FEF2F2', color: '#EF4444', label: 'TRANSFER OUT' },
  transfer_in: { bg: '#ECFDF5', color: '#16A34A', label: 'TRANSFER IN' },
  transfer_reversed: { bg: '#EFF6FF', color: '#0891B2', label: 'REVERSED' },
  stock_take_adjustment: { bg: '#F5F3FF', color: '#7C3AED', label: 'STOCK TAKE' },
  stock_take: { bg: '#F5F3FF', color: '#7C3AED', label: 'STOCK TAKE' },
};

const getTypeStyle = (type) => {
  // Direct lookup first
  if (TYPE_STYLES[type]) {
    return TYPE_STYLES[type];
  }
  
  // Handle variations
  if (type?.toLowerCase().includes('stock_take') || type?.toLowerCase().includes('adjustment')) {
    return TYPE_STYLES.stock_take_adjustment;
  }
  
  // Fallback with meaningful label
  return { bg: '#F1F5F9', color: '#64748B', label: type?.toUpperCase() || 'UNKNOWN' };
};

const PAGE_SIZE = 30;

export default function InventoryHistory() {
  const { apiFetch, businessId, branches, baseCurrency } = useAppContext();
  const { startDate, endDate, selectedOption, handleOptionSelect, navigateDate, reload: reloadDateRange } = useDateRange('today');

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [movements, setMovements] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [typePopup, setTypePopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!selectedBranchId && branches?.length) setSelectedBranchId(branches[0].branchId);
  }, [branches, selectedBranchId]);

  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  const fetchMovements = useCallback(async (isRefresh = false) => {
    if (!businessId || !selectedBranchId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const params = new URLSearchParams();
      params.append('startDate', String(start.getTime()));
      params.append('endDate', String(end.getTime()));
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-movements?${params.toString()}`);
      const data = Array.isArray(res) ? res : [];
      
      const formatted = data.map(m => ({
        ...m,
        formattedDate: new Date(m.createdAt).toLocaleDateString(undefined, { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        }),
        formattedTime: new Date(m.createdAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      }));
      
      setMovements(formatted);
    } catch (e) {
      console.error('Fetch stock movements error:', e);
      setError('Failed to load inventory history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, businessId, selectedBranchId, startDate, endDate, typeFilter]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') reloadDateRange(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadDateRange]);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [selectedBranchId, startDate, endDate, typeFilter, searchQuery]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return movements;
    const q = searchQuery.trim().toLowerCase();
    return movements.filter((m) => 
      m.productName?.toLowerCase().includes(q) || 
      m.sku?.toLowerCase().includes(q) ||
      m.cashierName?.toLowerCase().includes(q)
    );
  }, [movements, searchQuery]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const stats = useMemo(() => {
    const additions = filtered.filter((m) => m.quantityChange > 0).reduce((s, m) => s + m.quantityChange, 0);
    const reductions = filtered.filter((m) => m.quantityChange < 0).reduce((s, m) => s + Math.abs(m.quantityChange), 0);
    const conflicts = filtered.filter((m) => m.status === 'conflict').length;
    return { total: filtered.length, additions, reductions, conflicts };
  }, [filtered]);

  // ─── Export Functions ────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (isExporting || !filtered.length) return;
    setIsExporting(true);
    try {
      const header = ['Date', 'Time', 'Product', 'SKU', 'User', 'Type', 'Before', 'Change', 'After', 'Conflict', 'Reason'];
      const rows = filtered.map((m) => [
        m.formattedDate || '',
        m.formattedTime || '',
        m.productName || '',
        m.sku || '',
        m.cashierName || '',
        m.type || '',
        m.quantityBefore || 0,
        m.quantityChange || 0,
        m.quantityAfter || 0,
        m.status === 'conflict'
          ? `Requested ${m.requestedQty ?? ''} / Fulfilled ${m.fulfilledQty ?? ''} / Short ${m.conflictQty ?? ''}`
          : '',
        (m.status === 'conflict' ? (m.conflictReason || m.reason) : m.reason) || '',
      ]);
      const branchTag = selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`inventory_history_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...rows]);
    } finally {
      setIsExporting(false);
    }
  }, [filtered, selectedBranchName, startDate, endDate, isExporting]);

  const handleExportPdf = useCallback(() => {
    if (isExporting || !filtered.length) return;
    setIsExporting(true);

    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(16);
      doc.setTextColor('#0F172A');
      doc.text('Inventory History Report', pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor('#64748B');
      const dateRange = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
      doc.text(`${selectedBranchName} | ${dateRange}`, pageWidth / 2, 22, { align: 'center' });

      const tableData = filtered.map((m) => [
        m.formattedDate || '',
        m.formattedTime || '',
        m.productName || '',
        m.sku || '',
        m.cashierName || '',
        m.status === 'conflict' ? `${m.type || ''} (CONFLICT)` : (m.type || ''),
        String(m.quantityBefore || 0),
        String(m.quantityChange || 0),
        String(m.quantityAfter || 0),
        (m.status === 'conflict' ? (m.conflictReason || m.reason) : m.reason) || '',
      ]);

      autoTable(doc, {
        head: [['Date', 'Time', 'Product', 'SKU', 'User', 'Type', 'Before', 'Change', 'After', 'Reason']],
        body: tableData,
        startY: 30,
        theme: 'striped',
        headStyles: {
          fillColor: '#F1F5F9',
          textColor: '#0F172A',
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 6,
          textColor: '#1E293B',
        },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 18 },
          2: { cellWidth: 28 },
          3: { cellWidth: 20 },
          4: { cellWidth: 22 },
          5: { cellWidth: 22 },
          6: { cellWidth: 16, halign: 'center' },
          7: { cellWidth: 16, halign: 'center' },
          8: { cellWidth: 16, halign: 'center' },
          9: { cellWidth: 24 },
        },
        margin: { left: 8, right: 8 },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 5) {
            const raw = String(data.cell.raw || '');
            const isConflictRow = raw.includes('(CONFLICT)');
            const type = raw.replace(' (CONFLICT)', '');
            const style = getTypeStyle(type);
            data.cell.styles.textColor = isConflictRow ? '#EF4444' : style.color;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.section === 'body' && data.column.index === 7) {
            const change = parseFloat(data.cell.raw);
            data.cell.styles.textColor = change >= 0 ? '#16A34A' : '#EF4444';
            data.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawPage: function(data) {
          doc.setFontSize(7);
          doc.setTextColor('#94A3B8');
          const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
          const totalPages = doc.internal.getNumberOfPages();
          doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 15, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
          doc.text(`Generated: ${new Date().toLocaleString()}`, 15, doc.internal.pageSize.getHeight() - 10);
        },
      });

      const branchTag = selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`inventory_history_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [filtered, selectedBranchName, startDate, endDate, baseCurrency, isExporting]);

  // ─── Show loading bar instead of full screen spinner ──────────────────
  const showLoadingBar = loading || refreshing || isExporting;

  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => window.history.back()}>
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="reports-header-title">Inventory History</div>
              <div className="reports-header-sub">Every stock movement, audit-trail style</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={isExporting || !filtered.length}>
              PDF
            </Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !filtered.length}>
              CSV
            </Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={() => fetchMovements(true)} disabled={refreshing}>
              Refresh
            </Button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <DateRangeNav startDate={startDate} endDate={endDate} selectedOption={selectedOption} onNavigate={navigateDate} onOptionSelect={handleOptionSelect} />
        </div>

        <div className="reports-stats-row">
          <div className="reports-stat-card"><span className="reports-stat-label">Movements</span><span className="reports-stat-value">{stats.total}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Added</span><span className="reports-stat-value" style={{ color: '#16A34A' }}>+{stats.additions}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Removed</span><span className="reports-stat-value" style={{ color: '#EF4444' }}>-{stats.reductions}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Conflicts</span><span className="reports-stat-value" style={{ color: stats.conflicts ? '#EF4444' : '#0F172A' }}>{stats.conflicts}</span></div>
        </div>

        <div className="reports-toolbar">
          <div className="reports-search">
            <Search size={14} />
            <input placeholder="Search by product, SKU or user" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="reports-filter-btn" onClick={() => setTypePopup(!typePopup)}>
              <Filter size={13} /> {TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label}
            </button>
            {typePopup && (
              <div className="reports-filter-popover" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {TYPE_OPTIONS.map((opt) => (
                  <button key={opt.value} className={`reports-filter-option ${typeFilter === opt.value ? 'is-active' : ''}`}
                    onClick={() => { setTypeFilter(opt.value); setTypePopup(false); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabular Table View with horizontal scroll */}
        <div className="reports-list-card" style={{ overflowX: 'auto' }}>
          {error ? (
            <div className="reports-empty">
              <div className="reports-empty-title">{error}</div>
              <button onClick={() => fetchMovements()} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Retry</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="reports-empty">
              <History size={32} />
              <div className="reports-empty-title">No movements found</div>
              <div className="reports-empty-sub">Try a different date range or filter</div>
            </div>
          ) : (
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 100 }}>Date</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 80 }}>Time</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 150 }}>Product</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 80 }}>SKU</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 100 }}>User</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 120 }}>Type</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 60 }}>Before</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 60 }}>Change</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 60 }}>After</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 160 }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const style = getTypeStyle(m.type);
                  const isPositive = m.quantityChange >= 0;
                  const isConflict = m.status === 'conflict';
                  return (
                    <tr key={m.movementId} style={{ 
                      borderBottom: '1px solid #F1F5F9', 
                      backgroundColor: isConflict ? '#FEF2F2' : '#fff',
                    }}>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#0F172A' }}>{m.formattedDate}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748B' }}>{m.formattedTime}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{m.productName}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748B' }}>{m.sku}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748B' }}>{m.cashierName}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <span className="reports-list-item-badge" style={{ 
                            background: style.bg, 
                            color: style.color,
                            fontWeight: 700,
                            fontSize: 11,
                          }}>
                            {style.label}
                          </span>
                          {isConflict && (
                            <span className="reports-list-item-badge reports-badge-conflict">
                              <AlertTriangle size={10} strokeWidth={2.5} />
                              CONFLICT
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: '#64748B' }}>{m.quantityBefore}</td>
                      <td style={{ 
                        padding: '10px 12px', 
                        textAlign: 'center', 
                        fontSize: 12, 
                        fontWeight: 700, 
                        color: isPositive ? '#16A34A' : '#EF4444' 
                      }}>
                        {isPositive ? '+' : ''}{m.quantityChange}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: '#64748B' }}>{m.quantityAfter}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: isConflict ? '#B91C1C' : '#64748B', fontWeight: isConflict ? 600 : 400 }}>
                        {isConflict
                          ? (m.conflictReason || `Requested ${m.requestedQty ?? '?'}, fulfilled ${m.fulfilledQty ?? '?'}, short ${m.conflictQty ?? '?'}`)
                          : m.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {visible.length < filtered.length && (
            <div style={{ padding: '12px 16px', textAlign: 'center' }}>
              <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                Load more ({filtered.length - visible.length} remaining)
              </button>
            </div>
          )}
        </div>

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