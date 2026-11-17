// Where the event form goes after a create, when the create started somewhere other than /events
// (LIVE-2319). A Space calendar's create links carry `?return=/spaces/<slug>/...` so publishing an
// event lands the person back on the calendar they started from, not the main Events page.
//
// The value arrives in a URL, so it is UNTRUSTED: only a same-origin relative path under /spaces/ is
// accepted. No scheme, no host, no protocol-relative `//`, no backslash, no dot segments, no
// whitespace or control characters. Anything else reads as "no return path" and the form keeps its
// old behaviour (the new event's page). PURE.

/** The query param the create links set and /events/new reads. */
const RETURN_PARAM = 'return'

const SAFE_SPACE_PATH = /^\/spaces\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_\-()[\]]+)*\/?(?:\?[A-Za-z0-9_\-.=&%]*)?$/

/** The return path when `raw` is a safe /spaces/ path, else null. */
export function safeReturnPath(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string') return null
  if (v.length === 0 || v.length > 300) return null
  if (v.startsWith('//') || v.includes('\\') || v.includes('/../') || v.includes('/./')) return null
  return SAFE_SPACE_PATH.test(v) ? v : null
}

/** `href` with `return=<path>` added when `path` is a safe /spaces/ path; `href` unchanged otherwise. */
export function withReturnPath(href: string, path: string | null | undefined): string {
  const safe = safeReturnPath(path)
  if (!safe) return href
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}${RETURN_PARAM}=${encodeURIComponent(safe)}`
}
