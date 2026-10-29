// The Space cover PLACEHOLDER: the Frequency dark default (ink canvas, the --fq-pa sky/aqua/seaglass glow,
// a few signal waves) used when a Space has not uploaded its own cover, so the header always reads as an
// intentional identity band. Never a photograph (owner, 2026-10-28). Hosted build-time asset under
// public/images/site. A real cover always wins. ONE shared source: the profile hero (the (profile) layout)
// and the OG share card (opengraph-image) both read it, so a shared link previews the SAME image the page
// shows. PURE (no React / Next / Supabase), safe in any runtime.

const COVER_PLACEHOLDERS = ['/images/site/space-cover-default.jpg'] as const

/** The closed set of paths this module can hand back.
 *
 *  ⚠️ NOT decoration. The OG cards cannot read one of these from disk through a variable — a
 *  parameterised `readFile` is unresolvable to @vercel/nft, which falls back to globbing the whole
 *  of `public/` into every function under the segment (759.5 MB, measured). So each placeholder has
 *  a LITERAL reader in `lib/og/local-image.ts`, keyed by this union: adding a photo to the array
 *  above without adding its reader there is a TYPE ERROR, not a 500 in a share card. */
export type CoverPlaceholderPath = (typeof COVER_PLACEHOLDERS)[number]

/** The placeholder for a Space (or event). The id is kept so the call sites and the closed set stay
 *  the same shape if a second dark variant is ever added. */
export function coverPlaceholderFor(_id: string): CoverPlaceholderPath {
  return COVER_PLACEHOLDERS[0]
}
