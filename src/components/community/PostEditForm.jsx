// src/components/community/PostEditForm.jsx
import React, { useRef, useState } from "react";
import { Image as ImageIcon, Video, X } from "lucide-react";
import { validateMediaFile } from "../../utils/mediaValidation";
import { updatePost } from "../../services/community";
import "./PostEditForm.css";

export default function PostEditForm({ post, onDone, onCancel }) {
  const fileInputRef = useRef(null);
  const [body, setBody] = useState(post.body || "");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaKind, setMediaKind] = useState(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const showExistingMedia = post.mediaUrl && !removeMedia && !mediaFile;

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
      setRemoveMedia(false);
    } catch (err) {
      setError(err.message);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setChecking(false);
    }
  };

  const clearNewMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaKind(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveExisting = () => {
    setRemoveMedia(true);
    clearNewMedia();
  };

  const handleSave = async () => {
    const willHaveMedia = mediaFile || (post.mediaUrl && !removeMedia);
    if (!body.trim() && !willHaveMedia) {
      setError("Write something or attach a photo/video.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updatePost(post.id, {
        body,
        mediaFile,
        removeMedia,
        currentMediaUrl: post.mediaUrl,
        currentMediaPath: post.mediaPath,
        authorId: post.authorId,
      });
      onDone();
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="post-edit-form">
      <textarea
        className="post-edit-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        autoFocus
      />

      {showExistingMedia && (
        <div className="post-edit-media-preview">
          {post.mediaType === "video" ? (
            <video src={post.mediaUrl} controls muted />
          ) : (
            <img src={post.mediaUrl} alt="Current attachment" />
          )}
          <button type="button" className="post-edit-media-remove" onClick={handleRemoveExisting} aria-label="Remove attachment">
            <X size={14} />
          </button>
        </div>
      )}

      {mediaPreview && (
        <div className="post-edit-media-preview">
          {mediaKind === "video" ? (
            <video src={mediaPreview} controls muted />
          ) : (
            <img src={mediaPreview} alt="New attachment" />
          )}
          <button type="button" className="post-edit-media-remove" onClick={clearNewMedia} aria-label="Remove new attachment">
            <X size={14} />
          </button>
        </div>
      )}

      {checking && <p className="post-edit-hint">Checking file…</p>}
      {error && <p className="post-edit-error">{error}</p>}

      <div className="post-edit-toolbar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handlePickFile}
          style={{ display: "none" }}
        />
        <button type="button" className="post-edit-icon-btn" onClick={() => fileInputRef.current?.click()} title="Replace with photo">
          <ImageIcon size={16} />
        </button>
        <button type="button" className="post-edit-icon-btn" onClick={() => fileInputRef.current?.click()} title="Replace with video">
          <Video size={16} />
        </button>

        <div className="post-edit-actions">
          <button type="button" className="post-edit-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="post-edit-save" onClick={handleSave} disabled={saving || checking}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
