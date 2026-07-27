// src/utils/communityConfig.js
//
// Single source of truth for community categories, post types, and their
// display labels/colors. Mirrors the structure from the brainstorm doc.
//
// ✅ UPDATE: category list expanded to cover topics tied to the actual
// system — three distinct surfaces: the Backoffice web app, the in-store
// POS app (cashier-facing), and the Dashboard app (separate, owner-facing,
// for remote access) — so people can filter discussion by the feature
// area they're asking about. Existing ids (support, inventory, sales,
// hardware, printing, feature_requests, general_discussion,
// success_stories) are left untouched so old posts still resolve to the
// same label. `accounting` was removed — not a real feature, reporting
// lives under `analytics_reports` ("Analytics & Reports") instead.
// The Dashboard app gets its own category (`dashboard_app`), split out
// from in-app Analytics (`analytics_reports`), since it's a distinct
// app, not a POS feature.

export const COMMUNITY_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "support", label: "Support" },

  // Inventory — Backoffice Products/Import Stock/Categories & Discounts/
  // Inventory History & Value/Transfers/GRV/Stock Take, plus POS-side
  // product creation & editing.
  { id: "inventory", label: "Inventory" },

  // Sales — POS sales screen, Backoffice Sales Dashboard, Top Selling
  // Items, Sales Analytics.
  { id: "sales", label: "Sales" },

  // NEW — general POS app issues that don't fit a specific topic below
  // (crashes, syncing, login, general bugs on the in-store cashier app).
  { id: "pos_app", label: "POS App" },
  // NEW — the separate owner-facing Dashboard app (remote access for the
  // shop owner): remote access, exporting, Inventory History, Inventory
  // Value, Shifts, Receipts, Top Selling Items viewed remotely.
  { id: "dashboard_app", label: "Dashboard App" },

  // Hardware — POS terminals, scanners, general device setup.
  { id: "hardware", label: "Hardware" },

  // Printing — printer connection settings, receipt printing.
  { id: "printing", label: "Printing" },

  // NEW — Cash Management, Shifts, Expenses, Pay In/Pay Out (POS +
  // Backoffice "Cash Management" and "Shifts" screens).
  { id: "cash_shifts", label: "Cash & Shifts" },

  // NEW — Laybyes specifically (POS + Backoffice both have a dedicated
  // Laybyes screen, called out often enough to deserve its own filter).
  { id: "laybyes", label: "Laybyes" },

  // NEW — Analytics & Reports: Backoffice-side Branch Comparison, Sales/
  // Profit Analytics, Product Performance, Inventory Intelligence,
  // Cashier Performance, Customer Analytics, Receipts reporting.
  { id: "analytics_reports", label: "Analytics & Reports" },


  { id: "feature_requests", label: "Feature Requests" },
  { id: "general_discussion", label: "General Discussion" },
  { id: "success_stories", label: "Success Stories" },
];

export const COMMUNITY_POST_TYPES = {
  QUESTION: "question",
  TIP: "tip",
  FEATURE_REQUEST: "feature_request",
  DISCUSSION: "discussion",
};

export const POST_TYPE_LABELS = {
  question: "Question",
  tip: "Tip",
  feature_request: "Feature Request",
  discussion: "Discussion",
};

export const POST_TYPE_COLORS = {
  question: { fg: "#357abd", bg: "#eaf1fa" },
  tip: { fg: "#b8720a", bg: "#fdf1de" },
  feature_request: { fg: "#7a4fd6", bg: "#f1ebfc" },
  discussion: { fg: "#1c9d6c", bg: "#e4f7ef" },
};

export function categoryLabel(categoryId) {
  return COMMUNITY_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId;
}