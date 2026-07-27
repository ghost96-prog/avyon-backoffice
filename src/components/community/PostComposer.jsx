// src/components/community/PostComposer.jsx
import React, { useRef, useState } from "react";
import { Image as ImageIcon, Video, X, Send, Play } from "lucide-react";
import { COMMUNITY_CATEGORIES } from "../../utils/communityConfig";
import { createPost } from "../../services/community";
import {
  validateMediaFile,
  MAX_IMAGE_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_SECONDS,
  MAX_MEDIA_ITEMS,
} from "../../utils/mediaValidation";
import { useAppContext } from "../../context/AppContext";
import "./PostComposer.css";

const POSTABLE_CATEGORIES = COMMUNITY_CATEGORIES.filter((c) => c.id !== "all");

export default function PostComposer({ onPosted }) {
  const { uid, userProfile, businessName } = useAppContext();
  const fileInputRef = useRef(null);

  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general_discussion");
  // Each item: { file, previewUrl, kind: "image" | "video" }
  const [mediaItems, setMediaItems] = useState([]);
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checkingFile, setCheckingFile] = useState(false);

  const clearMedia = () => {
    mediaItems.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setMediaItems([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeMediaItem = (index) => {
    setMediaItems((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handlePickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setCheckingFile(true);

    const remainingSlots = MAX_MEDIA_ITEMS - mediaItems.length;
    const toCheck = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setError(`You can attach up to ${MAX_MEDIA_ITEMS} photos/videos per post — added the first ${remainingSlots}.`);
    }

    const accepted = [];
    for (const file of toCheck) {
      try {
        await validateMediaFile(file);
        accepted.push({
          file,
          previewUrl: URL.createObjectURL(file),
          kind: file.type.startsWith("video/") ? "video" : "image",
        });
      } catch (err) {
        setError(err.message || "That file can't be used.");
      }
    }

    if (accepted.length) {
      setMediaItems((prev) => [...prev, ...accepted]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setCheckingFile(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!body.trim() && mediaItems.length === 0) {
      setError("Write something or attach a photo/video.");
      return;
    }

    setSubmitting(true);
    try {
      await createPost({
        authorId: uid,
        authorName: userProfile?.name || "Business Owner",
        businessName,
        type: "discussion",
        category,
        body,
        anonymous,
        mediaFiles: mediaItems.map((m) => m.file),
      });

      setBody("");
      clearMedia();
      onPosted?.();
    } catch (err) {
      console.error("createPost error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        className="composer-input"
        placeholder="Ask a question, share a tip, or start a discussion…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
      />

      {mediaItems.length > 0 && (
        <div className="composer-media-strip">
          {mediaItems.map((m, i) => (
            <div className="composer-media-thumb" key={m.previewUrl}>
              {m.kind === "video" ? (
                <>
                  <video src={m.previewUrl} muted />
                  <span className="composer-media-thumb-playbtn">
                    <Play size={14} fill="white" />
                  </span>
                </>
              ) : (
                <img src={m.previewUrl} alt={`Attachment ${i + 1} preview`} />
              )}
              <button
                type="button"
                className="composer-media-remove"
                onClick={() => removeMediaItem(i)}
                aria-label="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {mediaItems.length < MAX_MEDIA_ITEMS && (
            <button
              type="button"
              className="composer-media-add-more"
              onClick={() => fileInputRef.current?.click()}
              title="Add another photo/video"
            >
              <ImageIcon size={16} />
              <span>Add</span>
            </button>
          )}
        </div>
      )}

      {checkingFile && <p className="composer-hint">Checking file…</p>}
      {error && <p className="composer-error">{error}</p>}

      <div className="composer-toolbar">
        <div className="composer-toolbar-left">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="composer-category">
            {POSTABLE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

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
            className="composer-icon-btn"
            title={`Add photos (up to ${MAX_MEDIA_ITEMS}, under ${MAX_IMAGE_SIZE_MB}MB each)`}
            onClick={() => fileInputRef.current?.click()}
            disabled={mediaItems.length >= MAX_MEDIA_ITEMS}
          >
            <ImageIcon size={17} />
          </button>
          <button
            type="button"
            className="composer-icon-btn"
            title={`Add video (under ${MAX_VIDEO_SECONDS}s, ${MAX_VIDEO_SIZE_MB}MB)`}
            onClick={() => fileInputRef.current?.click()}
            disabled={mediaItems.length >= MAX_MEDIA_ITEMS}
          >
            <Video size={17} />
          </button>

          <label className="composer-anon">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            Anonymous
          </label>
        </div>

        <button type="submit" className="composer-post-btn" disabled={submitting || checkingFile}>
          {submitting ? "Posting…" : (
            <>
              <Send size={14} /> Post
            </>
          )}
        </button>
      </div>
    </form>
  );
}
