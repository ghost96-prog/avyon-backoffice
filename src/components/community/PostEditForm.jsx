// src/components/community/PostEditForm.jsx
import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Video, X, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { validateMediaFile, MAX_MEDIA_ITEMS } from "../../utils/mediaValidation";
import { updatePost } from "../../services/community";
import "./PostEditForm.css";

// The post's current gallery, normalized to one shape regardless of
// whether it's a modern `media` array or a pre-gallery post that only
// ever had the legacy singular mediaUrl/mediaPath/mediaType fields.
function existingItemsFromPost(post) {
  const list = post.media?.length
    ? post.media
    : post.mediaUrl
    ? [{ url: post.mediaUrl, path: post.mediaPath, type: post.mediaType || "image" }]
    : [];

  return list.map((m, i) => ({
    id: `existing-${m.path || m.url || i}`,
    isNew: false,
    url: m.url,
    path: m.path,
    type: m.type || "image",
  }));
}

function newItemFromFile(file) {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    isNew: true,
    file,
    previewUrl: URL.createObjectURL(file),
    type: file.type.startsWith("video/") ? "video" : "image",
  };
}

export default function PostEditForm({ post, onDone, onCancel }) {
  const fileInputRef = useRef(null);
  const [body, setBody] = useState(post.body || "");
  // Existing and newly-added attachments live in one ordered list so add,
  // remove, and reorder all operate on a single array — the order here
  // becomes the post's carousel order on save.
  const [galleryItems, setGalleryItems] = useState(() => existingItemsFromPost(post));
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Revoke any still-outstanding object URLs for newly-added files if the
  // form unmounts (e.g. Cancel) without saving.
  useEffect(() => {
    return () => {
      galleryItems.forEach((item) => {
        if (item.isNew) URL.revokeObjectURL(item.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setChecking(true);

    const remainingSlots = MAX_MEDIA_ITEMS - galleryItems.length;
    const toCheck = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setError(`You can attach up to ${MAX_MEDIA_ITEMS} photos/videos per post — added the first ${remainingSlots}.`);
    }

    const accepted = [];
    for (const file of toCheck) {
      try {
        await validateMediaFile(file);
        accepted.push(newItemFromFile(file));
      } catch (err) {
        setError(err.message || "That file can't be used.");
      }
    }

    if (accepted.length) {
      setGalleryItems((prev) => [...prev, ...accepted]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setChecking(false);
  };

  const removeItem = (id) => {
    setGalleryItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.isNew) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const moveItem = (index, direction) => {
    setGalleryItems((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!body.trim() && galleryItems.length === 0) {
      setError("Write something or attach a photo/video.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const media = galleryItems.map((item) =>
        item.isNew
          ? { kind: "new", file: item.file }
          : { kind: "existing", url: item.url, path: item.path, type: item.type }
      );

      await updatePost(post.id, {
        body,
        media,
        currentMedia: post.media?.length
          ? post.media
          : post.mediaUrl
          ? [{ url: post.mediaUrl, path: post.mediaPath }]
          : [],
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

      {galleryItems.length > 0 && (
        <div className="post-edit-media-strip">
          {galleryItems.map((item, i) => (
            <div className="post-edit-media-thumb" key={item.id}>
              {item.type === "video" ? (
                <>
                  <video src={item.isNew ? item.previewUrl : item.url} muted />
                  <span className="post-edit-media-thumb-playbtn">
                    <Play size={14} fill="white" />
                  </span>
                </>
              ) : (
                <img src={item.isNew ? item.previewUrl : item.url} alt={`Attachment ${i + 1}`} />
              )}

              <button
                type="button"
                className="post-edit-media-remove"
                onClick={() => removeItem(item.id)}
                aria-label="Remove attachment"
              >
                <X size={12} />
              </button>

              {galleryItems.length > 1 && (
                <div className="post-edit-media-reorder">
                  <button
                    type="button"
                    onClick={() => moveItem(i, -1)}
                    disabled={i === 0}
                    aria-label="Move earlier"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(i, 1)}
                    disabled={i === galleryItems.length - 1}
                    aria-label="Move later"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {galleryItems.length < MAX_MEDIA_ITEMS && (
            <button
              type="button"
              className="post-edit-media-add-more"
              onClick={() => fileInputRef.current?.click()}
              title="Add another photo/video"
            >
              <ImageIcon size={16} />
              <span>Add</span>
            </button>
          )}
        </div>
      )}

      {checking && <p className="post-edit-hint">Checking file…</p>}
      {error && <p className="post-edit-error">{error}</p>}

      <div className="post-edit-toolbar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handlePickFiles}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="post-edit-icon-btn"
          title={`Add photos (up to ${MAX_MEDIA_ITEMS} total)`}
          onClick={() => fileInputRef.current?.click()}
          disabled={galleryItems.length >= MAX_MEDIA_ITEMS}
        >
          <ImageIcon size={16} />
        </button>
        <button
          type="button"
          className="post-edit-icon-btn"
          title="Add video"
          onClick={() => fileInputRef.current?.click()}
          disabled={galleryItems.length >= MAX_MEDIA_ITEMS}
        >
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
