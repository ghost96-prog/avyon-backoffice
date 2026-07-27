// src/services/community.js
//
// Firestore + Storage access layer for the Community feed.
//
// community/{postId}
//   authorId, authorName, businessName, anonymous
//   type, category, title (unused now, kept for back-compat), body
//   media: [{ url, path, type ("image"|"video") }, ...] — 0 or more
//     attachments, shown as a swipeable carousel when there's more than one.
//   mediaUrl, mediaPath, mediaType — legacy singular fields, kept in sync
//     with media[0] for any older code path that still reads them directly.
//   createdAt, editedAt, commentCount, likeCount, likedBy: [uid, ...]
//   pinned, status
//
// community/{postId}/comments/{commentId}
//   authorId, authorName, businessName, body, createdAt, editedAt,
//   likeCount, likedBy: [uid, ...], dislikeCount, dislikedBy: [uid, ...],
//   replyCount, mentions: [{ uid, name }, ...]
//   mediaUrl, mediaPath, mediaType ("image" | "video" | null)
//
// community/{postId}/comments/{commentId}/replies/{replyId}
//   authorId, authorName, businessName, body, createdAt, editedAt,
//   likeCount, likedBy: [uid, ...], mentions: [{ uid, name }, ...]
//   mediaUrl, mediaPath, mediaType ("image" | "video" | null)
//   parentReplyId: string | null — null for a direct reply to the comment
//     (level 2); set to another reply's id for a reply-to-a-reply
//     (level 3, the deepest level the UI allows).
//   replyingToName: string | null — the display name of who a level-3
//     reply is addressed to, for the "↳ replying to X" hint in the UI.
//
// All replies — level 2 and level 3 alike — live flat in this one
// `replies` subcollection (nesting is a client-side grouping by
// parentReplyId, not a Firestore subcollection-of-subcollections). That
// keeps a single subscribeToReplies() call sufficient to render the
// whole reply tree for a comment, and keeps replyCount / commentCount
// bookkeeping below a simple increment/decrement regardless of depth.
//
// `mediaPath` is the Storage object path (not the download URL) — keeping
// it alongside mediaUrl means deletes/edits never have to parse a URL to
// find the file to remove. Comments/replies stay single-attachment; only
// posts support the multi-image `media` array.

