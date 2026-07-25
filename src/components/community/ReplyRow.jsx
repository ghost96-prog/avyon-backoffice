// src/components/community/ReplyRow.jsx
//
// A reply to a comment (level 2), or a reply to that reply (level 3 —
// the deepest the UI goes). Level-2 rows get their own "Reply" button
// which opens a composer that posts a level-3 reply; level-3 rows don't
// get one, so nesting can't go any deeper than that.

import React, { useState } from "react";
import { timeAgo } from "../../utils/timeAgo";
import { splitMentions } from "../../utils/mentions";
import { toggleReplyLike, updateReply, deleteReply, addReply } from "../../services/community";
import AutoplayVideo from "./AutoplayVideo";
import Lightbox from "./Lightbox";
import PostMenu from "./PostMenu";
import CommentComposer from "./CommentComposer";
import ConfirmDialog from "./ConfirmDialog";

export default function ReplyRow({
  postId,
  commentId,
  reply,
  childReplies = [], // level-3 replies addressed to this row (only used at level 2)
  uid,
  isSuperAdmin = false,
  postAuthorId = null,
  authorName: currentAuthorName,
  businessName: currentBusinessName,
  participants = [],
}) {
  const isLiked = (reply.likedBy || []).includes(uid);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showReplyBox, setShowReplyBox] = useState(false);

  const isAuthor = reply.authorId === uid;
  const isPostOwnerReply = postAuthorId != null && reply.authorId === postAuthorId;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isSuperAdmin;
  const isLevel3 = !!reply.parentReplyId;

  const handleToggleLike = () => toggleReplyLike(postId, commentId, reply.id, uid, isLiked);

  const handleDelete = async () => {
    try {
      await deleteReply(postId, commentId, reply);
    } catch (err) {
      console.error("deleteReply error:", err);
      setErrorMsg(err.message || "Couldn't delete that reply.");
    }
  };

  const handleSaveEdit = async ({ body, mediaFile, removeMedia, mentions }) => {
    await updateReply(postId, commentId, reply.id, {
      body,
      mediaFile,
      removeMedia,
      currentMediaUrl: reply.mediaUrl,
      currentMediaPath: reply.mediaPath,
      authorId: reply.authorId,
      mentions,
    });
    setIsEditing(false);
  };

  const handleSubmitSubReply = async ({ body, mediaFile, mentions }) => {
    await addReply(postId, commentId, {
      authorId: uid,
      authorName: currentAuthorName || "Business Owner",
      businessName: currentBusinessName,
      body,
      mediaFile,
      mentions,
      parentReplyId: reply.id,
      replyingToName: reply.authorName,
    });
    setShowReplyBox(false);
  };

  const replyParticipants = Array.from(
    new Map(
      participants
        .concat({ uid: reply.authorId, name: reply.authorName })
        .filter((p) => p.uid && p.name)
        .map((p) => [p.uid, p])
    ).values()
  );

  if (isEditing) {
    return (
      <div className="comment-row reply-row">
        <span className="comment-avatar comment-avatar--small">{(reply.authorName || "?")[0].toUpperCase()}</span>
        <div className="comment-body" style={{ flex: 1 }}>
          <CommentComposer
            mode="edit"
            initialBody={reply.body}
            initialMedia={reply.mediaUrl ? { url: reply.mediaUrl, type: reply.mediaType } : null}
            initialMentions={reply.mentions || []}
            participants={replyParticipants}
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
        {isLevel3 && reply.replyingToName && (
          <span className="reply-replying-to">↳ replying to {reply.replyingToName}</span>
        )}
        <div className="comment-bubble-row">
          <div className={`comment-bubble ${isPostOwnerReply ? "comment-bubble--author" : ""}`}>
            <span className="comment-author">
              {reply.businessName ? `${reply.authorName} · ${reply.businessName}` : reply.authorName}
            </span>
            {isPostOwnerReply && <span className="comment-author-badge">Author</span>}
            {reply.body && (
              <span className="comment-text">
                {splitMentions(reply.body, reply.mentions).map((part, i) =>
                  part.mention ? (
                    <span key={i} className="mention-tag">
                      {part.text}
                    </span>
                  ) : (
                    <React.Fragment key={i}>{part.text}</React.Fragment>
                  )
                )}
              </span>
            )}
          </div>
          <PostMenu
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setIsEditing(true)}
            onDelete={handleDelete}
            confirmTitle="Delete this reply?"
            confirmMessage={isLevel3 ? "This can't be undone." : "Any replies to it will be deleted too. This can't be undone."}
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
          {!isLevel3 && (
            <button className="comment-reply-btn" onClick={() => setShowReplyBox((s) => !s)}>
              Reply
            </button>
          )}
        </div>

        {!isLevel3 && showReplyBox && (
          <div className="reply-composer-wrap">
            <CommentComposer
              onSubmit={handleSubmitSubReply}
              participants={replyParticipants}
              placeholder={`Reply to ${reply.authorName || "this reply"}…`}
              autoFocus
            />
          </div>
        )}

        {!isLevel3 && childReplies.length > 0 && (
          <div className="reply-list reply-list--nested">
            {childReplies.map((child) => (
              <ReplyRow
                key={child.id}
                postId={postId}
                commentId={commentId}
                reply={child}
                uid={uid}
                isSuperAdmin={isSuperAdmin}
                postAuthorId={postAuthorId}
                authorName={currentAuthorName}
                businessName={currentBusinessName}
                participants={replyParticipants}
              />
            ))}
          </div>
        )}
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
