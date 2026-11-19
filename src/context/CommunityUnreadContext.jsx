// src/context/CommunityUnreadContext.jsx
//
// Tracks how many community posts are "new since I last looked" so the
// TopBar can badge the Community icon. "Last seen" is a per-user,
// per-device localStorage timestamp — no schema change needed on the
// community docs or a users collection. Good enough for a badge; if
// cross-device sync ever matters, swap the localStorage read/write
// below for a field on the user's Firestore doc.
//
// Wire this in once, nested inside your existing <AppProvider> (it
// needs `uid` from useAppContext), e.g. in App.jsx:
//
//   <AppProvider>
//     <CommunityUnreadProvider>
//       {/* existing routes */}
//     </CommunityUnreadProvider>
//   </AppProvider>

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { subscribeToNewPostsCount } from "../services/community";
import { useAppContext } from "./AppContext";

const CommunityUnreadContext = createContext({
  unreadCount: 0,
  markCommunitySeen: () => {},
  newPostToast: null,
  dismissNewPostToast: () => {},
});

function storageKey(uid) {
  return `community_last_seen_${uid}`;
}

// The newest post we already popped a toast for, so a reload (or a re-subscribe) doesn't show the
// same post again. A genuinely newer post always gets its own toast.
function toastedKey(uid) {
  return `community_last_toasted_${uid}`;
}

export function CommunityUnreadProvider({ children }) {
  const { uid } = useAppContext();
  const [lastSeen, setLastSeen] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newPostToast, setNewPostToast] = useState(null); // { count, latest } | null
  const lastToastedRef = useRef(null);

  // Load (or seed) this user's last-seen timestamp whenever uid changes
  // (login, or switch-user on a shared device).
  useEffect(() => {
    if (!uid) {
      setLastSeen(null);
      setUnreadCount(0);
      setNewPostToast(null);
      lastToastedRef.current = null;
      return;
    }
    lastToastedRef.current = localStorage.getItem(toastedKey(uid));
    const raw = localStorage.getItem(storageKey(uid));
    if (raw) {
      setLastSeen(new Date(raw));
    } else {
      // First time this user has opened the app on this device — treat
      // everything that exists right now as already seen, so the badge
      // doesn't open showing every historical post as "new."
      const now = new Date();
      localStorage.setItem(storageKey(uid), now.toISOString());
      setLastSeen(now);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid || !lastSeen) return;
    const unsubscribe = subscribeToNewPostsCount(lastSeen, {
      excludeAuthorId: uid,
      onChange: (count, latest) => {
        setUnreadCount(count);
        if (count === 0 || !latest) {
          setNewPostToast(null);
          return;
        }
        if (latest.id !== lastToastedRef.current) {
          // A post we haven't announced yet: pop the toast.
          lastToastedRef.current = latest.id;
          try { localStorage.setItem(toastedKey(uid), latest.id); } catch (e) { /* storage full/blocked */ }
          setNewPostToast({ count, latest });
        } else {
          // Same newest post, count moved (e.g. an older one arrived/was removed): keep an open toast accurate.
          setNewPostToast((t) => (t ? { ...t, count } : t));
        }
      },
      onError: () => { setUnreadCount(0); setNewPostToast(null); },
    });
    return () => unsubscribe();
  }, [uid, lastSeen]);

  const markCommunitySeen = useCallback(() => {
    if (!uid) return;
    const now = new Date();
    localStorage.setItem(storageKey(uid), now.toISOString());
    setLastSeen(now);
    setUnreadCount(0);
    setNewPostToast(null);
  }, [uid]);

  // Dismiss hides the toast only. The badge/bounce stay until the user actually opens Community.
  const dismissNewPostToast = useCallback(() => setNewPostToast(null), []);

  return (
    <CommunityUnreadContext.Provider value={{ unreadCount, markCommunitySeen, newPostToast, dismissNewPostToast }}>
      {children}
    </CommunityUnreadContext.Provider>
  );
}

export function useCommunityUnread() {
  return useContext(CommunityUnreadContext);
}