import Image from 'next/image'

// Optimized image for the marketing blocks. Uses next/image so visitors get
// responsive srcsets + AVIF/WebP automatically (a real LCP/bandwidth win, the
// one Phase that actually touches public-page speed).
//
// Two modes:
//  - `aspect` set (a crop ratio like "21/9") → fill inside a ratio box, cropped
//    with object-cover + the focal class.
//  - no `aspect` (natural / unknown intrinsic size) → the documented next/image
//    responsive pattern (width/height 0 + sizes + h-auto), uncropped.
export function SiteImage({
  src,
  alt,
  aspect,
  focal = 'object-center',
  sizes = '100vw',
  preload = false,
  className = '',
}: {
  src: string
  alt: string
  aspect?: string
  focal?: string
  sizes?: string
  /** Preload the image (use for an LCP element). Next 16 replaced `priority` with `preload`. */
  preload?: boolean
  className?: string
}) {
  if (!aspect) {
    return (
      <Image
        src={src}
        alt={alt}
        width={0}
        height={0}
        sizes={sizes}
        preload={preload}
        className={`w-full h-auto ${className}`}
      />
    )
  }
  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: aspect }}>
      <Image src={src} alt={alt} fill sizes={sizes} preload={preload} className={`object-cover ${focal}`} />
    </div>
  )
}
