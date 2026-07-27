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

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { subscribeToNewPostsCount } from "../services/community";
import { useAppContext } from "./AppContext";

const CommunityUnreadContext = createContext({
  unreadCount: 0,
  markCommunitySeen: () => {},
});

function storageKey(uid) {
  return `community_last_seen_${uid}`;
}

export function CommunityUnreadProvider({ children }) {
  const { uid } = useAppContext();
  const [lastSeen, setLastSeen] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load (or seed) this user's last-seen timestamp whenever uid changes
  // (login, or switch-user on a shared device).
  useEffect(() => {
    if (!uid) {
      setLastSeen(null);
      setUnreadCount(0);
      return;
    }
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
      onChange: setUnreadCount,
      onError: () => setUnreadCount(0),
    });
    return () => unsubscribe();
  }, [uid, lastSeen]);

  const markCommunitySeen = useCallback(() => {
    if (!uid) return;
    const now = new Date();
    localStorage.setItem(storageKey(uid), now.toISOString());
    setLastSeen(now);
    setUnreadCount(0);
  }, [uid]);

  return (
    <CommunityUnreadContext.Provider value={{ unreadCount, markCommunitySeen }}>
      {children}
    </CommunityUnreadContext.Provider>
  );
}

export function useCommunityUnread() {
  return useContext(CommunityUnreadContext);
}
