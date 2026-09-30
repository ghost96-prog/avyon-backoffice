// utils/creditReceipts.js
// Credit receipt classification — mirrors the POS and the backend.
//  • credit SALE     : goods on account, nothing collected. Reported ONLY as
//                      "credit sales", never as gross / net sales.
//  • credit PAYMENT  : receiptType 'credit_payment', the receipt printed when a
//                      credit sale is settled IN FULL. It carries the sale's
//                      products; its money IS real sales.
//  • a credit sale is CANCELLED (never "refunded"); a credit payment is REFUNDED.

const parse = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return fallback; }
};

export const isCreditPaymentReceipt = (r) => r?.receiptType === 'credit_payment';

export const isCreditSaleReceipt = (r) => {
  if (!r) return false;
  const t = r.receiptType;
  if (t === 'laybye_deposit' || t === 'laybye_payment' || t === 'laybye_final' || t === 'credit_payment') return false;
  const totals = parse(r.totals, {});
  const base = parse(r.baseTotals, {});
  if (totals.isCreditSale === true || base.isCreditSale === true) return true;
  return (totals.balanceDue || base.balanceDue || 0) > 0 && (totals.paid || 0) === 0;
};

// 'owing' | 'paid' | 'cancelled' | null
export const getCreditStatus = (r) => {
  if (!isCreditSaleReceipt(r)) return null;
  if (r.status === 'cancelled' || r.status === 'refunded') return 'cancelled';
  const totals = parse(r.totals, {});
  return totals.creditStatus === 'paid' ? 'paid' : 'owing';
};

export const CREDIT_STATUS_BADGE = {
  owing:     { label: 'Owes',      bg: '#FFEDD5', color: '#EA580C' },
  paid:      { label: 'Paid up',   bg: '#DCFCE7', color: '#16A34A' },
  cancelled: { label: 'Cancelled', bg: '#FEE2E2', color: '#EF4444' },
};
