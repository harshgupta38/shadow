// The Bearer token for BackOffice's own API — not a cookie. The frontend
// (Firebase Hosting) and this API are different origins, so a cookie the
// API set is a third-party cookie from the browser's perspective: Chrome
// Incognito and mobile Safari (ITP) block those outright regardless of
// SameSite, which is exactly what broke login there. localStorage has no
// such cross-origin policy — it's scoped to this frontend's own origin,
// read only by this frontend's own JS, and attached explicitly below as
// an Authorization header rather than sent automatically by the browser.
const TOKEN_KEY = "bo_access_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage disabled/full — the user just won't stay signed in across a
    // reload; not worth surfacing over the login that already succeeded.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clean up if storage isn't available in the first place.
  }
}
