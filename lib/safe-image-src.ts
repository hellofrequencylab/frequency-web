// The image sibling of `safeHref` (lib/page-editor/richtext.tsx): one allowlist for every
// <img src> whose value did not come from a literal in the source.
//
// An <img> src cannot execute script the way an href can, so this is not patching an active
// XSS. It is closing the class: a src is a URL sink, and a URL sink that accepts any string
// will eventually be handed one from a database column, a Puck field, or a prop three
// components away. The allowlist makes the safe cases explicit and everything else render
// nothing, which is the honest failure for an image.
//
// CodeQL js/xss-through-dom models one sanitizer shape: `if (RE.test(v)) return v`, with RE
// anchored at both ends and no wildcards (HYG-142, ADR-1637). A parse-then-scheme-check is
// not that shape. `new URL()` leaves a blob: path and a data: body opaque, so a quote or an
// angle bracket in either used to come back out of `toString()` and land on the <img>. The
// four literals below are the allowlist; every non-null return is a test against one of them.
//
// Allowed, and why each is here:
//   IMAGE_PATH     same-origin assets under public/ (a leading slash, never //host)
//   IMAGE_DATA     raster data:image/png|jpeg|gif|webp|avif;base64 (no svg, no quotes)
//   IMAGE_HTTP     remote media (Supabase storage, Loom, operator-supplied covers)
//   IMAGE_BLOB     object URLs from URL.createObjectURL — origin plus a UUID, nothing else
// Everything else — javascript:, vbscript:, file:, a blob with a quote, a data: SVG — is null.

const IMAGE_PATH =
  /^\/[A-Za-z0-9._~?#@!$&'()*+,;=%-][A-Za-z0-9._/~?#@!$&'()*+,;=%-]*$/
const IMAGE_DATA = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/
const IMAGE_HTTP =
  /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~/?#@!$&'()*+,;=%-]*)?$/
const IMAGE_BLOB =
  /^blob:https?:\/\/[A-Za-z0-9.-]+\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function safeImageSrc(src: string | null | undefined): string | null {
  if (!src) return null
  const s = src.trim()
  if (!s) return null
  if (IMAGE_PATH.test(s)) return s
  if (IMAGE_DATA.test(s)) return s
  if (IMAGE_HTTP.test(s)) return s
  if (IMAGE_BLOB.test(s)) return s
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
export function safeUploadPreviewSrc(src: string | null | undefined): string | null {
  const safe = safeImageSrc(src)
  if (!safe) return null
  if (IMAGE_BLOB.test(safe)) return safe
  if (IMAGE_HTTP.test(safe)) return safe
  return null
}
