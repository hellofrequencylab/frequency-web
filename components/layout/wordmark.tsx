import Image from 'next/image'
import { SITE_NAME } from '@/lib/site'

// ── The wordmark image, in ONE place ──────────────────────────────────────────
//
// WHY THIS EXISTS. `<Image src="/frequency-logo.png" width={963} height={170}>` was copy-pasted
// into nine files, and that asset had the RETIRED tagline "A place to be human" baked into its
// pixels. scripts/check-canon.mjs bans that exact string; it scans .md/.ts/.tsx and is
// structurally incapable of reading a raster. So the one place the retired tagline still shipped
// was the one place the gate could never look — the header of essentially every page.
//
// A component instead of nine copies is the actual fix. The asset and its intrinsic size live
// here once, so swapping the artwork is a one-line change rather than a nine-file sweep where
// the eighth copy keeps the old dimensions and silently stretches the logo.
//
// THE CURRENT ASSET is the original `frequency-logo.png` cropped to its wordmark. The source had
// exactly one empty pixel row (y=130) between the Q's descender and the tagline, so the cut is
// provable and the letterforms are untouched — nothing was redrawn or re-traced.
//
// TO SWAP IN A NEW LOCKUP: replace `public/frequency-wordmark.png` and set WORDMARK_W/H to its
// real pixel size. Those two are next/image's ASPECT RATIO, not a display size — every call site
// sizes with `h-* w-auto`, so height is CSS-driven and any aspect works. Getting W/H wrong does
// not resize the mark, it STRETCHES it, which is the failure the nine hardcoded copies were one
// asset swap away from. `.brandmark` in app/globals.css masks the same file and now declares
// `aspect-ratio` itself, so there is no second number to keep in step — an earlier version of this
// note asked callers to do that and four of the five did not.
const WORDMARK_SRC = '/frequency-wordmark.png'
const WORDMARK_W = 963
const WORDMARK_H = 130

export function Wordmark({
  className,
  priority = false,
}: {
  /** Sizing + tone. Size with `h-* w-auto`; pass the surface's own invert rules. */
  className?: string
  /** Above-the-fold headers set this; footers and secondary marks should not. */
  priority?: boolean
}) {
  return (
    <Image
      src={WORDMARK_SRC}
      // The accessible name is the BRAND, not a description of the picture: on most surfaces
      // this sits inside a link, and "Frequency logo" would read as "Frequency logo, link".
      alt={SITE_NAME}
      width={WORDMARK_W}
      height={WORDMARK_H}
      priority={priority}
      className={className}
    />
  )
}
