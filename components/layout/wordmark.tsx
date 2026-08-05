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

// ── The LOCKUP proportions, as multiples of the MARK's height ─────────────────
//
// Every length in the lockup is an `em` inside a box whose font-size IS the mark height, so one
// number at the call site drives the whole thing and the parts cannot drift out of proportion.
//
// That indirection is load-bearing, and the first revision of this file got it wrong in a way
// worth recording. It sized the lockup with the caller's `h-9` and set the tagline to
// `text-[0.19em]`, on the assumption that `em` there meant "a fraction of the lockup's height".
// It does not: for `font-size`, `em` resolves against the PARENT's font-size, and nothing set
// one — so the tagline inherited the surrounding header (~17px) and rendered at ~3px. Worse, it
// rendered at a DIFFERENT size on every surface, since each header inherits its own font-size.
// Percentages resolve against height and `em` does not, so a lockup mixing the two is two
// sizing systems wearing one coat. Setting font-size on the lockup makes `em` mean what it
// already looked like it meant.
const TAGLINE_SIZE = 0.28 // tagline font-size ÷ mark height
const TAGLINE_GAP = 0.16 // gap between mark and tagline ÷ mark height

// `letterSpacing: 0.18em` is --tracking-eyebrow, the same small-caps spacing the `.eyebrow`
// utility gives the rest of the product. At that tracking the tagline measures ~5.1em wide
// against the mark's 7.41em (963/130), so it sits inside the mark's width and centres under it.
const TAGLINE_TRACKING = '0.18em'

type WordmarkProps = {
  /** Tone and spacing. Pass the surface's own invert rules. */
  className?: string
  /** Above-the-fold headers set this; footers and secondary marks should not. */
  priority?: boolean
} & (
  | {
      /** Mark alone. Size it with `h-* w-auto` in `className`. */
      tagline?: false
      mark?: never
    }
  | {
      /** Render the full LOCKUP — the wordmark over the tagline. */
      tagline: true
      /**
       * The MARK's height as a CSS length (e.g. `'2rem'`). Required, and deliberately not a
       * Tailwind `h-*` class: the tagline derives from this value, and a class name is not a
       * number this component can do arithmetic with. The lockup's rendered height comes out
       * TALLER than `mark` by the tagline and its gap, so size the slot, not the lockup.
       */
      mark: string
    }
)

export function Wordmark({ className, priority = false, tagline = false, mark }: WordmarkProps) {
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
  // WHERE THIS BELONGS. The tagline is 28% of the mark, so a header-sized mark (28px) puts it at
  // ~8px and a Discover-sized one (20px) at ~6px. Small caps at those sizes are a smudge, not a
  // design — which is why `tagline` is opt-in rather than the default, and why the headers take
  // the mark alone. The lockup goes where there is room for it.
  return (
    <span
      role="img"
      aria-label={`${SITE_NAME}. ${SITE_TAGLINE}.`}
      // font-size IS the mark height — see the note on TAGLINE_SIZE. Every `em` below is
      // therefore a fraction of the mark, which is what the proportions are expressed in.
      style={{ fontSize: mark }}
      className={`inline-flex flex-col items-center ${className ?? ''}`}
    >
      <Image
        src={WORDMARK_SRC}
        alt=""
        width={WORDMARK_W}
        height={WORDMARK_H}
        priority={priority}
        className="h-[1em] w-auto"
      />
      <span
        aria-hidden
        className="block w-full text-center font-bold uppercase leading-none"
        style={{
          fontSize: `${TAGLINE_SIZE}em`,
          // The gap is expressed in MARK units, so it is converted out of the tagline's own em.
          marginTop: `${TAGLINE_GAP / TAGLINE_SIZE}em`,
          letterSpacing: TAGLINE_TRACKING,
          // Tracking adds a trailing space after the final letter, which shifts centred text
          // visibly left. Indenting by the same amount puts the tagline back on the mark's axis.
          textIndent: TAGLINE_TRACKING,
        }}
      >
        {SITE_TAGLINE}
      </span>
    </span>
  )
}
