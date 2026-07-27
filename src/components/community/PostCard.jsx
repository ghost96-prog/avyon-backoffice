// src/components/community/PostCard.jsx
import React, { useState, useEffect } from "react";
import { Heart, MessageCircle, Share2, Check, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { POST_TYPE_LABELS, POST_TYPE_COLORS, categoryLabel } from "../../utils/communityConfig";
import { timeAgo } from "../../utils/timeAgo";
import { isCommunitySuperAdmin } from "../../utils/communityPermissions";
import { getThreadParticipants } from "../../utils/mentions";
import { togglePostLike, subscribeToComments, addComment, deletePost } from "../../services/community";
import { useAppContext } from "../../context/AppContext";
import AutoplayVideo from "./AutoplayVideo";
import CommentRow from "./CommentRow";
import CommentComposer from "./CommentComposer";
import PostMenu from "./PostMenu";
import PostEditForm from "./PostEditForm";
import ConfirmDialog from "./ConfirmDialog";
import "./PostCard.css";

// Text-only posts (no photo/video) get a full-bleed gradient card instead of
// a blank white block, so the feed stays visually consistent post-to-post
// the way a media-only TikTok feed would. Picked deterministically from the
// post id so a given post always renders the same card, not a random one
// that shifts every re-render/reload.
const CARD_GRADIENTS = [
  "linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)",
  "linear-gradient(135deg, #ff512f 0%, #dd2476 100%)",
  "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
  "linear-gradient(135deg, #f7971e 0%, #e0455f 100%)",
  "linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%)",
  "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)",
];

const gradientForPost = (id) => {
  if (!id) return CARD_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length];
};

