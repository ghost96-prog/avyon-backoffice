// src/utils/moduleSubscriptionCache.js
//
// localStorage cache for module (add-on) subscription state, keyed per
// branch. This is what makes the client "offline-safe": a branch owner
// who paid for a module but has a flaky connection should NEVER see a
// false "expired/not subscribed" modal just because the last fetch
// failed — the cached "active" state (from the last successful fetch)
// keeps being honored until either (a) a new successful fetch says
// otherwise, or (b) the cached accessExpiresAt timestamp itself has
// genuinely passed according to the device's own clock (which is a real
// expiry, not a network problem).
//
// Cache shape per branch, stored under key `moduleSub:{branchId}`:
//   {
//     modules: { [moduleId]: { status, hasAccess, accessExpiresAt, msRemaining } },
//     fetchedAt: <ms epoch of last SUCCESSFUL fetch>,
//   }

const CACHE_PREFIX = 'moduleSub:';
const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h — purely informational (isStale flag), never blocks access on its own

function cacheKey(branchId) {
  return `${CACHE_PREFIX}${branchId}`;
}

function readCache(branchId) {
  try {
    const raw = localStorage.getItem(cacheKey(branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.modules || !parsed.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(branchId, modules) {
  try {
    localStorage.setItem(
      cacheKey(branchId),
      JSON.stringify({ modules, fetchedAt: Date.now() })
    );
  } catch {
    // Storage full/unavailable — non-fatal, just means no offline fallback this session.
  }
}

function clearCache(branchId) {
  try {
    localStorage.removeItem(cacheKey(branchId));
  } catch {
    // ignore
  }
}

/**
 * Re-resolve a cached module snapshot against the CURRENT wall clock.
 * This is the one case where the client is allowed to move a module from
 * "active" to "expired" without a server round trip — because the
 * accessExpiresAt timestamp itself has now passed, which is a fact about
 * time, not a fact that depends on network connectivity. Suspended /
 * cancelled / inactive states never get reinterpreted here.
 */
function reresolveAgainstClock(modules, now = Date.now()) {
  const out = {};
  for (const [moduleId, mod] of Object.entries(modules)) {
    if (mod.status === 'active' && mod.accessExpiresAt && now > mod.accessExpiresAt) {
      out[moduleId] = {
        ...mod,
        status: 'expired',
        hasAccess: false,
        msRemaining: 0,
      };
    } else {
      out[moduleId] = {
        ...mod,
        msRemaining: mod.accessExpiresAt ? Math.max(0, mod.accessExpiresAt - now) : mod.msRemaining ?? null,
      };
    }
  }
  return out;
}

export { readCache, writeCache, clearCache, reresolveAgainstClock, STALE_AFTER_MS };