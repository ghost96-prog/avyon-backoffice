// src/components/community/MediaViewer.jsx
//
// Tapping a post's image/video opens this: the full media plus a live
// comment thread and like button, docked to the right on desktop
// (feed keeps scrolling on the left) and fullscreen on mobile.

import React, { useEffect, useState, useRef } from "react";
import { X, Heart, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { POST_TYPE_LABELS, POST_TYPE_COLORS, categoryLabel } from "../../utils/communityConfig";
import { timeAgo } from "../../utils/timeAgo";
import { isCommunitySuperAdmin } from "../../utils/communityPermissions";
import { togglePostLike, subscribeToComments, addComment, deletePost } from "../../services/community";
import CommentRow from "./CommentRow";
import CommentComposer from "./CommentComposer";
import PostMenu from "./PostMenu";
import PostEditForm from "./PostEditForm";
import ConfirmDialog from "./ConfirmDialog";
import "./MediaViewer.css";

export default function MediaViewer({ post, uid, userProfile, businessName, onClose }) {
  const [comments, setComments] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const touchStartXRef = useRef(0);

  useEffect(() => {
    if (!post) return;
    const unsubscribe = subscribeToComments(post.id, { onChange: setComments });
    return () => unsubscribe();
  }, [post?.id]);

  // A freshly opened post always starts on its first slide.
  useEffect(() => {
    setMediaIndex(0);
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

  // Same fallback as PostCard: prefer the media[] array, fall back to the
  // legacy singular fields for posts written before it existed.
  const mediaList =
    Array.isArray(post.media) && post.media.length > 0
      ? post.media
      : post.mediaUrl
      ? [{ url: post.mediaUrl, path: post.mediaPath, type: post.mediaType }]
      : [];

  const goNext = () => setMediaIndex((i) => Math.min(i + 1, mediaList.length - 1));
  const goPrev = () => setMediaIndex((i) => Math.max(i - 1, 0));
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

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
      businessName,
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
      setErrorMsg(err.message || "Couldn't delete that post.");
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
              confirmTitle="Delete this post?"
              confirmMessage="All its comments and attached media will be deleted too. This can't be undone."
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
            <div
              className="media-viewer-media"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="post-card-carousel-track"
                style={{
                  width: `${mediaList.length * 100}%`,
                  transform: `translateX(-${(mediaIndex / mediaList.length) * 100}%)`,
                }}
              >
                {mediaList.map((item, i) => (
                  <div
                    className="post-card-carousel-slide"
                    key={item.url || i}
                    style={{ width: `${100 / mediaList.length}%` }}
                  >
                    {item.type === "video" ? (
                      <video src={item.url} controls muted playsInline />
                    ) : (
                      <img src={item.url} alt={`Post attachment ${i + 1}`} />
                    )}
                  </div>
                ))}
              </div>

              {mediaList.length > 1 && (
                <>
                  <div className="post-card-carousel-dots">
                    {mediaList.map((_, i) => (
                      <button
                        key={i}
                        className={`post-card-carousel-dot ${i === mediaIndex ? "is-active" : ""}`}
                        onClick={() => setMediaIndex(i)}
                        aria-label={`Go to photo ${i + 1} of ${mediaList.length}`}
                      />
                    ))}
                  </div>

                  <span className="post-card-carousel-count">
                    {mediaIndex + 1}/{mediaList.length}
                  </span>

                  {mediaIndex > 0 && (
                    <button
                      className="post-card-carousel-nav post-card-carousel-nav--prev"
                      onClick={goPrev}
                      aria-label="Previous photo"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  {mediaIndex < mediaList.length - 1 && (
                    <button
                      className="post-card-carousel-nav post-card-carousel-nav--next"
                      onClick={goNext}
                      aria-label="Next photo"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </>
              )}
            </div>

            {post.body && <p className="media-viewer-body">{post.body}</p>}

            <div className="media-viewer-actions">
              <button
                className={`media-viewer-like-btn ${isLiked ? "is-liked" : ""}`}
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
                <CommentRow
                  key={c.id}
                  postId={post.id}
                  comment={c}
                  uid={uid}
                  isSuperAdmin={isSuperAdmin}
                  postAuthorId={post.authorId}
                  authorName={userProfile?.name || "Business Owner"}
                  businessName={businessName}
                />
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

      <ConfirmDialog
        open={!!errorMsg}
        variant="alert"
        danger={false}
        title="Couldn't delete post"
        message={errorMsg}
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
    </div>
  );
}
