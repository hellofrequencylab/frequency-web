import Link from 'next/link'
import { safeImageSrc } from '@/lib/safe-image-src'

// The in-app header wordmark. By DEFAULT renders the Frequency logo as an engraved,
// warm dark-sandy-brown fill (the wordmark PNG is an alpha mask) that lightly fades at rest,
// brightens on hover, and presses deeper on click (look + interaction live in
// `.brandmark` / `.brandmark-link`, app/globals.css). When the active Space sets a
// brand (a logo URL and/or a display name), that brand leads the header in place of
// the default mark, so a white-label Space looks like its own product. A Space logo is
// an operator-supplied URL (not a build-time asset), so it renders via a plain <img>
// like the other operator covers (circle-cover / channel-cover).
export function BrandMark({
  className = '',
  name = null,
  logoUrl = null,
}: {
  className?: string
  /** Active Space brand name; replaces the wordmark text, or labels the logo. */
  name?: string | null
  /** Active Space brand logo URL; rendered in place of the engraved wordmark. */
  logoUrl?: string | null
}) {
  // `min-w-0` makes this the header's flexible child, and it is load-bearing rather than tidy.
  // A flex item's default `min-width:auto` is its content size, so the mark refused to shrink and
  // the right-hand icon cluster — `justify-end`, so it overflows LEFTWARD — was painted straight
  // over the wordmark on every phone (measured: the header needs ~421px, an iPhone 14 is 390 and a
  // 360px Android is 69px short). The engraved mark is a mask at `contain`, so a narrower box
  // scales it down cleanly instead of cropping it; see the `max-w-full` on the span below.
  const linkClass = `brandmark-link group flex min-w-0 items-center pl-3.5 pr-2 md:px-5 ${className}`

  // Guarded: this is an operator-supplied URL out of a DB column reaching an <img src> sink,
  // which is the exact shape lib/safe-image-src.ts exists for. A rejected URL falls through to
  // the name (or the engraved wordmark) rather than painting a broken image in the header.
  const brandLogo = safeImageSrc(logoUrl)
  if (brandLogo) {
    return (
      <Link href="/feed" aria-label={`${name ?? 'Home'}, home feed`} className={linkClass}>
        {/* eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset */}
        <img src={brandLogo} alt={name ?? ''} className="h-[22px] md:h-8 w-auto min-w-0 max-w-[160px] object-contain" />
      </Link>
    )
  }

  if (name) {
    return (
      <Link href="/feed" aria-label={`${name}, home feed`} className={linkClass}>
        <span className="truncate font-display text-body-lg md:text-lead uppercase tracking-tight text-text">
          {name}
        </span>
      </Link>
    )
  }

  return (
    <Link href="/feed" aria-label="Frequency, home feed" className={linkClass}>
      {/* `max-w-full` is what turns the link's `min-w-0` into a real shrink. The mark's width is
          derived from its height by `aspect-ratio` (963/130 — the wordmark crop), which is an
          intrinsic size and therefore a floor, not a target: the box would keep its 163px and
          simply overhang. Capping it at the link's content box lets the mask's `contain` sizing
          scale the letterforms down on a narrow phone. */}
      <span className="brandmark h-[22px] max-w-full md:h-8" aria-hidden />
    </Link>
  )
}
