// src/components/community/PostMenu.jsx
//
// The "…" button on a post or comment. Shows Edit (author only) and
// Delete (author or superadmin, wired by the caller via canEdit/canDelete).
// Delete goes through the ConfirmDialog modal instead of window.confirm.

import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import "./PostMenu.css";

export default function PostMenu({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  confirmTitle = "Delete this?",
  confirmMessage = "This can't be undone.",
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!canEdit && !canDelete) return null;

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  return (
    <div className="post-menu" ref={menuRef}>
      <button
        type="button"
        className="post-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="post-menu-dropdown">
          {canEdit && (
            <button
              type="button"
              className="post-menu-item"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Pencil size={13} /> Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="post-menu-item post-menu-item--danger"
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        variant="confirm"
        danger
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
