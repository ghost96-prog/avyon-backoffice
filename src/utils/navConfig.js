// src/utils/navConfig.js
import {
  LayoutDashboard,
  TrendingUp,
  LineChart,
  Package,
  Boxes,
  Users,
  UserCog,
  GitCompare,
  FileBarChart,
  ClipboardList,
  Send,
  Download,
  ShieldAlert,
  Settings,
  Building2,
  Receipt,
  Clock,
  DollarSign,
  HandCoins,
  Tags,
  History,
  Landmark,
  ArrowLeftRight,
  FileInput,
  ClipboardCheck,
  Upload,
} from "lucide-react";
import { BACKOFFICE_PERMISSIONS as P } from "./permissions";

// permission: null  -> visible to every signed-in role
// permission: "*"   -> owner/admin only (no matching seeded permission id)
//
// ✅ NEW: `moduleId` marks an item as gated behind an add-on module
// subscription (see utils/moduleCatalog.js / useModuleSubscriptions).
// Absent/null = no module gate (base subscription only).
// `moduleGateMode`:
//   'block-nav'  -> clicking shows the ModuleSubscriptionModal instead of
//                   navigating (used for single-purpose screens like GRV,
//                   analytics — there's no sensible "view-only" version).
//   'allow-view' -> nav navigates normally; gating happens INSIDE the
//                   screen on specific write actions (Products is the
//                   only current case — browsing the catalog is free,
//                   creating/editing/importing is gated).
export const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Sales Dashboard", to: "/", icon: LayoutDashboard, permission: P.VIEW_SALES_REPORTS },
      { id: "top-items", label: "Top Selling Items", to: "/reports/top-selling-items", icon: TrendingUp, permission: P.VIEW_SALES_REPORTS },
      { id: "receipts", label: "Receipts", to: "/reports/receipts", icon: Receipt, permission: P.VIEW_SALES_REPORTS },
      { id: "shifts", label: "Shifts", to: "/reports/shifts", icon: Clock, permission: P.VIEW_SALES_REPORTS },
      { id: "cash", label: "Cash Management", to: "/reports/cash-management", icon: DollarSign, permission: P.VIEW_SALES_REPORTS },
      { id: "laybyes", label: "Laybyes", to: "/reports/laybyes", icon: HandCoins, permission: P.VIEW_SALES_REPORTS },
    ],
  },
  {
    label: "Inventory Management",
    items: [
      // ✅ Products: nav navigates freely — gating happens inside Products.jsx on write actions.
      { id: "inv-products", label: "Products", to: "/inventory/products", icon: Package, permission: P.MANAGE_ITEMS, moduleId: 'inventory_mgmt', moduleGateMode: 'allow-view' },
      // ✅ Import Stock: same screen-purpose as a "write" action -> block-nav.
      { id: "inv-import-stock", label: "Import Stock", to: "/inventory/import-stock", icon: Upload, permission: P.ADVANCED_INVENTORY, moduleId: 'inventory_mgmt', moduleGateMode: 'block-nav' },
      { id: "inv-categories", label: "Categories & Discounts", to: "/inventory/categories-discounts", icon: Tags, permission: P.MANAGE_ITEMS },
      { id: "inv-history", label: "Inventory History", to: "/inventory/history", icon: History, permission: P.VIEW_STOCK },
      { id: "inv-value", label: "Inventory Value", to: "/inventory/value", icon: Landmark, permission: P.ADVANCED_INVENTORY, moduleId: 'inventory_mgmt', moduleGateMode: 'block-nav' },
      { id: "inv-transfers", label: "Stock Transfers", to: "/inventory/transfers", icon: ArrowLeftRight, permission: P.ADVANCED_INVENTORY, moduleId: 'advanced_inventory', moduleGateMode: 'block-nav' },
      { id: "inv-grv", label: "GRV (Goods Received)", to: "/inventory/grv", icon: FileInput, permission: P.ADVANCED_INVENTORY, moduleId: 'advanced_inventory', moduleGateMode: 'block-nav' },
      { id: "inv-stocktake", label: "Stock Take", to: "/inventory/stock-take", icon: ClipboardCheck, permission: P.ADVANCED_INVENTORY, moduleId: 'advanced_inventory', moduleGateMode: 'block-nav' },
    ],
  },
  {
    label: "Analytics",
    items: [
      { id: "branches", label: "Branch Comparison", to: "/branches", icon: GitCompare, permission: P.VIEW_SALES_REPORTS, moduleId: 'analytics', moduleGateMode: 'block-nav' },
      { id: "sales", label: "Sales Analytics", to: "/sales", icon: TrendingUp, permission: P.VIEW_SALES_REPORTS, moduleId: 'analytics', moduleGateMode: 'block-nav' },
      { id: "profit", label: "Profit Analytics", to: "/profit", icon: LineChart, permission: P.VIEW_SALES_REPORTS, moduleId: 'analytics', moduleGateMode: 'block-nav' },
      { id: "products", label: "Product Performance", to: "/products", icon: Package, permission: P.VIEW_STOCK, moduleId: 'analytics', moduleGateMode: 'block-nav' },
      { id: "inventory", label: "Inventory Intelligence", to: "/inventory", icon: Boxes, permission: P.ADVANCED_INVENTORY, moduleId: 'analytics', moduleGateMode: 'block-nav' },
    ],
  },
  {
    label: "People",
    items: [
      { id: "staff", label: "Cashier Performance", to: "/staff", icon: UserCog, permission: P.MANAGE_EMPLOYEES, moduleId: 'analytics', moduleGateMode: 'block-nav' },
      { id: "customers", label: "Customer Analytics", to: "/customers", icon: Users, permission: P.MANAGE_CUSTOMERS },
    ],
  },
  {
    label: "System",
    items: [
      { id: "business", label: "Business Profile", to: "/business", icon: Building2, permission: "*" },
    ],
  },
];