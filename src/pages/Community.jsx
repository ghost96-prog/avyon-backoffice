// src/pages/Community.jsx
import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { subscribeToPosts } from "../services/community";
import { COMMUNITY_CATEGORIES } from "../utils/communityConfig";
import { useAppContext } from "../context/AppContext";
import PostComposer from "../components/community/PostComposer";
import PostCard from "../components/community/PostCard";
import MediaViewer from "../components/community/MediaViewer";
import "./Community.css";

export default function Community() {
  const { uid, userProfile } = useAppContext();
  const [activeCategory, setActiveCategory] = useState("all");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewerPostId, setViewerPostId] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToPosts({
      category: activeCategory,
      onChange: (list) => {
        setPosts(list);
        setLoading(false);
      },
      onError: (err) => {
        setError(err.message || "Failed to load community posts.");
        setLoading(false);
      },
    });

    return () => unsubscribe();
  }, [activeCategory]);

  const filteredPosts = searchTerm.trim()
    ? posts.filter((p) => p.body?.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : posts;

  // Keep the viewer in sync with live post updates (e.g. like count ticking up)
  const viewerPost = viewerPostId ? posts.find((p) => p.id === viewerPostId) || null : null;

  return (
    <div className={`community-shell ${viewerPost ? "viewer-open" : ""}`}>
      <div className="community-page">
        <div className="community-header">
          <h1>Avyon Community</h1>
          <p>Ask questions, share tips, and connect with other Avyon business owners.</p>
        </div>

        <PostComposer onPosted={() => {}} />

        <div className="community-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search posts…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="community-categories">
          {COMMUNITY_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`community-category-btn ${activeCategory === c.id ? "is-active" : ""}`}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="community-feed">
          {loading && <p className="community-status">Loading posts…</p>}

          {!loading && error && (
            <p className="community-status community-status-error">
              Couldn't load the community feed: {error}
            </p>
          )}

          {!loading && !error && filteredPosts.length === 0 && (
            <div className="community-empty-state">
              <p>No posts yet in this category.</p>
              <p>Be the first to share something!</p>
            </div>
          )}

          {!loading &&
            !error &&
            filteredPosts.map((post) => (
              <PostCard key={post.id} post={post} onOpenMedia={(p) => setViewerPostId(p.id)} />
            ))}
        </div>
      </div>

      {viewerPost && (
        <MediaViewer
          post={viewerPost}
          uid={uid}
          userProfile={userProfile}
          onClose={() => setViewerPostId(null)}
        />
      )}
    </div>
  );
}
