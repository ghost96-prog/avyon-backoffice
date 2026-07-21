// src/pages/InventoryAnalytics.jsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  ChevronLeft, Store, Lock, Boxes, TrendingUp, TrendingDown, Minus,
  AlertTriangle, PackageX, Clock, ArrowLeftRight,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import DateRangeNav from '../components/common/DateRangeNav';
import { useDateRange } from '../hooks/useDateRange';
import Button from '../components/common/Button';
import { formatMoney, formatNumber, toApiDate } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';
import { getModuleInfo } from '../utils/moduleCatalog';
import '../styles/ReportsShared.css';
import './Dashboard.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const URGENCY_META = {
  critical: { color: '#ef4444', bg: '#fee2e2', label: 'Critical' },
  high: { color: '#d97706', bg: '#fef3c7', label: 'High' },
  medium: { color: '#357abd', bg: '#e6eef9', label: 'Medium' },
};

// ✅ NEW — number of parallel report calls `load()` fires, used to drive
// the progress bar below (5 endpoints: performance, reorder, forecast,
// dead-stock, movements).
const TOTAL_ANALYTICS_CALLS = 5;

// ✅ NEW — inline progress bar shown while the analytics report calls are
// in flight. Unlike InventoryValue's InlineLoadProgress (which estimates
// progress via a log curve because it doesn't know the total page count
// up front), here we know exactly how many calls are outstanding, so the
// bar fills in exact fifths as each request resolves.
const LoadProgressBar = ({ loading, completed, total }) => {
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else if (visible) {
      hideTimeoutRef.current = setTimeout(() => setVisible(false), 500);
    }
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (!visible) return null;

  const percent = loading ? Math.min(100, Math.round((completed / total) * 100)) : 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190 }}>
      <div style={{ width: 90, height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 3,
          background: percent >= 100 ? '#16A34A' : 'linear-gradient(90deg, #234C6A 0%, #3B82F6 100%)',
          transition: 'width 0.35s ease, background 0.25s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>
        {percent >= 100 ? 'Loaded' : `Loading data… (${completed}/${total})`}
      </span>
    </div>
  );
};

function TrendIcon({ trend }) {
  if (trend === 'up') return <TrendingUp size={12} color="#16a34a" />;
  if (trend === 'down') return <TrendingDown size={12} color="#ef4444" />;
  return <Minus size={12} color="#8b97a7" />;
}

function HealthBar({ healthyPercent, lowStockPercent, outOfStockPercent }) {
  return (
    <div style={{ height: 10, borderRadius: 6, overflow: 'hidden', display: 'flex', background: '#f0f2f5' }}>
      <div style={{ width: `${healthyPercent}%`, background: '#16a34a' }} />
      <div style={{ width: `${lowStockPercent}%`, background: '#d97706' }} />
      <div style={{ width: `${outOfStockPercent}%`, background: '#ef4444' }} />
    </div>
  );
}