import {
  collection,
  addDoc,
  doc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase/firebase";
import { compressImageFile } from "../utils/mediaCompression";

const COMMUNITY_COLLECTION = "community";

// ── Media helpers ───────────────────────────────────────────────────────

/**
 * Uploads an image/video File to Storage and returns { url, path, type }.
 * Caller is expected to have already run validateMediaFile() on `file`.
 */
async function uploadMedia(file, authorId, folder = "posts") {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) throw new Error("Only images and videos are supported.");

  // Compress images before they ever touch Storage — this is the one
  // place every image upload (posts, comments, replies, edits) passes
  // through, so it's the one place compression needs to live.
  const fileToUpload = isImage ? await compressImageFile(file) : file;

  const ext = fileToUpload.name.split(".").pop();
  // Path shape must match the deployed storage rule exactly:
  // community-media/{userId}/{fileName} — so `folder` (posts/comments/replies)
  // gets folded into the filename instead of being its own segment.
  const path = `community-media/${authorId}/${folder}-${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, fileToUpload);
  const url = await getDownloadURL(storageRef);

  return { url, path, type: isVideo ? "video" : "image" };
}

// Uploads several files in parallel and returns their { url, path, type }
// results in the same order they were passed in — order matters here since
// it becomes the carousel order on the post.
async function uploadMediaFiles(files, authorId, folder = "posts") {
  if (!files || files.length === 0) return [];
  return Promise.all(files.map((file) => uploadMedia(file, authorId, folder)));
}

// Best-effort delete. Falls back to parsing the path out of a legacy
// download URL for docs written before mediaPath existed. Never throws —
// a missing/already-gone file shouldn't block the Firestore delete.
function storagePathFromUrl(url) {
  const match = url?.match(/\/o\/(.+?)\?/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function deleteMediaFile(mediaUrl, mediaPath) {
  const path = mediaPath || storagePathFromUrl(mediaUrl);
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if (err?.code !== "storage/object-not-found") {
      console.error("deleteMediaFile error:", err);
    }
  }
}

// Deletes every file in a post's `media` array. Used wherever a post's
// whole gallery needs to go — full post delete, or an edit that replaces
// the attachment set entirely.
async function deleteAllMediaFiles(mediaArray) {
  if (!Array.isArray(mediaArray) || mediaArray.length === 0) return;
  await Promise.all(mediaArray.map((m) => deleteMediaFile(m.url, m.path)));
}

// Deletes every doc in a subcollection ref, plus each doc's attached
// media. Used to cascade-delete replies (under a comment) and comments
// (under a post).
async function deleteSubcollectionDocs(subcollectionRef) {
  const snap = await getDocs(subcollectionRef);

  await Promise.all(
    snap.docs.map((d) => {
      const data = d.data();
      return data.mediaUrl || data.mediaPath ? deleteMediaFile(data.mediaUrl, data.mediaPath) : Promise.resolve();
    })
  );

  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return snap.docs;
}

// ── Posts ────────────────────────────────────────────────────────────────

export function subscribeToPosts({ category, take = 50, onChange, onError }) {
  const postsRef = collection(db, COMMUNITY_COLLECTION);
  const constraints = [where("status", "==", "published")];

  if (category && category !== "all") {
    constraints.push(where("category", "==", category));
  }

  constraints.push(orderBy("pinned", "desc"));
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(take));

  const q = query(postsRef, ...constraints);

  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error("subscribeToPosts error:", error);
      onError?.(error);
    }
  );
}

// Lightweight companion to subscribeToPosts, used only for the unread
// badge — we don't need post bodies/media, just how many published
// posts landed after `sinceDate`. Capped at 50 so a very stale badge
// can't pull down hundreds of docs just to render a number.
// NOTE: like subscribeToPosts, this needs a composite index
// (status ASC, createdAt ASC) — Firestore will log a console link to
// auto-create it the first time this runs against real data.
export function subscribeToNewPostsCount(sinceDate, { onChange, onError }) {
  const postsRef = collection(db, COMMUNITY_COLLECTION);
  const constraints = [where("status", "==", "published")];

  if (sinceDate) {
    constraints.push(where("createdAt", ">", sinceDate));
  }
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(50));

  const q = query(postsRef, ...constraints);

  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.size),
    (error) => {
      console.error("subscribeToNewPostsCount error:", error);
      onError?.(error);
    }
  );
}

/**
 * Create a new post. `mediaFiles` is optional — an array of Files from an
 * <input multiple>. Validate each with validateMediaFile() before calling
 * this. Uploaded in the same order as passed, which becomes the carousel
 * order on the post.
 */
export async function createPost({
  authorId,
  authorName,
  businessName,
  type,
  category,
  body,
  anonymous = false,
  mediaFiles = [],
}) {
  if (!authorId) throw new Error("Missing authorId");
  if (!body?.trim() && mediaFiles.length === 0) throw new Error("Write something or attach a photo/video.");

  const uploaded = await uploadMediaFiles(mediaFiles, authorId, "posts");
  const media = uploaded.map((u) => ({ url: u.url, path: u.path, type: u.type }));

  const postsRef = collection(db, COMMUNITY_COLLECTION);
  const docRef = await addDoc(postsRef, {
    authorId,
    authorName: anonymous ? "Anonymous" : authorName || "Business Owner",
    businessName: anonymous ? null : businessName || null,
    anonymous: !!anonymous,
    type: type || "discussion",
    category: category || "general_discussion",
    body: body?.trim() || "",
    media,
    // Legacy singular fields, kept in sync with the first attachment for
    // any older code path that still reads mediaUrl/mediaType directly.
    mediaUrl: media[0]?.url || null,
    mediaPath: media[0]?.path || null,
    mediaType: media[0]?.type || null,
    createdAt: serverTimestamp(),
    editedAt: null,
    commentCount: 0,
    likeCount: 0,
    likedBy: [],
    pinned: false,
    status: "published",
  });

  return docRef.id;
}

/**
 * Edit a post's text, category, and/or media gallery.
 *
 * Pass `media` to set the post's full attachment list, in the order the
 * post should display it — the edit form supports adding, removing, and
 * reordering, mixed freely with attachments that were already there.
 * Each entry is one of:
 *   - { kind: "existing", url, path, type } — an attachment the post
 *     already had (keeping it or just moving its position).
 *   - { kind: "new", file } — a File to upload and insert at this spot.
 * Pass `media: []` to remove every attachment. Leave `media` undefined
 * to leave the whole gallery untouched (e.g. a text-only edit).
 *
 * Pass the post's *current* `media` array (or, for older posts, its
 * legacy mediaUrl/mediaPath) as `currentMedia`/`currentMediaUrl`/
 * `currentMediaPath` — anything in there that didn't make it into the
 * new `media` list gets cleaned up from Storage.
 */
export async function updatePost(
  postId,
  {
    body,
    category,
    media,
    currentMedia = [],
    currentMediaUrl = null,
    currentMediaPath = null,
    authorId,
  }
) {
  const updates = { editedAt: serverTimestamp() };

  if (body !== undefined) updates.body = body?.trim() || "";
  if (category !== undefined) updates.category = category;

  if (media !== undefined) {
    const existingBefore = currentMedia.length
      ? currentMedia
      : currentMediaUrl || currentMediaPath
      ? [{ url: currentMediaUrl, path: currentMediaPath }]
      : [];

    // Upload every "new" entry (in parallel), keeping each result lined
    // up with its original position so order is preserved once existing
    // and freshly-uploaded items are merged back together below.
    const uploads = await Promise.all(
      media.map((item) => (item.kind === "new" ? uploadMedia(item.file, authorId, "posts") : null))
    );

    const finalMedia = media.map((item, i) =>
      item.kind === "new"
        ? { url: uploads[i].url, path: uploads[i].path, type: uploads[i].type }
        : { url: item.url, path: item.path, type: item.type }
    );

    // An existing attachment is identified by its Storage path (falling
    // back to its URL for older docs that predate mediaPath) so a kept
    // item that just moved position isn't mistaken for a dropped one.
    const keyOf = (m) => m.path || m.url;
    const keptKeys = new Set(finalMedia.map(keyOf).filter(Boolean));
    const dropped = existingBefore.filter((m) => !keptKeys.has(keyOf(m)));
    if (dropped.length) await deleteAllMediaFiles(dropped);

    updates.media = finalMedia;
    updates.mediaUrl = finalMedia[0]?.url || null;
    updates.mediaPath = finalMedia[0]?.path || null;
    updates.mediaType = finalMedia[0]?.type || null;
  }

  const ref_ = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(ref_, updates);
}

/**
 * Delete a post and everything under it: every comment, every comment's
 * replies, every attached media anywhere in that tree, and the post's
 * own media.
 */
export async function deletePost(post) {
  const postRef = doc(db, COMMUNITY_COLLECTION, post.id);
  const commentsRef = collection(db, COMMUNITY_COLLECTION, post.id, "comments");
  const commentsSnap = await getDocs(commentsRef);

  // For every comment: cascade-delete its replies first, then its own media.
  await Promise.all(
    commentsSnap.docs.map(async (commentDoc) => {
      const repliesRef = collection(db, COMMUNITY_COLLECTION, post.id, "comments", commentDoc.id, "replies");
      await deleteSubcollectionDocs(repliesRef);

      const c = commentDoc.data();
      if (c.mediaUrl || c.mediaPath) await deleteMediaFile(c.mediaUrl, c.mediaPath);
    })
  );

  // Now the comment docs themselves.
  for (let i = 0; i < commentsSnap.docs.length; i += 450) {
    const batch = writeBatch(db);
    commentsSnap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  if (Array.isArray(post.media) && post.media.length > 0) {
    await deleteAllMediaFiles(post.media);
  } else if (post.mediaUrl || post.mediaPath) {
    await deleteMediaFile(post.mediaUrl, post.mediaPath);
  }

  await deleteDoc(postRef);
}

/** Toggle a like on a post for the given uid. */
export async function togglePostLike(postId, uid, isCurrentlyLiked) {
  const ref_ = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(ref_, {
    likedBy: isCurrentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    likeCount: increment(isCurrentlyLiked ? -1 : 1),
  });
}

// ── Comments ─────────────────────────────────────────────────────────────

export function subscribeToComments(postId, { take = 100, onChange, onError }) {
  const commentsRef = collection(db, COMMUNITY_COLLECTION, postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"), limit(take));

  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error("subscribeToComments error:", error);
      onError?.(error);
    }
  );
}

/**
 * Add a comment. `mediaFile` is optional — validate with
 * validateMediaFile() before calling this.
 */
export async function addComment(postId, { authorId, authorName, businessName, body, mediaFile = null, mentions = [] }) {
  if (!body?.trim() && !mediaFile) throw new Error("Write something or attach a photo/video.");

  let mediaUrl = null;
  let mediaPath = null;
  let mediaType = null;
  if (mediaFile) {
    const uploaded = await uploadMedia(mediaFile, authorId, "comments");
    mediaUrl = uploaded.url;
    mediaPath = uploaded.path;
    mediaType = uploaded.type;
  }

  const commentsRef = collection(db, COMMUNITY_COLLECTION, postId, "comments");
  await addDoc(commentsRef, {
    authorId,
    authorName: authorName || "Business Owner",
    businessName: businessName || null,
    body: body?.trim() || "",
    mediaUrl,
    mediaPath,
    mediaType,
    createdAt: serverTimestamp(),
    editedAt: null,
    likeCount: 0,
    likedBy: [],
    dislikeCount: 0,
    dislikedBy: [],
    replyCount: 0,
    mentions,
  });

  const postRef = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(postRef, { commentCount: increment(1) });
}

/**
 * Edit a comment's text and/or attachment. Same replace/remove semantics
 * as updatePost — pass the comment's current mediaUrl/mediaPath in.
 */
export async function updateComment(
  postId,
  commentId,
  { body, mediaFile = null, removeMedia = false, currentMediaUrl = null, currentMediaPath = null, authorId, mentions }
) {
  const updates = { editedAt: serverTimestamp() };

  if (body !== undefined) updates.body = body?.trim() || "";
  if (mentions !== undefined) updates.mentions = mentions;

  if (mediaFile) {
    const uploaded = await uploadMedia(mediaFile, authorId, "comments");
    updates.mediaUrl = uploaded.url;
    updates.mediaPath = uploaded.path;
    updates.mediaType = uploaded.type;
    if (currentMediaUrl || currentMediaPath) {
      await deleteMediaFile(currentMediaUrl, currentMediaPath);
    }
  } else if (removeMedia) {
    updates.mediaUrl = null;
    updates.mediaPath = null;
    updates.mediaType = null;
    if (currentMediaUrl || currentMediaPath) {
      await deleteMediaFile(currentMediaUrl, currentMediaPath);
    }
  }

  const ref_ = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId);
  await updateDoc(ref_, updates);
}

/**
 * Delete a comment: cascades to every reply under it (docs + their
 * media), the comment's own media, then the comment doc itself, and
 * decrements the post's commentCount.
 */
export async function deleteComment(postId, comment) {
  const repliesRef = collection(db, COMMUNITY_COLLECTION, postId, "comments", comment.id, "replies");
  const deletedReplies = await deleteSubcollectionDocs(repliesRef);

  if (comment.mediaUrl || comment.mediaPath) {
    await deleteMediaFile(comment.mediaUrl, comment.mediaPath);
  }

  const commentRef = doc(db, COMMUNITY_COLLECTION, postId, "comments", comment.id);
  await deleteDoc(commentRef);

  // The post's commentCount is a total across every level (comment +
  // replies + replies-to-replies), so losing this comment also loses
  // every reply that was nested under it, flat subcollection and all.
  const postRef = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(postRef, { commentCount: increment(-(1 + deletedReplies.length)) });
}

/** Like a comment. Removes an existing dislike from the same user, if any. */
export async function toggleCommentLike(postId, commentId, uid, isCurrentlyLiked, isCurrentlyDisliked = false) {
  const ref_ = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId);
  const updates = {
    likedBy: isCurrentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    likeCount: increment(isCurrentlyLiked ? -1 : 1),
  };
  if (!isCurrentlyLiked && isCurrentlyDisliked) {
    updates.dislikedBy = arrayRemove(uid);
    updates.dislikeCount = increment(-1);
  }
  await updateDoc(ref_, updates);
}

/** Dislike a comment. Removes an existing like from the same user, if any. */
export async function toggleCommentDislike(postId, commentId, uid, isCurrentlyDisliked, isCurrentlyLiked = false) {
  const ref_ = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId);
  const updates = {
    dislikedBy: isCurrentlyDisliked ? arrayRemove(uid) : arrayUnion(uid),
    dislikeCount: increment(isCurrentlyDisliked ? -1 : 1),
  };
  if (!isCurrentlyDisliked && isCurrentlyLiked) {
    updates.likedBy = arrayRemove(uid);
    updates.likeCount = increment(-1);
  }
  await updateDoc(ref_, updates);
}

// ── Replies (two levels deep: reply, and reply-to-a-reply) ───────────────
//
// Both levels sit in the same flat `replies` subcollection under the
// comment — see the header comment for why. `parentReplyId` is what
// tells them apart: null = level 2 (direct reply to the comment),
// non-null = level 3 (reply to that reply). The UI stops offering a
// "Reply" affordance once you're at level 3.

export function subscribeToReplies(postId, commentId, { take = 200, onChange, onError }) {
  const repliesRef = collection(db, COMMUNITY_COLLECTION, postId, "comments", commentId, "replies");
  const q = query(repliesRef, orderBy("createdAt", "asc"), limit(take));

  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error("subscribeToReplies error:", error);
      onError?.(error);
    }
  );
}

/**
 * Add a reply to a comment, or a reply to another reply. `mediaFile` is
 * optional — validate with validateMediaFile() before calling this (same
 * size/duration caps as posts and comments).
 *
 * Pass `parentReplyId` + `replyingToName` when this is a level-3 reply
 * (i.e. replying to a reply rather than to the comment itself). Leave
 * them null for an ordinary level-2 reply.
 */
export async function addReply(
  postId,
  commentId,
  { authorId, authorName, businessName, body, mediaFile = null, mentions = [], parentReplyId = null, replyingToName = null }
) {
  if (!body?.trim() && !mediaFile) throw new Error("Write something or attach a photo/video.");

  let mediaUrl = null;
  let mediaPath = null;
  let mediaType = null;
  if (mediaFile) {
    const uploaded = await uploadMedia(mediaFile, authorId, "replies");
    mediaUrl = uploaded.url;
    mediaPath = uploaded.path;
    mediaType = uploaded.type;
  }

  const repliesRef = collection(db, COMMUNITY_COLLECTION, postId, "comments", commentId, "replies");
  await addDoc(repliesRef, {
    authorId,
    authorName: authorName || "Business Owner",
    businessName: businessName || null,
    body: body?.trim() || "",
    mediaUrl,
    mediaPath,
    mediaType,
    createdAt: serverTimestamp(),
    editedAt: null,
    likeCount: 0,
    likedBy: [],
    mentions,
    parentReplyId,
    replyingToName,
  });

  const commentRef = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId);
  await updateDoc(commentRef, { replyCount: increment(1) });

  // Every reply — level 2 or level 3 — counts toward the post's total
  // comment count, so the number shown on the feed is right without
  // anyone having to expand the thread first.
  const postRef = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(postRef, { commentCount: increment(1) });
}

export async function updateReply(
  postId,
  commentId,
  replyId,
  { body, mediaFile = null, removeMedia = false, currentMediaUrl = null, currentMediaPath = null, authorId, mentions }
) {
  const updates = { editedAt: serverTimestamp() };

  if (body !== undefined) updates.body = body?.trim() || "";
  if (mentions !== undefined) updates.mentions = mentions;

  if (mediaFile) {
    const uploaded = await uploadMedia(mediaFile, authorId, "replies");
    updates.mediaUrl = uploaded.url;
    updates.mediaPath = uploaded.path;
    updates.mediaType = uploaded.type;
    if (currentMediaUrl || currentMediaPath) {
      await deleteMediaFile(currentMediaUrl, currentMediaPath);
    }
  } else if (removeMedia) {
    updates.mediaUrl = null;
    updates.mediaPath = null;
    updates.mediaType = null;
    if (currentMediaUrl || currentMediaPath) {
      await deleteMediaFile(currentMediaUrl, currentMediaPath);
    }
  }

  const ref_ = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId, "replies", replyId);
  await updateDoc(ref_, updates);
}

export async function deleteReply(postId, commentId, reply) {
  const repliesRef = collection(db, COMMUNITY_COLLECTION, postId, "comments", commentId, "replies");

  // Deleting a level-2 reply also takes any level-3 replies addressed to
  // it with it — otherwise they'd be left dangling, pointing at a
  // parentReplyId that no longer exists.
  let deletedChildren = [];
  if (!reply.parentReplyId) {
    const childSnap = await getDocs(query(repliesRef, where("parentReplyId", "==", reply.id)));
    deletedChildren = childSnap.docs;

    await Promise.all(
      deletedChildren.map((d) => {
        const data = d.data();
        return data.mediaUrl || data.mediaPath ? deleteMediaFile(data.mediaUrl, data.mediaPath) : Promise.resolve();
      })
    );
    if (deletedChildren.length) {
      const batch = writeBatch(db);
      deletedChildren.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  if (reply.mediaUrl || reply.mediaPath) {
    await deleteMediaFile(reply.mediaUrl, reply.mediaPath);
  }

  const replyRef = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId, "replies", reply.id);
  await deleteDoc(replyRef);

  const totalRemoved = 1 + deletedChildren.length;
  const commentRef = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId);
  await updateDoc(commentRef, { replyCount: increment(-totalRemoved) });

  const postRef = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(postRef, { commentCount: increment(-totalRemoved) });
}

export async function toggleReplyLike(postId, commentId, replyId, uid, isCurrentlyLiked) {
  const ref_ = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId, "replies", replyId);
  await updateDoc(ref_, {
    likedBy: isCurrentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    likeCount: increment(isCurrentlyLiked ? -1 : 1),
  });
}

export { COMMUNITY_COLLECTION };
