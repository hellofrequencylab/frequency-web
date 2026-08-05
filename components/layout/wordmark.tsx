import Image from 'next/image'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'

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
  tagline = false,
}: {
  /** Sizing + tone. Size with `h-* w-auto`; pass the surface's own invert rules. */
  className?: string
  /** Above-the-fold headers set this; footers and secondary marks should not. */
  priority?: boolean
  /** Render the full LOCKUP — the wordmark over the tagline — instead of the mark alone. */
  tagline?: boolean
}) {
  if (!tagline) {
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

  // THE LOCKUP: the mark, then the tagline as TEXT rather than baked pixels.
  //
  // The retired tagline shipped for months on every page precisely because it was pixels —
  // scripts/check-canon.mjs bans the string and cannot read a raster, so the gate was blind by
  // construction. Set as text it is scannable by that gate, it inherits the theme instead of
  // needing a `dark:invert`, it stays crisp at any DPR, and it survives in email where images
  // are routinely blocked. Baking it back into the PNG would rebuild the exact trap.
  //
  // The string comes from SITE_TAGLINE, so the lockup, the OG card, the meta description and
  // the email footer can never disagree about what the tagline is.
  //
  // SIZING IS CONTAINER-RELATIVE, and that is the load-bearing part. The caller's `h-*` sizes
  // the whole LOCKUP, and the mark takes 68% of it with the tagline in the remainder — so
  // `h-7` stays 28px tall and no header grows. Stacking a tagline UNDER a mark that already
  // owned the full height would have added ~18px to every header on the site.
  //
  // `tracking-[0.18em]` is --tracking-eyebrow, the same small-caps spacing the .eyebrow utility
  // gives the rest of the product.
  return (
    <span
      role="img"
      aria-label={`${SITE_NAME}. ${SITE_TAGLINE}.`}
      className={`inline-flex flex-col items-center justify-between ${className ?? ''}`}
    >
      <Image
        src={WORDMARK_SRC}
        alt=""
        width={WORDMARK_W}
        height={WORDMARK_H}
        priority={priority}
        className="h-[68%] w-auto"
      />
      <span
        aria-hidden
        className="block w-full text-center text-[0.19em] font-bold uppercase leading-none tracking-[0.18em]"
      >
        {SITE_TAGLINE}
      </span>
    </span>
  )
}
