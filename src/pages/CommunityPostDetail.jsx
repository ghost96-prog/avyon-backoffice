// src/pages/CommunityPostDetail.jsx
//
// Placeholder — full post detail + replies thread lands in the next chunk.
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getPost, incrementViews } from "../services/community";
import "./Community.css";

export default function CommunityPostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const p = await getPost(postId);
      if (!active) return;
      setPost(p);
      setLoading(false);
      if (p) incrementViews(postId);
    })();
    return () => {
      active = false;
    };
  }, [postId]);

  return (
    <div className="community-page">
      <button className="community-ask-btn" style={{ marginBottom: 16 }} onClick={() => navigate("/community")}>
        <ArrowLeft size={16} /> Back to Community
      </button>

      {loading && <p className="community-status">Loading…</p>}
      {!loading && !post && <p className="community-status community-status-error">Post not found.</p>}

      {!loading && post && (
        <div>
          <h1>{post.title}</h1>
          <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{post.body}</p>
          <p className="community-status" style={{ marginTop: 24 }}>
            🚧 Replies thread coming in the next chunk.
          </p>
        </div>
      )}
    </div>
  );
}