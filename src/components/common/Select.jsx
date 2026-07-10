// src/components/common/Select.jsx
import React from "react";
import { ChevronDown } from "lucide-react";
import "./Select.css";

export default function Select({ value, onChange, options, ariaLabel }) {
  return (
    <div className="select-wrap">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="select-chevron" />
    </div>
  );
}
