// src/components/community/CommentRow.jsx
import React, { useState } from "react";
import { timeAgo } from "../../utils/timeAgo";
import {
  toggleCommentLike,
  toggleCommentDislike,
  updateComment,
  deleteComment,
  subscribeToReplies,
  addReply,
} from "../../services/community";
import AutoplayVideo from "./AutoplayVideo";
import Lightbox from "./Lightbox";
import PostMenu from "./PostMenu";
import CommentComposer from "./CommentComposer";
import ConfirmDialog from "./ConfirmDialog";
import ReplyRow from "./ReplyRow";

export default function CommentRow({
  postId,
  comment,
  uid,
  isSuperAdmin = false,
  postAuthorId = null,
  authorName: currentAuthorName,
  businessName: currentBusinessName,
}) {
  const isLiked = (comment.likedBy || []).includes(uid);
  const isDisliked = (comment.dislikedBy || []).includes(uid);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [showReplyBox, setShowReplyBox] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState([]);
  const [repliesLoaded, setRepliesLoaded] = useState(false);

  const isAuthor = comment.authorId === uid;
  const isPostOwnerComment = postAuthorId != null && comment.authorId === postAuthorId;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isSuperAdmin;

  // Same self-correcting pattern as the post's comment count: trust the
  // live subscribed list once it's loaded, fall back to the stored count.
  const displayReplyCount = repliesLoaded ? replies.length : comment.replyCount || 0;

  const loadReplies = () => {
    if (repliesLoaded) return;
    subscribeToReplies(postId, comment.id, {
      onChange: (list) => {
        setReplies(list);
        setRepliesLoaded(true);
      },
    });
  };

  const toggleShowReplies = () => {
    setShowReplies((s) => !s);
    loadReplies();
  };

  const handleToggleLike = () => toggleCommentLike(postId, comment.id, uid, isLiked, isDisliked);
  const handleToggleDislike = () => toggleCommentDislike(postId, comment.id, uid, isDisliked, isLiked);

  const handleDelete = async () => {
    try {
      await deleteComment(postId, comment);
    } catch (err) {
      console.error("deleteComment error:", err);
      setErrorMsg(err.message || "Couldn't delete that comment.");
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

  const handleSubmitReply = async ({ body, mediaFile }) => {
    await addReply(postId, comment.id, {
      authorId: uid,
      authorName: currentAuthorName || "Business Owner",
      businessName: currentBusinessName,
      body,
      mediaFile,
    });
    setShowReplyBox(false);
    if (!showReplies) toggleShowReplies();
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
          <div className={`comment-bubble ${isPostOwnerComment ? "comment-bubble--author" : ""}`}>
            <span className="comment-author">
              {comment.businessName ? `${comment.authorName} · ${comment.businessName}` : comment.authorName}
            </span>
            {isPostOwnerComment && <span className="comment-author-badge">Author</span>}
            {comment.body && <span className="comment-text">{comment.body}</span>}
          </div>
          <PostMenu
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setIsEditing(true)}
            onDelete={handleDelete}
            confirmTitle="Delete this comment?"
            confirmMessage="Its replies will be deleted too. This can't be undone."
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
          <button className={`comment-like-btn ${isLiked ? "is-liked" : ""}`} onClick={handleToggleLike}>
            Like{comment.likeCount ? ` · ${comment.likeCount}` : ""}
          </button>
          <button className={`comment-dislike-btn ${isDisliked ? "is-disliked" : ""}`} onClick={handleToggleDislike}>
            Dislike{comment.dislikeCount ? ` · ${comment.dislikeCount}` : ""}
          </button>
          <button className="comment-reply-btn" onClick={() => setShowReplyBox((s) => !s)}>
            Reply
          </button>
        </div>

        {showReplyBox && (
          <div className="reply-composer-wrap">
            <CommentComposer onSubmit={handleSubmitReply} autoFocus />
          </div>
        )}

        {(displayReplyCount > 0 || showReplies) && (
          <button className="comment-view-replies-btn" onClick={toggleShowReplies}>
            {showReplies
              ? "Hide replies"
              : `View ${displayReplyCount} repl${displayReplyCount === 1 ? "y" : "ies"}`}
          </button>
        )}

        {showReplies && (
          <div className="reply-list">
            {replies.map((r) => (
              <ReplyRow
                key={r.id}
                postId={postId}
                commentId={comment.id}
                reply={r}
                uid={uid}
                isSuperAdmin={isSuperAdmin}
                postAuthorId={postAuthorId}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxOpen && (
        <Lightbox
          media={{ url: comment.mediaUrl, type: comment.mediaType }}
          caption={comment.body}
          like={{ isLiked, count: comment.likeCount || 0, onToggle: handleToggleLike }}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!errorMsg}
        variant="alert"
        danger={false}
        title="Couldn't delete comment"
        message={errorMsg}
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
    </div>
  );
}
