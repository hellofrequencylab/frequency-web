import { resolveWebsiteBrand, type WebsiteSnapshot } from '@/lib/sites/editor/state'

// THE SPACE'S VISUAL BRAND IN ITS WEBSITE HEADER (LIVE-699). The website's header, share card and tab
// title all wear the Space's stored brand (spaces.brand_name, brand_logo_url, brand_accent, edited in
// Identity and branding and the admin brand editor), and a published website draft may override the name,
// logo and accent for the website alone (WebsiteSnapshot.chrome and .brand). This is the ONE place that
// order is decided, so the metadata and the page can never disagree about whose name is on the door.
//
// FALLBACKS, in order: a website chrome name, else the stored brand name, else the Space name; the website
// brand logo when the draft set or cleared one, else the stored logo, else none (the header draws the name
// alone); the website accent when set or cleared, else the stored accent, else null (the type's default
// accent takes over, lib/spaces/profile-config.ts). Pure, so the probe and the suite run it as shipped.

interface SiteBrandSource {
  name: string
  brandName?: string | null
  brandLogoUrl?: string | null
  brandAccent?: string | null
}

interface SiteHeaderBrand {
  /** The name the header, title and share card carry. Never empty. */
  name: string
  /** The header logo, or null for a name-only header. */
  logo: string | null
  /** The accent the site paints with, or null for the type's default. */
  accent: string | null
}

export function resolveSiteHeaderBrand(space: SiteBrandSource, website: WebsiteSnapshot | null): SiteHeaderBrand {
  const stored = space.brandName?.trim() || space.name.trim() || 'Your Space'
  const chromeName = website?.chrome?.name?.trim()
  const brand = resolveWebsiteBrand(website, { logo: space.brandLogoUrl ?? null, accent: space.brandAccent ?? null })
  return { name: chromeName || stored, logo: brand.logo, accent: brand.accent }
}
