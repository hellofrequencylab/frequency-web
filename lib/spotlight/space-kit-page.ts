// A SPACE'S THEMED SPOTLIGHT, THE SHARED OVERLAY. PURE.
// Every theme kit (Services, Designer, Temple, Free Human, Network) builds its Spotlight layouts from a kit profile's
// sample-free words. A Space's own Spotlight lays the Space's facts over that content: its name, tagline, photo, the
// links its owner added as the doors (else the kit's doors, pointed at this Space's own pages and dropped when the
// Space has no such page), and the closing call. The same function feeds the public page and the console preview, so
// the two cannot drift (owner, 2026-11-06: the editor showed one page and the link another).

import { safeUrl } from '@/lib/entity-blocks/block-content'

/** The kit's site paths, as this Space's own pages (app/(main)/spaces/[slug]/(profile)): a door never leads off the Space. */
const SPACE_PAGE: Record<string, string> = {
  '/book': 'book', '/services': 'book', '/reviews': 'reviews', '/events': 'events', '/meetups': 'events', '/gatherings': 'events',
  '/shop': 'shop', '/groups': 'circles', '/plans': 'memberships', '/membership': 'memberships', '/contact': 'contact',
}

export interface SpaceSpotlightFacts {
  slug: string
  name: string
  tagline: string | null
  /** `https://host` on a website host, empty on the app. */
  appOrigin?: string
  /** The owner's Links block, as saved. */
  links: { label: string; url: string }[]
  /** The owner's Button block, when it has a label and a safe address. */
  button: { label: string; href: string } | null
}

/** The facts a Space's saved Spotlight blocks hold: the Links and the Button. `content` is the grid's bag per block id. */
export function spaceFactsFromGrid(
  base: Pick<SpaceSpotlightFacts, 'slug' | 'name' | 'tagline' | 'appOrigin'>,
  content: unknown,
): SpaceSpotlightFacts {
  const bag = (id: string) => (content as Record<string, Record<string, unknown>> | undefined)?.[id]
  const raw = bag('links')?.items
  const links = (Array.isArray(raw) ? raw : [])
    .map((it: { label?: unknown; url?: unknown }) => ({ label: typeof it.label === 'string' ? it.label : '', url: safeUrl(it.url) }))
    .filter((it): it is { label: string; url: string } => Boolean(it.url && it.label))
  const btn = bag('button')
  const url = safeUrl(btn?.url)
  return { ...base, links, button: typeof btn?.label === 'string' && btn.label && url ? { label: btn.label, href: url } : null }
}

interface KitDoor { title: string; meta: string; href: string }
interface KitContentShape {
  name: string
  descriptor: string
  cta: { label: string; href: string }
  doors: KitDoor[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
}

/** Where a kit path lives on this Space, or null when the Space has no such page. */
function spacePage(facts: SpaceSpotlightFacts, href: string): string | null {
  const page = SPACE_PAGE[href]
  return page ? `${facts.appOrigin ?? ''}/spaces/${facts.slug}/${page}` : null
}

/** The host and path of a link, for a door's second line. */
function linkMeta(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return url
  }
}

/** Lay a Space's facts over a kit's sample-free content. The kit keeps its colour, type and layout; only words and
 *  addresses change. Generic over each kit's own content type, which all carry these five fields. */
export function overlaySpaceOnKit<C extends KitContentShape>(content: C, facts: SpaceSpotlightFacts): C {
  const own = facts.links.map((l, i) => ({ ...(content.doors[0] ?? {}), id: `link-${i}`, title: l.label, meta: linkMeta(l.url), href: l.url }))
  const seen = new Set<string>()
  const kitDoors = content.doors.flatMap((d) => {
    const href = spacePage(facts, d.href)
    if (!href || seen.has(href)) return []
    seen.add(href)
    return [{ ...d, href }]
  })
  const doors = (own.length ? own : kitDoors) as C['doors']
  const first = facts.links[0]
  const cta = facts.button ?? (first ? { label: first.label, href: first.url } : { label: content.cta.label, href: spacePage(facts, content.cta.href) ?? `${facts.appOrigin ?? ''}/spaces/${facts.slug}` })
  const featuredHref = spacePage(facts, content.featured.href)
  return {
    ...content,
    name: facts.name,
    descriptor: facts.tagline ?? '',
    cta,
    doors,
    // A featured card that has no page on this Space would lead nowhere: it points at the Space itself.
    featured: { ...content.featured, href: featuredHref ?? `${facts.appOrigin ?? ''}/spaces/${facts.slug}` },
  }
}
