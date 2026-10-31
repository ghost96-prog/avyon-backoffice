// src/components/intelligence/format.js
// Number formatting shared by the Intelligence tables, KPIs and charts.
// Mirrors the backend's money() so a number in a sentence ("$1,320 from 22
// units") reads the same as the same number in a table cell.

export function fmtMoney(sym, n, { signed = false } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : 2;
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = v < 0 ? '-' : signed && v > 0 ? '+' : '';
  return `${sign}${sym}${body}`;
}

export const fmtNumber = (n, digits = 0) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtPercent(n, { signed = false, digits = 1 } = {}) {
  const v = Number(n) || 0;
  return `${signed && v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

// "$1.2k" for chart axes
export function fmtCompact(sym, n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sym}${(v / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `${sym}${(v / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return `${sym}${Math.round(v)}`;
}

export function fmtMetric(m, sym) {
  switch (m.format) {
    case 'money': return fmtMoney(sym, m.value);
    case 'percent': return fmtPercent(m.value, { signed: m.signed });
    case 'number': return fmtNumber(m.value);
    case 'days': return `${fmtNumber(m.value)} ${m.value === 1 ? 'day' : 'days'}`;
    default: return String(m.value);
  }
}

// severity → visual tone keys used by the CSS (ix-tone-*)
export const toneOf = (severity) => (['critical', 'warning', 'success', 'info'].includes(severity) ? severity : 'info');
