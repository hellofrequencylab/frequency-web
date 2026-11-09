// THE CYBERWITCH SPACE SPOTLIGHT: the content a CyberWitch Space's /spaces/<slug>/spotlight page draws in the theme's own
// Stack layout (components/spotlight/space-spotlight.tsx). PURE: the Space and its saved Spotlight blocks in, the layout's
// content out.
import type { Space } from '@/lib/spaces/types'
import { safeUrl } from '@/lib/entity-blocks/block-content'
import { readSiteStyle } from '@/lib/theme/site-style'
import { cyberwitchKitSpotlightContent, type CyberWitchSpotlightContent } from '@/lib/spotlight/cyberwitch-kit-content'

/** The kit's site paths, as this Space's own pages (app/(main)/spaces/[slug]/(profile)): a door never leads off the Space. */
const CYBERWITCH_SPACE_PAGE: Record<string, string> = {
  '/book': 'book', '/services': 'book', '/reviews': 'reviews', '/events': 'events', '/shop': 'shop', '/groups': 'circles',
  '/plans': 'memberships', '/contact': 'contact',
}

/** A CyberWitch Space's Spotlight wears the theme's own Stack layout (owner, 2026-11-05: every surface of the theme looks
 *  like its template page), in the Space's neon: arch portrait (its logo), the name in blackletter, its tagline, the
 *  sticker button and riveted doors. Links the owner added are the doors; with none, the kit's doors open this Space's own
 *  pages. Null for any other theme: the block page renders as before. */
export function cyberwitchSpacePage(space: Pick<Space, 'slug' | 'name' | 'brandName' | 'brandAccent' | 'brandLogoUrl' | 'preferences'>, tagline: string | null, content: unknown, appOrigin?: string): CyberWitchSpotlightContent | null {
  if (readSiteStyle(space.preferences).theme !== 'cyberwitch') return null
  const base = `${appOrigin ?? ''}/spaces/${space.slug}`
  const page = (href: string) => (CYBERWITCH_SPACE_PAGE[href] ? `${base}/${CYBERWITCH_SPACE_PAGE[href]}` : base)
  const c = cyberwitchKitSpotlightContent('general', { name: space.brandName?.trim() || space.name, sample: false, accent: space.brandAccent ?? undefined, portrait: space.brandLogoUrl ?? undefined })
  const bag = (id: string) => (content as Record<string, Record<string, unknown>> | undefined)?.[id]
  const raw = bag('links')?.items
  const links = (Array.isArray(raw) ? raw : [])
    .map((it: { label?: unknown; url?: unknown }) => ({ label: typeof it.label === 'string' ? it.label : '', url: safeUrl(it.url) }))
    .filter((it): it is { label: string; url: string } => Boolean(it.url && it.label))
  const btn = bag('button')
  const btnUrl = safeUrl(btn?.url)
  const doors = links.length
    ? links.map((l, i) => ({ id: `link-${i}`, key: 'publish' as const, icon: 'bolt' as const, title: l.label, meta: l.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), href: l.url }))
    // Only the doors this Space has a page for, one door per page: no placeholder door leads nowhere.
    : c.doors.filter((d, i, all) => CYBERWITCH_SPACE_PAGE[d.href] && CYBERWITCH_SPACE_PAGE[d.href] !== 'book' && all.findIndex((x) => CYBERWITCH_SPACE_PAGE[x.href] === CYBERWITCH_SPACE_PAGE[d.href]) === i)
      .map((d) => ({ ...d, href: page(d.href) }))
  return {
    ...c,
    descriptor: '',
    pain: tagline ?? '',
    cta: typeof btn?.label === 'string' && btn.label && btnUrl ? { label: btn.label, href: btnUrl } : { label: c.cta.label, href: page(c.cta.href) },
    featured: { ...c.featured, href: page(c.featured.href) },
    doors,
  }
}
