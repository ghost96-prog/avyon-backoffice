// src/pages/Community.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, ChevronDown, ArrowLeft, Loader2 } from "lucide-react";
import { subscribeToPosts } from "../services/community";
import { COMMUNITY_CATEGORIES } from "../utils/communityConfig";
import { useAppContext } from "../context/AppContext";
import { useCommunityUnread } from "../context/CommunityUnreadContext";
import PostComposer from "../components/community/PostComposer";
import PostCard from "../components/community/PostCard";
import MediaViewer from "../components/community/MediaViewer";
import "./Community.css";

// ✅ NEW — how many posts we ask for on the first load, and how many more
// to pull in each time the user scrolls near the bottom. Kept small so we
// never pull the entire community feed into memory/listeners at once —
// mirrors the same "don't fetch everything up front" approach used for
// product pagination elsewhere in the app.
const INITIAL_PAGE_SIZE = 15;
const PAGE_SIZE_INCREMENT = 15;

export default function Community() {
  const navigate = useNavigate();
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

  // ✅ NEW — lazy-loading state. `pageSize` is how many posts we currently
  // ask the listener for; it only grows (never shrinks) as the user
  // scrolls, and resets back to the first page whenever the category
  // changes. `hasMore` is a heuristic: if the feed handed back fewer posts
  // than we asked for, we've hit the end.
  const [pageSize, setPageSize] = useState(INITIAL_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef(null);

  // Clear the badge on arrival, and again on the way out — the second
  // call catches anything that posted while this page was open, since
  // the realtime "new since" query would otherwise start climbing again
  // the moment new posts land.
  useEffect(() => {
    markCommunitySeen();
    return () => markCommunitySeen();
  }, [markCommunitySeen]);

  // ✅ CHANGED — now requests only `pageSize` posts instead of the whole
  // category. Re-fires whenever pageSize grows (user scrolled for more)
  // or the category changes (selectCategory below resets pageSize first,
  // so both land in the same render/batch and this only fires once).
  useEffect(() => {
    setLoading(pageSize === INITIAL_PAGE_SIZE);
    setError(null);

    const unsubscribe = subscribeToPosts({
      category: activeCategory,
      limit: pageSize,
      onChange: (list) => {
        setPosts(list);
        setHasMore(list.length >= pageSize);
        setLoading(false);
        setLoadingMore(false);
      },
      onError: (err) => {
        setError(err.message || "Failed to load community posts.");
        setLoading(false);
        setLoadingMore(false);
      },
    });

    return () => unsubscribe();
  }, [activeCategory, pageSize]);

  // ✅ NEW — grows the page size (and therefore triggers the effect above
  // to re-subscribe with a bigger limit) once the sentinel at the bottom
  // of the feed scrolls into view. Guarded so it can't fire again while a
  // load is already in flight or once we know there's nothing left.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loading && !loadingMore) {
          setLoadingMore(true);
          setPageSize((prev) => prev + PAGE_SIZE_INCREMENT);
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  // Close the filter popup on an outside click, same pattern as the
  // TopBar user menu.
  useEffect(() => {
    const onClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ✅ NEW — switching category should start back at the first page, not
  // keep whatever limit we'd scrolled up to for the previous category.
  const selectCategory = useCallback((id) => {
    setActiveCategory(id);
    setPageSize(INITIAL_PAGE_SIZE);
    setHasMore(true);
    setFilterOpen(false);
  }, []);

  // ✅ NEW — simple "go back" that falls back to the dashboard if there's
  // no previous entry in history (e.g. Community was opened directly via
  // a bookmarked URL rather than by navigating from within the app).
  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/dashboard");
  }, [navigate]);

  // ⚠️ Search currently filters only the posts already loaded on the
  // client (i.e. within the current pageSize window), not the entire
  // category — matching the "don't load everything at once" goal. If you
  // want search to reach posts that haven't been fetched yet, that needs
  // a server-side query rather than a wider client-side limit.
  const filteredPosts = searchTerm.trim()
    ? posts.filter((p) => p.body?.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : posts;

  // Keep the viewer in sync with live post updates (e.g. like count ticking up)
  const viewerPost = viewerPostId ? posts.find((p) => p.id === viewerPostId) || null : null;

  const activeCategoryLabel =
    COMMUNITY_CATEGORIES.find((c) => c.id === activeCategory)?.label || "All";

  return (
    <div className={`community-shell ${viewerPost ? "viewer-open" : ""}`}>
      {/* ✅ NEW — small local keyframe for the "loading more" spinner. If
          you'd rather keep this in Community.css, move it there as:
          .community-spinner { animation: community-spin 0.8s linear infinite; }
          @keyframes community-spin { to { transform: rotate(360deg); } } */}
      <style>{`
        .community-spinner { animation: community-spin 0.8s linear infinite; }
        @keyframes community-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div className="community-page">
        <div className="community-header" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            title="Go back"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: 9,
              border: "1px solid #E2E8F0",
              background: "#fff",
              color: "#475569",
              cursor: "pointer",
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <ArrowLeft size={17} />
          </button>
          <div>
            <h1>Avyon Community</h1>
            <p>Ask questions, share tips, and connect with other Avyon business owners.</p>
          </div>
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
                    onClick={() => selectCategory(c.id)}
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

          {/* ✅ NEW — invisible sentinel that triggers the next page once it
              scrolls into view, plus a small inline spinner while that next
              page is loading. Only rendered once we actually have posts and
              there's reason to believe more exist. */}
          {!loading && !error && posts.length > 0 && hasMore && (
            <div ref={sentinelRef} style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
              {loadingMore && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748B" }}>
                  <Loader2 size={14} className="community-spinner" />
                  <span>Loading more posts…</span>
                </div>
              )}
            </div>
          )}

          {!loading && !error && posts.length > 0 && !hasMore && (
            <p className="community-status" style={{ opacity: 0.6, fontSize: 12 }}>
              You're all caught up.
            </p>
          )}
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