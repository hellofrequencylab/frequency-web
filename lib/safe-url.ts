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

// Links pulled off a poster or pasted write-up are often printed without a
// scheme (`instagram.com/x`, `frequency.app/events`). This tolerant variant
// defaults a bare host/path to https, then runs the same http/https-only gate —
// so legitimate scheme-less links survive while `javascript:`/`data:` (which
// already carry a scheme) are still rejected. Returns the normalized URL, or
// null when it can't be made safe. Use this for stored event links (validate on
// store) and to resolve their hrefs (guard on render).
export function normalizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  return safeHttpUrl(hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`)
}
