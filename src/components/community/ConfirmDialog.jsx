// src/components/community/ConfirmDialog.jsx
//
// Drop-in replacement for window.confirm / window.alert. Two variants:
//   "confirm" — Cancel + a (usually danger-red) confirm button
//   "alert"   — single OK button, for surfacing an error after an action fails
//
// Fully self-contained: renders nothing when `open` is false, so it's
// safe to always mount at the bottom of whatever component owns it.

import React, { useEffect } from "react";
import { AlertTriangle, Info } from "lucide-react";
import "./ConfirmDialog.css";

export default function ConfirmDialog({
  open,
  variant = "confirm", // "confirm" | "alert"
  danger = true,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isAlert = variant === "alert";

  return (
    <div
      className="confirm-dialog-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className={`confirm-dialog ${danger ? "confirm-dialog--danger" : "confirm-dialog--neutral"}`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className={`confirm-dialog-icon ${danger ? "confirm-dialog-icon--danger" : ""}`}>
          {danger ? <AlertTriangle size={20} /> : <Info size={20} />}
        </div>

        {title && <h3 className="confirm-dialog-title">{title}</h3>}
        {message && <p className="confirm-dialog-message">{message}</p>}

        <div className="confirm-dialog-actions">
          {!isAlert && (
            <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`confirm-dialog-confirm ${danger ? "confirm-dialog-confirm--danger" : ""}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel || (isAlert ? "OK" : "Delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
