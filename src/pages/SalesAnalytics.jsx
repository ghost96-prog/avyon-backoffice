// src/pages/SalesAnalytics.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  ChevronLeft,
  Store,
  Download,
  FileText,
  Lock,
  Tag,
  UserCog,
  CreditCard,
  Coins,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, formatNumber, downloadCsv, toApiDate } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import '../styles/ReportsShared.css';
import './Dashboard.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DIMENSIONS = [
  { id: 'branch', label: 'Branch', icon: Store },
  { id: 'pos', label: 'POS Terminal', icon: CreditCard },
  { id: 'employee', label: 'Employee', icon: UserCog },
  { id: 'currency', label: 'Currency', icon: Coins },
  { id: 'category', label: 'Category', icon: Tag },
];

const DIM_COLORS = ['#357abd', '#50C878', '#FF6B6B', '#FFD93D', '#9C27B0', '#FF9800', '#00BCD4', '#A9A9A9'];

function formatDateDisplay(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function GrowthBadge({ value }) {
  if (value == null) return null;
  const isUp = value > 0.5;
  const isDown = value < -0.5;
  const color = isUp ? '#16a34a' : isDown ? '#ef4444' : '#8b97a7';
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color }}>
      <Icon size={11} />{value >= 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

export default function SalesAnalytics() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, hasBackofficePermission } = useAppContext();

  const canView = hasBackofficePermission(BACKOFFICE_PERMISSIONS.VIEW_SALES_REPORTS);

  const {
    startDate,
    endDate,
    selectedOption,
    handleOptionSelect,
    navigateDate,
    reload: reloadDateRange,
  } = useDateRange('today');

  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [dimension, setDimension] = useState('branch');

  const [summary, setSummary] = useState(null);
  const [dailyRows, setDailyRows] = useState([]);
  const [dimensionRows, setDimensionRows] = useState([]);
  const [branchComparison, setBranchComparison] = useState(null);

  const [loading, setLoading] = useState(true);
  const [dimensionLoading, setDimensionLoading] = useState(true);
  const [branchLoading, setBranchLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const hasMultipleBranches = (branches || []).length > 1;

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const branchNameMap = useMemo(() => {
    const map = {};
    (branches || []).forEach((b) => { map[b.branchId] = b.name; });
    return map;
  }, [branches]);

  const visibleDimensions = useMemo(
    () => DIMENSIONS.filter((d) => d.id !== 'branch' || hasMultipleBranches),
    [hasMultipleBranches]
  );

  // ─── Fetch summary + daily trend ──────────────────────────────────────────
  const loadOverview = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      if (selectedBranchId !== 'all') params.set('branchId', selectedBranchId);

      const [summaryRes, dailyRes] = await Promise.all([
        apiFetch(`/business/${businessId}/reports/sales-summary?${params.toString()}`),
        apiFetch(`/business/${businessId}/reports/daily-breakdown?${params.toString()}`),
      ]);

      setSummary(summaryRes.summary || null);
      setDailyRows(dailyRes.days || []);
    } catch (e) {
      console.error('Sales analytics overview error:', e);
      setError('Failed to load sales analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId]);

  // ─── Fetch current dimension breakdown ───────────────────────────────────
  const loadDimension = useCallback(async () => {
    if (!businessId) return;
    setDimensionLoading(true);
    try {
      const params = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      if (selectedBranchId !== 'all') params.set('branchId', selectedBranchId);

      const res = await apiFetch(`/business/${businessId}/reports/sales-by/${dimension}?${params.toString()}`);
      setDimensionRows(res.rows || []);
    } catch (e) {
      console.error('Sales-by-dimension error:', e);
      setDimensionRows([]);
    } finally {
      setDimensionLoading(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId, dimension]);

  // ─── Fetch branch comparison (always all-branch, ignores store filter) ────
  const loadBranchComparison = useCallback(async () => {
    if (!businessId || !hasMultipleBranches) { setBranchLoading(false); return; }
    setBranchLoading(true);
    try {
      const params = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      const res = await apiFetch(`/business/${businessId}/reports/branch-comparison?${params.toString()}`);
      setBranchComparison(res);
    } catch (e) {
      console.error('Branch comparison error:', e);
      setBranchComparison(null);
    } finally {
      setBranchLoading(false);
    }
  }, [apiFetch, businessId, startDate, endDate, hasMultipleBranches]);

  // ─── Combined refresh ──────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    if (!businessId) return;
    setRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        startDate: toApiDate(startDate),
        endDate: toApiDate(endDate)
      });
      if (selectedBranchId !== 'all') params.set('branchId', selectedBranchId);

      const calls = [
        apiFetch(`/business/${businessId}/reports/sales-summary?${params.toString()}`),
        apiFetch(`/business/${businessId}/reports/daily-breakdown?${params.toString()}`),
        apiFetch(`/business/${businessId}/reports/sales-by/${dimension}?${params.toString()}`),
      ];
      if (hasMultipleBranches) {
        const bParams = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
        calls.push(apiFetch(`/business/${businessId}/reports/branch-comparison?${bParams.toString()}`));
      }

      const results = await Promise.all(calls);
      setSummary(results[0].summary || null);
      setDailyRows(results[1].days || []);
      setDimensionRows(results[2].rows || []);
      if (hasMultipleBranches) setBranchComparison(results[3]);
    } catch (e) {
      console.error('Refresh all error:', e);
      setError('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId, dimension, hasMultipleBranches]);

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') reloadDateRange(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadDateRange]);

  useEffect(() => {
    const handlePopState = () => reloadDateRange();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [reloadDateRange]);

  useEffect(() => { if (businessId) loadOverview(); }, [businessId, startDate, endDate, selectedBranchId, loadOverview]);
  useEffect(() => { if (businessId) loadDimension(); }, [businessId, startDate, endDate, selectedBranchId, dimension, loadDimension]);
  useEffect(() => { if (businessId) loadBranchComparison(); }, [businessId, startDate, endDate, loadBranchComparison]);

  // ─── Row label / sub-label per dimension ─────────────────────────────────
  const rowLabel = useCallback((row) => {
    switch (dimension) {
      case 'category': return row.name || row.id;
      case 'employee': return row.name || row.id;
      case 'branch': return branchNameMap[row.id] || row.id;
      case 'pos': return row.name || `POS ${String(row.id).slice(0, 4)}`;
      case 'currency':
        if (row.name && row.symbol) {
          return `${row.name} (${row.symbol})`;
        }
        return row.name || row.id;
      default: return row.id;
    }
  }, [dimension, branchNameMap]);

  const rowSubLabel = useCallback((row) => {
    if (dimension === 'employee') {
      return [row.role, row.branchName, row.transactions != null ? `${row.transactions} transactions` : null].filter(Boolean).join(' · ');
    }
    if (dimension === 'pos') {
      return [row.branchName, row.transactions != null ? `${row.transactions} transactions` : null].filter(Boolean).join(' · ');
    }
    if (dimension === 'category' && row.qty != null) return `${row.qty} sold`;
    if (dimension === 'currency') {
      const parts = [];
      if (row.name) parts.push(row.name);
      if (row.symbol && row.symbol !== row.name) parts.push(row.symbol);
      if (row.transactions != null) parts.push(`${row.transactions} transactions`);
      return parts.join(' · ') || null;
    }
    if (row.transactions != null) return `${row.transactions} transactions`;
    return null;
  }, [dimension]);

  // ─── Client-side insight: best day of week (no extra backend call) ───────
  const bestDayInsight = useMemo(() => {
    if (!dailyRows.length) return null;
    const byDow = {};
    dailyRows.forEach((d) => {
      const dow = new Date(d.date).getDay();
      if (!byDow[dow]) byDow[dow] = { total: 0, count: 0 };
      byDow[dow].total += d.sales || 0;
      byDow[dow].count += 1;
    });
    let best = null;
    Object.entries(byDow).forEach(([dow, v]) => {
      const avg = v.total / v.count;
      if (!best || avg > best.avg) best = { dow: Number(dow), avg };
    });
    if (!best || best.avg <= 0) return null;
    return { day: DAY_NAMES[best.dow], avg: best.avg };
  }, [dailyRows]);

  // ─── Exports ──────────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (isExportingCsv || !dimensionRows.length) return;
    setIsExportingCsv(true);
    try {
      const header = ['Rank', 'Name', 'Sales', 'Share (%)'];
      const rows = dimensionRows.map((r, i) => [i + 1, rowLabel(r), (r.sales || 0).toFixed(2), (r.percentage || 0).toFixed(1)]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`sales-by-${dimension}_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...rows]);
    } finally {
      setIsExportingCsv(false);
    }
  }, [dimensionRows, dimension, rowLabel, selectedBranchId, selectedBranchName, startDate, endDate, isExportingCsv]);

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !summary) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
      doc.setFontSize(14);
      doc.text('Sales Analytics', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${selectedBranchName} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      autoTable(doc, {
        startY: 58,
        head: [['Metric', 'Value']],
        body: [
          ['Gross Sales', formatMoney(summary.grossSales, baseCurrency)],
          ['Discounts', formatMoney(summary.discounts, baseCurrency)],
          ['Refunds', formatMoney(summary.refunds, baseCurrency)],
          ['Net Sales', formatMoney(summary.netSales, baseCurrency)],
          ['COGS', formatMoney(summary.cogs, baseCurrency)],
          ['Profit', formatMoney(summary.profit, baseCurrency)],
          ['Transactions', formatNumber(summary.transactions)],
          ['Average Sale', formatMoney(summary.averageSale, baseCurrency)],
        ],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      const dimHead = [['Rank', `By ${DIMENSIONS.find((d) => d.id === dimension)?.label}`, 'Sales', 'Share']];
      const dimBody = dimensionRows.map((r, i) => [i + 1, rowLabel(r), formatMoney(r.sales, baseCurrency), `${(r.percentage || 0).toFixed(1)}%`]);
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: dimHead,
        body: dimBody,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      if (hasMultipleBranches && branchComparison?.branches?.length) {
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [['Rank', 'Branch', 'Sales', 'Growth', 'Transactions', 'Avg Sale']],
          body: branchComparison.branches.map((b) => [
            b.salesRank, b.name, formatMoney(b.sales, baseCurrency),
            `${b.salesGrowth >= 0 ? '+' : ''}${b.salesGrowth.toFixed(1)}%`,
            formatNumber(b.transactions), formatMoney(b.avgSale, baseCurrency),
          ]),
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
          margin: { left: 32, right: 32 },
        });
      }

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`sales-analytics_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [summary, dimensionRows, dimension, rowLabel, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf, hasMultipleBranches, branchComparison]);

  const renderStoreModal = () => {
    if (!storeModalOpen) return null;
    return (
      <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
        <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
          <div className="reports-modal-header">
            <span className="reports-modal-title">Select Store</span>
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

  if (!canView) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view sales analytics.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  const bcSummary = branchComparison?.summary;
  const bcRows = branchComparison?.branches || [];

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}>
            <ChevronLeft size={18} />
          </button>
          <div>
            <div className="reports-header-title">Sales Analytics</div>
            <div className="reports-header-sub">Summary, trend, and breakdowns for this period</div>
          </div>
        </div>
        <div className="reports-header-right">
          <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
            <Store size={14} />
            <span>{selectedBranchName}</span>
          </button>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExportingCsv || !dimensionRows.length}>
            CSV
          </Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !summary} loading={exportingPdf}>
            PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={refreshAll} loading={refreshing}>
            Refresh
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

      {error && (
        <div className="dashboard-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* ─── KPI row ─────────────────────────────────────────────────────── */}
      <div className="reports-stats-row">
        {[
          { label: 'Gross Sales', value: summary ? formatMoney(summary.grossSales, baseCurrency) : '' },
          { label: 'Discounts', value: summary ? formatMoney(summary.discounts, baseCurrency) : '' },
          { label: 'Refunds', value: summary ? formatMoney(summary.refunds, baseCurrency) : '' },
          { label: 'Net Sales', value: summary ? formatMoney(summary.netSales, baseCurrency) : '' },
          { label: 'COGS', value: summary ? formatMoney(summary.cogs, baseCurrency) : '' },
          { label: 'Profit', value: summary ? formatMoney(summary.profit, baseCurrency) : '' },
          { label: 'Transactions', value: summary ? formatNumber(summary.transactions) : '' },
          { label: 'Avg. Sale', value: summary ? formatMoney(summary.averageSale, baseCurrency) : '' },
        ].map((stat) => (
          <div className="reports-stat-card" key={stat.label}>
            <span className="reports-stat-label">{stat.label}</span>
            {loading ? (
              <div className="skeleton" style={{ height: 18, borderRadius: 4, marginTop: 4 }} />
            ) : (
              <span className="reports-stat-value">{stat.value}</span>
            )}
          </div>
        ))}
      </div>

      {/* ─── Best day insight ────────────────────────────────────────────── */}
      {!loading && bestDayInsight && (
        <div className="reports-list-card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} color="#357abd" />
          <span style={{ fontSize: 12.5, color: '#1a2332' }}>
            <strong>{bestDayInsight.day}</strong> is your strongest day, averaging {formatMoney(bestDayInsight.avg, baseCurrency)} in sales.
          </span>
        </div>
      )}

      {/* ─── Trend chart ─────────────────────────────────────────────────── */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>Sales trend</div>
        <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 10 }}>Net sales per day for the selected period</div>
        {loading ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 10 }} />
        ) : dailyRows.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyRows} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="salesAnalyticsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#357abd" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#357abd" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef1f5" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#8b97a7' }}
                axisLine={{ stroke: '#e6eaf0' }}
                tickLine={false}
                tickFormatter={(d) => { const dt = new Date(d); return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`; }}
              />
              <YAxis tick={{ fontSize: 10, fill: '#8b97a7' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                formatter={(v) => formatMoney(v, baseCurrency)}
                labelFormatter={(d) => formatDateDisplay(new Date(d))}
                contentStyle={{ borderRadius: 8, border: '1px solid #e6eaf0', fontSize: 12, boxShadow: '0 8px 24px rgba(22,32,43,0.12)' }}
              />
              <Area type="monotone" dataKey="sales" stroke="#357abd" strokeWidth={2} fill="url(#salesAnalyticsFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dashboard-empty">No sales recorded for this period yet.</div>
        )}
      </div>

      {/* ─── Dimension breakdown ─────────────────────────────────────────── */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: hasMultipleBranches ? 16 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332' }}>Sales breakdown</div>
            <div style={{ fontSize: 12, color: '#8b97a7' }}>Share of net sales by {DIMENSIONS.find((d) => d.id === dimension)?.label.toLowerCase()}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#f0f2f5', borderRadius: 6, padding: 2, flexWrap: 'wrap' }}>
            {visibleDimensions.map((d) => (
              <button
                key={d.id}
                className={`reports-filter-option ${dimension === d.id ? 'is-active' : ''}`}
                onClick={() => setDimension(d.id)}
                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto' }}
              >
                <d.icon size={12} style={{ marginRight: 4 }} />
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {dimensionLoading ? (
          <div className="skeleton" style={{ height: 180, borderRadius: 10 }} />
        ) : dimensionRows.length === 0 ? (
          <div className="dashboard-empty" style={{ height: 100 }}>No data for this dimension in the selected period.</div>
        ) : (
          <div className="category-panel">
            <div className="category-list">
              {dimensionRows.map((row, index) => (
                <div key={row.id || index} className="category-row" style={{ padding: '7px 2px' }}>
                  <div className="category-row-label" style={{ minWidth: 0 }}>
                    <span className="color-dot" style={{ background: DIM_COLORS[index % DIM_COLORS.length] }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rowLabel(row)}</div>
                      {rowSubLabel(row) && (
                        <div style={{ fontSize: 10.5, color: '#8b97a7' }}>{rowSubLabel(row)}</div>
                      )}
                    </div>
                  </div>
                  <div className="category-row-value">
                    <span>{formatMoney(row.sales, baseCurrency)}</span>
                    <span className="category-row-percent">({(row.percentage || 0).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Branch comparison — "which store is performing better" ──────── */}
      {hasMultipleBranches && (
        <div className="reports-list-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>
            <Trophy size={14} style={{ marginRight: 6, verticalAlign: -2, color: '#d97706' }} />Branch comparison
          </div>
          <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 12 }}>How each store is performing this period, ranked by sales</div>

          {branchLoading ? (
            <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />
          ) : !bcRows.length ? (
            <div className="dashboard-empty" style={{ height: 80 }}>No branch data for this period yet.</div>
          ) : (
            <>
              {/* Headline callouts */}
              <div className="reports-stats-row" style={{ marginBottom: 16 }}>
                {bcSummary?.topPerformer && (
                  <div className="reports-stat-card">
                    <span className="reports-stat-label"><Trophy size={11} style={{ marginRight: 4, verticalAlign: -1, color: '#d97706' }} />Top Performer</span>
                    <span className="reports-stat-value" style={{ fontSize: 13 }}>{bcSummary.topPerformer.name}</span>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{formatMoney(bcSummary.topPerformer.sales, baseCurrency)}</div>
                  </div>
                )}
                {bcSummary?.mostImproved && (
                  <div className="reports-stat-card">
                    <span className="reports-stat-label"><TrendingUp size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Most Improved</span>
                    <span className="reports-stat-value" style={{ fontSize: 13 }}>{bcSummary.mostImproved.name}</span>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                      {bcSummary.mostImproved.salesGrowth >= 0 ? '+' : ''}{bcSummary.mostImproved.salesGrowth.toFixed(1)}% vs prior period
                    </div>
                  </div>
                )}
                {bcSummary?.needsAttention && (
                  <div className="reports-stat-card">
                    <span className="reports-stat-label"><AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1, color: '#ef4444' }} />Needs Attention</span>
                    <span className="reports-stat-value" style={{ fontSize: 13 }}>{bcSummary.needsAttention.name}</span>
                    <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                      {bcSummary.needsAttention.salesGrowth.toFixed(1)}% vs prior period
                    </div>
                  </div>
                )}
              </div>

              {/* Ranked list */}
              <div className="category-panel">
                <div className="category-list">
                  {bcRows.map((b) => (
                    <div key={b.branchId} className="reports-list-item" style={{ padding: '10px 2px' }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, background: b.salesRank === 1 ? '#fef3c7' : '#f0f2f5',
                        color: b.salesRank === 1 ? '#d97706' : '#8b97a7', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>#{b.salesRank}</div>
                      <div className="reports-list-item-info">
                        <div className="reports-list-item-title">{b.name}</div>
                        <div className="reports-list-item-sub">
                          <span>{formatNumber(b.transactions)} transactions</span>
                          <span>Avg {formatMoney(b.avgSale, baseCurrency)}</span>
                          <span>{b.salesShare.toFixed(1)}% of network sales</span>
                          {b.topCategory && <span>Top: {b.topCategory}</span>}
                        </div>
                      </div>
                      <div className="reports-list-item-right">
                        <div className="reports-list-item-amount">{formatMoney(b.sales, baseCurrency)}</div>
                        <GrowthBadge value={b.salesGrowth} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {renderStoreModal()}
    </div>
  );
}