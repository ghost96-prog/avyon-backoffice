// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RequirePermission from "./components/auth/RequirePermission";
import DashboardLayout from "./components/layout/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import TopSellingItems from "./pages/TopSellingItems";
import Receipts from "./pages/Receipts";
import Shifts from "./pages/Shifts";
import CashManagement from "./pages/CashManagement";
import Customers from "./pages/Customers";
import Laybyes from "./pages/Laybyes";
import Products from "./pages/Products";
import ProductForm from "./pages/ProductForm";
import CategoriesDiscounts from "./pages/CategoriesDiscounts";
import ImportStock from "./pages/ImportStock";
import InventoryHistory from "./pages/InventoryHistory";
import InventoryValue from "./pages/InventoryValue";
import StockTransfers from "./pages/StockTransfers";
import GRV from "./pages/GRV";
import StockTake from "./pages/StockTake";
import { NAV_SECTIONS } from "./utils/navConfig";
import { BACKOFFICE_PERMISSIONS as P } from "./utils/permissions";

const REAL_PAGES = {
  '/': Dashboard,
  '/reports/top-selling-items': TopSellingItems,
  '/reports/receipts': Receipts,
  '/reports/shifts': Shifts,
  '/reports/cash-management': CashManagement,
  '/reports/laybyes': Laybyes,
  '/customers': Customers,
  '/inventory/products': Products,
  '/inventory/import-stock': ImportStock,
  '/inventory/categories-discounts': CategoriesDiscounts,
  '/inventory/history': InventoryHistory,
  '/inventory/value': InventoryValue,
  '/inventory/transfers': StockTransfers,
  '/inventory/grv': GRV,
  '/inventory/stock-take': StockTake,
};

// All nav items except dashboard - will use either real page or ComingSoon
const navItems = NAV_SECTIONS.flatMap((section) => section.items).filter((item) => item.to !== "/");

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard - main page */}
            <Route index element={<Dashboard />} />

            {/* All nav items with their corresponding pages */}
            {navItems.map((item) => {
              const PageComponent = REAL_PAGES[item.to];
              const path = item.to.slice(1); // Remove leading slash

              return (
                <Route
                  key={item.id}
                  path={path}
                  element={
                    <RequirePermission permission={item.permission}>
                      {PageComponent ? (
                        <PageComponent />
                      ) : (
                        <ComingSoon label={item.label} />
                      )}
                    </RequirePermission>
                  }
                />
              );
            })}

            {/* Sub-routes not in the sidebar nav — reached via navigate(), not a nav link */}
            <Route
              path="inventory/products/new"
              element={
                <RequirePermission permission={P.VIEW_STOCK}>
                  <ProductForm />
                </RequirePermission>
              }
            />
            <Route
              path="inventory/products/:productId/edit"
              element={
                <RequirePermission permission={P.VIEW_STOCK}>
                  <ProductForm />
                </RequirePermission>
              }
            />

            {/* Catch-all for unknown routes */}
            <Route path="*" element={<ComingSoon label="Page not found" />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}