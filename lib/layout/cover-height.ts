// THE ONE cover/hero height ladder — Short / Standard / Tall (ADR-793). The Business Space cover hero
// and the Event page hero both resolve their band height from HERE, so there is a single ladder + a
// single set of functions instead of two near-identical copies. Built on the most-developed ladder
// (the Space cover, lib/spaces/hero-config.ts): its deliberately WELL-SEPARATED desktop heights
// (224 / 352 / 576px) so the three tiers read distinctly, and its real-width aspect derivation for a
// shape-accurate focal-crop preview. PURE + data-only (client-safe, no Tailwind runtime).
//
// Vocabulary: Short / Standard / Tall. The Space cover historically stored the middle tier as 'medium';
// asCoverHeight() maps that legacy value onto 'standard', so no data migration is needed. Distinct from
// the header ELEMENT's min-height ladder (lib/layout/header-sizes.ts: short/standard/large/tall) — that
// sizes the overlaid-content page header (content can grow it); this sizes a fixed-height cover band.

export type CoverHeight = 'short' | 'standard' | 'tall'

/** The tiers (ascending), for a height picker's options. */
export const COVER_HEIGHT_OPTIONS: readonly { value: CoverHeight; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'standard', label: 'Standard' },
  { value: 'tall', label: 'Tall' },
] as const

/** The default tier (the shipped middle height). */
export const COVER_HEIGHT_DEFAULT: CoverHeight = 'standard'

// Desktop band heights, well separated so Short / Standard / Tall step visibly (224 / 352 / 576px).
const COVER_HEIGHT_CLASS: Record<CoverHeight, string> = {
  short: 'h-48 sm:h-56',
  standard: 'h-72 sm:h-[22rem]',
  tall: 'h-[24rem] sm:h-[36rem]',
}
// The desktop (`sm` and up) pixel height of each tier, for the aspect derivation below.
const COVER_HEIGHT_PX: Record<CoverHeight, number> = { short: 224, standard: 352, tall: 576 }

/** The responsive Tailwind height utility for a tier. Pure + total. */
export function coverHeightClass(height: CoverHeight): string {
  return COVER_HEIGHT_CLASS[height]
}

// ── THE POSTER LADDER: the same tiers, one step shorter on a PHONE ───────────────────────────────
// A band showing a contain-fitted poster (components/media/poster-band.tsx) does not need the
// height a cropped one does. `object-cover` uses every pixel of the box, so the box IS the picture;
// `object-contain` fits the artwork inside it, and any height the artwork does not use becomes
// blurred backdrop. At the standard tier the Meld poster (1400x600) paints 380x163 on a 412px
// phone, so the shipped 306px band would have been 47% picture and 53% filler.
//
// The `sm:` half is IDENTICAL to COVER_HEIGHT_CLASS above, byte for byte, because from `sm` up the
// poster band still crops at the operator's focal point and must keep the height it has always had.
// Only the phone half moves, and it moves one rung down the ladder the tiers already describe
// (204 -> 170, 306 -> 221, 408 -> 306 at this app's 17px root).
//
// 🔴 A SEPARATE MAP, NOT AN EDIT TO THE ONE ABOVE. COVER_HEIGHT_CLASS is shared with the Business
// Space cover hero, which overlays its own title/eyebrow/actions lockup on the band — shortening
// that by 85px on a phone would crowd copy this change has not looked at. One ladder, two fits.
const POSTER_HEIGHT_CLASS: Record<CoverHeight, string> = {
  short: 'h-40 sm:h-56',
  standard: 'h-52 sm:h-[22rem]',
  tall: 'h-72 sm:h-[36rem]',
}

/** The responsive height utility for a CONTAIN-fitted poster band. Same tiers, same desktop
 *  heights, one rung shorter on a phone. Pure + total. */
export function posterHeightClass(height: CoverHeight): string {
  return POSTER_HEIGHT_CLASS[height]
}

/** The width:height aspect ratio of the cover at a tier, for a shape-accurate focal-crop preview (the
 *  preview must be the same SHAPE as the live band). `maxWidthPx` is the band's REAL render width in its
 *  surface (e.g. the Space profile's 1044px center column). Pure + total. */
export function coverAspect(height: CoverHeight, maxWidthPx: number): number {
  return maxWidthPx / COVER_HEIGHT_PX[height]
}

/** Narrow any value to a CoverHeight, mapping the legacy Space 'medium' onto 'standard'. Pure + total. */
export function asCoverHeight(v: unknown): CoverHeight | undefined {
  if (v === 'medium') return 'standard'
  return v === 'short' || v === 'standard' || v === 'tall' ? v : undefined
}
