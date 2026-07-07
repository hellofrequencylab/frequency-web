// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — image ORDER → draft MEDIA (Importer v2). PURE. The operator's ordered seed
// images (inputs.images, first-is-primary) must flow onto the DRAFT's media so the materializer paints
// them on the page: the primary becomes the hero image (draft.media.heroPath → the cover + the photoHero
// block), the rest become the gallery. When the HERO is LOCKED the current hero image is frozen: it stays
// the hero regardless of order, and the gallery is the remaining images. Framework-free + unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

import type { BusinessProfile, ProfileMedia } from './schema'

/** Resolve the hero image + gallery from an ordered image list. When `lockHero` and a `currentHero` is
 *  given, the current hero stays the hero and the gallery is the rest; otherwise the first image leads.
 *  PURE + total. */
export function mediaFromOrder(
  order: string[],
  opts: { lockHero?: boolean; currentHero?: string | null } = {},
): { heroPath?: string; gallery: string[] } {
  const clean = order.filter((u) => typeof u === 'string' && u.length > 0)
  if (opts.lockHero && opts.currentHero) {
    return { heroPath: opts.currentHero, gallery: clean.filter((u) => u !== opts.currentHero) }
  }
  if (clean.length === 0) return { gallery: [] }
  const [first, ...rest] = clean
  return { heroPath: first, gallery: rest }
}

/** Return a COPY of `draft` with its media.heroPath + media.gallery set from the ordered image list
 *  (honouring a hero lock). Never mutates the input. Other media fields (logoPath) are preserved. PURE. */
export function withImageOrder(
  draft: BusinessProfile,
  order: string[],
  opts: { lockHero?: boolean } = {},
): BusinessProfile {
  const currentHero = draft.media?.heroPath ?? null
  const { heroPath, gallery } = mediaFromOrder(order, { lockHero: opts.lockHero, currentHero })
  const media: ProfileMedia = { ...(draft.media ?? {}) }
  if (heroPath) media.heroPath = heroPath
  else delete media.heroPath
  if (gallery.length) media.gallery = gallery
  else delete media.gallery
  return { ...draft, media }
}
