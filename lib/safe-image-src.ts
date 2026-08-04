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

  // Canonicalize and validate external/object URLs by parsed protocol.
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
    if (u.protocol === 'blob:' && typeof window !== 'undefined' && u.origin === window.location.origin) {
      return u.toString()
    }
  } catch {
    return null
  }

  return null
}
