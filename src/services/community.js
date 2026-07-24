// src/services/community.js
//
// Firestore + Storage access layer for the Community feed.
//
// community/{postId}
//   authorId, authorName, businessName, anonymous
//   type, category, title (unused now, kept for back-compat), body
//   mediaUrl, mediaPath, mediaType ("image" | "video" | null)
//   createdAt, editedAt, commentCount, likeCount, likedBy: [uid, ...]
//   pinned, status
//
// community/{postId}/comments/{commentId}
//   authorId, authorName, body, createdAt, editedAt, likeCount, likedBy: [uid, ...]
//   mediaUrl, mediaPath, mediaType ("image" | "video" | null)
//
// `mediaPath` is the Storage object path (not the download URL) — keeping
// it alongside mediaUrl means deletes/edits never have to parse a URL to
// find the file to remove.

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

  const ext = file.name.split(".").pop();
  const path = `community-media/${folder}/${authorId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  return { url, path, type: isVideo ? "video" : "image" };
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

/**
 * Create a new post. `mediaFile` is optional (a File from an <input>).
 * Validate the file with validateMediaFile() before calling this.
 */
export async function createPost({
  authorId,
  authorName,
  businessName,
  type,
  category,
  body,
  anonymous = false,
  mediaFile = null,
}) {
  if (!authorId) throw new Error("Missing authorId");
  if (!body?.trim() && !mediaFile) throw new Error("Write something or attach a photo/video.");

  let mediaUrl = null;
  let mediaPath = null;
  let mediaType = null;
  if (mediaFile) {
    const uploaded = await uploadMedia(mediaFile, authorId, "posts");
    mediaUrl = uploaded.url;
    mediaPath = uploaded.path;
    mediaType = uploaded.type;
  }

  const postsRef = collection(db, COMMUNITY_COLLECTION);
  const docRef = await addDoc(postsRef, {
    authorId,
    authorName: anonymous ? "Anonymous" : authorName || "Business Owner",
    businessName: anonymous ? null : businessName || null,
    anonymous: !!anonymous,
    type: type || "discussion",
    category: category || "general_discussion",
    body: body?.trim() || "",
    mediaUrl,
    mediaPath,
    mediaType,
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
 * Edit a post's text and/or attachment.
 * - Pass `mediaFile` to replace the attachment (old one is deleted from Storage).
 * - Pass `removeMedia: true` to drop the attachment entirely.
 * - Otherwise the existing attachment is left untouched.
 * Pass the post's *current* mediaUrl/mediaPath in so the old file can be
 * cleaned up on replace/remove.
 */
export async function updatePost(
  postId,
  { body, category, mediaFile = null, removeMedia = false, currentMediaUrl = null, currentMediaPath = null, authorId }
) {
  const updates = { editedAt: serverTimestamp() };

  if (body !== undefined) updates.body = body?.trim() || "";
  if (category !== undefined) updates.category = category;

  if (mediaFile) {
    const uploaded = await uploadMedia(mediaFile, authorId, "posts");
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

  const ref_ = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(ref_, updates);
}

/**
 * Delete a post and everything under it: every comment doc, every
 * comment's attached media, and the post's own attached media.
 */
export async function deletePost(post) {
  const postRef = doc(db, COMMUNITY_COLLECTION, post.id);
  const commentsRef = collection(db, COMMUNITY_COLLECTION, post.id, "comments");

  const commentsSnap = await getDocs(commentsRef);

  // Clean up comment media first (Storage has no cascade delete).
  await Promise.all(
    commentsSnap.docs.map((d) => {
      const c = d.data();
      return c.mediaUrl || c.mediaPath ? deleteMediaFile(c.mediaUrl, c.mediaPath) : Promise.resolve();
    })
  );

  // Batch-delete comment docs (Firestore batches cap at 500 writes).
  const commentDocs = commentsSnap.docs;
  for (let i = 0; i < commentDocs.length; i += 450) {
    const batch = writeBatch(db);
    commentDocs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  if (post.mediaUrl || post.mediaPath) {
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
export async function addComment(postId, { authorId, authorName, body, mediaFile = null }) {
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
    body: body?.trim() || "",
    mediaUrl,
    mediaPath,
    mediaType,
    createdAt: serverTimestamp(),
    editedAt: null,
    likeCount: 0,
    likedBy: [],
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
  { body, mediaFile = null, removeMedia = false, currentMediaUrl = null, currentMediaPath = null, authorId }
) {
  const updates = { editedAt: serverTimestamp() };

  if (body !== undefined) updates.body = body?.trim() || "";

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

/** Delete a single comment (and its attached media) and decrement the post's count. */
export async function deleteComment(postId, comment) {
  if (comment.mediaUrl || comment.mediaPath) {
    await deleteMediaFile(comment.mediaUrl, comment.mediaPath);
  }

  const commentRef = doc(db, COMMUNITY_COLLECTION, postId, "comments", comment.id);
  await deleteDoc(commentRef);

  const postRef = doc(db, COMMUNITY_COLLECTION, postId);
  await updateDoc(postRef, { commentCount: increment(-1) });
}

export async function toggleCommentLike(postId, commentId, uid, isCurrentlyLiked) {
  const ref_ = doc(db, COMMUNITY_COLLECTION, postId, "comments", commentId);
  await updateDoc(ref_, {
    likedBy: isCurrentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    likeCount: increment(isCurrentlyLiked ? -1 : 1),
  });
}

export { COMMUNITY_COLLECTION };
