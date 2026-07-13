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
      { id: "inv-products", label: "Products", to: "/inventory/products", icon: Package, permission: P.MANAGE_ITEMS },
      { id: "inv-import-stock", label: "Import Stock", to: "/inventory/import-stock", icon: Upload, permission: P.ADVANCED_INVENTORY },
      { id: "inv-categories", label: "Categories & Discounts", to: "/inventory/categories-discounts", icon: Tags, permission: P.MANAGE_ITEMS },
      { id: "inv-history", label: "Inventory History", to: "/inventory/history", icon: History, permission: P.VIEW_STOCK },
      // ✅ Inventory Value now uses ADVANCED_INVENTORY
      { id: "inv-value", label: "Inventory Value", to: "/inventory/value", icon: Landmark, permission: P.ADVANCED_INVENTORY },
      { id: "inv-transfers", label: "Stock Transfers", to: "/inventory/transfers", icon: ArrowLeftRight, permission: P.ADVANCED_INVENTORY },
      { id: "inv-grv", label: "GRV (Goods Received)", to: "/inventory/grv", icon: FileInput, permission: P.ADVANCED_INVENTORY },
      { id: "inv-stocktake", label: "Stock Take", to: "/inventory/stock-take", icon: ClipboardCheck, permission: P.ADVANCED_INVENTORY },
    ],
  },
  {
    label: "Analytics",
    items: [
      { id: "branches", label: "Branch Comparison", to: "/branches", icon: GitCompare, permission: P.VIEW_SALES_REPORTS },
      { id: "sales", label: "Sales Analytics", to: "/sales", icon: TrendingUp, permission: P.VIEW_SALES_REPORTS },
      { id: "profit", label: "Profit Analytics", to: "/profit", icon: LineChart, permission: P.VIEW_SALES_REPORTS },
      { id: "products", label: "Product Performance", to: "/products", icon: Package, permission: P.VIEW_STOCK },
      { id: "inventory", label: "Inventory Intelligence", to: "/inventory", icon: Boxes, permission: P.ADVANCED_INVENTORY },
      // { id: "financials", label: "Financial Reports", to: "/financials", icon: FileBarChart, permission: P.VIEW_SALES_REPORTS },
      // { id: "reports", label: "Report Builder", to: "/reports", icon: ClipboardList, permission: P.VIEW_SALES_REPORTS },
      // { id: "scheduled", label: "Scheduled Reports", to: "/scheduled-reports", icon: Send, permission: P.VIEW_SALES_REPORTS },
      // { id: "export", label: "Export Centre", to: "/export", icon: Download, permission: P.VIEW_SALES_REPORTS },
    ],
  },
  {
    label: "People",
    items: [
      { id: "staff", label: "Cashier Performance", to: "/staff", icon: UserCog, permission: P.MANAGE_EMPLOYEES },
      { id: "customers", label: "Customer Analytics", to: "/customers", icon: Users, permission: P.MANAGE_CUSTOMERS },
    ],
  },
  {
    label: "System",
    items: [
      { id: "business", label: "Business Profile", to: "/business", icon: Building2, permission: "*" },
      // { id: "settings", label: "Settings", to: "/settings", icon: Settings, permission: P.MANAGE_SETTINGS },
    ],
  },
];