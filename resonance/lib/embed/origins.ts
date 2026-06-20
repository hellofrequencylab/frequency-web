/**
 * Origin allowlist for the embed postMessage bridge. Same-origin is always
 * allowed; any cross-origin host that may frame and drive `/embed` must be
 * listed in NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS (comma-separated).
 *
 * Safe default: with the env unset, ONLY same-origin passes, so standalone mode
 * accepts nothing from a foreign parent without any configuration.
 *
 * Note: the signed JWT is still the real trust gate server-side. This list just
 * stops an unlisted parent window from reaching our message listener at all.
 */
export function allowedOrigins(): string[] {
  return (process.env.NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True if `origin` is same-origin (always allowed) or in the configured list. */
export function isAllowedOrigin(origin: string): boolean {
  if (typeof window !== "undefined" && origin === window.location.origin) {
    return true;
  }
  return allowedOrigins().includes(origin);
}
