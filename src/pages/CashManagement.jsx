// src/pages/CashManagement.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Store, X, ArrowDownCircle, ArrowUpCircle, FileText,
  Download, Wallet, Filter, Lock,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, toApiDate, downloadCsv } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import '../styles/ReportsShared.css';

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

const TX_TYPES = {
  pay_in: { label: 'Pay In', icon: ArrowDownCircle, color: '#16A34A', bg: '#DCFCE7', sign: '+' },
  pay_out: { label: 'Pay Out', icon: ArrowUpCircle, color: '#EF4444', bg: '#FEE2E2', sign: '-' },
  expense: { label: 'Expense', icon: FileText, color: '#0891B2', bg: '#FEF3C7', sign: '-' },
};

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Transactions' },
  { value: 'pay_in', label: 'Pay Ins' },
  { value: 'pay_out', label: 'Pay Outs' },
  { value: 'expense', label: 'Expenses' },
];

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'mobile', label: 'Mobile Pay' },
];

export default function CashManagement() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, userProfile, hasBackofficePermission } = useAppContext();

  // ✅ Use the shared selected branch hook with "All Stores" option
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });

  // ✅ Check permission
  const canViewCashManagement = hasBackofficePermission(BACKOFFICE_PERMISSIONS.VIEW_SALES_REPORTS);

  const {
    startDate, endDate, selectedOption, handleOptionSelect, navigateDate, reload: reloadDateRange,
  } = useDateRange('today');

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [allTransactions, setAllTransactions] = useState([]);
  const [openShifts, setOpenShifts] = useState({});
  const [typeFilter, setTypeFilter] = useState('all');
  const [typePopup, setTypePopup] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [txType, setTxType] = useState('pay_in');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txPaymentMethod, setTxPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const parseTx = useCallback((t, branchName, branchId) => ({
    ...t,
    id: t.id,
    store: branchName,
    branchId,
    type: t.type,
    amountInBaseCurrency: t.amountInBaseCurrency || t.amount || 0,
  }), []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const params = new URLSearchParams();
      params.append('startDate', String(start.getTime()));
      params.append('endDate', String(end.getTime()));
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const targetBranches = selectedBranchId === 'all'
        ? (branches && branches.length ? branches : await apiFetch(`/business/${businessId}/branches`))
        : branches.filter((b) => b.branchId === selectedBranchId);

      let txs = [];
      const shiftsMap = {};

      await Promise.all(targetBranches.map(async (branch) => {
        try {
          const txRes = await apiFetch(`/business/${businessId}/branches/${branch.branchId}/cash-transactions?${params.toString()}`);
          const list = Array.isArray(txRes.data || txRes) ? (txRes.data || txRes) : [];
          txs.push(...list.map((t) => parseTx(t, branch.name, branch.branchId)));
        } catch (e) {
          console.error(`Cash transactions fetch failed for ${branch.name}:`, e);
        }

        try {
          const shiftRes = await apiFetch(`/business/${businessId}/branches/${branch.branchId}/shifts/open`);
          if (shiftRes?.shift) shiftsMap[branch.branchId] = shiftRes.shift;
        } catch (e) {
          console.error(`Open shift fetch failed for ${branch.name}:`, e);
        }
      }));

      txs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAllTransactions(txs);
      setOpenShifts(shiftsMap);
    } catch (e) {
      console.error('Fetch cash transactions error:', e);
      setError('Failed to load cash transactions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, apiFetch, branches, startDate, endDate, selectedBranchId, typeFilter, parseTx]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') reloadDateRange(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadDateRange]);

  useEffect(() => {
    const onPop = () => reloadDateRange();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [reloadDateRange]);

  useEffect(() => {
    if (businessId && branches) fetchData();
  }, [businessId, branches, startDate, endDate, selectedBranchId, typeFilter, fetchData]);

  useEffect(() => { setVisibleCount(20); }, [selectedBranchId, startDate, endDate, typeFilter]);

  const stats = useMemo(() => {
    const payIn = allTransactions.filter((t) => t.type === 'pay_in');
    const payOut = allTransactions.filter((t) => t.type === 'pay_out');
    const expense = allTransactions.filter((t) => t.type === 'expense');
    const cashInDrawer = Object.values(openShifts).reduce((sum, s) => sum + (s.expectedAmount || 0), 0);
    return {
      cashInDrawer,
      payInTotal: payIn.reduce((s, t) => s + t.amountInBaseCurrency, 0), payInCount: payIn.length,
      payOutTotal: payOut.reduce((s, t) => s + t.amountInBaseCurrency, 0), payOutCount: payOut.length,
      expenseTotal: expense.reduce((s, t) => s + t.amountInBaseCurrency, 0), expenseCount: expense.length,
    };
  }, [allTransactions, openShifts]);

  const visibleTransactions = useMemo(() => allTransactions.slice(0, visibleCount), [allTransactions, visibleCount]);

  const handleExportCsv = useCallback(() => {
    if (isExporting || !allTransactions.length) return;
    setIsExporting(true);
    try {
      const header = ['Type', 'Store', 'Shift #', 'Description', 'Amount', 'Payment Method', 'Cashier', 'Date'];
      const rows = allTransactions.map((t) => [
        TX_TYPES[t.type]?.label || t.type,
        t.store,
        t.shiftNumber ?? '',
        t.description || '',
        t.amountInBaseCurrency.toFixed(2),
        t.paymentMethod || 'cash',
        t.cashierName || '',
        new Date(t.createdAt).toLocaleString(),
      ]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`cash-management_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...rows]);
    } finally {
      setIsExporting(false);
    }
  }, [allTransactions, selectedBranchId, selectedBranchName, startDate, endDate, isExporting]);

  // ─── PDF EXPORT ─────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !allTransactions.length) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
      doc.setFontSize(14);
      doc.text('Cash Management Report', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${selectedBranchName} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      const tableHead = [['Type', 'Store', 'Shift #', 'Description', 'Amount', 'Payment Method', 'Cashier', 'Date']];
      const tableBody = allTransactions.map((t) => [
        TX_TYPES[t.type]?.label || t.type,
        t.store,
        t.shiftNumber ?? '—',
        t.description || '',
        formatMoney(t.amountInBaseCurrency, baseCurrency),
        t.paymentMethod || 'cash',
        t.cashierName || '',
        new Date(t.createdAt).toLocaleString(),
      ]);

      autoTable(doc, {
        startY: 58,
        head: tableHead,
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      const finalY = doc.lastAutoTable.finalY + 20;
      doc.setFontSize(10);
      doc.setTextColor(20, 24, 30);
      doc.text(`Cash In Drawer: ${formatMoney(stats.cashInDrawer, baseCurrency)}`, 32, finalY);
      doc.text(`Pay In: +${formatMoney(stats.payInTotal, baseCurrency)} (${stats.payInCount})`, 32, finalY + 16);
      doc.text(`Pay Out: -${formatMoney(stats.payOutTotal, baseCurrency)} (${stats.payOutCount})`, 32, finalY + 32);
      doc.text(`Expenses: -${formatMoney(stats.expenseTotal, baseCurrency)} (${stats.expenseCount})`, 32, finalY + 48);

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`cash-management_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [allTransactions, stats, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf]);

  const openAddModal = (type) => {
    if (selectedBranchId === 'all') {
      setStoreModalOpen(true);
      return;
    }
    if (!openShifts[selectedBranchId]) {
      setError('No open shift for this store — open a shift on the POS first.');
      return;
    }
    setTxType(type);
    setTxAmount('');
    setTxDescription('');
    setTxPaymentMethod('cash');
    setAddModalOpen(true);
  };

  const handleSubmitTransaction = useCallback(async () => {
    const shift = openShifts[selectedBranchId];
    const amount = parseFloat(txAmount);
    if (!shift) { setError('No open shift for this store.'); return; }
    if (isNaN(amount) || amount <= 0) return;
    if (!txDescription.trim()) return;

    setSubmitting(true);
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/cash-transactions`, {
        method: 'POST',
        body: JSON.stringify({
          shiftId: shift.shiftId || shift.id,
          shiftNumber: shift.shiftNumber,
          type: txType,
          amount,
          currency: baseCurrency?.code || 'USD',
          exchangeRate: 1,
          description: txDescription.trim(),
          paymentMethod: txPaymentMethod,
          cashierId: userProfile?.uid || 'dashboard',
          cashierName: userProfile?.name || userProfile?.email?.split('@')[0] || 'Owner',
          posId: shift.posId || 'web-dashboard',
        }),
      });
      setAddModalOpen(false);
      await fetchData(true);
    } catch (e) {
      console.error('Add transaction error:', e);
      setError('Failed to record transaction');
    } finally {
      setSubmitting(false);
    }
  }, [apiFetch, businessId, selectedBranchId, openShifts, txType, txAmount, txDescription, txPaymentMethod, baseCurrency, userProfile, fetchData]);

  // ✅ Access Denied
  if (!canViewCashManagement) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view cash management.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ─── Show loading bar instead of full screen spinner ──────────────────
  const showLoadingBar = loading || refreshing || isExporting || exportingPdf || submitting;

  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Cash Management</div>
              <div className="reports-header-sub">Track cash flow and drawer activity</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !allTransactions.length}>
              CSV
            </Button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !allTransactions.length} loading={exportingPdf}>
              PDF
            </Button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <DateRangeNav startDate={startDate} endDate={endDate} selectedOption={selectedOption} onNavigate={navigateDate} onOptionSelect={handleOptionSelect} />
        </div>

        <div className="reports-stats-row">
          <div className="reports-stat-card" style={{ background: '#EFF6FF', borderColor: '#BFDBFE' }}>
            <span className="reports-stat-label">Cash In Drawer</span>
            <span className="reports-stat-value">{formatMoney(stats.cashInDrawer, baseCurrency)}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Pay In</span>
            <span className="reports-stat-value" style={{ color: '#16A34A' }}>+{formatMoney(stats.payInTotal, baseCurrency)}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Pay Out</span>
            <span className="reports-stat-value" style={{ color: '#EF4444' }}>-{formatMoney(stats.payOutTotal, baseCurrency)}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Expenses</span>
            <span className="reports-stat-value" style={{ color: '#0891B2' }}>-{formatMoney(stats.expenseTotal, baseCurrency)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" icon={ArrowDownCircle} onClick={() => openAddModal('pay_in')}>Pay In</Button>
          <Button variant="secondary" size="sm" icon={ArrowUpCircle} onClick={() => openAddModal('pay_out')}>Pay Out</Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={() => openAddModal('expense')}>Add Expense</Button>
        </div>

        <div className="reports-toolbar">
          <div style={{ position: 'relative' }}>
            <button className="reports-filter-btn" onClick={() => setTypePopup(!typePopup)}>
              <Filter size={13} /> {TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter)?.label}
            </button>
            {typePopup && (
              <div className="reports-filter-popover">
                {TYPE_FILTER_OPTIONS.map((opt) => (
                  <button key={opt.value} className={`reports-filter-option ${typeFilter === opt.value ? 'is-active' : ''}`}
                    onClick={() => { setTypeFilter(opt.value); setTypePopup(false); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="reports-list-card">
          {error ? (
            <div className="reports-empty">
              <div className="reports-empty-title">{error}</div>
              <button onClick={() => { setError(null); fetchData(); }} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : visibleTransactions.length === 0 ? (
            <div className="reports-empty">
              <Wallet size={32} />
              <div className="reports-empty-title">No transactions found</div>
              <div className="reports-empty-sub">Try a different date range or filter</div>
            </div>
          ) : (
            <>
              {visibleTransactions.map((t) => {
                const cfg = TX_TYPES[t.type] || TX_TYPES.pay_in;
                const Icon = cfg.icon;
                return (
                  <div key={t.id} className="reports-list-item">
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                      <Icon size={16} color={cfg.color} />
                    </div>
                    <div className="reports-list-item-info">
                      <div className="reports-list-item-title">{cfg.label}{t.description ? ` — ${t.description}` : ''}</div>
                      <div className="reports-list-item-sub">
                        <span>{t.store}</span>
                        {t.shiftNumber && <span>Shift #{t.shiftNumber}</span>}
                        <span>{new Date(t.createdAt).toLocaleString()}</span>
                        <span>{t.cashierName}</span>
                      </div>
                    </div>
                    <div className="reports-list-item-right">
                      <div className="reports-list-item-amount" style={{ color: cfg.color }}>
                        {cfg.sign}{formatMoney(t.amountInBaseCurrency, baseCurrency)}
                      </div>
                      <div style={{ fontSize: 11, color: '#8b97a7' }}>{t.paymentMethod || 'cash'}</div>
                    </div>
                  </div>
                );
              })}
              {visibleTransactions.length < allTransactions.length && (
                <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button onClick={() => setVisibleCount((c) => c + 20)} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                    Load more ({allTransactions.length - visibleTransactions.length} remaining)
                  </button>
                </div>
              )}
            </>
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
                {branchOptions.map((opt) => (
                  <button key={opt.value} className={`reports-filter-option ${selectedBranchId === opt.value ? 'is-active' : ''}`}
                    onClick={() => { setSelectedBranchId(opt.value); setStoreModalOpen(false); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {addModalOpen && (
          <div className="reports-modal-overlay" onClick={() => setAddModalOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">{TX_TYPES[txType].label}</span>
                <button className="reports-modal-close" onClick={() => setAddModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body">
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {PAYMENT_METHODS.map((m) => (
                    <button key={m.id} onClick={() => setTxPaymentMethod(m.id)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${txPaymentMethod === m.id ? '#0891B2' : '#E2E8F0'}`,
                        background: txPaymentMethod === m.id ? '#EFF6FF' : '#F8FAFC',
                        color: txPaymentMethod === m.id ? '#0891B2' : '#64748B',
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Amount ({baseCurrency?.code || 'USD'})
                </label>
                <input
                  type="number" min="0" step="0.01" value={txAmount} onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="0.00" autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 16, marginBottom: 12, boxSizing: 'border-box' }}
                />
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Description</label>
                <input
                  type="text" value={txDescription} onChange={(e) => setTxDescription(e.target.value)}
                  placeholder="Enter description..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
                />
                <button
                  onClick={handleSubmitTransaction}
                  disabled={submitting || !txAmount || !txDescription.trim()}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    background: TX_TYPES[txType].color, opacity: submitting ? 0.7 : 1,
                  }}>
                  {submitting ? 'Saving...' : `Confirm ${TX_TYPES[txType].label}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}