// src/components/dashboard/KpiCard.jsx
import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import "./KpiCard.css";

export default function KpiCard({ label, value, icon: Icon, trend, tone = "default", loading }) {
  const trendUp = typeof trend === "number" && trend >= 0;
  const hasTrend = typeof trend === "number";

  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      <div className="kpi-card-top">
        <span className="kpi-label">{label}</span>
        {Icon && (
          <span className="kpi-icon-circle">
            <Icon size={14} strokeWidth={2} />
          </span>
        )}
      </div>

      {loading ? (
        <div className="skeleton kpi-skeleton" />
      ) : (
        <span className="kpi-value">{value}</span>
      )}

      {hasTrend && !loading && (
        <span className={`kpi-trend ${trendUp ? "up" : "down"}`}>
          {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(trend).toFixed(1)}%
        </span>
      )}
    </div>
  );
}