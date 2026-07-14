// src/pages/BranchComparison.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  ChevronLeft,
  Download,
  FileText,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Award,
  Users,
  Percent,
  RotateCcw,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, formatNumber, downloadCsv, toApiDate } from '../utils/exportUtils';
import '../styles/ReportsShared.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BRANCH_COLORS = ['#357abd', '#50C878', '#FF6B6B', '#FFD93D', '#9C27B0', '#FF9800', '#00BCD4', '#A9A9A9'];

const SORT_OPTIONS = [
  { id: 'sales', label: 'Sales' },
  { id: 'profit', label: 'Profit' },
  { id: 'margin', label: 'Margin' },
  { id: 'growth', label: 'Growth' },
];

function GrowthBadge({ value }) {
  if (value == null || Number.isNaN(value)) return null;
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

export default function BranchComparison() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency } = useAppContext();

  // ✅ Use the shared selected branch hook with "All Stores" option
  const { selectedBranchId } = useSelectedBranch({ allowAll: true });

  const { startDate, endDate, selectedOption, handleOptionSelect, navigateDate, reload: reloadDateRange } = useDateRange('last30days');

  const [sortBy, setSortBy] = useState('sales');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const hasMultipleBranches = (branches || []).length > 1;

  const load = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ 
        startDate: toApiDate(startDate), 
        endDate: toApiDate(endDate) 
      });
      if (selectedBranchId !== 'all') params.set('branchId', selectedBranchId);
      
      const res = await apiFetch(`/business/${businessId}/reports/branch-comparison?${params.toString()}`);
      setData(res);
    } catch (e) {
      console.error('Branch comparison error:', e);
      setError('Failed to load branch comparison');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId]);

  useEffect(() => {
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') reloadDateRange(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadDateRange]);

  useEffect(() => { if (businessId) load(); }, [businessId, startDate, endDate, load]);

  const rows = data?.branches || [];
  const summary = data?.summary;

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    switch (sortBy) {
      case 'profit': return copy.sort((a, b) => b.profit - a.profit);
      case 'margin': return copy.sort((a, b) => b.margin - a.margin);
      case 'growth': return copy.sort((a, b) => b.salesGrowth - a.salesGrowth);
      default: return copy.sort((a, b) => b.sales - a.sales);
    }
  }, [rows, sortBy]);

  const trendData = useMemo(() => {
    if (!rows.length) return [];
    const byDate = {};
    rows.forEach((b) => {
      (b.dailyTrend || []).forEach((d) => {
        if (!byDate[d.date]) byDate[d.date] = { date: d.date };
        byDate[d.date][b.branchId] = d.sales;
      });
    });
    return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [rows]);

  const handleExportCsv = useCallback(() => {
    if (isExportingCsv || !rows.length) return;
    setIsExportingCsv(true);
    try {
      const header = ['Rank', 'Branch', 'Sales', 'Profit', 'Margin (%)', 'Growth (%)', 'Transactions', 'Avg Sale', 'Refund Rate (%)', 'Employees', 'Top Category'];
      const csvRows = sortedRows.map((b, i) => [
        i + 1, b.name, b.sales.toFixed(2), b.profit.toFixed(2), b.margin.toFixed(1),
        b.salesGrowth.toFixed(1), b.transactions, b.avgSale.toFixed(2),
        b.refundRate.toFixed(1), b.employeeCount, b.topCategory || '',
      ]);
      downloadCsv(`branch-comparison_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...csvRows]);
    } finally {
      setIsExportingCsv(false);
    }
  }, [rows, sortedRows, startDate, endDate, isExportingCsv]);

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !data) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
      doc.setFontSize(14);
      doc.text('Branch Comparison', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      autoTable(doc, {
        startY: 58,
        head: [['Metric', 'Value']],
        body: [
          ['Total Sales', formatMoney(summary?.totalSales || 0, baseCurrency)],
          ['Total Profit', formatMoney(summary?.totalProfit || 0, baseCurrency)],
          ['Branch Count', String(summary?.branchCount || 0)],
          ['Top Performer', summary?.topPerformer?.name || '—'],
          ['Most Improved', summary?.mostImproved?.name || '—'],
        ],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Rank', 'Branch', 'Sales', 'Profit', 'Margin', 'Growth', 'Transactions', 'Avg Sale', 'Refund Rate']],
        body: sortedRows.map((b, i) => [
          i + 1, b.name, formatMoney(b.sales, baseCurrency), formatMoney(b.profit, baseCurrency),
          `${b.margin.toFixed(1)}%`, `${b.salesGrowth >= 0 ? '+' : ''}${b.salesGrowth.toFixed(1)}%`,
          formatNumber(b.transactions), formatMoney(b.avgSale, baseCurrency), `${b.refundRate.toFixed(1)}%`,
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      doc.save(`branch-comparison_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [data, sortedRows, summary, baseCurrency, startDate, endDate, exportingPdf]);

  if (!hasMultipleBranches && !loading) {
    return (
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Branch Comparison</div>
              <div className="reports-header-sub">How each store is performing, ranked side by side</div>
            </div>
          </div>
        </div>
        <div className="dashboard-empty" style={{ marginTop: 24 }}>
          You only have one store right now — add another branch to unlock comparisons.
        </div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">Branch Comparison</div>
            <div className="reports-header-sub">Head-to-head performance across every store</div>
          </div>
        </div>
        <div className="reports-header-right">
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExportingCsv || !rows.length}>CSV</Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !data} loading={exportingPdf}>PDF</Button>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => load(true)} loading={refreshing}>Refresh</Button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <DateRangeNav startDate={startDate} endDate={endDate} selectedOption={selectedOption} onNavigate={navigateDate} onOptionSelect={handleOptionSelect} />
      </div>

      {error && <div className="dashboard-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Headline callouts */}
      <div className="reports-stats-row" style={{ marginBottom: 16 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div className="reports-stat-card" key={i}><div className="skeleton" style={{ height: 32, borderRadius: 4 }} /></div>
          ))
        ) : (
          <>
            {summary?.topPerformer && (
              <div className="reports-stat-card">
                <span className="reports-stat-label"><Trophy size={11} style={{ marginRight: 4, verticalAlign: -1, color: '#d97706' }} />Top Performer</span>
                <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.topPerformer.name}</span>
                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{formatMoney(summary.topPerformer.sales, baseCurrency)}</div>
              </div>
            )}
            {summary?.topProfitBranch && (
              <div className="reports-stat-card">
                <span className="reports-stat-label"><Award size={11} style={{ marginRight: 4, verticalAlign: -1, color: '#357abd' }} />Most Profitable</span>
                <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.topProfitBranch.name}</span>
                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{formatMoney(summary.topProfitBranch.profit, baseCurrency)}</div>
              </div>
            )}
            {summary?.mostImproved && (
              <div className="reports-stat-card">
                <span className="reports-stat-label"><TrendingUp size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Most Improved</span>
                <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.mostImproved.name}</span>
                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>+{summary.mostImproved.salesGrowth.toFixed(1)}% vs prior</div>
              </div>
            )}
            {summary?.highestMargin && (
              <div className="reports-stat-card">
                <span className="reports-stat-label"><Percent size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Best Margin</span>
                <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.highestMargin.name}</span>
                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{summary.highestMargin.margin.toFixed(1)}% margin</div>
              </div>
            )}
            {summary?.needsAttention && (
              <div className="reports-stat-card">
                <span className="reports-stat-label"><AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1, color: '#ef4444' }} />Needs Attention</span>
                <span className="reports-stat-value" style={{ fontSize: 13 }}>{summary.needsAttention.name}</span>
                <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{summary.needsAttention.salesGrowth.toFixed(1)}% vs prior</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Network trend — every branch on one chart */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>Sales trend by branch</div>
        <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 10 }}>Daily net sales for each store over the selected period</div>
        {loading ? (
          <div className="skeleton" style={{ height: 240, borderRadius: 10 }} />
        ) : trendData.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef1f5" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#8b97a7' }}
                axisLine={{ stroke: '#e6eaf0' }}
                tickLine={false}
                tickFormatter={(d) => { const dt = new Date(d); return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`; }}
              />
              <YAxis tick={{ fontSize: 10, fill: '#8b97a7' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v, name) => [formatMoney(v, baseCurrency), name]} contentStyle={{ borderRadius: 8, border: '1px solid #e6eaf0', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {rows.map((b, i) => (
                <Line key={b.branchId} type="monotone" dataKey={b.branchId} name={b.name} stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="dashboard-empty">No sales recorded for this period yet.</div>
        )}
      </div>

      {/* Ranked comparison list */}
      <div className="reports-list-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332' }}>Branch leaderboard</div>
            <div style={{ fontSize: 12, color: '#8b97a7' }}>Ranked by {SORT_OPTIONS.find((s) => s.id === sortBy)?.label.toLowerCase()}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#f0f2f5', borderRadius: 6, padding: 2 }}>
            {SORT_OPTIONS.map((opt) => (
              <button key={opt.id} className={`reports-filter-option ${sortBy === opt.id ? 'is-active' : ''}`}
                onClick={() => setSortBy(opt.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 10 }} />
        ) : !sortedRows.length ? (
          <div className="dashboard-empty" style={{ height: 100 }}>No branch data for this period yet.</div>
        ) : (
          sortedRows.map((b, index) => (
            <div key={b.branchId} className="reports-list-item" style={{ alignItems: 'flex-start' }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6, background: index === 0 ? '#fef3c7' : '#f0f2f5',
                color: index === 0 ? '#d97706' : '#8b97a7', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
              }}>#{index + 1}</div>
              <div className="reports-list-item-info">
                <div className="reports-list-item-title">{b.name}</div>
                <div className="reports-list-item-sub">
                  <span>{formatNumber(b.transactions)} transactions</span>
                  <span>Avg {formatMoney(b.avgSale, baseCurrency)}</span>
                  <span>{b.margin.toFixed(1)}% margin</span>
                  <span><Users size={10} style={{ verticalAlign: -1, marginRight: 2 }} />{b.employeeCount} staff</span>
                  <span>{b.refundRate.toFixed(1)}% refund rate</span>
                  {b.topCategory && <span>Top: {b.topCategory}</span>}
                  <span>{b.salesShare.toFixed(1)}% of network sales</span>
                </div>
              </div>
              <div className="reports-list-item-right">
                <div className="reports-list-item-amount">{formatMoney(b.sales, baseCurrency)}</div>
                <div style={{ fontSize: 11, color: '#5e6f8a', marginTop: 2 }}>{formatMoney(b.profit, baseCurrency)} profit</div>
                <GrowthBadge value={b.salesGrowth} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}