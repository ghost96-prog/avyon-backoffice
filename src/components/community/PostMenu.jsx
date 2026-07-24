// src/components/community/PostMenu.jsx
//
// The "…" button on a post or comment. Shows Edit (author only) and
// Delete (author or superadmin, wired by the caller via canEdit/canDelete).

import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import "./PostMenu.css";

export default function PostMenu({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  confirmMessage = "Delete this? This can't be undone.",
}) {
  const [open, setOpen] = useState(false);
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

  const handleDelete = () => {
    setOpen(false);
    if (window.confirm(confirmMessage)) onDelete();
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
            <button type="button" className="post-menu-item post-menu-item--danger" onClick={handleDelete}>
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
