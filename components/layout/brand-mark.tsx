import Link from 'next/link'

// The in-app header wordmark. Renders the Frequency logo as an engraved, warm
// dark-sandy-brown fill (the PNG is an alpha mask) that lightly fades at rest,
// brightens on hover, and presses deeper on click. All the look + interaction
// lives in `.brandmark` / `.brandmark-link` (app/globals.css); this just wires
// the shape to the feed link and keeps the header padding it always had.
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/feed"
      aria-label="Frequency — home feed"
      className={`brandmark-link group flex items-center pl-1 pr-3 md:px-5 ${className}`}
    >
      <span className="brandmark h-7 md:h-8 aspect-[963/170]" aria-hidden />
    </Link>
  )
}
