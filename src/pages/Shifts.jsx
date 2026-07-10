// src/pages/Shifts.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Store, Clock, X, Download, FileText, Lock } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import Button from '../components/common/Button';
import { formatMoney, toApiDate, downloadCsv } from '../utils/exportUtils';
import { BACKOFFICE_PERMISSIONS } from '../utils/permissions';
import '../styles/ReportsShared.css';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

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

const TX_CONFIG = {
  pay_in: { label: 'Pay In', icon: ArrowDownCircle, color: '#16A34A', bg: '#DCFCE7', sign: '+' },
  pay_out: { label: 'Pay Out', icon: ArrowUpCircle, color: '#EF4444', bg: '#FEE2E2', sign: '-' },
  expense: { label: 'Expense', icon: FileText, color: '#0891B2', bg: '#FEF3C7', sign: '-' },
};

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(openedAt, closedAt) {
  const end = closedAt || Date.now();
  const totalMins = Math.floor((end - openedAt) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Shifts() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, hasBackofficePermission } = useAppContext();

  // ✅ Check permission
  const canViewShifts = hasBackofficePermission(BACKOFFICE_PERMISSIONS.VIEW_SALES_REPORTS);

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
  const [allShifts, setAllShifts] = useState([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingShiftPdf, setExportingShiftPdf] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const parseShift = useCallback((s, branchName) => ({
    ...s,
    id: s.shiftId || s.id,
    store: branchName || s.store || 'Store',
    cashierName: s.cashierName || 'Staff',
    status: s.status || 'closed',
    openedAt: s.openedAt || Date.now(),
    closedAt: s.closedAt || null,
    shiftNumber: s.shiftNumber || 1,
    openingCash: s.openingCash || 0,
    closingCash: s.closingCash || null,
    grossSales: s.grossSales || 0,
    netSales: s.netSales || 0,
    totalRefunds: s.totalRefunds || 0,
    totalDiscounts: s.totalDiscounts || 0,
    receiptCount: s.receiptCount || 0,
    refundCount: s.refundCount || 0,
    cashSales: s.cashSales || 0,
    cardSales: s.cardSales || 0,
    mobileSales: s.mobileSales || 0,
    otherSales: s.otherSales || 0,
    totalPayIn: s.totalPayIn || 0,
    totalPayOut: s.totalPayOut || 0,
    totalExpenses: s.totalExpenses || 0,
    baseCurrencyCode: s.baseCurrencyCode || 'USD',
    currencyBreakdown: Array.isArray(s.currencyBreakdown) ? s.currencyBreakdown : [],
    expectedAmount: s.expectedAmount || s.openingCash || 0,
  }), []);

  const fetchShifts = useCallback(async (isRefresh = false) => {
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

      let allData = [];

      if (selectedBranchId === 'all') {
        const branchesData = await apiFetch(`/business/${businessId}/branches`);
        for (const branch of branchesData) {
          try {
            const response = await apiFetch(`/business/${businessId}/branches/${branch.branchId}/shifts?${params.toString()}`);
            const list = Array.isArray(response.data || response) ? (response.data || response) : [];
            allData = [...allData, ...list.map(s => parseShift(s, branch.name))];
          } catch (e) { /* ignore */ }
        }
      } else {
        const response = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/shifts?${params.toString()}`);
        const list = Array.isArray(response.data || response) ? (response.data || response) : [];
        const branchName = branches.find(b => b.branchId === selectedBranchId)?.name || 'Store';
        allData = list.map(s => parseShift(s, branchName));
      }

      allData.sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
      setAllShifts(allData);
    } catch (e) {
      console.error('Fetch shifts error:', e);
      setError('Failed to load shifts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, apiFetch, startDate, endDate, selectedBranchId, parseShift]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reloadDateRange();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadDateRange]);

  useEffect(() => {
    const handlePopState = () => {
      reloadDateRange();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [reloadDateRange]);

  useEffect(() => {
    if (businessId) {
      fetchShifts();
    }
  }, [businessId, startDate, endDate, selectedBranchId, fetchShifts]);

  const shiftStats = useMemo(() => {
    const total = allShifts.length;
    const totalSales = allShifts.reduce((sum, s) => sum + (s.expectedAmount || 0), 0);
    const openCount = allShifts.filter(s => s.status === 'open').length;
    const closedCount = allShifts.filter(s => s.status === 'closed').length;
    return { total, openCount, closedCount, totalSales };
  }, [allShifts]);

  const visibleShifts = useMemo(() => allShifts.slice(0, visibleCount), [allShifts, visibleCount]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + 20, allShifts.length));
  }, [allShifts.length]);

  const [cashTransactions, setCashTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const handleShiftClick = useCallback(async (shift) => {
    setSelectedShift(shift);
    setModalOpen(true);
    setCashTransactions([]);
    setLoadingTransactions(true);
    try {
      const branch = branches.find((b) => b.name === shift.store);
      const targetBranchId = selectedBranchId !== 'all' ? selectedBranchId : branch?.branchId;
      if (!targetBranchId) { setLoadingTransactions(false); return; }
      const params = new URLSearchParams({ shiftId: shift.shiftId || shift.id });
      const response = await apiFetch(`/business/${businessId}/branches/${targetBranchId}/cash-transactions?${params.toString()}`);
      const list = Array.isArray(response.data || response) ? (response.data || response) : [];
      setCashTransactions(list);
    } catch (e) {
      console.error('Error fetching cash transactions:', e);
      setCashTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }, [businessId, apiFetch, branches, selectedBranchId]);

  // ─── CSV EXPORT (list of shifts) ───────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (isExportingCsv || !allShifts.length) return;
    setIsExportingCsv(true);
    try {
      const header = [
        'Shift #', 'Store', 'Cashier', 'Opened', 'Closed', 'Status', 'Receipts',
        'Opening Cash', 'Net Sales', 'Pay In', 'Pay Out', 'Expenses',
        'Expected Amount', 'Closing Amount', 'Variance',
      ];
      const rows = allShifts.map((s) => [
        `#${s.shiftNumber}`,
        s.store,
        s.cashierName,
        fmtDateTime(s.openedAt),
        s.closedAt ? fmtDateTime(s.closedAt) : '—',
        s.status === 'open' ? 'Active' : 'Closed',
        s.receiptCount,
        s.openingCash.toFixed(2),
        s.netSales.toFixed(2),
        s.totalPayIn.toFixed(2),
        s.totalPayOut.toFixed(2),
        s.totalExpenses.toFixed(2),
        s.expectedAmount.toFixed(2),
        s.closingCash != null ? s.closingCash.toFixed(2) : '',
        s.closingCash != null ? (s.closingCash - s.expectedAmount).toFixed(2) : '',
      ]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`shifts_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...rows]);
    } finally {
      setIsExportingCsv(false);
    }
  }, [allShifts, selectedBranchId, selectedBranchName, startDate, endDate, isExportingCsv]);

  // ─── PDF EXPORT (list of shifts) ────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !allShifts.length) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });

      doc.setFontSize(14);
      doc.text('Shifts Report', 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      const branchLabel = selectedBranchId === 'all' ? 'All Stores' : selectedBranchName;
      doc.text(`${branchLabel} • ${toApiDate(startDate)} to ${toApiDate(endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      const tableHead = [['Shift #', 'Store', 'Cashier', 'Opened', 'Closed', 'Status', 'Receipts', 'Expected Amount']];
      const tableBody = allShifts.map(s => [
        `#${s.shiftNumber}`,
        s.store,
        s.cashierName,
        fmtDateTime(s.openedAt),
        s.closedAt ? fmtDateTime(s.closedAt) : '—',
        s.status === 'open' ? 'Active' : 'Closed',
        s.receiptCount,
        formatMoney(s.expectedAmount, baseCurrency),
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
      doc.text(`Total Shifts: ${shiftStats.total}`, 32, finalY);
      doc.text(`Active: ${shiftStats.openCount}`, 32, finalY + 16);
      doc.text(`Closed: ${shiftStats.closedCount}`, 32, finalY + 32);
      doc.text(`Total Sales: ${formatMoney(shiftStats.totalSales, baseCurrency)}`, 32, finalY + 48);

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`shifts_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError('Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingPdf(false);
    }
  }, [allShifts, shiftStats, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, exportingPdf]);

  // ─── PDF EXPORT (single shift detail, matches the popup layout) ───────────
  const handleExportSingleShiftPdf = useCallback(async () => {
    if (!selectedShift || exportingShiftPdf) return;
    setExportingShiftPdf(true);
    const s = selectedShift;
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt' });
      let y = 40;

      doc.setFontSize(16);
      doc.text(`Shift #${s.shiftNumber} Report`, 40, y);
      y += 18;
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${s.store} • ${s.status === 'open' ? 'Active' : 'Closed'}`, 40, y);
      y += 26;
      doc.setTextColor(20, 24, 30);

      const section = (title, rows) => {
        if (y > 740) { doc.addPage(); y = 40; }
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(title, 40, y);
        y += 6;
        doc.setDrawColor(226, 232, 240);
        doc.line(40, y, 555, y);
        y += 16;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        rows.forEach(([label, value]) => {
          if (y > 780) { doc.addPage(); y = 40; }
          doc.setTextColor(100, 116, 139);
          doc.text(String(label), 40, y);
          doc.setTextColor(15, 23, 42);
          doc.text(String(value), 300, y);
          y += 16;
        });
        y += 12;
      };

      section('Shift Overview', [
        ['Opened By', s.cashierName],
        ['Opened At', fmtDateTime(s.openedAt)],
        ...(s.closedAt ? [['Closed At', fmtDateTime(s.closedAt)]] : []),
        ['Duration', fmtDuration(s.openedAt, s.closedAt)],
        ['Base Currency', s.baseCurrencyCode],
      ]);

      const varianceRows = (s.closedAt && s.closingCash != null) ? [
        ['Closing Amount', formatMoney(s.closingCash, baseCurrency)],
        ['Variance', formatMoney(s.closingCash - s.expectedAmount, baseCurrency)],
      ] : [];

      section('Cash Drawer', [
        ['Opening Cash', formatMoney(s.openingCash, baseCurrency)],
        ['Net Sales', `+${formatMoney(s.netSales, baseCurrency)}`],
        ['Pay In', `+${formatMoney(s.totalPayIn, baseCurrency)}`],
        ['Pay Out', `-${formatMoney(s.totalPayOut, baseCurrency)}`],
        ['Expenses', `-${formatMoney(s.totalExpenses, baseCurrency)}`],
        ['Expected Amount', formatMoney(s.expectedAmount, baseCurrency)],
        ...varianceRows,
      ]);

      section('Payment Summary', [
        ['Cash', formatMoney(s.cashSales, baseCurrency)],
        ['Card', formatMoney(s.cardSales, baseCurrency)],
        ['Mobile Pay', formatMoney(s.mobileSales, baseCurrency)],
        ['Receipts', s.receiptCount],
        ['Refunds', s.refundCount],
        ['Gross Sales', formatMoney(s.grossSales, baseCurrency)],
        ['Total Discounts', `-${formatMoney(s.totalDiscounts, baseCurrency)}`],
      ]);

      if (s.currencyBreakdown?.length) {
        if (y > 700) { doc.addPage(); y = 40; }
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Sales by Currency (Net)', 40, y);
        y += 8;
        autoTable(doc, {
          startY: y,
          head: [['Currency', 'Receipts', 'Net Sales']],
          body: s.currencyBreakdown.map((bd) => [
            bd.currency, bd.receiptCount, `${bd.symbol || '$'}${Number(bd.netSales || 0).toFixed(2)}`,
          ]),
          styles: { fontSize: 9, cellPadding: 5 },
          headStyles: { fillColor: [53, 122, 189], fontSize: 9 },
          margin: { left: 40, right: 40 },
        });
        y = doc.lastAutoTable.finalY + 20;
      }

      if (cashTransactions.length) {
        if (y > 680) { doc.addPage(); y = 40; }
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Cash History', 40, y);
        y += 8;
        autoTable(doc, {
          startY: y,
          head: [['Type', 'Description', 'Amount', 'Method', 'Date']],
          body: cashTransactions.map((tx) => {
            const cfg = TX_CONFIG[tx.type] || TX_CONFIG.pay_in;
            return [
              cfg.label,
              tx.description || '—',
              `${cfg.sign}${formatMoney(tx.amountInBaseCurrency || tx.amount, baseCurrency)}`,
              tx.paymentMethod || 'cash',
              new Date(tx.createdAt).toLocaleString(),
            ];
          }),
          styles: { fontSize: 9, cellPadding: 5 },
          headStyles: { fillColor: [53, 122, 189], fontSize: 9 },
          margin: { left: 40, right: 40 },
        });
      }

      doc.save(`shift-${s.shiftNumber}_${s.store.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch (err) {
      console.error('Error exporting shift PDF:', err);
      setError('Could not generate the shift PDF. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setExportingShiftPdf(false);
    }
  }, [selectedShift, cashTransactions, baseCurrency, exportingShiftPdf]);

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

  const renderShiftDetail = () => {
    if (!selectedShift) return null;
    const s = selectedShift;
    const isOpen = s.status === 'open';

    return (
      <div className="reports-modal" style={{ maxWidth: 520 }}>
        <div className="reports-modal-header">
          <span className="reports-modal-title">Shift #{s.shiftNumber}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="reports-modal-close"
              onClick={handleExportSingleShiftPdf}
              disabled={exportingShiftPdf}
              title="Download shift PDF"
            >
              <Download size={18} />
            </button>
            <button className="reports-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
          </div>
        </div>
        <div className="reports-modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className={`reports-list-item-badge ${isOpen ? 'completed' : 'voided'}`}>{isOpen ? 'Active' : 'Closed'}</span>
            <span style={{ fontSize: 12, color: '#8b97a7' }}>{s.store}</span>
          </div>

          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Shift Overview</div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Opened By</span><span>{s.cashierName}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Opened At</span><span>{fmtDateTime(s.openedAt)}</span></div>
            {s.closedAt && <div className="reports-modal-row"><span className="reports-modal-row-label">Closed At</span><span>{fmtDateTime(s.closedAt)}</span></div>}
            <div className="reports-modal-row"><span className="reports-modal-row-label">Duration</span><span>{fmtDuration(s.openedAt, s.closedAt)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Base Currency</span><span>{s.baseCurrencyCode}</span></div>
          </div>

          <hr className="reports-modal-divider" />
          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Cash Drawer</div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Opening Cash</span><span>{formatMoney(s.openingCash, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Net Sales</span><span style={{ color: '#16a34a' }}>+{formatMoney(s.netSales, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Pay In</span><span style={{ color: '#16a34a' }}>+{formatMoney(s.totalPayIn, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Pay Out</span><span style={{ color: '#ef4444' }}>-{formatMoney(s.totalPayOut, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Expenses</span><span style={{ color: '#ef4444' }}>-{formatMoney(s.totalExpenses, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label bold">Expected Amount</span><span className="reports-modal-row-value bold">{formatMoney(s.expectedAmount, baseCurrency)}</span></div>
            {s.closedAt && s.closingCash != null && (
              <>
                <div className="reports-modal-row"><span className="reports-modal-row-label">Closing Amount</span><span>{formatMoney(s.closingCash, baseCurrency)}</span></div>
                <div className="reports-modal-row">
                  <span className="reports-modal-row-label">Variance</span>
                  <span style={{ color: Math.abs(s.closingCash - s.expectedAmount) < 0.01 ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                    {formatMoney(s.closingCash - s.expectedAmount, baseCurrency)}
                  </span>
                </div>
              </>
            )}
          </div>

          <hr className="reports-modal-divider" />
          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Payment Summary</div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Cash</span><span>{formatMoney(s.cashSales, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Card</span><span>{formatMoney(s.cardSales, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Mobile Pay</span><span>{formatMoney(s.mobileSales, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Receipts</span><span>{s.receiptCount}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Refunds</span><span>{s.refundCount}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Gross Sales</span><span>{formatMoney(s.grossSales, baseCurrency)}</span></div>
            <div className="reports-modal-row"><span className="reports-modal-row-label">Total Discounts</span><span style={{ color: '#0891b2' }}>-{formatMoney(s.totalDiscounts, baseCurrency)}</span></div>
          </div>

          {s.currencyBreakdown?.length > 0 && (
            <>
              <hr className="reports-modal-divider" />
              <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <div className="reports-modal-section-title">Sales by Currency (Net)</div>
                {s.currencyBreakdown.map((bd) => (
                  <div key={bd.currency} className="reports-modal-row">
                    <span>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{bd.currency}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>{bd.receiptCount} receipts</div>
                    </span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>{bd.symbol || '$'}{Number(bd.netSales || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <hr className="reports-modal-divider" />
          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Cash History {cashTransactions.length > 0 ? `(${cashTransactions.length})` : ''}</div>
            {loadingTransactions ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>Loading transactions...</div>
            ) : cashTransactions.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>No cash transactions for this shift</div>
            ) : (
              cashTransactions.map((tx) => {
                const cfg = TX_CONFIG[tx.type] || TX_CONFIG.pay_in;
                const Icon = cfg.icon;
                const amount = tx.amountInBaseCurrency || tx.amount;
                return (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={14} color={cfg.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{cfg.label}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.sign}{formatMoney(amount, baseCurrency)}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>{new Date(tx.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  // ✅ Access Denied
  if (!canViewShifts) {
    return (
      <div className="reports-access-denied">
        <div className="reports-access-denied-content">
          <Lock size={48} className="reports-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view shifts.</p>
          <p className="reports-access-denied-sub">Contact your administrator to request access.</p>
          <button className="reports-access-denied-btn" onClick={() => navigate('/')}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ─── Show loading bar instead of full screen spinner ──────────────────
  const showLoadingBar = loading || refreshing || exportingPdf || exportingShiftPdf || isExportingCsv || loadingTransactions;

  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Shifts</div>
              <div className="reports-header-sub">View completed and active shifts</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExportingCsv || !allShifts.length}>
              CSV
            </Button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={exportingPdf || !allShifts.length} loading={exportingPdf}>
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
          <div className="reports-stat-card"><span className="reports-stat-label">Shifts</span><span className="reports-stat-value">{shiftStats.total}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Active</span><span className="reports-stat-value">{shiftStats.openCount}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Closed</span><span className="reports-stat-value">{shiftStats.closedCount}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Total Sales</span><span className="reports-stat-value">{formatMoney(shiftStats.totalSales, baseCurrency)}</span></div>
        </div>

        <div className="reports-list-card">
          {error ? (
            <div className="reports-empty">
              <span style={{ color: '#ef4444' }}>⚠️</span>
              <div className="reports-empty-title">{error}</div>
              <button onClick={() => fetchShifts()} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : visibleShifts.length === 0 ? (
            <div className="reports-empty">
              <Clock size={32} />
              <div className="reports-empty-title">No shifts found</div>
              <div className="reports-empty-sub">Try a different date range or store</div>
            </div>
          ) : (
            <>
              {visibleShifts.map(s => (
                <div key={s.id} className="reports-list-item" onClick={() => handleShiftClick(s)}>
                  <div className="reports-list-item-info">
                    <div className="reports-list-item-title">Shift #{s.shiftNumber}</div>
                    <div className="reports-list-item-sub">
                      <span>{s.store}</span>
                      <span>{s.cashierName}</span>
                      <span>{fmtDateTime(s.openedAt)}</span>
                      <span className={`reports-list-item-badge ${s.status === 'open' ? 'completed' : 'voided'}`}>
                        {s.status === 'open' ? 'Active' : 'Closed'}
                      </span>
                    </div>
                  </div>
                  <div className="reports-list-item-right">
                    <div className="reports-list-item-amount">{formatMoney(s.expectedAmount, baseCurrency)}</div>
                    <div style={{ fontSize: 11, color: '#8b97a7' }}>{s.receiptCount} receipts</div>
                  </div>
                </div>
              ))}
              {visibleShifts.length < allShifts.length && (
                <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button onClick={handleLoadMore} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                    Load more ({allShifts.length - visibleShifts.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {storeModalOpen && renderStoreModal()}
        {modalOpen && (
          <div className="reports-modal-overlay" onClick={() => setModalOpen(false)}>
            {renderShiftDetail()}
          </div>
        )}
      </div>
    </>
  );
}