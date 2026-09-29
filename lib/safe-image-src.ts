// The image sibling of `safeHref` (lib/page-editor/richtext.tsx): one allowlist for every
// <img src> whose value did not come from a literal in the source.
//
// An <img> src cannot execute script the way an href can, so this is not patching an active
// XSS. It is closing the class: a src is a URL sink, and a URL sink that accepts any string
// will eventually be handed one from a database column, a Puck field, or a prop three
// components away. The allowlist makes the safe cases explicit and everything else render
// nothing, which is the honest failure for an image.
//
// Allowed, and why each is here:
//   blob:            object URLs from URL.createObjectURL — local upload previews
//   data:image/…     inline raster/vector, used by the QR and OG surfaces
//   http(s)://       remote media (Supabase storage, Loom, operator-supplied covers)
//   /path            same-origin assets under public/
// Everything else — javascript:, vbscript:, file:, a bare word — resolves to null.

/** A base that cannot resolve, used only to turn a relative path into a parsed URL. `.invalid` is
 *  reserved by RFC 2606, so nothing is fetchable from it even if one ever leaked into a `src`.
 *  FIXED, and deliberately not `window.location.origin`: an allowlist that answers differently on
 *  the server than in the browser is the trap this file already learned about with blob: below. */
const RELATIVE_BASE = 'https://relative.invalid'

export function safeImageSrc(src: string | null | undefined): string | null {
  if (!src) return null
  const s = src.trim()
  if (!s) return null

  // Same-origin absolute path under public/app routes. PARSED, never passed through: it resolves
  // against a base that cannot exist, and it only counts as a path if the result's origin is still
  // that base. That refuses what a leading slash can hide — `//host/x` is protocol-relative and
  // points off-origin — and what comes back is the parser's normalised path, not the caller's
  // string. Returning the input verbatim here was the one raw pass-through left in this file.
  if (s.startsWith('/')) {
    try {
      const u = new URL(s, RELATIVE_BASE)
      return u.origin === RELATIVE_BASE ? `${u.pathname}${u.search}` : null
    } catch {
      return null
    }
  }

  // Data URLs are only allowed for images.
  if (s.startsWith('data:')) {
    return /^data:image\/[a-z0-9.+-]+[,;]/i.test(s) ? s : null
  }

  // Parse rather than prefix-match, and hand back the URL parser's own serialisation: a
  // string that survives `new URL()` and comes back out of `toString()` is a URL by
  // construction, not by our reading of it.
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
    // A blob: URL carries its creator's origin inside it, so `u.origin` is that inner
    // origin. Requiring http(s) there rejects `blob:null/…`, which is what a sandboxed or
    // otherwise opaque-origin document produces.
    //
    // Deliberately NOT compared against window.location.origin. A blob: URL is only
    // resolvable in the origin that minted it, so a cross-origin one is already inert in
    // an <img> — the comparison buys no safety, and reaching for `window` would make this
    // function answer differently on the server than in the browser. A helper whose result
    // depends on where it runs is a trap for the next caller, and every server render
    // would silently get null.
    if (u.protocol === 'blob:' && /^https?:\/\//.test(u.origin)) return u.toString()
  } catch {
    return null
  }

  return null
}

// The narrow sibling, for the ONE case that recurs across the product: a local upload
// preview. SEVEN surfaces paint one — the Beta induction avatar, the onboarding avatar
// step, the feed composer attachment, the report-dialog screenshot, the connection
// creator's avatar and logo, the poster-scan preview, and the event-spark thumb — and
// until this helper each guarded it differently: one used safeImageSrc, one an ad-hoc
// /^(?:blob:|https?:\/\/)/i regex, and the rest nothing at all.
//
// The first version of this comment claimed THREE surfaces and named the onboarding step
// as covered. It was not: `app/onboarding/form.tsx` still rendered the raw state value,
// and CodeQL flagged it. Counting the shape by memory instead of by grep is exactly how
// the unguarded one happens, which is the thing this helper exists to stop.
//
// An upload preview is only ever a blob: URL from createObjectURL, or the http(s) URL
// the file got after it uploaded. Nothing else is reachable, so nothing else is allowed:
// no data:, no same-origin /path. That is deliberately STRICTER than safeImageSrc.
// data: is excluded not because an <img> would run a data:image/svg+xml (it will not —
// SVG loaded through <img> is script-disabled in every browser) but because a preview
// has no reason to carry inline bytes, and a guard that permits what the caller cannot
// produce is a guard with slack in it.
//
// THE LAST STEP IS A WHOLE-STRING ALLOWLIST, and that is deliberate (HYG-137, ADR-1620).
//
// The first version ended in a prefix test, `/^(?:blob:|https?:)/`, on the parser's output. Two
// things were wrong with that. First, the parser does not escape an opaque path: a blob: URL is
// handed back as written, so `blob:https://app.local/"><img src=x onerror=alert(1)>` came out of
// this function verbatim. Nothing can mint that string (createObjectURL writes a UUID there) and
// React escapes attribute values, so it never ran, but a URL sanitizer that returns a quote and an
// angle bracket is not doing the job its name claims. Second, CodeQL could not see a sanitizer at
// all. Its js/xss-through-dom query follows `input.files` through URL.createObjectURL to the
// <img src>, and a regexp test only stops that flow when the pattern is anchored at BOTH ends and
// has no wildcard in it (no `.`, no `[^…]`, no `\S`). So every preview sink was reported as "DOM
// text reinterpreted as HTML", and the old advice here was to dismiss the alerts one by one.
//
// Both regexps below are anchored at both ends and list every character they accept, so the value
// that reaches a src is one of these two shapes and nothing else:
//
//   blob:   blob:<http(s) origin>/<id>   the id is letters, digits and hyphens (a UUID in every
//                                        browser), which is all createObjectURL ever writes there
//   http(s) <scheme>://<host>[:port]/<path>[?query], the parser's serialisation, which has already
//                                        percent-encoded quotes, angle brackets, backticks and
//                                        spaces; no credentials, no fragment
//
// A value outside them renders no preview (the callers fall back to initials or nothing), which is
// the honest failure for an image. If CodeQL reports an upload preview again, the sink is not going
// through this function, or someone loosened a pattern: fix that, do not dismiss the alert.
const BLOB_PREVIEW_SRC = /^blob:https?:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9-]{1,64}$/i
const UPLOADED_PREVIEW_SRC =
  /^https?:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9._~%!$&()*+,;=:@/-]*(?:\?[a-z0-9._~%!$&()*+,;=:@/?-]*)?$/i

export function safeUploadPreviewSrc(src: string | null | undefined): string | null {
  const safe = safeImageSrc(src)
  if (!safe) return null
  if (BLOB_PREVIEW_SRC.test(safe)) return safe
  if (UPLOADED_PREVIEW_SRC.test(safe)) return safe
  return null
}
