// THE FREQUENCY PLACEHOLDER ART: one of the installed brand photographs (public/brand/frequency/photos),
// picked deterministically from a key, for a Frequency surface that must show art where the record has
// none (a Starter Circle with no image, a member with no header photo). The same key always draws the
// same photo, so a card never flickers between renders and two neighbours rarely match. A real image
// always wins; this is only the fallback. Pure: no React, Next or Supabase, safe in any runtime.

const PHOTOS = [
  'gathering-02.jpg',
  'gathering-03.jpg',
  'gathering-04.jpg',
  'gathering-05.jpg',
  'gathering-06.jpg',
  'gathering-07.jpg',
  'gathering-08.jpg',
  'gathering-09.jpg',
  'gathering-10.jpg',
  'gathering-11.jpg',
  'gathering-12.jpg',
  'gathering-13.jpg',
  'gathering-14.jpg',
  'day-beach-hoop.jpg',
  'day-meditation-circle.jpg',
  'day-parachute-play.jpg',
  'day-park-yoga.jpg',
] as const

/** Every photo this module can hand back, as a public URL. */
export const FQ_PLACEHOLDER_PHOTOS: readonly string[] = PHOTOS.map((f) => `/brand/frequency/photos/${f}`)

/** One brand photo for `key` (a slug or an id). Stable for the same key. */
export function fqPlaceholderArt(key: string): string {
  // FNV-1a over the key's code units: a cheap, well-spread hash, so slugs that share a prefix
  // ("sunrise-sit", "sunrise-swim") still land on different photos.
  let h = 0x811c9dc5 // token-ok: the FNV-1a offset basis, a hash constant, not a colour
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) // token-ok: the FNV-1a prime, a hash constant, not a colour
  }
  return FQ_PLACEHOLDER_PHOTOS[(h >>> 0) % FQ_PLACEHOLDER_PHOTOS.length]
}
