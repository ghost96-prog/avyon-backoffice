// src/utils/permissions.js
//
// Single source of truth for "which backoffice permission unlocks which
// nav item / page." Matches the permission ids seeded in roleController.js
// (DEFAULT_ROLE_PERMISSIONS[...].backoffice.permissions[].id).

export const BACKOFFICE_PERMISSIONS = {
  VIEW_SALES_REPORTS: "view_sales_reports",
  CANCEL_RECEIPTS: "cancel_receipts",
  MANAGE_ITEMS: "manage_items_bo",
  ADVANCED_INVENTORY: "advanced_inventory",
  VIEW_STOCK: "view_stock_bo",
  MANAGE_EMPLOYEES: "manage_employees",
  MANAGE_CUSTOMERS: "manage_customers",
  MANAGE_SETTINGS: "manage_settings",
  MANAGE_BILLING: "manage_billing",
  MANAGE_PAYMENT_TYPES: "manage_payment_types",
  MANAGE_TAXES: "manage_taxes",
  MANAGE_POS_DEVICES: "manage_pos_devices",
};

export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  stock_controller: "Stock Controller",
};

export const ROLE_BADGE_COLORS = {
  owner: { fg: "#b8720a", bg: "#fdf1de" },
  admin: { fg: "#357abd", bg: "#eaf1fa" },
  manager: { fg: "#1c9d6c", bg: "#e4f7ef" },
  cashier: { fg: "#c23b7a", bg: "#fbe7f1" },
  stock_controller: { fg: "#234c6a", bg: "#e8f0fe" },
};