// src/components/community/ReplyRow.jsx
//
// A reply to a comment. Deliberately leaner than CommentRow: no dislike,
// and no "reply" button of its own — replies are one level deep only.

import React, { useState } from "react";
import { timeAgo } from "../../utils/timeAgo";
import { toggleReplyLike, updateReply, deleteReply } from "../../services/community";
import AutoplayVideo from "./AutoplayVideo";
import Lightbox from "./Lightbox";
import PostMenu from "./PostMenu";
import CommentComposer from "./CommentComposer";
import ConfirmDialog from "./ConfirmDialog";

export default function ReplyRow({ postId, commentId, reply, uid, isSuperAdmin = false, postAuthorId = null }) {
  const isLiked = (reply.likedBy || []).includes(uid);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const isAuthor = reply.authorId === uid;
  const isPostOwnerReply = postAuthorId != null && reply.authorId === postAuthorId;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isSuperAdmin;

  const handleToggleLike = () => toggleReplyLike(postId, commentId, reply.id, uid, isLiked);

  const handleDelete = async () => {
    try {
      await deleteReply(postId, commentId, reply);
    } catch (err) {
      console.error("deleteReply error:", err);
      setErrorMsg(err.message || "Couldn't delete that reply.");
    }
  };

  const handleSaveEdit = async ({ body, mediaFile, removeMedia }) => {
    await updateReply(postId, commentId, reply.id, {
      body,
      mediaFile,
      removeMedia,
      currentMediaUrl: reply.mediaUrl,
      currentMediaPath: reply.mediaPath,
      authorId: reply.authorId,
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="comment-row reply-row">
        <span className="comment-avatar comment-avatar--small">{(reply.authorName || "?")[0].toUpperCase()}</span>
        <div className="comment-body" style={{ flex: 1 }}>
          <CommentComposer
            mode="edit"
            initialBody={reply.body}
            initialMedia={reply.mediaUrl ? { url: reply.mediaUrl, type: reply.mediaType } : null}
            onSubmit={handleSaveEdit}
            onCancel={() => setIsEditing(false)}
            autoFocus
          />
        </div>
      </div>
    );
  }

  return (
    <div className="comment-row reply-row">
      <span className="comment-avatar comment-avatar--small">{(reply.authorName || "?")[0].toUpperCase()}</span>
      <div className="comment-body">
        <div className="comment-bubble-row">
          <div className={`comment-bubble ${isPostOwnerReply ? "comment-bubble--author" : ""}`}>
            <span className="comment-author">
              {reply.businessName ? `${reply.authorName} · ${reply.businessName}` : reply.authorName}
            </span>
            {isPostOwnerReply && <span className="comment-author-badge">Author</span>}
            {reply.body && <span className="comment-text">{reply.body}</span>}
          </div>
          <PostMenu
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setIsEditing(true)}
            onDelete={handleDelete}
            confirmTitle="Delete this reply?"
            confirmMessage="This can't be undone."
          />
        </div>

        {reply.mediaUrl && reply.mediaType === "image" && (
          <div className="comment-media" onClick={() => setLightboxOpen(true)}>
            <img src={reply.mediaUrl} alt="Reply attachment" loading="lazy" />
          </div>
        )}
        {reply.mediaUrl && reply.mediaType === "video" && (
          <div className="comment-media">
            <AutoplayVideo src={reply.mediaUrl} compact onOpen={() => setLightboxOpen(true)} />
          </div>
        )}

        <div className="comment-meta">
          <span>
            {timeAgo(reply.createdAt)}
            {reply.editedAt ? " · edited" : ""}
          </span>
          <button className={`comment-like-btn ${isLiked ? "is-liked" : ""}`} onClick={handleToggleLike}>
            Like{reply.likeCount ? ` · ${reply.likeCount}` : ""}
          </button>
        </div>
      </div>

      {lightboxOpen && (
        <Lightbox
          media={{ url: reply.mediaUrl, type: reply.mediaType }}
          caption={reply.body}
          like={{ isLiked, count: reply.likeCount || 0, onToggle: handleToggleLike }}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!errorMsg}
        variant="alert"
        danger={false}
        title="Couldn't delete reply"
        message={errorMsg}
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
    </div>
  );
}
