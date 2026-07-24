// src/components/community/PostComposer.jsx
import React, { useRef, useState } from "react";
import { Image as ImageIcon, Video, X, Send } from "lucide-react";
import { COMMUNITY_CATEGORIES } from "../../utils/communityConfig";
import { createPost } from "../../services/community";
import { validateMediaFile, MAX_IMAGE_SIZE_MB, MAX_VIDEO_SIZE_MB, MAX_VIDEO_SECONDS } from "../../utils/mediaValidation";
import { useAppContext } from "../../context/AppContext";
import "./PostComposer.css";

const POSTABLE_CATEGORIES = COMMUNITY_CATEGORIES.filter((c) => c.id !== "all");

export default function PostComposer({ onPosted }) {
  const { uid, userProfile, businessName } = useAppContext();
  const fileInputRef = useRef(null);

  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general_discussion");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaKind, setMediaKind] = useState(null); // "image" | "video"
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checkingFile, setCheckingFile] = useState(false);

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaKind(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setCheckingFile(true);
    try {
      await validateMediaFile(file);
      setMediaFile(file);
      setMediaKind(file.type.startsWith("video/") ? "video" : "image");
      setMediaPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err.message || "That file can't be used.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setCheckingFile(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!body.trim() && !mediaFile) {
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
        mediaFile,
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

      {mediaPreview && (
        <div className="composer-media-preview">
          {mediaKind === "video" ? (
            <video src={mediaPreview} controls muted />
          ) : (
            <img src={mediaPreview} alt="Attachment preview" />
          )}
          <button type="button" className="composer-media-remove" onClick={clearMedia} aria-label="Remove attachment">
            <X size={14} />
          </button>
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
            onChange={handlePickFile}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="composer-icon-btn"
            title={`Add photo (under ${MAX_IMAGE_SIZE_MB}MB)`}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon size={17} />
          </button>
          <button
            type="button"
            className="composer-icon-btn"
            title={`Add video (under ${MAX_VIDEO_SECONDS}s, ${MAX_VIDEO_SIZE_MB}MB)`}
            onClick={() => fileInputRef.current?.click()}
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
