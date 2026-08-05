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

export function safeImageSrc(src: string | null | undefined): string | null {
  if (!src) return null
  const s = src.trim()
  if (!s) return null

  // Same-origin absolute path under public/app routes.
  if (s.startsWith('/')) return s

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
// WHY THE CALL SITES CARRY `// codeql[js/xss-through-dom]`.
//
// CodeQL does not model either function as a sanitizer, so every <img> fed by one is
// reported as "DOM text reinterpreted as HTML". The path it draws is real but inert:
//
//   <input type="file">  →  e.target.files[0]   (CodeQL: DOM text)
//   URL.createObjectURL(file)                   (CodeQL: taint survives)
//   <img src={…}>                               (CodeQL: HTML sink)
//
// `createObjectURL` does not embed anything from the file. It returns a browser-minted
// `blob:<origin>/<uuid>` — the filename, the bytes and the MIME type never appear in the
// string, so there is no attacker-controlled character to escape. The taint label is
// carried by the File, not by the URL that identifies it.
//
// Adding these guards RAISED the alert count 5 → 7, because routing four more surfaces
// through one shared helper is exactly what lets CodeQL connect the path across files.
// The code got stricter and the report got louder; both facts are true at once.
//
// Suppressed per site rather than filtered globally, so a genuine js/xss-through-dom
// somewhere else — an innerHTML, a dangerouslySetInnerHTML — still fails the build.
export function safeUploadPreviewSrc(src: string | null | undefined): string | null {
  const safe = safeImageSrc(src)
  if (!safe) return null
  return /^(?:blob:|https?:)/i.test(safe) ? safe : null
}
