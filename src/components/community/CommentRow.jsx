// src/components/community/CommentRow.jsx
import React, { useState } from "react";
import { timeAgo } from "../../utils/timeAgo";
import { toggleCommentLike, updateComment, deleteComment } from "../../services/community";
import AutoplayVideo from "./AutoplayVideo";
import Lightbox from "./Lightbox";
import PostMenu from "./PostMenu";
import CommentComposer from "./CommentComposer";

export default function CommentRow({ postId, comment, uid, isSuperAdmin = false }) {
  const isLiked = (comment.likedBy || []).includes(uid);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isAuthor = comment.authorId === uid;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isSuperAdmin;

  const handleToggleLike = () => toggleCommentLike(postId, comment.id, uid, isLiked);

  const handleDelete = async () => {
    try {
      await deleteComment(postId, comment);
    } catch (err) {
      console.error("deleteComment error:", err);
      window.alert(err.message || "Couldn't delete that comment.");
    }
  };

  const handleSaveEdit = async ({ body, mediaFile, removeMedia }) => {
    await updateComment(postId, comment.id, {
      body,
      mediaFile,
      removeMedia,
      currentMediaUrl: comment.mediaUrl,
      currentMediaPath: comment.mediaPath,
      authorId: comment.authorId,
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="comment-row">
        <span className="comment-avatar">{(comment.authorName || "?")[0].toUpperCase()}</span>
        <div className="comment-body" style={{ flex: 1 }}>
          <CommentComposer
            mode="edit"
            initialBody={comment.body}
            initialMedia={comment.mediaUrl ? { url: comment.mediaUrl, type: comment.mediaType } : null}
            onSubmit={handleSaveEdit}
            onCancel={() => setIsEditing(false)}
            autoFocus
          />
        </div>
      </div>
    );
  }

  return (
    <div className="comment-row">
      <span className="comment-avatar">{(comment.authorName || "?")[0].toUpperCase()}</span>
      <div className="comment-body">
        <div className="comment-bubble-row">
          <div className="comment-bubble">
            <span className="comment-author">{comment.authorName}</span>
            {comment.body && <span className="comment-text">{comment.body}</span>}
          </div>
          <PostMenu
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setIsEditing(true)}
            onDelete={handleDelete}
            confirmMessage="Delete this comment? This can't be undone."
          />
        </div>

        {comment.mediaUrl && comment.mediaType === "image" && (
          <div className="comment-media" onClick={() => setLightboxOpen(true)}>
            <img src={comment.mediaUrl} alt="Comment attachment" loading="lazy" />
          </div>
        )}
        {comment.mediaUrl && comment.mediaType === "video" && (
          <div className="comment-media">
            <AutoplayVideo src={comment.mediaUrl} compact onOpen={() => setLightboxOpen(true)} />
          </div>
        )}

        <div className="comment-meta">
          <span>
            {timeAgo(comment.createdAt)}
            {comment.editedAt ? " · edited" : ""}
          </span>
          <button
            className={`comment-like-btn ${isLiked ? "is-liked" : ""}`}
            onClick={handleToggleLike}
          >
            Like{comment.likeCount ? ` · ${comment.likeCount}` : ""}
          </button>
        </div>
      </div>

      {lightboxOpen && (
        <Lightbox
          media={{ url: comment.mediaUrl, type: comment.mediaType }}
          caption={comment.body}
          like={{ isLiked, count: comment.likeCount || 0, onToggle: handleToggleLike }}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
