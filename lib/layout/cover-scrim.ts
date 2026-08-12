// THE ONE cover-overlay vocabulary — None / Shade / Blend — and the ONE place it is translated into
// what `PageHero` actually draws. The sibling of lib/layout/cover-height.ts: that file is the single
// Short / Standard / Tall ladder every cover shares, this file is the single overlay set.
//
// WHY A TRANSLATION EXISTS AT ALL. Two vocabularies for one idea grew up separately:
//   • what an OPERATOR picks and what we STORE — 'none' | 'shade' | 'blend' (`CoverScrim`, first
//     shipped on Space profiles and stored under the `coverScrim` key of a jsonb bag), and
//   • what the RENDERER takes — 'none' | 'shadow' | 'fade' (`HeroOverlayStyle`, the `overlayStyle`
//     prop on components/templates/page-hero.tsx).
// Neither is wrong, and renaming either one rewrites either saved operator data or a shared
// component's public prop. So they stay, and `heroOverlayForScrim` is the ONE seam between them.
// Map it here or not at all: a second copy of `shade → shadow` in a page is how the two drift.
//
// STORAGE IS DELIBERATELY THE SAME KEY EVERYWHERE. A Space keeps it in `spaces.preferences`, a
// Circle in `circles.theme` — different columns on different tables, same `coverScrim` key, same
// reader and the same non-destructive merge (both re-exported below from the Space's already-shipped
// pure helpers, which validate the value and default to 'shade'). Nothing new to migrate, and an
// untouched entity keeps a sparse bag and renders exactly as it did.
//
// PURE + data-only, client-safe: no React, no DB, no Tailwind runtime.

import {
  readCoverScrim,
  nextCoverScrimPreferences,
  type CoverScrim,
} from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import type { HeroOverlayStyle } from '@/components/templates/page-hero'

export type { CoverScrim }

/** Read the chosen overlay out of ANY preferences/theme jsonb bag. Fail-safe to 'shade', which is
 *  the treatment that stays legible on any photo. Pure + total. */
export const readCoverScrimSetting = readCoverScrim

/** Merge a chosen overlay into an existing bag. Non-destructive: only `coverScrim` is written, every
 *  other key is preserved. Pure. */
export const writeCoverScrimSetting = nextCoverScrimPreferences

/** The overlay options, in picker order, with the copy the owner accepted on Spaces. Reused verbatim
 *  so the same control never says two different things in two places. */
export const COVER_SCRIM_OPTIONS: readonly { value: CoverScrim; label: string; tagline: string }[] = [
  { value: 'none', label: 'None', tagline: 'A clean photo with no overlay.' },
  { value: 'shade', label: 'Shade', tagline: 'A soft dark fade so your name stays readable on any photo.' },
  { value: 'blend', label: 'Blend', tagline: 'The photo melts into the page. Best with a calm image.' },
] as const

/** The default overlay when nobody has chosen one. */
export const COVER_SCRIM_DEFAULT: CoverScrim = 'shade'

/** THE mapping, and the only one: the operator's word for the overlay → the `overlayStyle` prop
 *  PageHero takes. Pure + total.
 *
 *    <PageHero overlayStyle={heroOverlayForScrim(readCoverScrimSetting(circle.theme))} … />
 */
export function heroOverlayForScrim(scrim: CoverScrim): HeroOverlayStyle {
  // shade → a dark scrim behind the overlaid identity. blend → the cover fades into the page
  // background. none → the clean photo, kept legible by the hero's own halo.
  return scrim === 'blend' ? 'fade' : scrim === 'none' ? 'none' : 'shadow'
}
