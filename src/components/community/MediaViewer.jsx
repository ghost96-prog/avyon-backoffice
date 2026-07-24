// src/components/community/MediaViewer.jsx
//
// Tapping a post's image/video opens this: the full media plus a live
// comment thread and like button, docked to the right on desktop
// (feed keeps scrolling on the left) and fullscreen on mobile.

import React, { useEffect, useState } from "react";
import { X, Heart, MessageCircle } from "lucide-react";
import { POST_TYPE_LABELS, POST_TYPE_COLORS, categoryLabel } from "../../utils/communityConfig";
import { timeAgo } from "../../utils/timeAgo";
import { isCommunitySuperAdmin } from "../../utils/communityPermissions";
import { togglePostLike, subscribeToComments, addComment, deletePost } from "../../services/community";
import CommentRow from "./CommentRow";
import CommentComposer from "./CommentComposer";
import PostMenu from "./PostMenu";
import PostEditForm from "./PostEditForm";
import "./MediaViewer.css";

export default function MediaViewer({ post, uid, userProfile, onClose }) {
  const [comments, setComments] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!post) return;
    const unsubscribe = subscribeToComments(post.id, { onChange: setComments });
    return () => unsubscribe();
  }, [post?.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!post) return null;

  const isLiked = (post.likedBy || []).includes(uid);
  const isAuthor = post.authorId === uid;
  const isSuperAdmin = isCommunitySuperAdmin(userProfile);
  const canEdit = isAuthor;
  const canDelete = isAuthor || isSuperAdmin;

  const typeColor = POST_TYPE_COLORS[post.type] || POST_TYPE_COLORS.discussion;
  const authorLine = post.anonymous
    ? "Anonymous"
    : post.businessName
    ? `${post.authorName} · ${post.businessName}`
    : post.authorName;

  const handleSubmitComment = async ({ body, mediaFile }) => {
    await addComment(post.id, {
      authorId: uid,
      authorName: userProfile?.name || "Business Owner",
      body,
      mediaFile,
    });
  };

  const handleDeletePost = async () => {
    try {
      await deletePost(post);
      onClose();
    } catch (err) {
      console.error("deletePost error:", err);
      window.alert(err.message || "Couldn't delete that post.");
    }
  };

  return (
    <div className="media-viewer-backdrop" onClick={onClose}>
      <div className="media-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="media-viewer-header">
          <div className="media-viewer-header-text">
            <span className="post-card-avatar">{(post.authorName || "?")[0].toUpperCase()}</span>
            <div>
              <div className="media-viewer-author">{authorLine}</div>
              <div className="media-viewer-meta">
                {timeAgo(post.createdAt)}
                {post.editedAt ? " · edited" : ""} ·{" "}
                <span style={{ color: typeColor.fg }}>{POST_TYPE_LABELS[post.type]}</span> ·{" "}
                {categoryLabel(post.category)}
              </div>
            </div>
          </div>
          <div className="media-viewer-header-actions">
            <PostMenu
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setIsEditing(true)}
              onDelete={handleDeletePost}
              confirmMessage="Delete this post and all its comments? This can't be undone."
            />
            <button className="media-viewer-close" onClick={onClose} aria-label="Close preview">
              <X size={20} />
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="media-viewer-scroll">
            <div className="media-viewer-edit-wrap">
              <PostEditForm post={post} onDone={() => setIsEditing(false)} onCancel={() => setIsEditing(false)} />
            </div>
          </div>
        ) : (
          <div className="media-viewer-scroll">
            <div className="media-viewer-media">
              {post.mediaType === "video" ? (
                <video src={post.mediaUrl} controls autoPlay muted playsInline />
              ) : (
                <img src={post.mediaUrl} alt="Post attachment" />
              )}
            </div>

            {post.body && <p className="media-viewer-body">{post.body}</p>}

            <div className="media-viewer-actions">
              <button
                className={`post-card-action-btn ${isLiked ? "is-liked" : ""}`}
                onClick={() => togglePostLike(post.id, uid, isLiked)}
              >
                <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                {post.likeCount > 0 ? post.likeCount : "Like"}
              </button>
              <span className="media-viewer-comment-count">
                <MessageCircle size={16} /> {comments.length}
              </span>
            </div>

            <div className="media-viewer-comments">
              {comments.map((c) => (
                <CommentRow key={c.id} postId={post.id} comment={c} uid={uid} isSuperAdmin={isSuperAdmin} />
              ))}
              {comments.length === 0 && (
                <p className="media-viewer-empty">No comments yet — be the first to reply.</p>
              )}
            </div>
          </div>
        )}

        {!isEditing && (
          <div className="media-viewer-composer">
            <CommentComposer onSubmit={handleSubmitComment} />
          </div>
        )}
      </div>
    </div>
  );
}
