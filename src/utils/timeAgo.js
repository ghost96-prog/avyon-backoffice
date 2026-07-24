// src/utils/timeAgo.js
//
// Small helper for "3h ago" / "2d ago" style timestamps used across the
// community feed. Accepts a Firestore Timestamp, a JS Date, a millis
// number, or null (still-pending serverTimestamp() write).

export function timeAgo(value) {
  if (!value) return "just now";

  let date;
  if (typeof value?.toDate === "function") {
    date = value.toDate(); // Firestore Timestamp
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    date = new Date(value);
  } else {
    return "just now";
  }

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return date.toLocaleDateString();
}