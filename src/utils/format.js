// src/utils/format.js

export function formatMoney(value, currencyCode = "USD") {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch (_) {
    return `$${n.toFixed(2)}`;
  }
}

export function formatNumber(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatCompact(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// Local calendar date (YYYY-MM-DD). NOT toISOString(): that converts local midnight to UTC,
// which shifts the date back a day in any timezone ahead of UTC (e.g. Harare, UTC+2).
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayRange() {
  const d = new Date();
  const iso = localDate(d);
  return { startDate: iso, endDate: iso };
}

export function lastNDaysRange(n) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (n - 1));
  return { startDate: localDate(start), endDate: localDate(end) };
}