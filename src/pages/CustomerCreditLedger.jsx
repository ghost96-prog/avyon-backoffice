// src/pages/CustomerCreditLedger.jsx
//
// One customer's credit statement — full transaction history with a
// running balance. Reached from Customers.jsx or Credit.jsx via
// navigate(`/credit/:customerId`, { state: { branchId } }).
//
// ✅ REMOVED — "Record Payment" from here. A payment is only ever real once
// it's collected at the POS: that flow creates a receipt, books the till/
// shift, and writes the ledger entry together (see
// recordLocalCreditPaymentWithReceipt in the POS's realm/schema.js).
// Recording one from the backoffice bypassed all of that — no receipt, no
// till record — so it's gone; this screen is read-only.

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ChevronLeft, Receipt as ReceiptIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatMoney } from '../utils/exportUtils';
import '../styles/ReportsShared.css';

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CustomerCreditLedger() {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerId } = useParams();
  const { apiFetch, businessId, branches, baseCurrency } = useAppContext();

  const branchId = location.state?.branchId || branches?.[0]?.branchId;

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLedger = useCallback(async () => {
    if (!businessId || !branchId || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${branchId}/customers/${customerId}/credit/ledger`);
      setLedger(res);
    } catch (e) {
      console.error('Fetch credit ledger error:', e);
      setError('Failed to load statement');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, branchId, customerId]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  if (loading) {
    return (
      <div className="reports-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#8b97a7' }}>Loading statement...</div>
      </div>
    );
  }

  if (error && !ledger) {
    return (
      <div className="reports-page">
        <div className="reports-empty">
          <div className="reports-empty-title">{error}</div>
          <button onClick={fetchLedger} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid #e6eaf0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Retry</button>
        </div>
      </div>
    );
  }

  const availableCredit = ledger?.creditLimit ? Math.max(0, ledger.creditLimit - (ledger.outstandingBalance || 0)) : null;

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate(-1)}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">{ledger?.customerName || 'Customer'}</div>
            <div className="reports-header-sub">Credit statement</div>
          </div>
        </div>
      </div>

      {/* Balance card */}
      <div style={{ marginTop: 16, background: '#0F172A', borderRadius: 12, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>Outstanding balance</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', marginTop: 2 }}>{formatMoney(ledger?.outstandingBalance || 0, baseCurrency)}</div>
        </div>
        {availableCredit !== null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Available credit</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>{formatMoney(availableCredit, baseCurrency)}</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: '20px 0 8px' }}>
        Transaction History
      </div>

      <div className="reports-list-card">
        {!ledger?.transactions?.length ? (
          <div className="reports-empty">
            <ReceiptIcon size={28} />
            <div className="reports-empty-title">No credit activity yet</div>
          </div>
        ) : (
          ledger.transactions.map((t) => {
            // CREDIT_REFUND is the legacy name of a cancelled credit sale.
            const isCancel = t.type === 'CREDIT_CANCEL' || t.type === 'CREDIT_REFUND';
            // A refunded PAYMENT puts the debt back (balance goes UP).
            const isPaymentRefund = t.type === 'CREDIT_PAYMENT_REFUND';
            // Payments and cancelled credit sales both REDUCE the balance.
            const isPayment = t.type === 'CREDIT_PAYMENT' || isCancel;
            return (
              <div key={t.transactionId} className="reports-list-item" style={{ cursor: 'default' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10,
                  background: isPayment ? '#F0FDF4' : '#FFF7ED',
                }}>
                  {isPayment ? <ArrowDown size={14} color="#16A34A" /> : <ArrowUp size={14} color="#EA580C" />}
                </div>
                <div className="reports-list-item-info">
                  <div className="reports-list-item-title">
                    {isCancel ? `Cancelled${t.receiptNumber ? ` — #${t.receiptNumber}` : ''}` : isPaymentRefund ? `Payment refunded${t.receiptNumber ? ` — #${t.receiptNumber}` : ''}` : isPayment ? `Payment${t.paymentMethod ? ` — ${t.paymentMethod}` : ''}` : `Credit Sale${t.receiptNumber ? ` #${t.receiptNumber}` : ''}`}
                  </div>
                  <div className="reports-list-item-sub"><span>{formatDate(t.createdAt)}</span></div>
                </div>
                <div className="reports-list-item-right">
                  <div className="reports-list-item-amount" style={{ color: isPayment ? '#16A34A' : '#EA580C' }}>
                    {isPayment ? '-' : '+'}{formatMoney(t.amount, baseCurrency)}
                  </div>
                  <div style={{ fontSize: 11, color: '#8b97a7' }}>Balance {formatMoney(t.balanceAfter, baseCurrency)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}