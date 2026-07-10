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

export function todayRange() {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  return { startDate: iso, endDate: iso };
}

export function lastNDaysRange(n) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (n - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
