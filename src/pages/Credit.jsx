// src/pages/Credit.jsx
//
// Credit / Receivables — accounts-receivable REPORT for the selected date range.
//
// Everything on this screen is driven by the one date-range picker at the top
// (useDateRange + DateRangeNav, same as Receipts.jsx / ProfitAnalytics.jsx):
//   • summary cards   — credit sales, payments collected, cancelled sales, net change,
//                       customers with activity, overdue
//   • daily breakdown — sales / payments / cancelled sales per day (multi-day ranges)
//   • customer list   — only customers who had credit activity in the range,
//                       with THEIR figures for the range
//
// All of it comes from ONE endpoint per branch — GET .../credit/report — so the
// cards, the daily table and the list can never disagree with each other.
// "All Stores" fans out one request per branch and merges the results.
//
// ✅ FIX — this screen used to show a live, all-time snapshot (every customer
// with a balance, ignoring the date range) and swallowed every request error
// in an empty catch, so a failing/empty response looked exactly like "No
// outstanding credit". Errors are now surfaced (per store), and nothing here is
// all-time any more. A customer's full statement (with running balance) is one
// tap away on the customer row.

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Store, Search, X, Users, AlertTriangle, ArrowUpRight, ArrowDownRight, RotateCcw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { useDateRange } from '../hooks/useDateRange';
import DateRangeNav from '../components/common/DateRangeNav';
import { formatMoney, toApiDate } from '../utils/exportUtils';
import '../styles/ReportsShared.css';

const EMPTY_REPORT = {
  totals: {
    creditSales: 0, creditSalesCount: 0,
    creditPayments: 0, creditPaymentsCount: 0,
    creditCancels: 0, creditCancelsCount: 0,
    netChange: 0, overdueTotal: 0, overdueCount: 0,
  },
  days: [],
  customers: [],
};

const r2 = (n) => Math.round((n || 0) * 100) / 100;

function formatDayLabel(dateStr) {
  // dateStr is a UTC day key (YYYY-MM-DD) — render it in UTC so it never
  // shifts to the neighbouring day in the viewer's timezone.
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const cardStyle = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 };
const cardLabelStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase' };
const cardValueStyle = { fontSize: 20, fontWeight: 800, color: '#0F172A', marginTop: 6 };
const cardSubStyle = { fontSize: 11, color: '#94A3B8', marginTop: 2 };

