// src/components/common/Button.jsx
import React from "react";
import "./Button.css";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon: Icon,
  iconRight: IconRight,
  className = "",
  ...rest
}) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="spinner btn-spinner" />
      ) : (
        <>
          {Icon && <Icon size={size === "sm" ? 15 : 17} strokeWidth={2} />}
          <span>{children}</span>
          {IconRight && <IconRight size={size === "sm" ? 15 : 17} strokeWidth={2} />}
        </>
      )}
    </button>
  );
}
