// The event cover's INTRINSIC ASPECT (width / height), captured in the BROWSER and stored on the
// existing events.theme jsonb bag under `coverAspect`, beside `coverFocus` and `heroHeight`. No new
// DB column, no migration (ADR-1248).
//
// 🔴 WHY THE BROWSER, AND WHY A NUMBER. `events` stores no cover dimensions, and every server-side
// way of learning them is one this repo has already refused for the poster band: decoding means
// `sharp`, which is the single largest cost in check:build-budget and would fan out across the
// event routes (docs/DEPLOY-SAFETY.md); fetching the image header at render time is a blocking
// subrequest on a marquee page. The browser has ALREADY decoded the cover every time the focal
// picker previews it, so `naturalWidth / naturalHeight` there is free. The value travels to the
// server as a number, the server VALIDATES it (it arrives from a client, so it is untrusted) and
// never computes it. The same shape lib/library/image-describe.ts uses for blurhash and palette.
//
// The consumer is components/media/poster-band.tsx: with the aspect known, the band becomes the
// poster's own shape (capped by the host's height tier) instead of a tier-shaped guess.

/** The sanest ratio a cover can carry. 1:5 portrait to 5:1 panorama; anything outside is treated
 *  as absent rather than clamped, because a clamped value would still size the band wrong. */
export const COVER_ASPECT_MIN = 0.2
export const COVER_ASPECT_MAX = 5

/** The theme key. One constant, so the writer and the reader cannot drift apart. */
export const COVER_ASPECT_KEY = 'coverAspect'

/** Narrow an untrusted value to a usable cover aspect, or null. Finite, positive, inside the
 *  bounds, rounded to four decimals so a stored value does not carry float noise. Pure + total. */
export function normalizeCoverAspect(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n < COVER_ASPECT_MIN || n > COVER_ASPECT_MAX) return null
  return Math.round(n * 10000) / 10000
}

/** The aspect of a decoded image, from the dimensions the browser reports (`naturalWidth` and
 *  `naturalHeight`, or an ImageBitmap's `width` and `height`). Null when either is missing, which is
 *  what a failed decode reports. Pure + total. */
export function measureCoverAspect(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return normalizeCoverAspect(width / height)
}

/** Read the stored cover aspect out of events.theme (jsonb), or null when the event carries none
 *  or carries something unusable. A null here is what makes the poster band fall back to its tier. */
export function readEventCoverAspect(theme: unknown): number | null {
  if (theme && typeof theme === 'object') {
    return normalizeCoverAspect((theme as Record<string, unknown>)[COVER_ASPECT_KEY])
  }
  return null
}

/** Merge a measured cover aspect into an existing theme object, preserving every other key.
 *  Null (or an unusable number) DROPS the key, so a cover that could not be measured leaves the
 *  band on its tier fallback rather than on a stale shape. Returns the next theme. */
export function writeEventCoverAspect(theme: unknown, aspect: number | null): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  const normalized = normalizeCoverAspect(aspect)
  if (normalized !== null) base[COVER_ASPECT_KEY] = normalized
  else delete base[COVER_ASPECT_KEY]
  return base
}
