// src/pages/StaffPerformance.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Store, Download, FileText, Lock, UserCog,
  TrendingUp, TrendingDown, Minus, Award, Users, RotateCcw,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, formatNumber, downloadCsv, toApiDate } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';
import { getModuleInfo } from '../utils/moduleCatalog';
import '../styles/ReportsShared.css';
import { useSelectedBranch } from '../hooks/useSelectedBranch';

const SORT_OPTIONS = [
  { id: 'sales', label: 'Sales' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'avgSale', label: 'Avg Sale' },
  { id: 'growth', label: 'Growth' },
];

const ROLE_META = {
  owner: { color: '#357abd', bg: '#e6eef9' },
  admin: { color: '#357abd', bg: '#e6eef9' },
  manager: { color: '#9C27B0', bg: '#f3e5f9' },
  cashier: { color: '#16a34a', bg: '#dcfce7' },
  stock_controller: { color: '#d97706', bg: '#fef3c7' },
};

function roleLabel(role) {
  if (!role) return 'Staff';
  return role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

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

// Mirrors the backend's resolvePreviousRange: the immediately-preceding
// range of equal length, so "growth" always compares like-for-like.
function computePreviousRange(startDate, endDate) {
  const lengthDays = Math.round((endDate - startDate) / 86400000) + 1;
  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (lengthDays - 1));
  return { prevStart, prevEnd };
}

