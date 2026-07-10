// src/pages/ComingSoon.jsx
import React from "react";
import { Construction } from "lucide-react";

export default function ComingSoon({ label }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "90px 20px",
        textAlign: "center",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
      }}
    >
      <Construction size={32} color="var(--accent)" strokeWidth={1.8} />
      <h2 style={{ fontSize: 18, color: "var(--ink)" }}>{label}</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", maxWidth: 380 }}>
        This section is coming in the next BackOffice update.
      </p>
    </div>
  );
}