export default function InventoryAnalytics() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, hasBackofficePermission } = useAppContext();
  const canView = hasBackofficePermission(BACKOFFICE_PERMISSIONS.ADVANCED_INVENTORY);

  // ✅ Module gate for Analytics
  const { guardAction, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();
  const hasAnalytics = hasModuleAccess('analytics');

  // ✅ Use the shared selected branch hook with "All Stores" option
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });

  const { startDate, endDate, selectedOption, handleOptionSelect, navigateDate, reload: reloadDateRange } = useDateRange('last30days');

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  const [urgencyFilter, setUrgencyFilter] = useState('all');

  const [performance, setPerformance] = useState(null);
  const [reorder, setReorder] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [deadStock, setDeadStock] = useState(null);
  const [movements, setMovements] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // ✅ NEW — how many of the TOTAL_ANALYTICS_CALLS report calls have
  // resolved so far; drives LoadProgressBar.
  const [loadCompleted, setLoadCompleted] = useState(0);

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const load = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    setLoadCompleted(0);
    try {
      const rangeParams = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      const branchParams = new URLSearchParams();
      if (selectedBranchId !== 'all') {
        rangeParams.set('branchId', selectedBranchId);
        branchParams.set('branchId', selectedBranchId);
      }
      const reorderParams = new URLSearchParams(branchParams);
      reorderParams.set('leadTimeDays', leadTimeDays);

      // ✅ NEW — wraps each call so LoadProgressBar can tick up as each of
      // the 5 report endpoints resolves, instead of the whole KPI/section
      // block staying blank until every request comes back at once.
      const trackedFetch = (url) => apiFetch(url).then((res) => {
        setLoadCompleted((c) => c + 1);
        return res;
      });

      const [perf, reo, fc, dead, moves] = await Promise.all([
        trackedFetch(`/business/${businessId}/reports/inventory-performance?${rangeParams.toString()}`),
        trackedFetch(`/business/${businessId}/reports/reorder-recommendations?${reorderParams.toString()}`),
        trackedFetch(`/business/${businessId}/reports/demand-forecast?${branchParams.toString()}`),
        trackedFetch(`/business/${businessId}/reports/dead-stock?${branchParams.toString()}`),
        trackedFetch(`/business/${businessId}/reports/stock-movement-analytics?${rangeParams.toString()}`),
      ]);
      setPerformance(perf);
      setReorder(reo);
      setForecast(fc);
      setDeadStock(dead);
      setMovements(moves);
    } catch (e) {
      console.error('Inventory analytics error:', e);
      setError('Failed to load inventory analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId, leadTimeDays]);

  useEffect(() => {
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') reloadDateRange(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadDateRange]);

  useEffect(() => { 
    if (businessId && hasAnalytics) {
      load(); 
    }
  }, [businessId, startDate, endDate, selectedBranchId, leadTimeDays, load, hasAnalytics]);

  const filteredRecs = useMemo(() => {
    const recs = reorder?.recommendations || [];
    return urgencyFilter === 'all' ? recs : recs.filter((r) => r.urgency === urgencyFilter);
  }, [reorder, urgencyFilter]);

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

  // ─── ACCESS DENIED ────────────────────────────────────────────────────────
  if (!hasAnalytics) {
    const moduleInfo = getModuleInfo('analytics');
    return (
      <div className="reports-page">
        {/* ✅ Store selector ALWAYS visible, even when access denied */}
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Inventory Intelligence</div>
              <div className="reports-header-sub">Turnover, demand forecasting, and reorder guidance</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /><span>{selectedBranchName}</span>
            </button>
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
              You need the <strong>{moduleInfo?.label || 'Analytics'}</strong> module to view inventory intelligence for <strong>{selectedBranchName}</strong>.
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

  // ─── PERMISSION CHECK ────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view inventory intelligence.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>Go Back</button>
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
            <div className="reports-header-title">Inventory Intelligence</div>
            <div className="reports-header-sub">Turnover, demand forecasting, and reorder guidance</div>
          </div>
        </div>
        <div className="reports-header-right">
          <LoadProgressBar loading={loading || refreshing} completed={loadCompleted} total={TOTAL_ANALYTICS_CALLS} />
          <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
            <Store size={14} /><span>{selectedBranchName}</span>
          </button>
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
          { label: 'Inventory Cost Value', value: performance ? formatMoney(performance.inventoryValue.totalCostValue, baseCurrency) : '' },
          { label: 'Retail Value', value: performance ? formatMoney(performance.inventoryValue.totalRetailValue, baseCurrency) : '' },
          { label: 'Turnover Ratio', value: performance ? `${performance.periodMetrics.turnoverRatio.toFixed(2)}x` : '' },
          { label: 'GMROI', value: performance ? `${performance.periodMetrics.gmroi.toFixed(2)}x` : '' },
          { label: 'Low Stock', value: performance ? formatNumber(performance.stockHealth.lowStockCount) : '' },
          { label: 'Out of Stock', value: performance ? formatNumber(performance.stockHealth.outOfStockCount) : '' },
        ].map((stat) => (
          <div className="reports-stat-card" key={stat.label}>
            <span className="reports-stat-label">{stat.label}</span>
            {loading ? <div className="skeleton" style={{ height: 18, borderRadius: 4, marginTop: 4 }} /> : <span className="reports-stat-value">{stat.value}</span>}
          </div>
        ))}
      </div>

      {/* Stock health + category value */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 10 }}>Stock health</div>
        {loading ? <div className="skeleton" style={{ height: 10, borderRadius: 6 }} /> : performance && (
          <>
            <HealthBar {...performance.stockHealth} />
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#5e6f8a', flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#16a34a', marginRight: 5 }} />Healthy: {performance.stockHealth.healthyCount}</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#d97706', marginRight: 5 }} />Low: {performance.stockHealth.lowStockCount}</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ef4444', marginRight: 5 }} />Out: {performance.stockHealth.outOfStockCount}</span>
            </div>
          </>
        )}

        {!loading && performance?.valueByCategory?.length > 0 && (
          <div className="category-panel" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 6 }}>Inventory value by category</div>
            <div className="category-list">
              {performance.valueByCategory.slice(0, 8).map((c, i) => (
                <div key={c.categoryId} className="category-row" style={{ padding: '7px 2px' }}>
                  <div className="category-row-label" style={{ minWidth: 0 }}>
                    <span className="color-dot" style={{ background: ['#357abd', '#50C878', '#FF6B6B', '#FFD93D', '#9C27B0', '#FF9800', '#00BCD4', '#A9A9A9'][i % 8] }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.categoryName}</div>
                      <div style={{ fontSize: 10.5, color: '#8b97a7' }}>{c.items} items in stock</div>
                    </div>
                  </div>
                  <div className="category-row-value"><span>{formatMoney(c.costValue, baseCurrency)}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reorder recommendations */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332' }}>Reorder recommendations</div>
            <div style={{ fontSize: 12, color: '#8b97a7' }}>
              {reorder ? `${reorder.criticalCount} critical · ${reorder.highCount} high priority` : 'Based on recent sales velocity'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select value={leadTimeDays} onChange={(e) => setLeadTimeDays(Number(e.target.value))}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e6eaf0', background: '#fff' }}>
              {[3, 5, 7, 14, 21].map((d) => <option key={d} value={d}>{d}-day lead time</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4, background: '#f0f2f5', borderRadius: 6, padding: 2 }}>
              {['all', 'critical', 'high', 'medium'].map((u) => (
                <button key={u} className={`reports-filter-option ${urgencyFilter === u ? 'is-active' : ''}`}
                  onClick={() => setUrgencyFilter(u)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 12, width: 'auto', textTransform: 'capitalize' }}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
        ) : filteredRecs.length === 0 ? (
          <div className="dashboard-empty" style={{ height: 80 }}>Nothing needs reordering right now.</div>
        ) : (
          filteredRecs.slice(0, 30).map((r) => {
            const meta = URGENCY_META[r.urgency];
            return (
              <div key={`${r.branchId}-${r.productId}`} className="reports-list-item">
                <span style={{
                  padding: '3px 8px', borderRadius: 5, background: meta.bg, color: meta.color,
                  fontSize: 10.5, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase',
                }}>{meta.label}</span>
                <div className="reports-list-item-info">
                  <div className="reports-list-item-title">{r.name}</div>
                  <div className="reports-list-item-sub">
                    <span>SKU: {r.sku || '—'}</span>
                    <span>Stock: {r.currentStock}</span>
                    <span>~{r.avgDailySales.toFixed(1)}/day</span>
                    {r.daysUntilStockOut != null && <span>{r.daysUntilStockOut.toFixed(0)}d until out</span>}
                  </div>
                </div>
                <div className="reports-list-item-right">
                  <div className="reports-list-item-amount">Order {r.recommendedQty}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Demand forecast + dead stock, side by side stacked */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>Demand forecast</div>
        <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 10 }}>
          {forecast ? `Projected demand over the next ${forecast.horizonDays} days · ${forecast.stockOutRiskCount} at risk of stocking out` : ''}
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
        ) : !forecast?.items?.length ? (
          <div className="dashboard-empty" style={{ height: 80 }}>Not enough sales history to forecast demand yet.</div>
        ) : (
          forecast.items.slice(0, 15).map((f) => (
            <div key={f.productId} className="reports-list-item">
              <div className="reports-list-item-info">
                <div className="reports-list-item-title">{f.name}</div>
                <div className="reports-list-item-sub">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><TrendIcon trend={f.trend} /> {f.trend}</span>
                  <span>{f.avgDailyDemand.toFixed(1)}/day avg</span>
                  <span>Stock: {f.currentStock}</span>
                  {f.willStockOut && <span style={{ color: '#ef4444', fontWeight: 600 }}>Stock-out risk</span>}
                </div>
              </div>
              <div className="reports-list-item-right">
                <div className="reports-list-item-amount">{Math.round(f.forecastQty)} units</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>
          <PackageX size={14} style={{ marginRight: 6, verticalAlign: -2, color: '#8b97a7' }} />Dead stock
        </div>
        <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 10 }}>
          {deadStock ? `${deadStock.count} products, no sales in ${deadStock.noSaleDays}+ days · ${formatMoney(deadStock.totalTiedUpValue, baseCurrency)} tied up` : ''}
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 100, borderRadius: 10 }} />
        ) : !deadStock?.items?.length ? (
          <div className="dashboard-empty" style={{ height: 80 }}>No dead stock detected — nice work.</div>
        ) : (
          deadStock.items.slice(0, 15).map((d) => (
            <div key={d.productId} className="reports-list-item">
              <div className="reports-list-item-info">
                <div className="reports-list-item-title">{d.name}</div>
                <div className="reports-list-item-sub">
                  <span>{d.categoryName}</span>
                  <span>Stock: {d.currentStock}</span>
                  <span><Clock size={10} style={{ verticalAlign: -1, marginRight: 2 }} />{d.daysSinceLastSale != null ? `${d.daysSinceLastSale}d since last sale` : 'Never sold'}</span>
                </div>
              </div>
              <div className="reports-list-item-right">
                <div className="reports-list-item-amount" style={{ color: '#d97706' }}>{formatMoney(d.tiedUpValue, baseCurrency)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stock movement analytics */}
      <div className="reports-list-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>Stock movement activity</div>
        <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 10 }}>Daily movement volume for the selected period</div>
        {loading ? (
          <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />
        ) : movements?.dailyTrend?.length ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={movements.dailyTrend} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="moveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#357abd" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#357abd" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef1f5" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8b97a7' }} axisLine={{ stroke: '#e6eaf0' }} tickLine={false}
                tickFormatter={(d) => { const dt = new Date(d); return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`; }} />
              <YAxis tick={{ fontSize: 10, fill: '#8b97a7' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v, name) => [v, name === 'qty' ? 'Units moved' : 'Movements']} contentStyle={{ borderRadius: 8, border: '1px solid #e6eaf0', fontSize: 12 }} />
              <Area type="monotone" dataKey="qty" stroke="#357abd" strokeWidth={2} fill="url(#moveFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dashboard-empty">No stock movements recorded for this period.</div>
        )}

        {!loading && movements && (
          <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#8b97a7', marginBottom: 4 }}>By type</div>
              {movements.byType.slice(0, 6).map((t) => (
                <div key={t.type} style={{ fontSize: 12, color: '#1a2332', marginBottom: 2 }}>
                  {t.type.replace(/_/g, ' ')}: <strong>{t.count}</strong> ({formatNumber(t.totalQty)} units)
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b97a7', marginBottom: 4 }}>
                <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Conflicts
              </div>
              <div style={{ fontSize: 12, color: '#1a2332' }}>{movements.conflicts.count} oversells · {movements.conflicts.unfulfilledQty} units unfulfilled</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b97a7', marginBottom: 4 }}>
                <ArrowLeftRight size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Transfers
              </div>
              <div style={{ fontSize: 12, color: '#1a2332' }}>
                Out: {movements.transfers.outQty} · In: {movements.transfers.inQty} · Reversed: {movements.transfers.reversedQty}
              </div>
            </div>
          </div>
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