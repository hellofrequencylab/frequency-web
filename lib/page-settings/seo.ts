import { normalizeObjectPosition } from '@/lib/images/focal-point'

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
  /** Focal point for the header image, a CSS object-position string ("x% y%"). */
  headerFocal?: string | null
}

export interface SeoFields {
  seo_title: string | null
  seo_description: string | null
  og_image_url: string | null
  header_image_url: string | null
  /** Focal point for the header image ("x% y%"); NULL = centered crop. */
  header_image_focal: string | null
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

/** Normalize + bound the SEO input into storable fields, or null if either image URL is unsafe.
 *  The header focal point is normalized through the focal-point helper (centered/empty → null), so
 *  only a deliberately-moved focal point is ever stored, and a focal point with no header image is
 *  dropped so it never lingers. */
export function normalizeSeo(input: SeoInput): SeoFields | null {
  if (!isSafeOgUrl(input.ogImage) || !isSafeOgUrl(input.headerImage)) return null
  const og = (input.ogImage ?? '').trim()
  const header = (input.headerImage ?? '').trim()
  return {
    seo_title: clamp(input.title, TITLE_MAX),
    seo_description: clamp(input.description, DESC_MAX),
    og_image_url: og || null,
    header_image_url: header || null,
    header_image_focal: header ? normalizeObjectPosition(input.headerFocal) : null,
  }
}

// The two on-page panes that EDIT these fields (the settings spine, ADR-268): "Basics"
// owns the identity half (title + header image), "SEO & meta" owns the search half
// (description + share image). They save independently, so a save MUST only touch the fields
// its pane owns — otherwise saving one pane would null the other's fields on the shared row.
export type SeoPane = 'basics' | 'meta'

/** The storable field KEYS each pane owns. The save path normalizes the full input, then
 *  writes back ONLY these keys (merged over the existing row), so the other pane is untouched. */
export const SEO_PANE_FIELDS: Record<SeoPane, readonly (keyof SeoFields)[]> = {
  basics: ['seo_title', 'header_image_url', 'header_image_focal'],
  meta: ['seo_description', 'og_image_url'],
}

/** Normalize the input, then keep only the fields the given pane owns (or all fields when no
 *  pane is given). Returns null when an image URL is unsafe (the whole save is rejected, as
 *  before). Used by the partial-merge save so each pane writes back just its own columns. */
export function normalizeSeoForPane(input: SeoInput, pane?: SeoPane): Partial<SeoFields> | null {
  const full = normalizeSeo(input)
  if (!full) return null
  if (!pane) return full
  const out: Partial<SeoFields> = {}
  for (const key of SEO_PANE_FIELDS[pane]) out[key] = full[key]
  return out
}
