// src/pages/Laybyes.jsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Store, Search, X, HandCoins, Download, RefreshCw,
  Phone, Mail, Calendar, AlertTriangle, FileText,
} from 'lucide-react';
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

const STATUS_CONFIG = {
  active: { label: 'Active', bg: '#DCFCE7', color: '#16A34A', dot: '#22C55E' },
  on_hold: { label: 'On Hold', bg: '#FEF3C7', color: '#0891B2', dot: '#F59E0B' },
  completed: { label: 'Completed', bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6' },
  cancelled: { label: 'Cancelled', bg: '#FEE2E2', color: '#EF4444', dot: '#EF4444' },
};

const PAY_TYPE = {
  deposit: { label: 'Deposit', bg: '#EFF6FF', color: '#2563EB' },
  payment: { label: 'Payment', bg: '#DCFCE7', color: '#16A34A' },
  final: { label: 'Final', bg: '#F5F3FF', color: '#7C3AED' },
};

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_FETCH_SIZE = 200;
const PAGE_STEP = 20;

const AVATAR_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#06B6D4'];

function avatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name = '') {
  return name.split(' ').map((w) => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function toBase(usdAmount, baseCurrency) {
  return (usdAmount || 0) * (baseCurrency?.rate || 1);
}

export default function Laybyes() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency } = useAppContext();
  const exportRef = useRef(null);

  const {
    startDate, endDate, selectedOption, handleOptionSelect, navigateDate, reload: reloadDateRange,
  } = useDateRange('today');

  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [allLaybyes, setAllLaybyes] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusPopup, setStatusPopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedLaybye, setSelectedLaybye] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const parseLaybye = useCallback((lb, branchName, branchId) => {
    const totalAmountUSD = lb.totalAmountUSD ?? ((lb.totalAmount || 0) / (lb.exchangeRate || 1));
    const totalPaidUSD = lb.totalPaidUSD ?? 0;
    const balanceUSD = Math.max(0, totalAmountUSD - totalPaidUSD);
    return {
      ...lb,
      id: lb.laybyeId || lb.id,
      store: branchName,
      branchId,
      status: lb.status || 'active',
      items: Array.isArray(lb.items) ? lb.items : [],
      payments: Array.isArray(lb.payments) ? lb.payments : [],
      totalAmountUSD,
      totalPaidUSD,
      balanceUSD,
      exchangeRate: lb.exchangeRate || 1,
    };
  }, []);

  const fetchLaybyes = useCallback(async (isRefresh = false) => {
    if (!businessId || !branches) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const params = new URLSearchParams();
      params.append('startDate', String(start.getTime()));
      params.append('endDate', String(end.getTime()));
      params.append('pageSize', String(PAGE_FETCH_SIZE));
      params.append('page', '1');
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const targetBranches = selectedBranchId === 'all' ? branches : branches.filter((b) => b.branchId === selectedBranchId);

      let all = [];
      await Promise.all(targetBranches.map(async (branch) => {
        try {
          const res = await apiFetch(`/business/${businessId}/branches/${branch.branchId}/laybyes?${params.toString()}`);
          const list = Array.isArray(res.data || res) ? (res.data || res) : [];
          all.push(...list.map((lb) => parseLaybye(lb, branch.name, branch.branchId)));
        } catch (e) {
          console.error(`Laybyes fetch failed for ${branch.name}:`, e);
        }
      }));

      all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAllLaybyes(all);
    } catch (e) {
      console.error('Fetch laybyes error:', e);
      setError('Failed to load laybyes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, branches, apiFetch, startDate, endDate, selectedBranchId, statusFilter, parseLaybye]);

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
    if (businessId && branches) fetchLaybyes();
  }, [businessId, branches, startDate, endDate, selectedBranchId, statusFilter, fetchLaybyes]);

  useEffect(() => { setVisibleCount(PAGE_STEP); }, [selectedBranchId, startDate, endDate, statusFilter, searchQuery]);

  const filteredLaybyes = useMemo(() => {
    if (!searchQuery.trim()) return allLaybyes;
    const q = searchQuery.trim().toLowerCase();
    return allLaybyes.filter((lb) =>
      lb.laybyeNumber?.toLowerCase().includes(q) ||
      lb.customerName?.toLowerCase().includes(q) ||
      lb.customerPhone?.toLowerCase().includes(q) ||
      lb.customerEmail?.toLowerCase().includes(q)
    );
  }, [allLaybyes, searchQuery]);

  const visibleLaybyes = useMemo(() => filteredLaybyes.slice(0, visibleCount), [filteredLaybyes, visibleCount]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_STEP, filteredLaybyes.length));
  }, [filteredLaybyes.length]);

  const stats = useMemo(() => {
    const active = allLaybyes.filter((lb) => lb.status === 'active').length;
    const onHold = allLaybyes.filter((lb) => lb.status === 'on_hold').length;
    const completed = allLaybyes.filter((lb) => lb.status === 'completed').length;
    const outstandingUSD = allLaybyes
      .filter((lb) => lb.status === 'active' || lb.status === 'on_hold')
      .reduce((sum, lb) => sum + lb.balanceUSD, 0);
    return { total: allLaybyes.length, active, onHold, completed, outstandingUSD };
  }, [allLaybyes]);

  const handleExportCsv = useCallback(() => {
    if (isExporting || !filteredLaybyes.length) return;
    setIsExporting(true);
    try {
      const header = ['Laybye #', 'Store', 'Customer', 'Phone', 'Status', 'Total', 'Paid', 'Balance', 'Created'];
      const rows = filteredLaybyes.map((lb) => [
        lb.laybyeNumber,
        lb.store,
        lb.customerName || '',
        lb.customerPhone || '',
        STATUS_CONFIG[lb.status]?.label || lb.status,
        toBase(lb.totalAmountUSD, baseCurrency).toFixed(2),
        toBase(lb.totalPaidUSD, baseCurrency).toFixed(2),
        toBase(lb.balanceUSD, baseCurrency).toFixed(2),
        new Date(lb.createdAt).toLocaleString(),
      ]);
      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      downloadCsv(`laybyes_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.csv`, [header, ...rows]);
    } finally {
      setIsExporting(false);
    }
  }, [filteredLaybyes, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, isExporting]);

  const handleExportPdf = useCallback(() => {
    if (isExporting || !filteredLaybyes.length) return;
    setIsExporting(true);

    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(16);
      doc.setTextColor('#0F172A');
      doc.text('Laybyes Report', pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor('#64748B');
      const dateRangeText = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
      const storeText = selectedBranchName;
      doc.text(`${dateRangeText} | ${storeText} | ${baseCurrency?.code || 'USD'}`, pageWidth / 2, 22, { align: 'center' });

      doc.setFontSize(9);
      doc.setTextColor('#475569');
      const statsText = `Total: ${stats.total} | Active: ${stats.active} | On Hold: ${stats.onHold} | Completed: ${stats.completed} | Outstanding: ${formatMoney(toBase(stats.outstandingUSD, baseCurrency), baseCurrency)}`;
      doc.text(statsText, pageWidth / 2, 29, { align: 'center' });

      const tableData = filteredLaybyes.map((lb) => [
        lb.laybyeNumber || '',
        lb.customerName || 'Unknown',
        lb.customerPhone || '',
        STATUS_CONFIG[lb.status]?.label || lb.status,
        formatMoney(toBase(lb.totalAmountUSD, baseCurrency), baseCurrency),
        formatMoney(toBase(lb.totalPaidUSD, baseCurrency), baseCurrency),
        formatMoney(toBase(lb.balanceUSD, baseCurrency), baseCurrency),
        lb.store || '',
        fmtDate(lb.createdAt),
      ]);

      autoTable(doc, {
        head: [['Laybye #', 'Customer', 'Phone', 'Status', 'Total', 'Paid', 'Balance', 'Store', 'Created']],
        body: tableData,
        startY: 35,
        theme: 'striped',
        headStyles: {
          fillColor: '#F1F5F9',
          textColor: '#0F172A',
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 7,
          textColor: '#1E293B',
        },
        columnStyles: {
          0: { cellWidth: 28, halign: 'center' },
          1: { cellWidth: 30 },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 30 },
          8: { cellWidth: 25, halign: 'center' },
        },
        margin: { left: 10, right: 10 },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 3) {
            const status = data.cell.raw;
            if (status === 'Active') {
              data.cell.styles.textColor = '#16A34A';
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'On Hold') {
              data.cell.styles.textColor = '#0891B2';
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'Completed') {
              data.cell.styles.textColor = '#2563EB';
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'Cancelled') {
              data.cell.styles.textColor = '#EF4444';
              data.cell.styles.fontStyle = 'bold';
            }
          }
          if (data.section === 'body' && data.column.index === 6) {
            const balance = parseFloat(data.cell.raw.replace(/[^0-9.-]+/g, ''));
            if (balance > 0) {
              data.cell.styles.textColor = '#EF4444';
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = '#16A34A';
            }
          }
        },
        didDrawPage: function(data) {
          doc.setFontSize(8);
          doc.setTextColor('#94A3B8');
          const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
          const totalPages = doc.internal.getNumberOfPages();
          doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 15, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
          doc.text(`Generated: ${new Date().toLocaleString()}`, 15, doc.internal.pageSize.getHeight() - 10);
        },
      });

      const branchTag = selectedBranchId === 'all' ? 'all-stores' : selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`laybyes_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}.pdf`);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [filteredLaybyes, selectedBranchId, selectedBranchName, startDate, endDate, baseCurrency, isExporting, stats]);

  const openDetail = (lb) => {
    setSelectedLaybye(lb);
    setModalOpen(true);
  };

  const renderStoreModal = () => {
    if (!storeModalOpen) return null;
    return (
      <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
        <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
          <div className="reports-modal-header">
            <span className="reports-modal-title">Select Store</span>
            <button className="reports-modal-close" onClick={() => setStoreModalOpen(false)}><X size={18} /></button>
          </div>
          <div className="reports-modal-body" style={{ padding: '16px' }}>
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

  const renderLaybyeDetail = () => {
    if (!selectedLaybye) return null;
    const lb = selectedLaybye;
    const status = STATUS_CONFIG[lb.status] || STATUS_CONFIG.active;
    const percentPaid = lb.totalAmountUSD > 0 ? (lb.totalPaidUSD / lb.totalAmountUSD) * 100 : 0;
    const isOverdue = lb.nextPaymentDue && Date.now() > lb.nextPaymentDue && lb.status === 'active';
    let runningBalanceUSD = lb.totalAmountUSD;
    const paymentsWithBalance = (lb.payments || []).map((p) => {
      runningBalanceUSD -= (p.amountUSD || 0);
      return { ...p, balanceAfterUSD: Math.max(0, runningBalanceUSD) };
    });

    return (
      <div className="reports-modal" style={{ maxWidth: 560 }}>
        <div className="reports-modal-header">
          <span className="reports-modal-title">{lb.laybyeNumber}</span>
          <button className="reports-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
        </div>
        <div className="reports-modal-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 20, background: avatarColor(lb.customerName || ''),
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14,
            }}>
              {initials(lb.customerName || '?')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{lb.customerName || 'Unknown'}</div>
              <div style={{ fontSize: 11, color: '#8b97a7' }}>{lb.store}</div>
            </div>
            <span className="reports-list-item-badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
          </div>

          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Customer Information</div>
            {lb.customerPhone && (
              <div className="reports-modal-row">
                <span className="reports-modal-row-label"><Phone size={11} style={{ verticalAlign: -2, marginRight: 4 }} />Phone</span>
                <span>{lb.customerPhone}</span>
              </div>
            )}
            {lb.customerEmail && (
              <div className="reports-modal-row">
                <span className="reports-modal-row-label"><Mail size={11} style={{ verticalAlign: -2, marginRight: 4 }} />Email</span>
                <span>{lb.customerEmail}</span>
              </div>
            )}
            <div className="reports-modal-row">
              <span className="reports-modal-row-label"><Calendar size={11} style={{ verticalAlign: -2, marginRight: 4 }} />Created</span>
              <span>{fmtDateTime(lb.createdAt)}</span>
            </div>
            {lb.nextPaymentDue && (
              <div className="reports-modal-row">
                <span className="reports-modal-row-label">Next Payment</span>
                <span style={isOverdue ? { color: '#EF4444', fontWeight: 700 } : undefined}>
                  {fmtDate(lb.nextPaymentDue)}{isOverdue ? ' (Overdue)' : ''}
                </span>
              </div>
            )}
            {lb.notes && (
              <div className="reports-modal-row">
                <span className="reports-modal-row-label">Notes</span>
                <span>{lb.notes}</span>
              </div>
            )}
          </div>

          <hr className="reports-modal-divider" />

          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Payment Summary ({baseCurrency?.code || 'USD'})</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{formatMoney(toBase(lb.totalAmountUSD, baseCurrency), baseCurrency)}</div>
              </div>
              <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Paid</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{formatMoney(toBase(lb.totalPaidUSD, baseCurrency), baseCurrency)}</div>
              </div>
              <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Balance</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: lb.balanceUSD > 0 ? '#EF4444' : '#16A34A', marginTop: 4 }}>
                  {formatMoney(toBase(lb.balanceUSD, baseCurrency), baseCurrency)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, percentPaid)}%`, height: '100%', background: '#0891B2', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>{Math.round(percentPaid)}%</span>
            </div>
          </div>

          <hr className="reports-modal-divider" />

          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Products ({lb.items?.length || 0})</div>
            {(lb.items || []).map((item, i) => {
              const unitPriceUSD = item.unitPriceUSD || (item.unitPrice / (lb.exchangeRate || 1));
              const lineTotalUSD = item.lineTotalUSD || (item.lineTotal / (lb.exchangeRate || 1));
              return (
                <div key={item.id || i} className="reports-modal-row">
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#0F172A' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8' }}>{item.qty} × {formatMoney(toBase(unitPriceUSD, baseCurrency), baseCurrency)}</div>
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{formatMoney(toBase(lineTotalUSD, baseCurrency), baseCurrency)}</span>
                </div>
              );
            })}
            <div className="reports-modal-row" style={{ fontWeight: 700, fontSize: 13, borderTop: '1px solid #f0f2f5', paddingTop: 6, marginTop: 4 }}>
              <span>Total</span>
              <span>{formatMoney(toBase(lb.totalAmountUSD, baseCurrency), baseCurrency)}</span>
            </div>
          </div>

          <hr className="reports-modal-divider" />

          <div className="reports-modal-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="reports-modal-section-title">Payment History ({paymentsWithBalance.length})</div>
            {paymentsWithBalance.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#94A3B8', fontSize: 12 }}>No payments yet</div>
            ) : (
              paymentsWithBalance.map((p, i) => {
                const ptCfg = PAY_TYPE[p.type] || PAY_TYPE.payment;
                const isRefunded = p.refunded === true;
                return (
                  <div key={p.id || i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '8px 0', borderBottom: '1px solid #F8FAFC', opacity: isRefunded ? 0.7 : 1,
                    background: isRefunded ? '#FEF2F2' : 'transparent',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ background: ptCfg.bg, color: ptCfg.color, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5 }}>
                          {ptCfg.label}
                        </span>
                        {isRefunded && (
                          <span style={{ background: '#FEE2E2', color: '#EF4444', fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>
                            Refunded
                          </span>
                        )}
                        {p.shiftNumber && (
                          <span style={{ background: '#F1F5F9', color: '#64748B', fontSize: 9, fontWeight: 500, padding: '2px 6px', borderRadius: 4 }}>
                            Shift #{p.shiftNumber}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{fmtDateTime(p.paidAt)}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{p.method} · {p.receiptNumber}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                        Balance after: {formatMoney(toBase(p.balanceAfterUSD, baseCurrency), baseCurrency)}
                      </div>
                      {p.notes && <div style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic', marginTop: 2 }}>{p.notes}</div>}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 800, color: isRefunded ? '#94A3B8' : '#0F172A',
                      textDecoration: isRefunded ? 'line-through' : 'none', whiteSpace: 'nowrap', marginLeft: 8,
                    }}>
                      {p.currencySymbol || '$'}{Number(p.amount || 0).toFixed(2)}
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

  // Render a single laybye list item with full details - FULL WIDTH
  const renderLaybyeItem = (lb) => {
    const status = STATUS_CONFIG[lb.status] || STATUS_CONFIG.active;
    const percentPaid = lb.totalAmountUSD > 0 ? (lb.totalPaidUSD / lb.totalAmountUSD) * 100 : 0;
    const isOverdue = lb.nextPaymentDue && Date.now() > lb.nextPaymentDue && lb.status === 'active';
    
    const totalDisplay = formatMoney(toBase(lb.totalAmountUSD, baseCurrency), baseCurrency);
    const paidDisplay = formatMoney(toBase(lb.totalPaidUSD, baseCurrency), baseCurrency);
    const balanceDisplay = formatMoney(toBase(lb.balanceUSD, baseCurrency), baseCurrency);

    return (
      <div 
        key={lb.id} 
        className="reports-list-item" 
        onClick={() => openDetail(lb)}
        style={{ 
          cursor: 'pointer',
          padding: '14px 16px',
          borderBottom: '1px solid #F1F5F9',
          backgroundColor: isOverdue ? '#FFF7F7' : '#fff',
          width: '100%',
          display: 'block',
        }}
      >
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          alignItems: 'flex-start',
          width: '100%',
        }}>
          {/* Avatar - fixed size */}
          <div style={{
            width: 40, 
            height: 40, 
            borderRadius: 20, 
            background: avatarColor(lb.customerName || ''),
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: '#fff', 
            fontWeight: 800, 
            fontSize: 14, 
            flexShrink: 0,
          }}>
            {initials(lb.customerName || '?')}
          </div>

          {/* Main Content - takes all remaining space */}
          <div style={{ 
            flex: 1, 
            minWidth: 0,
            width: '100%',
          }}>
            {/* Header: Name + Laybye # */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              flexWrap: 'wrap', 
              gap: 6,
              width: '100%',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                {lb.customerName || 'Unknown'}
              </span>
              <span style={{ 
                fontSize: 10, 
                color: '#94A3B8', 
                background: '#F1F5F9', 
                padding: '2px 8px', 
                borderRadius: 4 
              }}>
                {lb.laybyeNumber}
              </span>
            </div>

            {/* Amounts Row: Total | Paid | Balance */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12,
              background: '#F8FAFC', 
              borderRadius: 8, 
              padding: '6px 10px', 
              marginTop: 6,
              width: '100%',
            }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#64748B', fontWeight: 500 }}>Total</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{totalDisplay}</div>
              </div>
              <div style={{ width: 1, height: 24, background: '#E2E8F0', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#16A34A', fontWeight: 500 }}>Paid</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#16A34A' }}>{paidDisplay}</div>
              </div>
              <div style={{ width: 1, height: 24, background: '#E2E8F0', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: lb.balanceUSD > 0 ? '#EF4444' : '#16A34A', fontWeight: 500 }}>Balance</div>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 700, 
                  color: lb.balanceUSD > 0 ? '#EF4444' : '#16A34A'
                }}>{balanceDisplay}</div>
              </div>
            </div>

            {/* Progress Bar - full width */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              marginTop: 6,
              width: '100%',
            }}>
              <div style={{ 
                flex: 1, 
                height: 6, 
                background: '#E2E8F0', 
                borderRadius: 3, 
                overflow: 'hidden',
                minWidth: 0,
              }}>
                <div style={{ 
                  width: `${Math.min(100, percentPaid)}%`, 
                  height: '100%', 
                  background: '#16A34A', 
                  borderRadius: 3 
                }} />
              </div>
              <span style={{ 
                fontSize: 10, 
                fontWeight: 600, 
                color: '#64748B', 
                minWidth: 35, 
                textAlign: 'right',
                flexShrink: 0,
              }}>
                {Math.round(percentPaid)}%
              </span>
            </div>

            {/* Meta: Store | Due Date | Status */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              marginTop: 6, 
              flexWrap: 'wrap',
              width: '100%',
            }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>{lb.store}</span>
              
              {lb.nextPaymentDue && (
                <span style={{ 
                  fontSize: 11, 
                  color: isOverdue ? '#EF4444' : '#64748B',
                  fontWeight: isOverdue ? 600 : 400,
                }}>
                  Due {fmtDate(lb.nextPaymentDue)}
                </span>
              )}
              
              {/* Status Badge */}
              <div style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 4,
                background: status.bg, 
                padding: '2px 8px', 
                borderRadius: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: status.dot }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: status.color }}>{status.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Show loading bar instead of full screen spinner ──────────────────
  const showLoadingBar = loading || refreshing || isExporting;

  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Laybyes</div>
              <div className="reports-header-sub">View laybye customers and payment history</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={isExporting || !filteredLaybyes.length}>
              PDF
            </Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !filteredLaybyes.length}>
              CSV
            </Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => fetchLaybyes(true)} loading={refreshing}>
              Refresh
            </Button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <DateRangeNav startDate={startDate} endDate={endDate} selectedOption={selectedOption} onNavigate={navigateDate} onOptionSelect={handleOptionSelect} />
        </div>

        <div className="reports-stats-row">
          <div className="reports-stat-card"><span className="reports-stat-label">Total</span><span className="reports-stat-value">{stats.total}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Active</span><span className="reports-stat-value" style={{ color: '#16A34A' }}>{stats.active}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">On Hold</span><span className="reports-stat-value" style={{ color: '#0891B2' }}>{stats.onHold}</span></div>
          <div className="reports-stat-card"><span className="reports-stat-label">Completed</span><span className="reports-stat-value" style={{ color: '#2563EB' }}>{stats.completed}</span></div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Outstanding</span>
            <span className="reports-stat-value" style={{ color: '#EF4444' }}>{formatMoney(toBase(stats.outstandingUSD, baseCurrency), baseCurrency)}</span>
          </div>
        </div>

        <div className="reports-toolbar">
          <div className="reports-search">
            <Search size={14} />
            <input placeholder="Search by name, phone, email or laybye number" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="reports-filter-btn" onClick={() => setStatusPopup(!statusPopup)}>
              {STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label}
            </button>
            {statusPopup && (
              <div className="reports-filter-popover">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <button key={opt.value} className={`reports-filter-option ${statusFilter === opt.value ? 'is-active' : ''}`}
                    onClick={() => { setStatusFilter(opt.value); setStatusPopup(false); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="reports-list-card" style={{ width: '100%', overflow: 'hidden' }}>
          {error ? (
            <div className="reports-empty">
              <AlertTriangle size={32} color="#ef4444" />
              <div className="reports-empty-title">{error}</div>
              <button onClick={() => fetchLaybyes()} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          ) : visibleLaybyes.length === 0 ? (
            <div className="reports-empty">
              <HandCoins size={32} />
              <div className="reports-empty-title">No laybyes found</div>
              <div className="reports-empty-sub">Try a different date range, store, or filter</div>
            </div>
          ) : (
            <>
              {visibleLaybyes.map((lb) => renderLaybyeItem(lb))}
              {visibleLaybyes.length < filteredLaybyes.length && (
                <div style={{ padding: '12px 16px', textAlign: 'center', width: '100%' }}>
                  <button onClick={handleLoadMore} style={{ padding: '6px 20px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5e6f8a' }}>
                    Load more ({filteredLaybyes.length - visibleLaybyes.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {storeModalOpen && renderStoreModal()}
        {modalOpen && (
          <div className="reports-modal-overlay" onClick={() => setModalOpen(false)}>
            {renderLaybyeDetail()}
          </div>
        )}
      </div>
    </>
  );
}