export default function PostCard({ post, onOpenMedia, isViewerOpen = false }) {
  const { uid, userProfile, businessName } = useAppContext();

  const isLiked = (post.likedBy || []).includes(uid);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [shared, setShared] = useState(false);

  const isAuthor = post.authorId === uid;
  const isSuperAdmin = isCommunitySuperAdmin(userProfile);
  const canEdit = isAuthor;
  const canDelete = isAuthor || isSuperAdmin;

  const loadComments = () => {
    if (commentsLoaded) return;
    subscribeToComments(post.id, {
      onChange: (list) => {
        setComments(list);
        setCommentsLoaded(true);
      },
    });
  };

  const toggleShowComments = () => {
    setShowComments((s) => !s);
    loadComments();
  };

  // Once the thread has actually loaded, the live subscribed list is the
  // source of truth — it can't drift out of sync the way the stored
  // commentCount field can if an increment write ever gets rejected.
  // Each comment's own replyCount already covers every reply nested
  // under it (both levels, since replies share one flat subcollection),
  // so summing "1 + replyCount" per comment gives the true total without
  // needing to expand every thread first.
  const displayCommentCount = commentsLoaded
    ? comments.reduce((sum, c) => sum + 1 + (c.replyCount || 0), 0)
    : post.commentCount || 0;

  // Everyone taggable from the top-level composer: the post author plus
  // every top-level commenter visible so far.
  const threadParticipants = getThreadParticipants(post, comments, uid);

  // Post's carousel: prefer the new media[] array; fall back to the legacy
  // singular mediaUrl/mediaType for posts written before this existed.
  const mediaList =
    Array.isArray(post.media) && post.media.length > 0
      ? post.media
      : post.mediaUrl
      ? [{ url: post.mediaUrl, path: post.mediaPath, type: post.mediaType }]
      : [];
  const hasMedia = mediaList.length > 0;

  const [mediaIndex, setMediaIndex] = useState(0);
  // If the gallery shrinks (e.g. an edit collapses it to one image) while
  // sitting on a now-out-of-range slide, snap back into range.
  useEffect(() => {
    if (mediaIndex > mediaList.length - 1) {
      setMediaIndex(Math.max(0, mediaList.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaList.length]);

  const touchStartXRef = React.useRef(0);
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

  const cardGradient = gradientForPost(post.id);
  const typeColor = POST_TYPE_COLORS[post.type] || POST_TYPE_COLORS.discussion;
  const authorLine = post.anonymous
    ? "Anonymous"
    : post.businessName
    ? `${post.authorName} · ${post.businessName}`
    : post.authorName;

  const handleLike = () => togglePostLike(post.id, uid, isLiked);

  const handleShare = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?post=${post.id}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch (err) {
      console.error("Copy share link failed:", err);
    }
  };

  // Floating like/comment/share rail, overlaid on the media (or the
  // gradient card for text-only posts) — the TikTok-style rail this feed
  // is meant to have. Shared between both post shapes so they stay
  // visually identical.
  const renderRail = () => (
    <div className="post-card-rail">
      <button
        className={`post-card-rail-btn ${isLiked ? "is-liked" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          handleLike();
        }}
      >
        <span className="post-card-rail-icon">
          <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
        </span>
        <span className="post-card-rail-count">{post.likeCount > 0 ? post.likeCount : "Like"}</span>
      </button>

      <button
        className="post-card-rail-btn"
        onClick={(e) => {
          e.stopPropagation();
          toggleShowComments();
        }}
      >
        <span className="post-card-rail-icon">
          <MessageCircle size={18} />
        </span>
        <span className="post-card-rail-count">
          {displayCommentCount > 0 ? displayCommentCount : "Comment"}
        </span>
      </button>

      <button
        className="post-card-rail-btn"
        onClick={(e) => {
          e.stopPropagation();
          handleShare();
        }}
      >
        <span className="post-card-rail-icon">
          {shared ? <Check size={16} /> : <Share2 size={16} />}
        </span>
        <span className="post-card-rail-count">{shared ? "Copied" : "Share"}</span>
      </button>
    </div>
  );

  const handleSubmitComment = async ({ body, mediaFile, mentions }) => {
    await addComment(post.id, {
      authorId: uid,
      authorName: userProfile?.name || "Business Owner",
      businessName,
      body,
      mediaFile,
      mentions,
    });
    if (!showComments) toggleShowComments();
  };

  const handleDeletePost = async () => {
    setDeleting(true);
    try {
      await deletePost(post);
      // Firestore's live subscription removes the post from the feed
      // automatically once the delete completes — nothing else to do here.
    } catch (err) {
      console.error("deletePost error:", err);
      setErrorMsg(err.message || "Couldn't delete that post.");
      setDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <div className="post-card">
        <div className="post-card-header">
          <div className="post-card-header-left">
            <span className="post-card-avatar">{(post.authorName || "?")[0].toUpperCase()}</span>
            <div className="post-card-header-text">
              <span className="post-card-author">{authorLine}</span>
              <span className="post-card-meta">Editing…</span>
            </div>
          </div>
        </div>
        <PostEditForm post={post} onDone={() => setIsEditing(false)} onCancel={() => setIsEditing(false)} />
      </div>
    );
  }

  return (
    <div className={`post-card ${deleting ? "post-card--deleting" : ""}`}>
      <div className="post-card-header">
        <div className="post-card-header-left">
          <span className="post-card-avatar">{(post.authorName || "?")[0].toUpperCase()}</span>
          <div className="post-card-header-text">
            <span className="post-card-author">{authorLine}</span>
            <span className="post-card-meta">
              {timeAgo(post.createdAt)}
              {post.editedAt ? " · edited" : ""} ·{" "}
              <span style={{ color: typeColor.fg }}>{POST_TYPE_LABELS[post.type]}</span>
              {" · "}
              {categoryLabel(post.category)}
            </span>
          </div>
        </div>
        <PostMenu
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={() => setIsEditing(true)}
          onDelete={handleDeletePost}
          confirmTitle="Delete this post?"
          confirmMessage="All its comments and attached media will be deleted too. This can't be undone."
        />
      </div>

      {hasMedia ? (
        <>
          {post.body && <p className="post-card-body">{post.body}</p>}
          <div
            className="post-card-frame post-card-frame--media"
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
                    i === mediaIndex ? (
                      <AutoplayVideo src={item.url} onOpen={() => onOpenMedia(post)} forcePause={isViewerOpen} />
                    ) : (
                      // Videos further along the carousel aren't mounted (and
                      // don't autoplay) until they're actually swiped to —
                      // keeps a multi-video post from firing off several
                      // autoplaying videos at once off-screen.
                      <div className="post-card-carousel-video-placeholder" />
                    )
                  ) : (
                    <img
                      src={item.url}
                      alt={`Post attachment ${i + 1}`}
                      loading="lazy"
                      onClick={() => onOpenMedia(post)}
                    />
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setMediaIndex(i);
                      }}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      goPrev();
                    }}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                {mediaIndex < mediaList.length - 1 && (
                  <button
                    className="post-card-carousel-nav post-card-carousel-nav--next"
                    onClick={(e) => {
                      e.stopPropagation();
                      goNext();
                    }}
                    aria-label="Next photo"
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
              </>
            )}

            {renderRail()}
          </div>
        </>
      ) : (
        <div className="post-card-frame post-card-frame--text" style={{ background: cardGradient }}>
          <span className="post-card-type-chip">{POST_TYPE_LABELS[post.type]}</span>
          <Quote className="post-card-quote-icon" size={26} />
          <p className="post-card-frame-text">{post.body}</p>
          {renderRail()}
        </div>
      )}

      <button className="post-card-comments-toggle" onClick={toggleShowComments}>
        {displayCommentCount > 0
          ? `View ${displayCommentCount} comment${displayCommentCount === 1 ? "" : "s"}`
          : "Be the first to comment"}
      </button>

      {showComments && (
        <div className="post-card-comments">
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
              threadParticipants={threadParticipants}
            />
          ))}
          <CommentComposer onSubmit={handleSubmitComment} participants={threadParticipants} />
        </div>
      )}

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
