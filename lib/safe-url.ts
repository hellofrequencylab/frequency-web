// Allow only http/https URLs through to an `href` or a stored link, blocking
// `javascript:`, `data:`, `vbscript:`, and other script-bearing schemes (stored-XSS
// defense). Returns the trimmed URL when safe, else null. Framework-free, so the same
// check guards the write path (server actions / data layer) and the render sink (a
// component's `href`). Use BOTH — validate on store, guard on render (defense in depth).

export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const protocol = new URL(trimmed).protocol
    return protocol === 'http:' || protocol === 'https:' ? trimmed : null
  } catch {
    // Not an absolute URL (relative paths, garbage) — not a safe external link.
    return null
  }
}
