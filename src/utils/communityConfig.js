// src/utils/communityConfig.js
//
// Single source of truth for community categories, post types, and their
// display labels/colors. Mirrors the structure from the brainstorm doc.

export const COMMUNITY_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "support", label: "Support" },
  { id: "inventory", label: "Inventory" },
  { id: "sales", label: "Sales" },
  { id: "hardware", label: "Hardware" },
  { id: "printing", label: "Printing" },
  { id: "accounting", label: "Accounting" },
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