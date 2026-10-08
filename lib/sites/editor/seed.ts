import type { Data, ContentItem } from '@/lib/page-editor/types'
import { parseEntityLayout, resolveRows } from '@/lib/entity-blocks/layout'
import { readSiteHero } from '@/lib/spaces/website'
import { readHeroConfig } from '@/lib/spaces/hero-config'
import type { Space } from '@/lib/spaces/types'

const TYPES: Record<string, string> = {
  editorial: 'EditorialSection', cardGrid: 'CardGrid', zigzag: 'Zigzag', features: 'Features',
  accentBeat: 'AccentBeat', photoHero: 'PhotoHero', displayHeading: 'DisplayHeading', prose: 'Prose',
  heading: 'Heading', text: 'Text', image: 'Image', gallery: 'Gallery', quote: 'Quote', divider: 'Divider',
  events: 'SpaceEvents', circles: 'SpaceCommunity', practices: 'SpacePractices', faq: 'SpaceFAQ',
  offerings: 'SpaceOfferings', memberships: 'SpaceMemberships', contactForm: 'SpaceContact',
}

/** Import original content and original asset URLs once; never the screenshot crops. */
export function seedWebsiteHome(space: Space, fallback: Data): Data {
  const prefs = (space.preferences ?? {}) as Record<string, unknown>
  const grid = parseEntityLayout(prefs.profileLayout)
  if (!grid?.rows?.length) return withWebsiteIds(fallback)
  const name = space.brandName?.trim() || space.name
  const hero = readSiteHero(prefs)
  const profileHero = readHeroConfig(prefs)
  const content: ContentItem[] = [{ type: 'PhotoHero', props: {
    id: 'website-hero', content: 'below', variant: 'image', title: hero.heading ?? profileHero.heading ?? name,
    eyebrow: hero.eyebrow ?? profileHero.eyebrow ?? '',
    subtitle: hero.tagline ?? profileHero.tagline ?? space.tagline ?? '',
    image: space.coverImageUrl ?? '', alt: name,
    actionPrimaryLabel: hero.action?.label ?? '', actionPrimaryHref: hero.action?.href ?? '',
    actionSecondaryLabel: hero.secondary?.label ?? '', actionSecondaryHref: hero.secondary?.href ?? '',
  } }]
  for (const row of resolveRows(grid, 'space')) for (const id of row.cells.flat()) {
    const type = TYPES[id]
    if (type) content.push({ type, props: { ...(grid.content?.[id] ?? {}), id: `website-${id}` } })
  }
  return { root: {}, content }
}

export function withWebsiteIds(doc: Data): Data {
  return { ...doc, content: doc.content.filter((b) => b.type !== 'SpaceIdentityHeader').map((b, i) => ({ ...b, props: { ...b.props, id: b.props.id || `website-${i}` } })) }
}
