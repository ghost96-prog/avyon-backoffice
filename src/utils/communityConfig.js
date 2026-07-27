// src/utils/communityConfig.js
//
// Single source of truth for community categories, post types, and their
// display labels/colors. Mirrors the structure from the brainstorm doc.
//
// ✅ UPDATE: category list expanded to cover topics tied to the actual
// system (Backoffice web app + in-store POS + remote POS Dashboard app),
// so people can filter discussion by the feature area they're asking
// about. Existing ids (support, inventory, sales, hardware, printing,
// accounting, feature_requests, general_discussion, success_stories)
// are left untouched so old posts still resolve to the same label.
// The remote POS Dashboard app gets its own category (`pos_dashboard_app`),
// split out from in-app Analytics (`analytics_reports`), since it's a
// distinct product surface.

export const COMMUNITY_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "support", label: "Support" },

  // Inventory — Backoffice Products/Import Stock/Categories & Discounts/
  // Inventory History & Value/Transfers/GRV/Stock Take, plus POS-side
  // product creation & editing.
  { id: "inventory", label: "Inventory" },

  // Sales — POS sales screen, Sales Dashboard, Top Selling Items, Sales
  // Analytics (Backoffice + remote Dashboard app).
  { id: "sales", label: "Sales" },

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

  { id: "accounting", label: "Accounting" },

  // NEW — Analytics & Reports: Backoffice-side Branch Comparison, Sales/
  // Profit Analytics, Product Performance, Inventory Intelligence,
  // Cashier Performance, Customer Analytics, Receipts reporting.
  { id: "analytics_reports", label: "Analytics & Reports" },

  // NEW — the separate remote POS Dashboard app: remote access,
  // exporting, Inventory History, Inventory Value, Shifts, Receipts,
  // Top Selling Items viewed remotely.
  { id: "pos_dashboard_app", label: "POS Dashboard App" },

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