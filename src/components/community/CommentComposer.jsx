// src/components/community/CommentComposer.jsx
//
// Text + optional image/video attachment for comments. Doubles as the
// edit form: pass mode="edit" with initialBody/initialMedia and this
// renders Save/Cancel instead of a send button, and lets the existing
// attachment be removed or replaced.

import React, { useRef, useState } from "react";
import { Image as ImageIcon, Send, X } from "lucide-react";
import { validateMediaFile } from "../../utils/mediaValidation";
import "./CommentComposer.css";

export default function CommentComposer({
  onSubmit,
  onCancel,
  autoFocus = false,
  mode = "create",
  initialBody = "",
  initialMedia = null, // { url, type } | null
}) {
  const fileInputRef = useRef(null);
  const [text, setText] = useState(initialBody);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaKind, setMediaKind] = useState(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);

  const isEdit = mode === "edit";
  const showExistingMedia = isEdit && initialMedia && !removeExisting && !mediaFile;

  const clearNewMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaKind(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setChecking(true);
    try {
      await validateMediaFile(file);
      setMediaFile(file);
      setMediaKind(file.type.startsWith("video/") ? "video" : "image");
      setMediaPreview(URL.createObjectURL(file));
      setRemoveExisting(false);
    } catch (err) {
      setError(err.message);
      clearNewMedia();
    } finally {
      setChecking(false);
    }
  };

  const handleRemoveExisting = () => {
    setRemoveExisting(true);
    clearNewMedia();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const willHaveMedia = mediaFile || (isEdit && initialMedia && !removeExisting);
    if (!text.trim() && !willHaveMedia) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ body: text, mediaFile, removeMedia: removeExisting });
      if (!isEdit) {
        setText("");
        clearNewMedia();
      }
    } catch (err) {
      setError(err.message || "Couldn't post that comment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="comment-composer-wrap" onSubmit={handleSubmit}>
      {showExistingMedia && (
        <div className="comment-composer-media-preview">
          {initialMedia.type === "video" ? (
            <video src={initialMedia.url} controls muted />
          ) : (
            <img src={initialMedia.url} alt="Current attachment" />
          )}
          <button type="button" className="comment-composer-media-remove" onClick={handleRemoveExisting} aria-label="Remove attachment">
            <X size={12} />
          </button>
        </div>
      )}

      {mediaPreview && (
        <div className="comment-composer-media-preview">
          {mediaKind === "video" ? (
            <video src={mediaPreview} controls muted />
          ) : (
            <img src={mediaPreview} alt="Attachment preview" />
          )}
          <button type="button" className="comment-composer-media-remove" onClick={clearNewMedia} aria-label="Remove attachment">
            <X size={12} />
          </button>
        </div>
      )}

      {checking && <p className="comment-composer-hint">Checking file…</p>}
      {error && <p className="comment-composer-error">{error}</p>}

      <div className="comment-composer">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handlePickFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="comment-composer-attach-btn"
          title="Add photo or video"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon size={16} />
        </button>

        <input
          type="text"
          placeholder="Write a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={autoFocus}
        />

        {isEdit ? (
          <div className="comment-composer-edit-actions">
            <button type="button" className="comment-composer-cancel" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="comment-composer-save" disabled={submitting || checking}>
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <button type="submit" disabled={submitting || (!text.trim() && !mediaFile)} aria-label="Send comment">
            <Send size={15} />
          </button>
        )}
      </div>
    </form>
  );
}
