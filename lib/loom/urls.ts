// A tiny guard for URLs coming back from the Loom picker. Picker assets are always Supabase Storage
// PUBLIC object URLs (getPublicUrl -> https://<ref>.supabase.co/storage/v1/object/public/<bucket>/...).
// The setter actions that persist a picked URL straight into a rendered `src` column validate with this
// so a caller can't smuggle an arbitrary URL into an image column. PURE + framework-free.

/** Is `url` an https Supabase Storage PUBLIC object URL (the shape the Loom picker returns)? */
export function isLoomPublicImageUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.pathname.includes('/storage/v1/object/public/')
  } catch {
    return false
  }
}

/** Is this Loom file a vector (SVG)? Read from the stored mime first, then the url's extension.
 *  The Studio's Upscale chip and the upscale op both ask it (LIVE-589): a vector is sharp at any
 *  size, and Recraft's upscale endpoints take a raster only. PURE, so client and server share it. */
export function isVectorFile(mime: string | null | undefined, url: string | null | undefined): boolean {
  if (mime && /svg/i.test(mime)) return true
  if (!url) return false
  const path = url.split(/[?#]/)[0] ?? ''
  return /\.svgz?$/i.test(path)
}
