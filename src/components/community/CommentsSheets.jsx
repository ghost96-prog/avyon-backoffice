
import React, { useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { subscribeToComments, addComment } from "../../services/community";
import { getThreadParticipants } from "../../utils/mentions";
import CommentRow from "./CommentRow";
import CommentComposer from "./CommentComposer";
import "./CommentsSheets.css";

export default function CommentsSheet({ post, uid, userProfile, businessName, isSuperAdmin, onClose }) {
  const [comments, setComments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!post) return;
    const unsubscribe = subscribeToComments(post.id, {
      onChange: (list) => {
        setComments(list);
        setLoaded(true);
      },
    });
    return () => unsubscribe();
  }, [post?.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!post) return null;

  const totalCount = loaded
    ? comments.reduce((sum, c) => sum + 1 + (c.replyCount || 0), 0)
    : post.commentCount || 0;

  const threadParticipants = getThreadParticipants(post, comments, uid);

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(onClose, 220);
  };

  const handleSubmitComment = async ({ body, mediaFile, mentions }) => {
    await addComment(post.id, {
      authorId: uid,
      authorName: userProfile?.name || "Business Owner",
      businessName,
      body,
      mediaFile,
      mentions,
    });
  };

  return (
    <div className={`comments-sheet-backdrop ${closing ? "is-closing" : ""}`} onClick={handleClose}>
      <div className={`comments-sheet ${closing ? "is-closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="comments-sheet-handle-wrap">
          <div className="comments-sheet-handle" />
        </div>

        <div className="comments-sheet-header">
          <h2>{totalCount} comment{totalCount === 1 ? "" : "s"}</h2>
          <button className="comments-sheet-close" onClick={handleClose} aria-label="Close comments">
            <ChevronDown size={20} className="comments-sheet-close-mobile" />
            <X size={20} className="comments-sheet-close-desktop" />
          </button>
        </div>

        <div className="comments-sheet-list">
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
          {loaded && comments.length === 0 && (
            <p className="comments-sheet-empty">No comments yet — be the first to reply.</p>
          )}
        </div>

        <div className="comments-sheet-composer">
          <CommentComposer onSubmit={handleSubmitComment} participants={threadParticipants} autoFocus />
        </div>
      </div>
    </div>
  );
}
