// THE CIRCLE COVER'S TWO PIECES (owner, 2026-11-20: "Needs the mindless background with the logo over it
// fully in screen"). The band behind is a picture; the owning Space's logo sits over it whole, never cropped.
// A Circle whose own image IS its Space's logo (Mindless Carlsbad saved the logo as its image) gets the Space's
// header behind instead, so the logo shows once, in full, on top of the background.

type SpaceBits = { type: string; cover_image_url?: string | null; brand_logo_url?: string | null } | null | undefined

/** The path of an image URL, so an absolute and a site-relative link to the same file compare equal. */
function imagePath(url: string): string {
  try {
    return new URL(url, 'https://x.invalid').pathname
  } catch {
    return url
  }
}

export function circleCoverArt(imageUrl: string | null | undefined, space: SpaceBits): {
  background: string | null
  logo: string | null
} {
  const owned = !!space && space.type !== 'root'
  const logo = owned ? space?.brand_logo_url || null : null
  const spaceCover = owned ? space?.cover_image_url || null : null
  const own = imageUrl || null
  const ownIsLogo = !!own && !!logo && imagePath(own) === imagePath(logo)
  const background = own && !ownIsLogo ? own : spaceCover ?? (logo ? null : own)
  return { background, logo }
}
