// src/services/api.js
export const API_BASE = import.meta.env.VITE_API_BASE || "https://api-kr2g73yf5a-uc.a.run.app";

/**
 * Builds an authenticated fetch function bound to a "get a fresh ID token"
 * callback. Mirrors the mobile app's apiFetch: JSON in/out, retries once
 * on 401 with a forced token refresh, throws on non-OK responses so
 * callers can catch() and show a message.
 */
export function createApiFetch(getToken) {
  return async function apiFetch(path, options = {}, retryCount = 0) {
    const token = await getToken(false);
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    let json = null;
    try {
      json = await res.json();
    } catch (_) {
      // No/invalid JSON body (e.g. 204) — that's fine for some endpoints.
    }

    if (res.status === 401 && retryCount < 2) {
      const freshToken = await getToken(true);
      if (freshToken) {
        return apiFetch(path, options, retryCount + 1);
      }
    }

    if (!res.ok) {
      throw new Error((json && json.error) || `Request failed: ${res.status}`);
    }

    return json;
  };
}