export default function StaffPerformance() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, hasBackofficePermission } = useAppContext();
  const canView = hasBackofficePermission(BACKOFFICE_PERMISSIONS.MANAGE_EMPLOYEES);

  // ✅ Module gate for Analytics
  const { guardAction, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();
  const hasAnalytics = hasModuleAccess('analytics');

  const { startDate, endDate, selectedOption, handleOptionSelect, navigateDate, reload: reloadDateRange } = useDateRange('last30days');

  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState('sales');
  const [roleFilter, setRoleFilter] = useState('all');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const { prevStart, prevEnd } = computePreviousRange(startDate, endDate);

      const curParams = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      const prevParams = new URLSearchParams({ startDate: toApiDate(prevStart), endDate: toApiDate(prevEnd) });
      if (selectedBranchId !== 'all') {
        curParams.set('branchId', selectedBranchId);
        prevParams.set('branchId', selectedBranchId);
      }

      const [curRes, prevRes] = await Promise.all([
        apiFetch(`/business/${businessId}/reports/sales-by/employee?${curParams.toString()}`),
        apiFetch(`/business/${businessId}/reports/sales-by/employee?${prevParams.toString()}`),
      ]);

      const prevById = {};
      (prevRes.rows || []).forEach((r) => { prevById[r.id] = r; });

      const merged = (curRes.rows || []).map((r) => {
        const prev = prevById[r.id];
        const prevSales = prev?.sales || 0;
        const growth = prevSales > 0 ? ((r.sales - prevSales) / prevSales) * 100 : (r.sales > 0 ? 100 : 0);
        return {
          ...r,
          avgSale: r.transactions > 0 ? r.sales / r.transactions : 0,
          growth,
        };
      });

      setRows(merged);
    } catch (e) {
      console.error('Staff performance error:', e);
      setError('Failed to load cashier performance');
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

  useEffect(() => { 
    if (businessId && hasAnalytics) {
      load(); 
    }
  }, [businessId, startDate, endDate, selectedBranchId, load, hasAnalytics]);

  const availableRoles = useMemo(() => {
    const set = new Set(rows.map((r) => r.role).filter(Boolean));
    return Array.from(set);
  }, [rows]);

  const filteredRows = useMemo(
    () => (roleFilter === 'all' ? rows : rows.filter((r) => r.role === roleFilter)),
    [rows, roleFilter]
  );

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    switch (sortBy) {
      case 'transactions': return copy.sort((a, b) => (b.transactions || 0) - (a.transactions || 0));
      case 'avgSale': return copy.sort((a, b) => b.avgSale - a.avgSale);
      case 'growth': return copy.sort((a, b) => b.growth - a.growth);
      default: return copy.sort((a, b) => (b.sales || 0) - (a.sales || 0));
    }
  }, [filteredRows, sortBy]);

  const totals = useMemo(() => {
    const sales = filteredRows.reduce((s, r) => s + (r.sales || 0), 0);
    const transactions = filteredRows.reduce((s, r) => s + (r.transactions || 0), 0);
    return {
      staffCount: filteredRows.length,
      sales,
      transactions,
      avgSale: transactions > 0 ? sales / transactions : 0,
      topPerformer: [...filteredRows].sort((a, b) => (b.sales || 0) - (a.sales || 0))[0] || null,
    };
  }, [filteredRows]);

  const handleExportCsv = useCallback(() => {
    if (!guardAction('analytics')) return;
    if (isExportingCsv || !sortedRows.length) return;
    setIsExportingCsv(true);
    try {
      const header = ['Rank', 'Name', 'Role', 'Branch', 'Sales', 'Transactions', 'Avg Sale', 'Growth (%)', 'Share (%)'];
      const csvRows = sortedRows.map((r, i) => [
        i + 1, r.name, roleLabel(r.role), r.branchName || '', (r.sales || 0).toFixed(2),
        r.transactions || 0, r.avgSale.toFixed(2), r.growth.toFixed(1), (r.percentage || 0).toFixed(1),
      ]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`cashier-performance_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...csvRows]);
    } finally {
      setIsExportingCsv(false);
    }
  }, [sortedRows, selectedBranchId, selectedBranchName, startDate, endDate, isExportingCsv, guardAction]);

  const handleExportPdf = useCallback(async () => {
    if (!guardAction('analytics')) return;
    if (exportingPdf || !sortedRows.length) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
      doc.setFontSize(14);
      doc.text('Cashier Performance', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${selectedBranchName} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      autoTable(doc, {
        startY: 58,
        head: [['Metric', 'Value']],
        body: [
          ['Active Staff', String(totals.staffCount)],
          ['Total Sales', formatMoney(totals.sales, baseCurrency)],
          ['Total Transactions', formatNumber(totals.transactions)],
          ['Avg Sale', formatMoney(totals.avgSale, baseCurrency)],
          ['Top Performer', totals.topPerformer?.name || '—'],
        ],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Rank', 'Name', 'Role', 'Sales', 'Transactions', 'Avg Sale', 'Growth']],
        body: sortedRows.map((r, i) => [
          i + 1, r.name, roleLabel(r.role), formatMoney(r.sales, baseCurrency),
          formatNumber(r.transactions), formatMoney(r.avgSale, baseCurrency),
          `${r.growth >= 0 ? '+' : ''}${r.growth.toFixed(1)}%`,
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`cashier-performance_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [sortedRows, totals, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf, guardAction]);

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

  // ─── PERMISSION CHECK ────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view cashier performance.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  // ─── MODULE ACCESS DENIED ────────────────────────────────────────────────────
  if (!hasAnalytics) {
    const moduleInfo = getModuleInfo('analytics');
    return (
      <div className="reports-page">
        {/* ✅ Store selector ALWAYS visible, even when access denied */}
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Cashier Performance</div>
              <div className="reports-header-sub">Sales, volume, and growth by staff member</div>
            </div>
          </div>
          <div className="reports-header-right">
            {hasMultipleBranches && (
              <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
                <Store size={14} /><span>{selectedBranchName}</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Lock size={32} color="#EF4444" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
              {moduleInfo?.label || 'Analytics'} Required
            </h2>
            <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>
              You need the <strong>{moduleInfo?.label || 'Analytics'}</strong> module to view cashier performance for <strong>{selectedBranchName}</strong>.
              Please subscribe to unlock this functionality.
            </p>
            <div style={{ marginTop: 16, fontSize: 13, color: '#94A3B8' }}>
              {moduleInfo?.price && (
                <span>Price: {moduleInfo.price}{moduleInfo.period || '/month'}</span>
              )}
            </div>
            <button 
              onClick={() => guardAction('analytics')}
              style={{ 
                marginTop: 20,
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: '#0891B2',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Subscribe Now
            </button>
          </div>
        </div>

        {/* Store selector modal */}
        {renderStoreModal()}

        {/* ✅ Module gate modal */}
        {gateModalModuleId && (
          <ModuleSubscriptionModal
            moduleId={gateModalModuleId}
            moduleState={getModuleState(gateModalModuleId)}
            onClose={closeGateModal}
          />
        )}
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">Cashier Performance</div>
            <div className="reports-header-sub">Sales, volume, and growth by staff member</div>
          </div>
        </div>
        <div className="reports-header-right">
          {hasMultipleBranches && (
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /><span>{selectedBranchName}</span>
            </button>
          )}
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExportingCsv || !sortedRows.length}>CSV</Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !sortedRows.length} loading={exportingPdf}>PDF</Button>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => load(true)} loading={refreshing}>Refresh</Button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <DateRangeNav startDate={startDate} endDate={endDate} selectedOption={selectedOption} onNavigate={navigateDate} onOptionSelect={handleOptionSelect} />
      </div>

      {error && <div className="dashboard-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* KPI row */}
      <div className="reports-stats-row" style={{ marginBottom: 16 }}>
        {[
          { label: 'Active Staff', value: !loading ? formatNumber(totals.staffCount) : '' },
          { label: 'Total Sales', value: !loading ? formatMoney(totals.sales, baseCurrency) : '' },
          { label: 'Total Transactions', value: !loading ? formatNumber(totals.transactions) : '' },
          { label: 'Avg Sale', value: !loading ? formatMoney(totals.avgSale, baseCurrency) : '' },
        ].map((stat) => (
          <div className="reports-stat-card" key={stat.label}>
            <span className="reports-stat-label">{stat.label}</span>
            {loading ? <div className="skeleton" style={{ height: 18, borderRadius: 4, marginTop: 4 }} /> : <span className="reports-stat-value">{stat.value}</span>}
          </div>
        ))}
        {!loading && totals.topPerformer && (
          <div className="reports-stat-card">
            <span className="reports-stat-label"><Award size={11} style={{ marginRight: 4, verticalAlign: -1, color: '#d97706' }} />Top Performer</span>
            <span className="reports-stat-value" style={{ fontSize: 13 }}>{totals.topPerformer.name}</span>
            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{formatMoney(totals.topPerformer.sales, baseCurrency)}</div>
          </div>
        )}
      </div>

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
        {availableRoles.length > 1 && (
          <>
            <span style={{ fontSize: 12, color: '#8b97a7', fontWeight: 500, marginLeft: 8 }}>Role</span>
            <div style={{ display: 'flex', gap: 4, background: '#f0f2f5', borderRadius: 6, padding: 2, flexWrap: 'wrap' }}>
              <button className={`reports-filter-option ${roleFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setRoleFilter('all')} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto' }}>All</button>
              {availableRoles.map((role) => (
                <button key={role} className={`reports-filter-option ${roleFilter === role ? 'is-active' : ''}`}
                  onClick={() => setRoleFilter(role)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto' }}>
                  {roleLabel(role)}
                </button>
              ))}
            </div>
          </>
        )}
        <span style={{ fontSize: 12, color: '#8b97a7', marginLeft: 'auto' }}>{sortedRows.length} staff</span>
      </div>

      {/* Leaderboard */}
      <div className="reports-list-card">
        {loading ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 10, margin: 16 }} />
        ) : sortedRows.length === 0 ? (
          <div className="reports-empty">
            <UserCog size={32} />
            <div className="reports-empty-title">No staff sales in this period</div>
            <div className="reports-empty-sub">Try a different date range, store, or role filter</div>
          </div>
        ) : (
          sortedRows.map((r, index) => {
            const meta = ROLE_META[r.role] || { color: '#8b97a7', bg: '#f0f2f5' };
            return (
              <div key={r.id} className="reports-list-item" style={{ alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6, background: index === 0 ? '#fef3c7' : '#f0f2f5',
                  color: index === 0 ? '#d97706' : '#8b97a7', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
                }}>#{index + 1}</div>
                <div className="reports-list-item-info">
                  <div className="reports-list-item-title">
                    {r.name}
                    <span style={{
                      marginLeft: 8, padding: '2px 7px', borderRadius: 5, background: meta.bg, color: meta.color,
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', verticalAlign: 1,
                    }}>{roleLabel(r.role)}</span>
                  </div>
                  <div className="reports-list-item-sub">
                    {r.branchName && <span>{r.branchName}</span>}
                    <span>{formatNumber(r.transactions)} transactions</span>
                    <span>Avg {formatMoney(r.avgSale, baseCurrency)}</span>
                    <span>{(r.percentage || 0).toFixed(1)}% of network sales</span>
                  </div>
                </div>
                <div className="reports-list-item-right">
                  <div className="reports-list-item-amount">{formatMoney(r.sales, baseCurrency)}</div>
                  <GrowthBadge value={r.growth} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {renderStoreModal()}

      {/* ✅ Module gate modal */}
      {gateModalModuleId && (
        <ModuleSubscriptionModal
          moduleId={gateModalModuleId}
          moduleState={getModuleState(gateModalModuleId)}
          onClose={closeGateModal}
        />
      )}
    </div>
  );
}