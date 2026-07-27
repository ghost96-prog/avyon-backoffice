// src/pages/Community.jsx
import React, { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { subscribeToPosts } from "../services/community";
import { COMMUNITY_CATEGORIES } from "../utils/communityConfig";
import { useAppContext } from "../context/AppContext";
import { useCommunityUnread } from "../context/CommunityUnreadContext";
import PostComposer from "../components/community/PostComposer";
import PostCard from "../components/community/PostCard";
import MediaViewer from "../components/community/MediaViewer";
import "./Community.css";

export default function Community() {
  const { uid, userProfile, businessName } = useAppContext();
  const { markCommunitySeen } = useCommunityUnread();
  const [activeCategory, setActiveCategory] = useState("all");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewerPostId, setViewerPostId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Clear the badge on arrival, and again on the way out — the second
  // call catches anything that posted while this page was open, since
  // the realtime "new since" query would otherwise start climbing again
  // the moment new posts land.
  useEffect(() => {
    markCommunitySeen();
    return () => markCommunitySeen();
  }, [markCommunitySeen]);

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

  // Close the filter popup on an outside click, same pattern as the
  // TopBar user menu.
  useEffect(() => {
    const onClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filteredPosts = searchTerm.trim()
    ? posts.filter((p) => p.body?.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : posts;

  // Keep the viewer in sync with live post updates (e.g. like count ticking up)
  const viewerPost = viewerPostId ? posts.find((p) => p.id === viewerPostId) || null : null;

  const activeCategoryLabel =
    COMMUNITY_CATEGORIES.find((c) => c.id === activeCategory)?.label || "All";

  return (
    <div className={`community-shell ${viewerPost ? "viewer-open" : ""}`}>
      <div className="community-page">
        <div className="community-header">
          <h1>Avyon Community</h1>
          <p>Ask questions, share tips, and connect with other Avyon business owners.</p>
        </div>

        <PostComposer onPosted={() => {}} />

        <div className="community-toolbar">
          <div className="community-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search posts…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="community-filter" ref={filterRef}>
            <button
              type="button"
              className={`community-filter-btn ${activeCategory !== "all" ? "is-active" : ""}`}
              onClick={() => setFilterOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={filterOpen}
            >
              <SlidersHorizontal size={14} />
              <span>{activeCategoryLabel}</span>
              <ChevronDown size={14} className={`community-filter-chevron ${filterOpen ? "is-open" : ""}`} />
            </button>

            {filterOpen && (
              <div className="community-filter-menu">
                {COMMUNITY_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`community-filter-option ${activeCategory === c.id ? "is-active" : ""}`}
                    onClick={() => {
                      setActiveCategory(c.id);
                      setFilterOpen(false);
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
              <PostCard
                key={post.id}
                post={post}
                onOpenMedia={(p) => setViewerPostId(p.id)}
                isViewerOpen={post.id === viewerPostId}
              />
            ))}
        </div>
      </div>

      {viewerPost && (
        <MediaViewer
          post={viewerPost}
          uid={uid}
          userProfile={userProfile}
          businessName={businessName}
          onClose={() => setViewerPostId(null)}
        />
      )}
    </div>
  );
}
