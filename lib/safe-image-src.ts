// The image sibling of `safeHref` (lib/page-editor/richtext.tsx): one allowlist for every
// <img src> whose value did not come from a literal in the source.
//
// An <img> src cannot execute script the way an href can, so this is not patching an active
// XSS. It is closing the class CodeQL js/xss-through-dom reports, and the class a URL sink
// that accepts any string will eventually be handed from a database column, a Puck field, or
// a paste. The allowlist makes the safe cases explicit and everything else render nothing.
//
// CodeQL models one sanitizer shape: `if (RE.test(v)) return v`, with RE a fully anchored
// literal that has no bare dot, negated class, or \S/\W/\D (HYG-142, ADR-1637).
// A parse-then-scheme-check is not that shape: `new URL` treats a blob path and a data:
// body as opaque, so quotes and angle brackets came back verbatim. Every non-null return
// below is that `if (RE.test(safe)) return safe` form. Fix the helper, never dismiss the
// alert.
//
// Allowed, and why each is here:
//   /path              same-origin assets under public/ (and /api/og)
//   data:image/raster  FileReader previews and inline PNG/JPEG/GIF/WebP/AVIF
//   data:image/svg+xml percent-encoded Loom site icons (raw "<svg onload" stays out)
//   http(s)://…/path   remote media (Supabase storage, Loom, operator covers)
//   blob:http(s)://…/uuid  object URLs from URL.createObjectURL
// Everything else — javascript:, vbscript:, file:, a protocol-relative host, a blob
// id that is not a uuid — resolves to null.

const SAFE_PATH = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:[.][A-Za-z0-9]+)?(?:[?][A-Za-z0-9_.&=%-]*)?$/
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/
const SAFE_DATA_SVG = /^data:image\/svg[+]xml,[A-Za-z0-9._~%()!*+,;-]+$/
const SAFE_HTTP = /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[A-Za-z0-9._/~%+-]+(?:[?][A-Za-z0-9._~=&/%+:-]*)?$/
const SAFE_BLOB = /^blob:https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function safeImageSrc(src: string | null | undefined): string | null {
  if (!src) return null
  const safe = src.trim()
  if (!safe) return null
  if (SAFE_PATH.test(safe)) return safe
  if (SAFE_DATA_IMAGE.test(safe)) return safe
  if (SAFE_DATA_SVG.test(safe)) return safe
  if (SAFE_HTTP.test(safe)) return safe
  if (SAFE_BLOB.test(safe)) return safe
  return null
}

// The narrow sibling, for the ONE case that recurs across the product: a local upload
// preview. SEVEN surfaces paint one — the Beta induction avatar, the onboarding avatar
// step, the feed composer attachment, the report-dialog screenshot, the connection
// creator's avatar and logo, the poster-scan preview, and the event-spark thumb — and
// until this helper each guarded it differently: one used safeImageSrc, one an ad-hoc
// /^(?:blob:|https?:\/\/)/i regex, and the rest nothing at all.
//
// An upload preview is only ever a blob: URL from createObjectURL, or the http(s) URL
// the file got after it uploaded. Nothing else is reachable, so nothing else is allowed:
// no data:, no same-origin /path. That is deliberately STRICTER than safeImageSrc.
// Rewriting this helper into the same `if (RE.test(v)) return v` shape is not this row;
// until then it filters the already-allowlisted string.
export function safeUploadPreviewSrc(src: string | null | undefined): string | null {
  const safe = safeImageSrc(src)
  if (!safe) return null
  return /^(?:blob:|https?:)/i.test(safe) ? safe : null
}
