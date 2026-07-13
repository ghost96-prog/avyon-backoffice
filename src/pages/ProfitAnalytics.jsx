// src/pages/ProfitAnalytics.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  ChevronLeft, Store, Download, FileText, Lock, Tag,
  Trophy, TrendingUp, TrendingDown, Minus, Award, Calendar,
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

// Only these two dimensions carry a `profit` figure on the backend today
// (byBranch always has; byCategory now does too).
const DIMENSIONS = [
    { id: 'branch', label: 'Branch', icon: Store },
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

export default function ProfitAnalytics() {
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
      console.error('Profit analytics overview error:', e);
      setError('Failed to load profit analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId]);

  const loadDimension = useCallback(async () => {
    if (!businessId) return;
    setDimensionLoading(true);
    try {
      const params = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      if (selectedBranchId !== 'all') params.set('branchId', selectedBranchId);

      const res = await apiFetch(`/business/${businessId}/reports/sales-by/${dimension}?${params.toString()}`);
      const rows = (res.rows || []).map((r) => ({
        ...r,
        margin: r.sales > 0 ? ((r.profit || 0) / r.sales) * 100 : 0,
      }));
      rows.sort((a, b) => (b.profit || 0) - (a.profit || 0));
      setDimensionRows(rows);
    } catch (e) {
      console.error('Profit-by-dimension error:', e);
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

  const rowLabel = useCallback((row) => {
    if (dimension === 'branch') return branchNameMap[row.id] || row.name || row.id;
    return row.name || row.id;
  }, [dimension, branchNameMap]);

  // ─── Client-side insight: best margin day (no extra backend call) ─────────
  const bestMarginDayInsight = useMemo(() => {
    if (!dailyRows.length) return null;
    let best = null;
    dailyRows.forEach((d) => {
      if (!d.sales) return;
      const margin = ((d.profit || 0) / d.sales) * 100;
      if (!best || margin > best.margin) best = { date: d.date, margin };
    });
    if (!best) return null;
    return { ...best, dateDisplay: formatDateDisplay(new Date(best.date)) };
  }, [dailyRows]);

  // ─── Branch profit ranking (re-sorted from the shared endpoint) ──────────
  const bcRowsByProfit = useMemo(() => {
    const rows = branchComparison?.branches || [];
    return [...rows].sort((a, b) => b.profit - a.profit).map((b, i) => ({ ...b, profitRankLocal: i + 1 }));
  }, [branchComparison]);

  const handleExportCsv = useCallback(() => {
    if (isExportingCsv || !dimensionRows.length) return;
    setIsExportingCsv(true);
    try {
      const header = ['Rank', 'Name', 'Sales', 'Profit', 'Margin (%)'];
      const rows = dimensionRows.map((r, i) => [i + 1, rowLabel(r), (r.sales || 0).toFixed(2), (r.profit || 0).toFixed(2), (r.margin || 0).toFixed(1)]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`profit-by-${dimension}_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...rows]);
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
      doc.text('Profit Analytics', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${selectedBranchName} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      autoTable(doc, {
        startY: 58,
        head: [['Metric', 'Value']],
        body: [
          ['Net Sales', formatMoney(summary.netSales, baseCurrency)],
          ['COGS', formatMoney(summary.cogs, baseCurrency)],
          ['Profit', formatMoney(summary.profit, baseCurrency)],
          ['Profit Margin', `${(summary.profitMargin || 0).toFixed(1)}%`],
          ['Transactions', formatNumber(summary.transactions)],
          ['Average Sale', formatMoney(summary.averageSale, baseCurrency)],
        ],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      const dimHead = [['Rank', `By ${DIMENSIONS.find((d) => d.id === dimension)?.label}`, 'Sales', 'Profit', 'Margin']];
      const dimBody = dimensionRows.map((r, i) => [i + 1, rowLabel(r), formatMoney(r.sales, baseCurrency), formatMoney(r.profit, baseCurrency), `${(r.margin || 0).toFixed(1)}%`]);
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: dimHead,
        body: dimBody,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      if (hasMultipleBranches && bcRowsByProfit.length) {
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [['Rank', 'Branch', 'Profit', 'Margin', 'Growth']],
          body: bcRowsByProfit.map((b) => [
            b.profitRankLocal, b.name, formatMoney(b.profit, baseCurrency),
            `${b.margin.toFixed(1)}%`, `${b.profitGrowth >= 0 ? '+' : ''}${b.profitGrowth.toFixed(1)}%`,
          ]),
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
          margin: { left: 32, right: 32 },
        });
      }

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`profit-analytics_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [summary, dimensionRows, dimension, rowLabel, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf, hasMultipleBranches, bcRowsByProfit]);

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
          <p>You don't have permission to view profit analytics.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  const bcSummary = branchComparison?.summary;
  const topProfitBranch = bcRowsByProfit[0] || null;

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}>
            <ChevronLeft size={18} />
          </button>
          <div>
            <div className="reports-header-title">Profit Analytics</div>
            <div className="reports-header-sub">Margin, trend, and where your profit is coming from</div>
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
          <Button variant="secondary" size="sm" onClick={() => loadOverview(true)} loading={refreshing}>
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
          { label: 'Net Sales', value: summary ? formatMoney(summary.netSales, baseCurrency) : '' },
          { label: 'COGS', value: summary ? formatMoney(summary.cogs, baseCurrency) : '' },
          { label: 'Profit', value: summary ? formatMoney(summary.profit, baseCurrency) : '' },
          { label: 'Profit Margin', value: summary ? `${(summary.profitMargin || 0).toFixed(1)}%` : '' },
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

      {/* ─── Best margin day insight ────────────────────────────────────── */}
      {!loading && bestMarginDayInsight && (
        <div className="reports-list-card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} color="#50C878" />
          <span style={{ fontSize: 12.5, color: '#1a2332' }}>
            Your best margin day was <strong>{bestMarginDayInsight.dateDisplay}</strong> at {bestMarginDayInsight.margin.toFixed(1)}% profit margin.
          </span>
        </div>
      )}

      {/* ─── Net sales vs profit trend ──────────────────────────────────── */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>Net sales vs. profit</div>
        <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 10 }}>Daily comparison for the selected period</div>
        {loading ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 10 }} />
        ) : dailyRows.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyRows} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="netSalesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#357abd" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#357abd" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#50C878" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#50C878" stopOpacity={0} />
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
                formatter={(v, name) => [formatMoney(v, baseCurrency), name === 'sales' ? 'Net Sales' : 'Profit']}
                labelFormatter={(d) => formatDateDisplay(new Date(d))}
                contentStyle={{ borderRadius: 8, border: '1px solid #e6eaf0', fontSize: 12, boxShadow: '0 8px 24px rgba(22,32,43,0.12)' }}
              />
              <Legend
                formatter={(value) => (value === 'sales' ? 'Net Sales' : 'Profit')}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Area type="monotone" dataKey="sales" name="sales" stroke="#357abd" strokeWidth={2} fill="url(#netSalesFill)" />
              <Area type="monotone" dataKey="profit" name="profit" stroke="#50C878" strokeWidth={2} fill="url(#profitFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dashboard-empty">No sales recorded for this period yet.</div>
        )}
      </div>

      {/* ─── Profit breakdown ────────────────────────────────────────────── */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: hasMultipleBranches ? 16 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332' }}>Profit breakdown</div>
            <div style={{ fontSize: 12, color: '#8b97a7' }}>Ranked by profit contribution by {DIMENSIONS.find((d) => d.id === dimension)?.label.toLowerCase()}</div>
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
          <div className="dashboard-empty" style={{ height: 100 }}>No profit data for this dimension in the selected period.</div>
        ) : (
          <div className="category-panel">
            <div className="category-list">
              {dimensionRows.map((row, index) => (
                <div key={row.id || index} className="category-row" style={{ padding: '7px 2px' }}>
                  <div className="category-row-label" style={{ minWidth: 0 }}>
                    <span className="color-dot" style={{ background: DIM_COLORS[index % DIM_COLORS.length] }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rowLabel(row)}</div>
                      <div style={{ fontSize: 10.5, color: '#8b97a7' }}>
                        Sales {formatMoney(row.sales, baseCurrency)} · {row.margin.toFixed(1)}% margin
                      </div>
                    </div>
                  </div>
                  <div className="category-row-value">
                    <span style={{ color: (row.profit || 0) >= 0 ? '#16a34a' : '#ef4444' }}>{formatMoney(row.profit, baseCurrency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Branch profit comparison ──────────────────────────────────── */}
      {hasMultipleBranches && (
        <div className="reports-list-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>
            <Trophy size={14} style={{ marginRight: 6, verticalAlign: -2, color: '#d97706' }} />Branch profit comparison
          </div>
          <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 12 }}>Which store is actually making you the most money, ranked by profit</div>

          {branchLoading ? (
            <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />
          ) : !bcRowsByProfit.length ? (
            <div className="dashboard-empty" style={{ height: 80 }}>No branch profit data for this period yet.</div>
          ) : (
            <>
              <div className="reports-stats-row" style={{ marginBottom: 16 }}>
                {topProfitBranch && (
                  <div className="reports-stat-card">
                    <span className="reports-stat-label"><Trophy size={11} style={{ marginRight: 4, verticalAlign: -1, color: '#d97706' }} />Most Profitable</span>
                    <span className="reports-stat-value" style={{ fontSize: 13 }}>{topProfitBranch.name}</span>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{formatMoney(topProfitBranch.profit, baseCurrency)}</div>
                  </div>
                )}
                {bcSummary?.highestMargin && (
                  <div className="reports-stat-card">
                    <span className="reports-stat-label"><Award size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Highest Margin</span>
                    <span className="reports-stat-value" style={{ fontSize: 13 }}>{bcSummary.highestMargin.name}</span>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{bcSummary.highestMargin.margin.toFixed(1)}% margin</div>
                  </div>
                )}
              </div>

              <div className="category-panel">
                <div className="category-list">
                  {bcRowsByProfit.map((b) => (
                    <div key={b.branchId} className="reports-list-item" style={{ padding: '10px 2px' }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, background: b.profitRankLocal === 1 ? '#dcfce7' : '#f0f2f5',
                        color: b.profitRankLocal === 1 ? '#16a34a' : '#8b97a7', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>#{b.profitRankLocal}</div>
                      <div className="reports-list-item-info">
                        <div className="reports-list-item-title">{b.name}</div>
                        <div className="reports-list-item-sub">
                          <span>Sales {formatMoney(b.sales, baseCurrency)}</span>
                          <span>{b.margin.toFixed(1)}% margin</span>
                          {b.topCategory && <span>Top: {b.topCategory}</span>}
                        </div>
                      </div>
                      <div className="reports-list-item-right">
                        <div className="reports-list-item-amount" style={{ color: b.profit >= 0 ? '#16a34a' : '#ef4444' }}>
                          {formatMoney(b.profit, baseCurrency)}
                        </div>
                        <GrowthBadge value={b.profitGrowth} />
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