export default function Credit() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency } = useAppContext();
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });
  const {
    startDate,
    endDate,
    selectedOption,
    handleOptionSelect,
    navigateDate,
  } = useDateRange('today');

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [report, setReport] = useState(EMPTY_REPORT);
  const [searchQuery, setSearchQuery] = useState('');

  // Ignore responses from a superseded request (user flipped the date range
  // or store again before the previous fetch came back).
  const requestSeq = useRef(0);

  const startStr = useMemo(() => toApiDate(startDate), [startDate]);
  const endStr = useMemo(() => toApiDate(endDate), [endDate]);

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'All Stores' }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === 'all' ? 'All Stores' : branchOptions.find((b) => b.value === selectedBranchId)?.label || '';

  const fetchReport = useCallback(async () => {
    if (!businessId || !branches) return;

    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setWarning(null);

    const targetBranches = selectedBranchId === 'all'
      ? branches
      : branches.filter((b) => b.branchId === selectedBranchId);

    if (targetBranches.length === 0) {
      setReport(EMPTY_REPORT);
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ startDate: startStr, endDate: endStr });

    const results = await Promise.all(targetBranches.map(async (branch) => {
      try {
        const res = await apiFetch(`/business/${businessId}/branches/${branch.branchId}/credit/report?${params.toString()}`);
        return { branch, res };
      } catch (e) {
        console.error(`Credit report failed for ${branch.name}:`, e);
        return { branch, error: e?.message || 'Request failed' };
      }
    }));

    if (seq !== requestSeq.current) return; // a newer request owns the screen now

    const ok = results.filter((r) => r.res);
    const failed = results.filter((r) => !r.res);

    if (ok.length === 0) {
      setReport(EMPTY_REPORT);
      setError(`Failed to load credit report${failed[0]?.error ? ` — ${failed[0].error}` : ''}`);
      setLoading(false);
      return;
    }

    const totals = { ...EMPTY_REPORT.totals };
    const dayMap = new Map();
    const customers = [];

    ok.forEach(({ branch, res }) => {
      totals.creditSales = r2(totals.creditSales + (res.creditSales || 0));
      totals.creditSalesCount += res.creditSalesCount || 0;
      totals.creditPayments = r2(totals.creditPayments + (res.creditPayments || 0));
      totals.creditPaymentsCount += res.creditPaymentsCount || 0;
      totals.creditCancels = r2(totals.creditCancels + (res.creditCancels || 0));
      totals.creditCancelsCount += res.creditCancelsCount || 0;
      totals.netChange = r2(totals.netChange + (res.netChange || 0));
      totals.overdueTotal = r2(totals.overdueTotal + (res.overdueTotal || 0));
      totals.overdueCount += res.overdueCount || 0;

      (res.days || []).forEach((d) => {
        const cur = dayMap.get(d.date) || { date: d.date, creditSales: 0, creditPayments: 0, creditCancels: 0, netChange: 0 };
        cur.creditSales = r2(cur.creditSales + (d.creditSales || 0));
        cur.creditPayments = r2(cur.creditPayments + (d.creditPayments || 0));
        cur.creditCancels = r2(cur.creditCancels + (d.creditCancels || 0));
        cur.netChange = r2(cur.netChange + (d.netChange || 0));
        dayMap.set(d.date, cur);
      });

      (res.customers || []).forEach((c) => customers.push({ ...c, store: branch.name, branchId: branch.branchId }));
    });

    customers.sort((a, b) => b.netChange - a.netChange || b.creditSales - a.creditSales);
    const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    setReport({ totals, days, customers });
    if (failed.length > 0) {
      setWarning(`Couldn't load ${failed.map((f) => f.branch.name).join(', ')} — figures below exclude ${failed.length === 1 ? 'that store' : 'those stores'}.`);
    }
    setLoading(false);
  }, [businessId, branches, apiFetch, selectedBranchId, startStr, endStr]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const { totals, days, customers } = report;

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q));
  }, [customers, searchQuery]);

  // Only days that actually had credit activity — a year-long range would
  // otherwise render 365 mostly-empty rows.
  const activeDays = useMemo(
    () => days.filter((d) => d.creditSales || d.creditPayments || d.creditCancels),
    [days]
  );
  const showDaily = days.length > 1 && activeDays.length > 0;

  const val = (v) => (loading ? '…' : v);

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">Credit / Receivables</div>
            <div className="reports-header-sub">Credit activity for the selected period</div>
          </div>
        </div>
        <div className="reports-header-right">
          <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
            <Store size={14} /> <span>{selectedBranchName}</span>
          </button>
          <button
            onClick={() => navigate('/customers')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Users size={15} /> Customers
          </button>
        </div>
      </div>

      {/* One date range drives the whole screen */}
      <div style={{ marginTop: 16, marginBottom: 14 }}>
        <DateRangeNav
          startDate={startDate}
          endDate={endDate}
          selectedOption={selectedOption}
          onNavigate={navigateDate}
          onOptionSelect={handleOptionSelect}
        />
      </div>

      {warning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 12.5 }}>
          <AlertTriangle size={14} /> <span>{warning}</span>
        </div>
      )}

      {/* Summary cards — all for the selected range */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, display: 'flex', alignItems: 'center', gap: 6, color: '#EA580C' }}>
            <ArrowUpRight size={14} /> Credit Sales
          </div>
          <div style={cardValueStyle}>{val(formatMoney(totals.creditSales, baseCurrency))}</div>
          <div style={cardSubStyle}>{plural(totals.creditSalesCount, 'sale')}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A' }}>
            <ArrowDownRight size={14} /> Payments Collected
          </div>
          <div style={cardValueStyle}>{val(formatMoney(totals.creditPayments, baseCurrency))}</div>
          <div style={cardSubStyle}>{plural(totals.creditPaymentsCount, 'payment')}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, display: 'flex', alignItems: 'center', gap: 6, color: '#64748B' }}>
            <RotateCcw size={14} /> Cancelled
          </div>
          <div style={cardValueStyle}>{val(formatMoney(totals.creditCancels, baseCurrency))}</div>
          <div style={cardSubStyle}>{plural(totals.creditCancelsCount, 'cancelled sale')}</div>
        </div>
        <div style={{ ...cardStyle, background: '#0F172A', border: 'none' }}>
          <div style={{ ...cardLabelStyle, color: '#94A3B8' }}>Net Change</div>
          <div style={{ ...cardValueStyle, color: totals.netChange > 0 ? '#FB923C' : totals.netChange < 0 ? '#4ADE80' : '#fff' }}>
            {val(`${totals.netChange > 0 ? '+' : totals.netChange < 0 ? '-' : ''}${formatMoney(Math.abs(totals.netChange), baseCurrency)}`)}
          </div>
          <div style={{ ...cardSubStyle, color: '#64748B' }}>Effect on receivables</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, color: '#64748B' }}>Customers</div>
          <div style={cardValueStyle}>{val(customers.length)}</div>
          <div style={cardSubStyle}>with credit activity</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, color: totals.overdueTotal > 0 ? '#EA580C' : '#64748B' }}>Overdue</div>
          <div style={{ ...cardValueStyle, color: totals.overdueTotal > 0 ? '#EA580C' : '#0F172A' }}>{val(formatMoney(totals.overdueTotal, baseCurrency))}</div>
          <div style={cardSubStyle}>from this period's sales</div>
        </div>
      </div>

      {/* Daily breakdown (multi-day ranges only) */}
      {showDaily && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: '4px 0 8px' }}>
            Daily Breakdown
          </div>
          <div className="reports-list-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'right', color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Credit Sales</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Payments</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Cancelled</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {activeDays.map((d) => (
                  <tr key={d.date} style={{ borderTop: '1px solid #F1F5F9', textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: '#334155', fontWeight: 600 }}>{formatDayLabel(d.date)}</td>
                    <td style={{ padding: '10px 14px', color: d.creditSales ? '#EA580C' : '#94A3B8' }}>{formatMoney(d.creditSales, baseCurrency)}</td>
                    <td style={{ padding: '10px 14px', color: d.creditPayments ? '#16A34A' : '#94A3B8' }}>{formatMoney(d.creditPayments, baseCurrency)}</td>
                    <td style={{ padding: '10px 14px', color: '#64748B' }}>{formatMoney(d.creditCancels, baseCurrency)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: d.netChange > 0 ? '#EA580C' : d.netChange < 0 ? '#16A34A' : '#64748B' }}>
                      {d.netChange > 0 ? '+' : d.netChange < 0 ? '-' : ''}{formatMoney(Math.abs(d.netChange), baseCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Customers with credit activity in the range */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: '4px 0 8px' }}>
        Customer Activity
      </div>

      <div className="reports-toolbar">
        <div className="reports-search">
          <Search size={14} />
          <input placeholder="Search by name or phone" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
        </div>
      </div>

      <div className="reports-list-card">
        {error ? (
          <div className="reports-empty">
            <div className="reports-empty-title">{error}</div>
            <button onClick={fetchReport} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Retry</button>
          </div>
        ) : loading ? (
          <div className="reports-empty">
            <div className="reports-empty-sub">Loading credit activity...</div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="reports-empty">
            <Users size={32} />
            <div className="reports-empty-title">{searchQuery.trim() ? 'No matching customers' : 'No credit activity in this period'}</div>
            <div className="reports-empty-sub">{searchQuery.trim() ? 'Try a different name or phone number.' : 'Try a different date range or store.'}</div>
          </div>
        ) : (
          filteredCustomers.map((c) => (
            <div
              key={`${c.branchId}_${c.customerId}`}
              className="reports-list-item"
              onClick={() => navigate(`/credit/${c.customerId}`, { state: { branchId: c.branchId } })}
            >
              <div style={{ width: 40, height: 40, borderRadius: 20, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, fontWeight: 800, color: '#EA580C' }}>
                {c.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="reports-list-item-info">
                <div className="reports-list-item-title">{c.name}</div>
                <div className="reports-list-item-sub">
                  <span>{c.store}</span>
                  {c.phone && <span>{c.phone}</span>}
                  {c.creditSalesCount > 0 && <span>{plural(c.creditSalesCount, 'sale')} · {formatMoney(c.creditSales, baseCurrency)}</span>}
                  {c.creditPayments > 0 && <span>Paid {formatMoney(c.creditPayments, baseCurrency)}</span>}
                  {c.creditCancels > 0 && <span>Cancelled {formatMoney(c.creditCancels, baseCurrency)}</span>}
                </div>
              </div>
              <div className="reports-list-item-right">
                <div
                  className="reports-list-item-amount"
                  style={{ color: c.netChange > 0 ? '#EA580C' : c.netChange < 0 ? '#16A34A' : '#64748B' }}
                >
                  {c.netChange > 0 ? '+' : c.netChange < 0 ? '-' : ''}{formatMoney(Math.abs(c.netChange), baseCurrency)}
                </div>
                {c.overdue && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#DC2626', marginTop: 2 }}>
                    <AlertTriangle size={11} /> Overdue {formatMoney(c.overdueAmount, baseCurrency)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Store picker */}
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
    </div>
  );
}
