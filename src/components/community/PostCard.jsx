// src/components/community/PostCard.jsx
import React, { useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { POST_TYPE_LABELS, POST_TYPE_COLORS, categoryLabel } from "../../utils/communityConfig";
import { timeAgo } from "../../utils/timeAgo";
import { isCommunitySuperAdmin } from "../../utils/communityPermissions";
import { togglePostLike, subscribeToComments, addComment, deletePost } from "../../services/community";
import { useAppContext } from "../../context/AppContext";
import AutoplayVideo from "./AutoplayVideo";
import CommentRow from "./CommentRow";
import CommentComposer from "./CommentComposer";
import PostMenu from "./PostMenu";
import PostEditForm from "./PostEditForm";
import "./PostCard.css";

export default function PostCard({ post, onOpenMedia }) {
  const { uid, userProfile } = useAppContext();

  const isLiked = (post.likedBy || []).includes(uid);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const typeColor = POST_TYPE_COLORS[post.type] || POST_TYPE_COLORS.discussion;
  const authorLine = post.anonymous
    ? "Anonymous"
    : post.businessName
    ? `${post.authorName} · ${post.businessName}`
    : post.authorName;

  const handleLike = () => togglePostLike(post.id, uid, isLiked);

  const handleSubmitComment = async ({ body, mediaFile }) => {
    await addComment(post.id, {
      authorId: uid,
      authorName: userProfile?.name || "Business Owner",
      body,
      mediaFile,
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
      window.alert(err.message || "Couldn't delete that post.");
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
          confirmMessage="Delete this post and all its comments? This can't be undone."
        />
      </div>

      {post.body && <p className="post-card-body">{post.body}</p>}

      {post.mediaUrl && post.mediaType === "image" && (
        <div className="post-card-media" onClick={() => onOpenMedia(post)}>
          <img src={post.mediaUrl} alt="Post attachment" loading="lazy" />
        </div>
      )}
      {post.mediaUrl && post.mediaType === "video" && (
        <div className="post-card-media">
          <AutoplayVideo src={post.mediaUrl} onOpen={() => onOpenMedia(post)} />
        </div>
      )}

      <div className="post-card-stats-row">
        {post.likeCount > 0 && (
          <span className="post-card-like-count">
            <Heart size={12} fill="currentColor" /> {post.likeCount}
          </span>
        )}
        {post.commentCount > 0 && (
          <button className="post-card-comment-count" onClick={toggleShowComments}>
            {post.commentCount} comment{post.commentCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div className="post-card-actions">
        <button className={`post-card-action-btn ${isLiked ? "is-liked" : ""}`} onClick={handleLike}>
          <Heart size={16} fill={isLiked ? "currentColor" : "none"} /> Like
        </button>
        <button className="post-card-action-btn" onClick={toggleShowComments}>
          <MessageCircle size={16} /> Comment
        </button>
      </div>

      {showComments && (
        <div className="post-card-comments">
          {comments.map((c) => (
            <CommentRow key={c.id} postId={post.id} comment={c} uid={uid} isSuperAdmin={isSuperAdmin} />
          ))}
          <CommentComposer onSubmit={handleSubmitComment} />
        </div>
      )}
    </div>
  );
}
