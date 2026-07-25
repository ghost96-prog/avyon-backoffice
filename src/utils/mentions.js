// src/utils/mentions.js
//
// Lightweight @mention support scoped to the current thread. There's no
// user directory to search yet, so "people you can tag" means "people
// already visible in this thread" — the post author plus anyone who has
// commented or replied (at any nesting level) in what's currently loaded.
//
// A comment/reply doc stores the mentions it was posted with as
// `mentions: [{ uid, name }, ...]`. Rendering re-highlights those exact
// names inside the body text — no offsets to keep in sync, no risk of a
// mention pointing at stale text after an edit changes surrounding words.

/** Walks a post + its loaded comments (each optionally carrying a
 * `_replies` array of loaded reply docs) and returns a deduped list of
 * { uid, name } for everyone visible in the thread so far. `excludeUid`
 * drops the current user from their own suggestion list. */
export function getThreadParticipants(post, comments = [], excludeUid = null) {
  const seen = new Map();
  const add = (uid, name) => {
    if (!uid || !name || uid === excludeUid || seen.has(uid)) return;
    seen.set(uid, { uid, name });
  };

  if (post && !post.anonymous) add(post.authorId, post.authorName);

  comments.forEach((c) => {
    add(c.authorId, c.authorName);
    (c._replies || []).forEach((r) => add(r.authorId, r.authorName));
  });

  return Array.from(seen.values());
}

/** Given the composer text and the cursor position, returns the
 * in-progress @mention token being typed — e.g. "hey @ky" with the
 * cursor at the end returns { start: 4, query: "ky" } — or null if the
 * cursor isn't inside one. Requires the @ to be at the start of the text
 * or preceded by whitespace, so emails/handles elsewhere in the text
 * aren't mistaken for a trigger. */
export function activeMentionTrigger(text, cursorPos) {
  const upToCursor = text.slice(0, cursorPos);
  const match = upToCursor.match(/(?:^|\s)@([a-zA-Z0-9._' -]{0,30})$/);
  if (!match) return null;
  const start = upToCursor.length - match[1].length - 1; // index of the '@'
  return { start, query: match[1] };
}

/** Replaces the in-progress @token with the chosen participant's name.
 * Returns the new text and where the cursor should land afterward. */
export function applyMention(text, trigger, name) {
  const before = text.slice(0, trigger.start);
  const after = text.slice(trigger.start + 1 + trigger.query.length);
  const insertion = `@${name} `;
  return { text: before + insertion + after, cursor: (before + insertion).length };
}

/** Splits a comment/reply body into plain-text and mention segments for
 * rendering, matching against the { uid, name } list stored on the doc. */
export function splitMentions(body, mentions = []) {
  if (!body || !mentions.length) return [{ text: body || "", mention: false }];

  const names = mentions
    .map((m) => m.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length) // longest first avoids partial-name overlaps
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (!names.length) return [{ text: body, mention: false }];

  const re = new RegExp(`@(${names.join("|")})\\b`, "g");
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) parts.push({ text: body.slice(lastIndex, match.index), mention: false });
    parts.push({ text: match[0], mention: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) parts.push({ text: body.slice(lastIndex), mention: false });
  return parts;
}
