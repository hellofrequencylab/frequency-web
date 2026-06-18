// Pure validation + normalization for per-route SEO fields (lib/page-settings). Kept
// dependency-free so it is unit-tested and shared by the save action. Bounds the text and
// rejects an unsafe share-image URL (no javascript:, no plain http) before anything is stored.

export interface SeoInput {
  title?: string | null
  description?: string | null
  /** Compact social-share / OG image (link previews). */
  ogImage?: string | null
  /** Wide page header / banner image. */
  headerImage?: string | null
}

export interface SeoFields {
  seo_title: string | null
  seo_description: string | null
  og_image_url: string | null
  header_image_url: string | null
}

const TITLE_MAX = 120
const DESC_MAX = 320

function clamp(v: string | null | undefined, max: number): string | null {
  const s = (v ?? '').trim()
  return s ? s.slice(0, max) : null
}

/** A share-image URL is safe iff it is a root-relative path (`/...`, not `//...`) or an
 *  https URL — mirrors the Space-branding `isSafeLogoUrl` check. Empty is fine (no image). */
export function isSafeOgUrl(v: string | null | undefined): boolean {
  const s = (v ?? '').trim()
  if (!s) return true
  if (s.startsWith('/') && !s.startsWith('//')) return true
  try {
    return new URL(s).protocol === 'https:'
  } catch {
    return false
  }
}

/** Normalize + bound the SEO input into storable fields, or null if either image URL is unsafe. */
export function normalizeSeo(input: SeoInput): SeoFields | null {
  if (!isSafeOgUrl(input.ogImage) || !isSafeOgUrl(input.headerImage)) return null
  const og = (input.ogImage ?? '').trim()
  const header = (input.headerImage ?? '').trim()
  return {
    seo_title: clamp(input.title, TITLE_MAX),
    seo_description: clamp(input.description, DESC_MAX),
    og_image_url: og || null,
    header_image_url: header || null,
  }
}
