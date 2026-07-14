// src/utils/moduleCatalog.js
//
// Frontend mirror of utils/moduleSubscriptionLogic.js's MODULE_CATALOG.
// Backend is still the source of truth for STATUS (active/expired/etc via
// module-access-status) — this file only carries the display copy
// (label/description/price/icon) so the modal and any other UI don't
// hardcode strings in multiple places. Keep in sync with the backend
// catalog if a module is ever renamed/repriced.

import { Package, Repeat, BarChart3 } from 'lucide-react';

export const MODULE_CATALOG = {
  inventory_mgmt: {
    id: 'inventory_mgmt',
    label: 'Inventory Management',
    price: 5,
    period: '/month per branch',
    icon: Package,
    color: '#0891B2',
    bg: '#ECFEFF',
    description: 'Full control over your product catalog — create, edit, and bulk-import products, plus real-time stock valuation.',
    features: [
      'Create & edit products',
      'Bulk import stock via CSV',
      'Inventory value reports',
      'Cost & margin tracking',
    ],
  },
  advanced_inventory: {
    id: 'advanced_inventory',
    label: 'Advanced Inventory Management',
    price: 5,
    period: '/month per branch',
    icon: Repeat,
    color: '#7C3AED',
    bg: '#F5F3FF',
    description: 'Move stock between branches and keep your counts honest with GRVs and structured stock takes.',
    features: [
      'Goods Received Vouchers (GRV)',
      'Store-to-store stock transfers',
      'Stock take & reconciliation',
      'Full audit trail per movement',
    ],
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics',
    price: 5,
    period: '/month per branch',
    icon: BarChart3,
    color: '#EA580C',
    bg: '#FFF7ED',
    description: 'See what\u2019s actually driving the business — sales, profit, product, and inventory analytics, plus cashier performance.',
    features: [
      'Sales & profit analytics',
      'Product performance reports',
      'Branch comparison',
      'Cashier performance tracking',
    ],
  },
};
// Add this after MODULE_CATALOG
export const MODULE_IDS = Object.keys(MODULE_CATALOG);
export function getModuleInfo(moduleId) {
  return MODULE_CATALOG[moduleId] || null;
}