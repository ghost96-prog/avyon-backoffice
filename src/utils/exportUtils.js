// src/utils/exportUtils.js
import { toApiDate } from '../hooks/useDateRange';

// Re-export toApiDate so it can be imported from exportUtils
export { toApiDate };

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) =>
    row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function formatMoney(amount, currency) {
  const symbol = currency?.symbol || '$';
  const val = Number(amount) || 0;
  return `${symbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}