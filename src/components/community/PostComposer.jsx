// src/components/community/PostComposer.jsx
import React, { useRef, useState } from "react";
import { Image as ImageIcon, Video, X, Send, Play } from "lucide-react";
import { COMMUNITY_CATEGORIES } from "../../utils/communityConfig";
import { createPost } from "../../services/community";
import {
  validateMediaFile,
  remainingMediaSlots,
  MAX_IMAGE_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_SECONDS,
  MAX_IMAGES_PER_POST,
  MAX_VIDEOS_PER_POST,
} from "../../utils/mediaValidation";
import { useAppContext } from "../../context/AppContext";
import "./PostComposer.css";

const POSTABLE_CATEGORIES = COMMUNITY_CATEGORIES.filter((c) => c.id !== "all");

export default function PostComposer({ onPosted }) {
  const { uid, userProfile, businessName } = useAppContext();
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general_discussion");
  // Each item: { file, previewUrl, kind: "image" | "video" }
  const [mediaItems, setMediaItems] = useState([]);
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checkingFile, setCheckingFile] = useState(false);

  const slots = remainingMediaSlots(mediaItems);

  const clearMedia = () => {
    mediaItems.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setMediaItems([]);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removeMediaItem = (index) => {
    setMediaItems((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Shared handler for both the photo and video inputs — each input's
  // `accept` attribute steers what the OS picker shows, but the actual
  // per-type cap is enforced here regardless of which button was used.
  const handlePickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setCheckingFile(true);

    const accepted = [];

    for (const file of files) {
      const isVideo = file.type.startsWith("video/");
      const { images, videos } = remainingMediaSlots([...mediaItems, ...accepted]);

      if (isVideo && videos <= 0) {
        setError(`Only ${MAX_VIDEOS_PER_POST} video allowed per post.`);
        continue;
      }
      if (!isVideo && images <= 0) {
        setError(`You can attach up to ${MAX_IMAGES_PER_POST} images per post.`);
        continue;
      }

      try {
        await validateMediaFile(file);
        accepted.push({
          file,
          previewUrl: URL.createObjectURL(file),
          kind: isVideo ? "video" : "image",
        });
      } catch (err) {
        setError(err.message || "That file can't be used.");
      }
    }

    if (accepted.length) {
      setMediaItems((prev) => [...prev, ...accepted]);
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
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
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickFiles}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="composer-icon-btn"
            title={`Add photos (up to ${MAX_IMAGES_PER_POST}, under ${MAX_IMAGE_SIZE_MB}MB each)`}
            onClick={() => photoInputRef.current?.click()}
            disabled={slots.images <= 0}
          >
            <ImageIcon size={17} />
          </button>

          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handlePickFiles}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="composer-icon-btn"
            title={`Add video (up to ${MAX_VIDEOS_PER_POST}, under ${MAX_VIDEO_SECONDS}s, ${MAX_VIDEO_SIZE_MB}MB)`}
            onClick={() => videoInputRef.current?.click()}
            disabled={slots.videos <= 0}
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
