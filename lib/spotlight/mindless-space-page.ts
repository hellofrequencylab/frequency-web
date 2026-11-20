// THE MINDLESS SPACE SPOTLIGHT: the content a Mindless Space's /spaces/<slug>/spotlight page draws in the theme's own
// Stack layout (components/spotlight/space-spotlight.tsx). PURE: the Space and its saved Spotlight blocks in, the layout's
// content out.
import type { Space } from '@/lib/spaces/types'
import { safeUrl } from '@/lib/entity-blocks/block-content'
import { linkDoorStyle, markedMainLink } from '@/lib/spotlight/door-style'
import { readSiteStyle } from '@/lib/theme/site-style'
import { mindlessKitSpotlightContent, type MindlessSpotlightContent } from '@/lib/spotlight/mindless-kit-content'

/** The kit's site paths, as this Space's own pages (app/(main)/spaces/[slug]/(profile)): a door never leads off the Space. */
const MINDLESS_SPACE_PAGE: Record<string, string> = {
  '/book': 'book', '/services': 'book', '/reviews': 'reviews', '/events': 'events', '/shop': 'shop', '/groups': 'circles',
  '/plans': 'memberships', '/contact': 'contact',
}

/** A Mindless Space's Spotlight wears the theme's own Stack layout (owner, 2026-11-05: every surface of the theme looks
 *  like its template page), in the Space's paint: round portrait (its logo), the name in the drip display, its tagline, the
 *  sticker button and raised doors. Links the owner added are the doors; with none, the kit's doors open this Space's own
 *  pages. Null for any other theme: the block page renders as before. */
export function mindlessSpacePage(space: Pick<Space, 'slug' | 'name' | 'brandName' | 'brandAccent' | 'brandLogoUrl' | 'preferences'>, tagline: string | null, content: unknown, appOrigin?: string): MindlessSpotlightContent | null {
  if (readSiteStyle(space.preferences).theme !== 'mindless') return null
  const base = `${appOrigin ?? ''}/spaces/${space.slug}`
  const page = (href: string) => (MINDLESS_SPACE_PAGE[href] ? `${base}/${MINDLESS_SPACE_PAGE[href]}` : base)
  const c = mindlessKitSpotlightContent('general', { name: space.brandName?.trim() || space.name, sample: false, accent: space.brandAccent ?? undefined, portrait: space.brandLogoUrl ?? undefined })
  const bag = (id: string) => (content as Record<string, Record<string, unknown>> | undefined)?.[id]
  const raw = bag('links')?.items
  const links = (Array.isArray(raw) ? raw : [])
    .map((it: { label?: unknown; url?: unknown; style?: unknown }) => ({ label: typeof it.label === 'string' ? it.label : '', url: safeUrl(it.url), style: it.style }))
    .filter((it): it is { label: string; url: string; style: unknown } => Boolean(it.url && it.label))
  const btn = bag('button')
  const btnUrl = safeUrl(btn?.url)
  const button = typeof btn?.label === 'string' && btn.label && btnUrl ? { label: btn.label, href: btnUrl } : null
  // Each link in the style the owner picked, and the link they marked main is the button when there is no Button block
  // (LIVE-2487). Unmarked, the theme's own sticker button stays, so a text link never turns into it.
  const blockStyle = bag('links')?.linkStyle
  const marked = button ? null : markedMainLink(links)
  const doors = links.length
    ? links.flatMap((l, i) => {
      if (l === marked) return []
      const style = linkDoorStyle(l, blockStyle)
      return [{ id: `link-${i}`, key: 'publish' as const, icon: 'bolt' as const, title: l.label, meta: l.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: l.url, ...(style ? { style } : {}) }]
    })
    // Only the doors this Space has a page for, one door per page: no placeholder door leads nowhere.
    : c.doors.filter((d, i, all) => MINDLESS_SPACE_PAGE[d.href] && MINDLESS_SPACE_PAGE[d.href] !== 'book' && all.findIndex((x) => MINDLESS_SPACE_PAGE[x.href] === MINDLESS_SPACE_PAGE[d.href]) === i)
      .map((d) => ({ ...d, href: page(d.href) }))
  return {
    ...c,
    descriptor: '',
    pain: tagline ?? '',
    cta: button ?? (marked ? { label: marked.label, href: marked.url } : { label: c.cta.label, href: page(c.cta.href) }),
    featured: { ...c.featured, href: page(c.featured.href) },
    doors,
  }
}
