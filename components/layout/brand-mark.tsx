import Link from 'next/link'

// The in-app header wordmark. By DEFAULT renders the Frequency logo as an engraved,
// warm dark-sandy-brown fill (the PNG is an alpha mask) that lightly fades at rest,
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
  const linkClass = `brandmark-link group flex items-center pl-3.5 pr-2 md:px-5 ${className}`

  if (logoUrl) {
    return (
      <Link href="/feed" aria-label={`${name ?? 'Home'}, home feed`} className={linkClass}>
        {/* eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset */}
        <img src={logoUrl} alt={name ?? ''} className="h-[22px] md:h-8 w-auto max-w-[160px] object-contain" />
      </Link>
    )
  }

  if (name) {
    return (
      <Link href="/feed" aria-label={`${name}, home feed`} className={linkClass}>
        <span className="font-display text-lg md:text-xl uppercase tracking-tight text-text">
          {name}
        </span>
      </Link>
    )
  }

  return (
    <Link href="/feed" aria-label="Frequency, home feed" className={linkClass}>
      <span className="brandmark h-[22px] md:h-8 aspect-[963/170]" aria-hidden />
    </Link>
  )
}
