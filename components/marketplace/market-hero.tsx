import { PageHero } from '@/components/templates/page-hero'
import type { PageHeroSize, PageHeroVariant } from '@/components/templates'

// MARKET HERO — the commerce/browse section header (Classifieds / Market / Frequency Store / Housing,
// and the browse indexes that adopted it). It is now a THIN wrapper over the canonical PageHero (the one
// site-wide header band, THEME-PROTOCOL "structure" layer): the `center` + `large` variant with an
// in-hero search. Keeping the same props means every caller is unchanged, but the header is now
// single-sourced and TOKEN-CLEAN — the old inline `rgb(20 18 16 / …)` scrim + `text-white` are gone, so
// these heroes theme + dark-mode correctly like the rest of the site. Voice-canon copy comes from the
// caller (no em dashes).
export function MarketHero({
  image,
  focal,
  eyebrow,
  title,
  subtitle,
  search,
  action,
  variant = 'overlay',
  size = 'large',
  overlay = true,
}: {
  image: string
  /** Focal point ("x% y%") so the crop keeps the subject in frame. */
  focal?: string | null
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  /** The instant search bar (MarketSearchBar), rendered inside the hero. */
  search?: React.ReactNode
  action?: React.ReactNode
  /** The layout variant, forwarded to PageHero. Defaults to the shipped centered `overlay`. */
  variant?: PageHeroVariant
  /** Band height, forwarded to PageHero. Defaults to the tall directory `large`. */
  size?: PageHeroSize
  /** Draw the ink overlay (scrim). Default on. */
  overlay?: boolean
}) {
  return (
    <PageHero
      coverImage={image}
      coverFocus={focal}
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      search={search}
      actions={action}
      variant={variant}
      size={size}
      overlay={overlay}
    />
  )
}
