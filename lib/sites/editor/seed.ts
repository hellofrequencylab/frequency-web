import { isAssetRef } from '@/lib/library/asset-ref'
import type { Data, ContentItem } from '@/lib/page-editor/types'
import { parseEntityLayout, resolveRows } from '@/lib/entity-blocks/layout'
import { readSiteHero } from '@/lib/spaces/website'
import { readHeroConfig } from '@/lib/spaces/hero-config'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import type { WebsiteTheme } from './state'
import type { Space } from '@/lib/spaces/types'

const TYPES: Record<string, string> = {
  editorial: 'EditorialSection', cardGrid: 'CardGrid', zigzag: 'Zigzag', features: 'FeatureGrid',
  accentBeat: 'AccentBeat', photoHero: 'PhotoHero', displayHeading: 'DisplayHeading', prose: 'Prose',
  heading: 'Heading', text: 'Text', image: 'Image', gallery: 'Gallery', quote: 'Quote', divider: 'Divider',
  events: 'SpaceEvents', circles: 'SpaceCommunity', practices: 'SpacePractices', faq: 'SpaceFAQ',
  offerings: 'SpaceOfferings', memberships: 'SpaceCTA', contactForm: 'SpaceContact',
  about: 'SpaceAbout', story: 'SpaceAbout', stats: 'SpaceHighlights', booking: 'SpaceBooking',
  journeys: 'SpacePractices', team: 'SpaceTeam', reviews: 'SpaceReviews', contact: 'SpaceContact', business: 'SpaceBusiness',
  callout: 'SpaceCallout', links: 'LinkTree', embed: 'SpotlightEmbed',
}

/** Import original content and original asset URLs once; never the screenshot crops. */
export function seedWebsiteHome(space: Space, fallback: Data): Data {
  const prefs = (space.preferences ?? {}) as Record<string, unknown>
  const grid = parseEntityLayout(prefs.profileLayout)
  if (!grid) return withWebsiteIds(fallback)
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
    if (!type) continue
    const authored = grid.content?.[id]
    const originals = fallback.content.filter((block) => block.type === type)
    if (!authored && originals.length) {
      content.push(...originals.map((block, index) => ({ ...block, props: { ...block.props, id: `website-${id}-${index}` } })))
    } else content.push({ type, props: { ...entityWebsiteProps(id, authored ?? {}), id: `website-${id}` } })
  }
  return { root: {}, content }
}

export function withWebsiteIds(doc: Data): Data {
  const ids = new Set<string>()
  let count = 0
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize)
    if (!value || typeof value !== 'object') return value
    const object = value as Record<string, unknown>
    const next = Object.fromEntries(Object.entries(object).map(([key, child]) => [key, normalize(child)]))
    if (typeof next.type === 'string' && next.props && typeof next.props === 'object' && !Array.isArray(next.props)) {
      const props = next.props as Record<string, unknown>
      let id = typeof props.id === 'string' && props.id.trim() ? props.id : `website-${count++}`
      while (ids.has(id)) id = `website-${count++}`
      ids.add(id); next.props = { ...props, id }
    }
    return next
  }
  return { ...doc, content: normalize(doc.content.filter((b) => b.type !== 'SpaceIdentityHeader')) as ContentItem[] }
}

/** Bridge the existing entity rail's authored field names to registered page blocks. */
export function entityWebsiteProps(id: string, p: Record<string, unknown>): Record<string, unknown> {
  const shared = { ...p }
  if (id === 'heading') return { ...shared, title: p.text ?? p.title ?? '' }
  if (id === 'text') return { ...shared, body: p.text ?? p.body ?? '' }
  if (id === 'image') return { ...shared, image: p.src ?? p.image ?? '' }
  if (id === 'quote') return { ...shared, quote: p.text ?? p.quote ?? '', attribution: p.by ?? p.attribution ?? '' }
  if (id === 'gallery') return { ...shared, items: Array.isArray(p.images) ? p.images.map((image) => typeof image === 'string' || isAssetRef(image) ? { image } : { ...image, image: image.src ?? image.image ?? '' }) : p.items ?? [] }
  if (id === 'editorial' || id === 'zigzag') return { ...shared, lead: p.body ?? p.lead ?? '', body: id === 'editorial' ? 'prose' : 'lead' }
  if (id === 'features') return { ...shared, items: Array.isArray(p.items) ? p.items.map((item) => ({ ...item, body: item.text ?? item.body ?? '', href: item.url ?? item.href ?? '' })) : [] }
  if (id === 'cardGrid') return { ...shared, cards: Array.isArray(p.cards) ? p.cards.map((card) => ({ ...card, body: card.text ?? card.body ?? '' })) : [] }
  if (id === 'photoHero') return { ...shared, display: p.display ?? 'overlay', actionPrimaryLabel: p.buttonOn === false ? '' : p.buttonLabel ?? '', actionPrimaryHref: p.buttonUrl ?? '' }
  if (id === 'accentBeat') return { ...shared, mode: 'cta', ctaLabel: p.buttonOn === false ? '' : p.buttonLabel ?? '', ctaHref: p.buttonUrl ?? '' }
  if (id === 'memberships') return { ...shared, heading: p.title ?? p.heading ?? 'Memberships', ctaLabel: p.ctaLabel ?? 'View memberships', ctaHref: '/book' }
  if (['about', 'story', 'callout', 'events', 'circles', 'practices', 'journeys', 'offerings', 'contactForm', 'reviews', 'faq', 'team'].includes(id)) return { ...shared, heading: p.title ?? p.heading ?? '' }
  return shared
}

export function initialWebsiteTheme(preferences: unknown): WebsiteTheme {
  const p = preferences && typeof preferences === 'object' ? preferences as Record<string, unknown> : {}
  const theme = typeof p.websiteTheme === 'string' ? p.websiteTheme : typeof p.theme === 'string' ? p.theme : ''
  if (theme.toLowerCase() === 'midnight') return 'Midnight'
  if (theme.toLowerCase() === 'dawn') return 'DAWN'
  return parseSpaceTheme(preferences) === 'menswork' || theme.toLowerCase() === 'menswork' ? 'Menswork' : 'DAWN'
}
