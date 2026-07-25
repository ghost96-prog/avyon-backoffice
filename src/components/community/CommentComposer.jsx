// src/components/community/CommentComposer.jsx
//
// Text + optional image/video attachment for comments. Doubles as the
// edit form: pass mode="edit" with initialBody/initialMedia and this
// renders Save/Cancel instead of a send button, and lets the existing
// attachment be removed or replaced.
//
// Also handles @mention autocomplete: pass `participants` (people
// already visible in this thread) and typing "@" opens a filtered
// dropdown. Picking a name inserts "@Name" into the text and tracks it
// in a `mentions` list that's included in onSubmit — that list is what
// gets stored and re-highlighted later, so highlighting never depends on
// fragile text offsets.

import React, { useRef, useState } from "react";
import { Image as ImageIcon, Send, X } from "lucide-react";
import { validateMediaFile } from "../../utils/mediaValidation";
import { activeMentionTrigger, applyMention } from "../../utils/mentions";
import "./CommentComposer.css";

export default function CommentComposer({
  onSubmit,
  onCancel,
  autoFocus = false,
  mode = "create",
  initialBody = "",
  initialMedia = null, // { url, type } | null
  initialMentions = [], // [{ uid, name }, ...]
  participants = [], // [{ uid, name }, ...] people taggable in this thread
  placeholder = "Write a comment…",
  replyingToLabel = null, // e.g. "Replying to Jane Doe"
}) {
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const [text, setText] = useState(initialBody);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaKind, setMediaKind] = useState(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);

  const [mentions, setMentions] = useState(initialMentions);
  const [mentionTrigger, setMentionTrigger] = useState(null); // { start, query } | null
  const [activeIndex, setActiveIndex] = useState(0);

  const isEdit = mode === "edit";
  const showExistingMedia = isEdit && initialMedia && !removeExisting && !mediaFile;

  const suggestions = mentionTrigger
    ? participants
        .filter((p) => p.name.toLowerCase().startsWith(mentionTrigger.query.toLowerCase()))
        .slice(0, 6)
    : [];
  const showMentionMenu = mentionTrigger !== null && suggestions.length > 0;

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

  // Keeps the mentions list in sync with what's actually still typed in
  // the text — if someone deletes "@Jane" by hand, Jane should stop
  // being a stored mention on this comment.
  const pruneMentions = (nextText, list) => list.filter((m) => nextText.includes(`@${m.name}`));

  const handleTextChange = (e) => {
    const nextText = e.target.value;
    setText(nextText);
    setMentions((prev) => pruneMentions(nextText, prev));

    const cursorPos = e.target.selectionStart ?? nextText.length;
    const trigger = activeMentionTrigger(nextText, cursorPos);
    setMentionTrigger(trigger);
    setActiveIndex(0);
  };

  const pickMention = (participant) => {
    if (!mentionTrigger) return;
    const { text: nextText, cursor } = applyMention(text, mentionTrigger, participant.name);
    setText(nextText);
    setMentions((prev) => (prev.some((m) => m.uid === participant.uid) ? prev : [...prev, participant]));
    setMentionTrigger(null);

    requestAnimationFrame(() => {
      const el = textInputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (!showMentionMenu) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickMention(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setMentionTrigger(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const willHaveMedia = mediaFile || (isEdit && initialMedia && !removeExisting);
    if (!text.trim() && !willHaveMedia) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ body: text, mediaFile, removeMedia: removeExisting, mentions });
      if (!isEdit) {
        setText("");
        clearNewMedia();
        setMentions([]);
      }
    } catch (err) {
      setError(err.message || "Couldn't post that comment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="comment-composer-wrap" onSubmit={handleSubmit}>
      {replyingToLabel && <p className="comment-composer-replying-to">{replyingToLabel}</p>}

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

        <div className="comment-composer-input-wrap">
          <input
            ref={textInputRef}
            type="text"
            placeholder={placeholder}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setMentionTrigger(null), 120)}
            autoFocus={autoFocus}
          />

          {showMentionMenu && (
            <ul className="comment-composer-mention-menu">
              {suggestions.map((p, i) => (
                <li key={p.uid}>
                  <button
                    type="button"
                    className={i === activeIndex ? "is-active" : ""}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickMention(p)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
