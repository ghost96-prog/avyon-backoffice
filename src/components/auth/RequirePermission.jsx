// src/components/auth/RequirePermission.jsx
import React from "react";
import { ShieldOff } from "lucide-react";
import { useAppContext } from "../../context/AppContext";

export default function RequirePermission({ permission, children }) {
  const { activeStaff, hasPermission } = useAppContext();

  const allowed =
    permission === null ||
    permission === undefined ||
    activeStaff?.role === "owner" ||
    (permission === "*" ? ["owner", "admin"].includes(activeStaff?.role) : hasPermission(permission));

  if (allowed) return children;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "80px 20px",
        textAlign: "center",
        color: "var(--ink-soft)",
      }}
    >
      <ShieldOff size={34} color="var(--ink-faint)" />
      <h2 style={{ fontSize: 17, color: "var(--ink)" }}>You don't have access to this page</h2>
      <p style={{ fontSize: 13.5, maxWidth: 360 }}>
        Ask a business owner or admin to grant this permission in Access Rights if you need it.
      </p>
    </div>
  );
}
