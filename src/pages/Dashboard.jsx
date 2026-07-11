// src/pages/Dashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  DollarSign,
  Receipt,
  TrendingUp,
  RotateCcw,
  Tag,
  Package,
  Award,
  AlertTriangle,
  RefreshCw,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
  Store,
  Lock,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useDateRange } from "../hooks/useDateRange";
import DateRangeNav from "../components/common/DateRangeNav";
import KpiCard from "../components/dashboard/KpiCard";
import Panel from "../components/common/Panel";
import Select from "../components/common/Select";
import Button from "../components/common/Button";
import { formatMoney, formatNumber, downloadCsv } from "../utils/exportUtils";
import { BACKOFFICE_PERMISSIONS } from "../utils/permissions";
import "./Dashboard.css";

const CATEGORY_COLORS = ["#357abd", "#50C878", "#FF6B6B", "#FFD93D", "#9C27B0", "#FF9800", "#00BCD4", "#A9A9A9"];

const STAT_META = {
  grossSales: { icon: DollarSign, tone: "default" },
  discounts: { icon: Tag, tone: "warning" },
  returns: { icon: RotateCcw, tone: "danger" },
  netSales: { icon: TrendingUp, tone: "success" },
  cogs: { icon: Package, tone: "default" },
  profit: { icon: TrendingUp, tone: "success" },
  receipts: { icon: Receipt, tone: "default" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toApiDate(d) {
  return d.toISOString().split("T")[0];
}

function formatDateDisplay(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateRangeLabel(start, end) {
  return `${MONTHS[start.getMonth()]} ${start.getDate()} - ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function formatPercent(change) {
  const n = Number(change) || 0;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { apiFetch, businessId, branches, baseCurrency, hasBackofficePermission } = useAppContext();

  const {
    startDate,
    endDate,
    selectedOption,
    handleOptionSelect,
    navigateDate,
    reload: reloadDateRange,
    loadFromStorage,
  } = useDateRange('today');

  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const branchOptions = useMemo(
    () => [{ value: "all", label: "All Stores" }, ...(branches || []).map((b) => ({ value: b.branchId, label: b.name }))],
    [branches]
  );
  const selectedBranchName = selectedBranchId === "all" ? "All Stores" : branchOptions.find((b) => b.value === selectedBranchId)?.label || "";

  const [stats, setStats] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branchCount, setBranchCount] = useState(0);
  const [prevRangeLabel, setPrevRangeLabel] = useState("");
  const [dailyRows, setDailyRows] = useState([]);
  const [branchRows, setBranchRows] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Check if user has permission to view sales reports
  const canViewSales = useMemo(() => {
    return hasBackofficePermission(BACKOFFICE_PERMISSIONS.VIEW_SALES_REPORTS);
  }, [hasBackofficePermission]);

  const load = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    setLoading(true);
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);

      const dailyParams = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });
      if (selectedBranchId !== "all") dailyParams.set("branchId", selectedBranchId);

      const branchParams = new URLSearchParams({ startDate: toApiDate(startDate), endDate: toApiDate(endDate) });

      const [overview, daily, branchDim] = await Promise.all([
        apiFetch(`/business/${businessId}/reports/dashboard?${params.toString()}`),
        apiFetch(`/business/${businessId}/reports/daily-breakdown?${dailyParams.toString()}`),
        apiFetch(`/business/${businessId}/reports/sales-by/branch?${branchParams.toString()}`).catch(() => null),
      ]);

      setStats(overview.stats || []);
      setTopItems(overview.topItems || []);
      setCategories(overview.categories || []);
      setEmployees(overview.employees || []);
      setBranchCount(overview.branchCount || 0);
      setDailyRows(daily.days || []);
      setBranchRows(branchDim?.rows || []);

      if (overview.previousRange) {
        const ps = new Date(overview.previousRange.startDate);
        const pe = new Date(overview.previousRange.endDate);
        setPrevRangeLabel(`vs ${MONTHS[ps.getMonth()]} ${ps.getDate()} - ${MONTHS[pe.getMonth()]} ${pe.getDate()}`);
      } else {
        setPrevRangeLabel("");
      }
    } catch (err) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [apiFetch, businessId, startDate, endDate, selectedBranchId]);

  // ─── Reload persisted date range on focus ────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reloadDateRange();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadDateRange]);

  // ─── Reload persisted date range on browser back/forward ────────────────
  useEffect(() => {
    const handlePopState = () => {
      reloadDateRange();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [reloadDateRange]);

  // ─── Single source of truth for fetching ─────────────────────────────────
  useEffect(() => {
    if (businessId) {
      load();
    }
  }, [businessId, startDate, endDate, selectedBranchId, load]);

  const exportFileTag = useMemo(() => {
    const branchTag = selectedBranchId === "all" ? "all-stores" : selectedBranchName.toLowerCase().replace(/\s+/g, "-");
    return `sales-report_${branchTag}_${toApiDate(startDate)}_to_${toApiDate(endDate)}`;
  }, [selectedBranchId, selectedBranchName, startDate, endDate]);

  const handleExportCsv = useCallback(() => {
    const header = ["Date", "Gross Sales", "Net Sales", "Transactions", "Profit", "Refunds", "Refund Count"];
    const rows = dailyRows.map((d) => [d.date, d.grossSales, d.sales, d.transactions, d.profit, d.refunds, d.refundCount]);
    const totalsRow = [
      "TOTAL",
      dailyRows.reduce((s, d) => s + (d.grossSales || 0), 0),
      dailyRows.reduce((s, d) => s + (d.sales || 0), 0),
      dailyRows.reduce((s, d) => s + (d.transactions || 0), 0),
      dailyRows.reduce((s, d) => s + (d.profit || 0), 0),
      dailyRows.reduce((s, d) => s + (d.refunds || 0), 0),
      dailyRows.reduce((s, d) => s + (d.refundCount || 0), 0),
    ];
    downloadCsv(`${exportFileTag}.csv`, [header, ...rows, totalsRow]);
  }, [dailyRows, exportFileTag]);

  const handleExportPdf = useCallback(async () => {
    if (!dailyRows.length || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = autoTableModule.default || autoTableModule;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt" });

      doc.setFontSize(14);
      doc.text("Sales Report", 32, 30);
      doc.setFontSize(10);
      doc.setTextColor(110, 120, 135);
      doc.text(`${selectedBranchName} • ${formatDateRangeLabel(startDate, endDate)}`, 32, 46);
      doc.setTextColor(20, 24, 30);

      const statsRows = stats.map((s) => [
        s.title === "Returns" ? "Refunds" : s.title,
        s.key === "receipts" ? formatNumber(s.value) : formatMoney(s.value, baseCurrency),
        formatPercent(s.change),
      ]);

      autoTable(doc, {
        startY: 58,
        head: [["Metric", "Value", "Change"]],
        body: statsRows,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      const dailyHead = ["Date", "Gross sales", "Net sales", "Transactions", "Profit", "Refunds"];
      const dailyBody = dailyRows.map((d) => [
        formatDateDisplay(new Date(d.date)),
        formatMoney(d.grossSales, baseCurrency),
        formatMoney(d.sales, baseCurrency),
        formatNumber(d.transactions),
        formatMoney(d.profit, baseCurrency),
        formatMoney(d.refunds, baseCurrency),
      ]);

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [dailyHead],
        body: dailyBody,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [53, 122, 189], fontSize: 8 },
        margin: { left: 32, right: 32 },
      });

      doc.save(`${exportFileTag}.pdf`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      setError("Could not generate the PDF. Make sure jspdf and jspdf-autotable are installed.");
    } finally {
      setExportingPdf(false);
    }
  }, [dailyRows, stats, selectedBranchName, startDate, endDate, baseCurrency, exportFileTag, exportingPdf]);

  const filteredStats = stats;
  const sortedBranchRows = useMemo(() => [...branchRows].sort((a, b) => (b.sales || 0) - (a.sales || 0)), [branchRows]);
  const topBranchRow = sortedBranchRows[0];
  const worstBranchRow = sortedBranchRows[sortedBranchRows.length - 1];
  const branchRowsMax = sortedBranchRows.length ? Math.max(...sortedBranchRows.map((r) => r.sales || 0)) : 0;

  // ✅ Show access denied if user doesn't have permission
  if (!canViewSales) {
    return (
      <div className="dashboard-access-denied">
        <div className="dashboard-access-denied-content">
          <Lock size={48} className="dashboard-access-denied-icon" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view sales reports.</p>
          <p className="dashboard-access-denied-sub">Contact your administrator to request access.</p>
          <Button variant="primary" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-left">
          <Select 
            value={selectedBranchId} 
            onChange={setSelectedBranchId} 
            options={branchOptions} 
            ariaLabel="Branch" 
          />
          <DateRangeNav
            startDate={startDate}
            endDate={endDate}
            selectedOption={selectedOption}
            onNavigate={navigateDate}
            onOptionSelect={handleOptionSelect}
          />
        </div>

        <div className="dashboard-toolbar-right">
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={loading || !dailyRows.length}>
            CSV
          </Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={loading || !dailyRows.length} loading={exportingPdf}>
            PDF
          </Button>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => load(true)} loading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="dashboard-error">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      <div className="kpi-grid">
        {(loading ? Array.from({ length: 7 }) : filteredStats).map((stat, i) => {
          const meta = stat ? STAT_META[stat.key] || {} : {};
          const isCount = stat?.key === "receipts";
          return (
            <KpiCard
              key={stat?.key || i}
              label={stat ? (stat.title === "Returns" ? "Refunds" : stat.title) : ""}
              value={stat ? (isCount ? formatNumber(stat.value) : formatMoney(stat.value, baseCurrency)) : ""}
              icon={meta.icon || DollarSign}
              trend={stat?.change}
              tone={meta.tone}
              loading={loading}
            />
          );
        })}
      </div>
      {!loading && prevRangeLabel && <div className="dashboard-vs-label">{prevRangeLabel}</div>}

      <div className="dashboard-grid">
        <Panel 
          title="Top selling items" 
          subtitle="Ranked by revenue for this period" 
          className="dashboard-side-panel"
          headerActions={
            topItems.length > 0 && (
              <button 
                className="dashboard-view-all-link"
                onClick={() => navigate('/reports/top-selling-items')}
              >
                View all →
              </button>
            )
          }
        >
          {loading ? (
            <div className="skeleton" style={{ height: 170, borderRadius: 10 }} />
          ) : topItems.length === 0 ? (
            <div className="dashboard-empty" style={{ height: 100 }}>No sales in this period.</div>
          ) : (
            <div className="ranked-list">
              {topItems.slice(0, 5).map((item, index) => (
                <div key={item.productId} className="ranked-row">
                  <span className="ranked-index">{index + 1}</span>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="ranked-thumb" />
                  ) : (
                    <div className="ranked-thumb ranked-thumb-placeholder">
                      <Package size={13} />
                    </div>
                  )}
                  <div className="ranked-info">
                    <span className="ranked-name">{item.name}</span>
                    <span className="ranked-sub">x {item.qty}</span>
                  </div>
                  <span className="ranked-value">{formatMoney(item.revenue, baseCurrency)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Sales by category" subtitle="Share of net sales for this period" className="dashboard-side-panel">
          {loading ? (
            <div className="skeleton" style={{ height: 170, borderRadius: 10 }} />
          ) : categories.length === 0 ? (
            <div className="dashboard-empty" style={{ height: 100 }}>No category data for this period.</div>
          ) : (
            <div className="category-panel">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={categories} dataKey="sales" nameKey="label" innerRadius={34} outerRadius={60} paddingAngle={2}>
                    {categories.map((c, i) => (
                      <Cell key={c.id} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(v, baseCurrency)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="category-list">
                {categories.map((cat, index) => (
                  <div key={cat.id} className="category-row">
                    <div className="category-row-label">
                      <span className="color-dot" style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                      <span>{cat.label}</span>
                    </div>
                    <div className="category-row-value">
                      <span>{formatMoney(cat.sales, baseCurrency)}</span>
                      <span className="category-row-percent">({cat.percentage.toFixed(1)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Sales by employee" subtitle="Every cashier who traded in this period">
        {loading ? (
          <div className="skeleton" style={{ height: 140, borderRadius: 10 }} />
        ) : employees.length === 0 ? (
          <div className="dashboard-empty" style={{ height: 100 }}>No employee sales for this period.</div>
        ) : (
          <div className="employee-list">
            {employees.map((emp) => (
              <div key={emp.id} className="employee-row">
                <div className="employee-avatar">{(emp.name || "?").trim().charAt(0).toUpperCase()}</div>
                <div className="employee-info">
                  <span className="employee-name">{emp.name}</span>
                  <div className="employee-meta">
                    <span className="role-badge">{emp.role}</span>
                    {selectedBranchId === "all" && emp.branchName && <span className="employee-store">{emp.branchName}</span>}
                    <span className="employee-orders">{emp.transactions} orders</span>
                  </div>
                </div>
                <span className="employee-sales">{formatMoney(emp.sales, baseCurrency)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="dashboard-grid">
        <Panel title="Sales trend" subtitle="Net sales per day for the selected period" className="dashboard-chart-panel">
          <div className="dashboard-chart">
            {loading ? (
              <div className="skeleton" style={{ height: 220, borderRadius: 10 }} />
            ) : dailyRows.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyRows} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#357abd" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#357abd" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef1f5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#8b97a7" }}
                    axisLine={{ stroke: "#e6eaf0" }}
                    tickLine={false}
                    tickFormatter={(d) => {
                      const dt = new Date(d);
                      return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#8b97a7" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    formatter={(v) => formatMoney(v, baseCurrency)}
                    labelFormatter={(d) => {
                      const dt = new Date(d);
                      return formatDateDisplay(dt);
                    }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e6eaf0",
                      fontSize: 12,
                      boxShadow: "0 8px 24px rgba(22,32,43,0.12)",
                    }}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#357abd" strokeWidth={2} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="dashboard-empty">No sales recorded for this period yet.</div>
            )}
          </div>
        </Panel>

        <Panel title="Branch comparison" subtitle="Sales across all stores for this period" className="dashboard-side-panel">
          {loading ? (
            <div className="skeleton" style={{ height: 160, borderRadius: 10 }} />
          ) : sortedBranchRows.length <= 1 ? (
            <div className="dashboard-empty" style={{ height: 100 }}>
              {branchCount <= 1 ? "Add another store to compare branch performance." : "No sales recorded for this period yet."}
            </div>
          ) : (
            <div className="branch-snapshot">
              <div className="branch-row branch-row-top">
                <div className="branch-row-icon">
                  <Award size={14} />
                </div>
                <div className="branch-row-text">
                  <span className="branch-row-label">Top store</span>
                  <span className="branch-row-name">{topBranchRow?.name || topBranchRow?.id || "—"}</span>
                </div>
                <span className="branch-row-value">{formatMoney(topBranchRow?.sales, baseCurrency)}</span>
              </div>
              <div className="branch-row branch-row-worst">
                <div className="branch-row-icon">
                  <AlertTriangle size={14} />
                </div>
                <div className="branch-row-text">
                  <span className="branch-row-label">Needs attention</span>
                  <span className="branch-row-name">{worstBranchRow?.name || worstBranchRow?.id || "—"}</span>
                </div>
                <span className="branch-row-value">{formatMoney(worstBranchRow?.sales, baseCurrency)}</span>
              </div>

              <div className="branch-compare-list">
                {sortedBranchRows.map((b) => (
                  <div key={b.id} className="branch-compare-row">
                    <div className="branch-compare-label">
                      <Store size={11} />
                      <span>{b.name || b.id}</span>
                    </div>
                    <div className="branch-compare-bar-track">
                      <div
                        className="branch-compare-bar-fill"
                        style={{ width: `${branchRowsMax > 0 ? ((b.sales || 0) / branchRowsMax) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="branch-compare-value">{formatMoney(b.sales, baseCurrency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Daily breakdown"
        subtitle="One row per day for the selected period — matches the exported file"
        headerActions={
          <div className="panel-export-actions">
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={loading || !dailyRows.length}>
              CSV
            </Button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={loading || !dailyRows.length} loading={exportingPdf}>
              PDF
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="skeleton" style={{ height: 190, borderRadius: 10 }} />
        ) : dailyRows.length === 0 ? (
          <div className="dashboard-empty" style={{ height: 100 }}>No sales recorded for this period yet.</div>
        ) : (
          <div className="daily-table-wrap">
            <table className="daily-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Gross sales</th>
                  <th>Net sales</th>
                  <th>Transactions</th>
                  <th>Profit</th>
                  <th>Refunds</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDateDisplay(new Date(d.date))}</td>
                    <td>{formatMoney(d.grossSales, baseCurrency)}</td>
                    <td>{formatMoney(d.sales, baseCurrency)}</td>
                    <td>{formatNumber(d.transactions)}</td>
                    <td>{formatMoney(d.profit, baseCurrency)}</td>
                    <td>{formatMoney(d.refunds, baseCurrency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}