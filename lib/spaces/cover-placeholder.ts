// The Space cover PLACEHOLDER set — a small curated set of calm, warm, neutral SITE stock photos used
// when a Space has not uploaded its own cover, so the header always reads as an intentional identity
// band rather than a flat gradient. Hosted build-time assets under public/images/site. A real cover
// always wins. ONE shared source: the profile hero (the (profile) layout) and the OG share card
// (opengraph-image) both pick from here, so a shared link previews the SAME photo the page shows.
// PURE (no React / Next / Supabase), safe in any runtime.

export const COVER_PLACEHOLDERS = [
  '/images/site/outdoor-group.jpg',
  '/images/site/sunset.jpg',
  '/images/site/lab-lounge.jpg',
  '/images/site/nature-viewing-sunset.jpg',
  '/images/site/community-dinner.jpg',
  '/images/site/meditation-circle-outdoor.jpg',
] as const

/** The closed set of paths this module can hand back.
 *
 *  ⚠️ NOT decoration. The OG cards cannot read one of these from disk through a variable — a
 *  parameterised `readFile` is unresolvable to @vercel/nft, which falls back to globbing the whole
 *  of `public/` into every function under the segment (759.5 MB, measured). So each placeholder has
 *  a LITERAL reader in `lib/og/local-image.ts`, keyed by this union: adding a photo to the array
 *  above without adding its reader there is a TYPE ERROR, not a 500 in a share card. */
export type CoverPlaceholderPath = (typeof COVER_PLACEHOLDERS)[number]

/** Deterministically pick ONE placeholder for a Space, keyed off its id, so the same Space always
 *  shows the same photo and different Spaces vary (no Math.random, stable across renders). */
export function coverPlaceholderFor(id: string): CoverPlaceholderPath {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % COVER_PLACEHOLDERS.length
  return COVER_PLACEHOLDERS[hash]
}
