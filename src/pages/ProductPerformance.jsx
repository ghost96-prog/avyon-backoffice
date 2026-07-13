// src/pages/ProductPerformance.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Store, Download, FileText, Lock, Package,
  TrendingUp, TrendingDown, Minus, Award, AlertTriangle,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, formatNumber, downloadCsv, toApiDate } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import '../styles/ReportsShared.css';

const SORT_OPTIONS = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'profit', label: 'Profit' },
  { id: 'qty', label: 'Units Sold' },
  { id: 'margin', label: 'Margin' },
  { id: 'velocity', label: 'Velocity' },
];

const ABC_META = {
  A: { color: '#16a34a', bg: '#dcfce7', label: 'A — Top revenue drivers' },
  B: { color: '#d97706', bg: '#fef3c7', label: 'B — Steady contributors' },
  C: { color: '#8b97a7', bg: '#f0f2f5', label: 'C — Long tail' },
};

function TrendIcon({ value }) {
  if (value > 2) return <TrendingUp size={12} color="#16a34a" />;
  if (value < -2) return <TrendingDown size={12} color="#ef4444" />;
  return <Minus size={12} color="#8b97a7" />;
}

export default function ProductPerformance() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, hasBackofficePermission } = useAppContext();
  const canView = hasBackofficePermission(BACKOFFICE_PERMISSIONS.VIEW_STOCK);

  const { startDate, endDate, selectedOption, handleOptionSelect, navigateDate, reload: reloadDateRange } = useDateRange('today');

  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState('revenue');
  const [abcFilter, setAbcFilter] = useState('all');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showDeadStock, setShowDeadStock] = useState(false);

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const load = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate), sortBy });
      if (selectedBranchId !== 'all') params.set('branchId', selectedBranchId);
      const res = await apiFetch(`/business/${businessId}/reports/product-performance?${params.toString()}`);
      setData(res);
    } catch (e) {
      console.error('Product performance error:', e);
      setError('Failed to load product performance');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId, sortBy]);

  useEffect(() => {
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') reloadDateRange(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadDateRange]);

  useEffect(() => { if (businessId) load(); }, [businessId, startDate, endDate, selectedBranchId, sortBy, load]);

  const rows = data?.items || [];
  const filteredRows = useMemo(
    () => (abcFilter === 'all' ? rows : rows.filter((r) => r.abcClass === abcFilter)),
    [rows, abcFilter]
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  const handleExportCsv = useCallback(() => {
    if (isExportingCsv || !rows.length) return;
    setIsExportingCsv(true);
    try {
      const header = ['Rank', 'Name', 'SKU', 'Category', 'Class', 'Qty Sold', 'Revenue', 'Profit', 'Margin (%)', 'Current Stock', 'Days of Stock'];
      const csvRows = filteredRows.map((r, i) => [
        i + 1, r.name, r.sku, r.categoryName, r.abcClass, r.qty,
        r.revenue.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1),
        r.currentStock, r.daysOfStock != null ? r.daysOfStock.toFixed(1) : '',
      ]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`product-performance_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...csvRows]);
    } finally {
      setIsExportingCsv(false);
    }
  }, [filteredRows, rows, selectedBranchId, selectedBranchName, startDate, endDate, isExportingCsv]);

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !data) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
      doc.setFontSize(14);
      doc.text('Product Performance', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${selectedBranchName} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      autoTable(doc, {
        startY: 58,
        head: [['Metric', 'Value']],
        body: [
          ['Total Revenue', formatMoney(data.summary.totalRevenue, baseCurrency)],
          ['Total Profit', formatMoney(data.summary.totalProfit, baseCurrency)],
          ['Avg Margin', `${data.summary.avgMargin.toFixed(1)}%`],
          ['Products Sold', formatNumber(data.summary.productCount)],
          ['No-Sale Products', formatNumber(data.summary.noSaleCount)],
          ['Dead Stock Value', formatMoney(data.summary.deadStockValue, baseCurrency)],
        ],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Rank', 'Product', 'Class', 'Qty', 'Revenue', 'Profit', 'Margin', 'Stock']],
        body: filteredRows.map((r, i) => [
          i + 1, r.name, r.abcClass, r.qty, formatMoney(r.revenue, baseCurrency),
          formatMoney(r.profit, baseCurrency), `${r.margin.toFixed(1)}%`, r.currentStock,
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`product-performance_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [data, filteredRows, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf]);

  const renderStoreModal = () => {
    if (!storeModalOpen) return null;
    return (
      <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
        <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
          <div className="reports-modal-header"><span className="reports-modal-title">Select Store</span></div>
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
    );
  };

  if (!canView) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view product performance.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">Product Performance</div>
            <div className="reports-header-sub">Profit, margin, and velocity by product</div>
          </div>
        </div>
        <div className="reports-header-right">
          <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
            <Store size={14} /><span>{selectedBranchName}</span>
          </button>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExportingCsv || !rows.length}>CSV</Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !data} loading={exportingPdf}>PDF</Button>
          <Button variant="secondary" size="sm" onClick={() => load(true)} loading={refreshing}>Refresh</Button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <DateRangeNav startDate={startDate} endDate={endDate} selectedOption={selectedOption} onNavigate={navigateDate} onOptionSelect={handleOptionSelect} />
      </div>

      {error && <div className="dashboard-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* KPI row */}
      <div className="reports-stats-row">
        {[
          { label: 'Total Revenue', value: summary ? formatMoney(summary.totalRevenue, baseCurrency) : '' },
          { label: 'Total Profit', value: summary ? formatMoney(summary.totalProfit, baseCurrency) : '' },
          { label: 'Avg Margin', value: summary ? `${summary.avgMargin.toFixed(1)}%` : '' },
          { label: 'Products Sold', value: summary ? formatNumber(summary.productCount) : '' },
          { label: 'No-Sale Items', value: summary ? formatNumber(summary.noSaleCount) : '' },
          { label: 'Dead Stock Value', value: summary ? formatMoney(summary.deadStockValue, baseCurrency) : '' },
        ].map((stat) => (
          <div className="reports-stat-card" key={stat.label}>
            <span className="reports-stat-label">{stat.label}</span>
            {loading ? <div className="skeleton" style={{ height: 18, borderRadius: 4, marginTop: 4 }} /> : <span className="reports-stat-value">{stat.value}</span>}
          </div>
        ))}
      </div>

      {/* Highlights */}
      {!loading && summary && (summary.bestMargin || summary.worstMargin || summary.fastestMover) && (
        <div className="reports-stats-row" style={{ marginBottom: 16 }}>
          {summary.bestMargin && (
            <div className="reports-stat-card">
              <span className="reports-stat-label"><Award size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Best Margin</span>
              <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.bestMargin.name}</span>
              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{summary.bestMargin.margin.toFixed(1)}% margin</div>
            </div>
          )}
          {summary.fastestMover && (
            <div className="reports-stat-card">
              <span className="reports-stat-label"><TrendingUp size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Fastest Mover</span>
              <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.fastestMover.name}</span>
              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>+{summary.fastestMover.qtyChangePercent.toFixed(0)}% vs prior period</div>
            </div>
          )}
          {summary.worstMargin && (
            <div className="reports-stat-card">
              <span className="reports-stat-label"><AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Weakest Margin</span>
              <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.worstMargin.name}</span>
              <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{summary.worstMargin.margin.toFixed(1)}% margin</div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#8b97a7', fontWeight: 500 }}>Sort by</span>
        <div style={{ display: 'flex', gap: 4, background: '#f0f2f5', borderRadius: 6, padding: 2 }}>
          {SORT_OPTIONS.map((opt) => (
            <button key={opt.id} className={`reports-filter-option ${sortBy === opt.id ? 'is-active' : ''}`}
              onClick={() => setSortBy(opt.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto' }}>
              {opt.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#8b97a7', fontWeight: 500, marginLeft: 8 }}>Class</span>
        <div style={{ display: 'flex', gap: 4, background: '#f0f2f5', borderRadius: 6, padding: 2 }}>
          {['all', 'A', 'B', 'C'].map((c) => (
            <button key={c} className={`reports-filter-option ${abcFilter === c ? 'is-active' : ''}`}
              onClick={() => setAbcFilter(c)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto' }}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#8b97a7', marginLeft: 'auto' }}>{visibleRows.length} of {filteredRows.length} products</span>
      </div>

      {/* Main list */}
      <div className="reports-list-card">
        {loading ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 10, margin: 16 }} />
        ) : filteredRows.length === 0 ? (
          <div className="reports-empty">
            <Package size={32} />
            <div className="reports-empty-title">No product sales in this period</div>
            <div className="reports-empty-sub">Try a different date range, store, or class filter</div>
          </div>
        ) : (
          <>
            {visibleRows.map((r, index) => {
              const meta = ABC_META[r.abcClass];
              return (
                <div key={r.productId} className="reports-list-item" style={{ alignItems: 'flex-start' }}>
                  <div style={{ width: 24, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#8b97a7', paddingTop: 2 }}>{index + 1}</div>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, background: meta.bg, color: meta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                  }} title={meta.label}>{r.abcClass}</span>
                  <div className="reports-list-item-info">
                    <div className="reports-list-item-title">{r.name}</div>
                    <div className="reports-list-item-sub">
                      <span>{r.categoryName}</span>
                      <span>SKU: {r.sku || '—'}</span>
                      <span>Qty: {r.qty}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <TrendIcon value={r.qtyChangePercent} /> {r.qtyChangePercent >= 0 ? '+' : ''}{r.qtyChangePercent.toFixed(0)}%
                      </span>
                      <span>Stock: {r.currentStock}{r.daysOfStock != null ? ` (${r.daysOfStock.toFixed(0)}d)` : ''}</span>
                    </div>
                  </div>
                  <div className="reports-list-item-right">
                    <div className="reports-list-item-amount">{formatMoney(r.revenue, baseCurrency)}</div>
                    <div style={{ fontSize: 11, color: (r.profit >= 0 ? '#16a34a' : '#ef4444'), fontWeight: 600 }}>
                      {formatMoney(r.profit, baseCurrency)} profit · {r.margin.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
            {visibleRows.length < filteredRows.length && (
              <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                <button onClick={() => setVisibleCount((c) => c + 20)}
                  style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dead stock / no-sale products */}
      {!loading && data?.noSaleProducts?.length > 0 && (
        <div className="reports-list-card" style={{ padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowDeadStock((v) => !v)}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332' }}>
                <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: -2, color: '#d97706' }} />
                No sales this period ({data.noSaleProducts.length})
              </div>
              <div style={{ fontSize: 12, color: '#8b97a7' }}>{formatMoney(data.summary.deadStockValue, baseCurrency)} tied up in unsold stock</div>
            </div>
            <span style={{ fontSize: 12, color: '#357abd', fontWeight: 600 }}>{showDeadStock ? 'Hide' : 'Show'}</span>
          </div>
          {showDeadStock && (
            <div className="category-panel" style={{ marginTop: 12 }}>
              <div className="category-list">
                {data.noSaleProducts.map((p) => (
                  <div key={p.productId} className="category-row" style={{ padding: '7px 2px' }}>
                    <div className="category-row-label" style={{ minWidth: 0 }}>
                      <span className="color-dot" style={{ background: '#d97706' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 10.5, color: '#8b97a7' }}>{p.categoryName} · {p.currentStock} in stock</div>
                      </div>
                    </div>
                    <div className="category-row-value"><span style={{ color: '#d97706' }}>{formatMoney(p.tiedUpValue, baseCurrency)}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {renderStoreModal()}
    </div>
  );
}