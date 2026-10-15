import { readProfileData, SPACE_SOCIAL_PLATFORMS } from '@/lib/spaces/profile-data'
import { spaceSchemaLocation } from '@/lib/spaces/schema-location'
import { readHeroConfig, resolveHero } from '@/lib/spaces/hero-config'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { safeUrl } from '@/lib/entity-blocks/block-content'
import { listEventsForSpace } from '@/lib/events/store'
import type { Space } from '@/lib/spaces/types'

// THE KEY FACTS A SIGNED-OUT VISITOR SEES BESIDE A SPACE (SCAN-883). The public Space page under
// Frequency is a two-column page: the Space's own blocks, and a side column with where it is, when it
// is open, how to reach it, what to do next and what is coming up. This module gathers those facts in
// one shape for both signed-out trees: the cached share root (app/(public)/spaces/[slug]/page.tsx) and
// the signed-out Space tabs ((main)/spaces/[slug]/(profile)/layout.tsx).
//
// 🔴 CACHED, VIEWER-FREE RENDERS (the Oct 8 outage). Nothing here reads a viewer: preferences are parsed
// purely, the address goes through the one precision rule (lib/spaces/schema-location.ts, so an
// 'approximate' Space never shows its street), and the events come from listEventsForSpace, which reads
// through the service-role client with the publication gate on (published, public or unlisted, not
// removed). No cookie client and no cookie or header read: the share root is ISR and must stay so.

export type PublicSpaceEvent = {
  slug: string
  title: string
  startsAt: string
  timeZone: string | null
  /** The city-level line when the host hid the address, else the venue or the free-text place. */
  place: string | null
}

export type PublicSpaceFacts = {
  /** Street and town lines, already trimmed to what the owner's location precision allows. */
  address: string[]
  /** Opening hours, free text, one line per row as the owner typed them. */
  hours: string | null
  phone: string | null
  email: string | null
  /** A safe absolute website URL, and the bare host to print. */
  website: { href: string; label: string } | null
  socials: { href: string; label: string }[]
  /** The Space's primary action (the same button its cover carries signed in: Book, Join, and so on). */
  cta: { href: string; label: string; external: boolean } | null
  /** The next few published events, soonest first, cancelled dropped. */
  events: PublicSpaceEvent[]
}

const clean = (v: string | null | undefined): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t.length ? t : null
}

/** A typed website ("royaltemple.org") is a link too: give it a scheme, then keep only http(s). PURE. */
export function publicWebsite(raw: string | null | undefined): { href: string; label: string } | null {
  const v = clean(raw)
  if (!v) return null
  const href = safeUrl(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
  if (!/^https?:/i.test(href)) return null
  try {
    return { href, label: new URL(href).host.replace(/^www\./, '') }
  } catch {
    return null
  }
}

/** The visible address lines for a Space, under the owner's precision choice. PURE. */
export function publicAddressLines(space: Parameters<typeof spaceSchemaLocation>[0], contactAddress?: string | null): string[] {
  const a = spaceSchemaLocation(space, contactAddress).address
  if (!a) return []
  const town = [a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [a.streetAddress, town].filter((l): l is string => !!l && l.trim().length > 0)
}

/** Everything the side column shows, read without a viewer. A failed event read drops the events,
 *  never the page. */
export async function readPublicSpaceFacts(space: Space, opts: { tagline?: string | null } = {}): Promise<PublicSpaceFacts> {
  const profile = readProfileData(space.preferences)
  const base = `/spaces/${space.slug}`
  const hero = resolveHero({
    config: readHeroConfig(space.preferences),
    preferences: space.preferences,
    base,
    brandName: space.brandName?.trim() || space.name,
    tagline: opts.tagline ?? null,
    defaultCtaLabel: defaultPrimaryCtaLabel(space.type),
  })
  const ctaHref = hero.cta.show ? safeUrl(hero.cta.href) : ''

  const rows = await listEventsForSpace(space.id, { limit: 6, upcomingOnly: true }).catch(() => [])
  const events: PublicSpaceEvent[] = rows
    .filter((e) => !e.is_cancelled && !!e.slug)
    .slice(0, 3)
    .map((e) => {
      const town = [e.city, e.region].map((p) => p?.trim()).filter(Boolean).join(', ')
      const place = e.hide_address === true ? town || null : clean(e.venue_name) || clean(e.location) || town || null
      return { slug: e.slug as string, title: e.title, startsAt: e.starts_at, timeZone: e.time_zone ?? null, place }
    })

  const socialLabel = (platform: string) =>
    SPACE_SOCIAL_PLATFORMS.find((p) => p.key === platform)?.label ?? null
  const socials = (profile.socials ?? [])
    .map((s) => ({ href: safeUrl(s.url), label: socialLabel(s.platform) }))
    .filter((s): s is { href: string; label: string } => /^https?:/i.test(s.href) && !!s.label)

  return {
    address: publicAddressLines(space, profile.address),
    hours: clean(profile.hours),
    phone: clean(profile.phone),
    email: clean(profile.email),
    website: publicWebsite(profile.website),
    socials,
    cta: ctaHref ? { href: ctaHref, label: hero.cta.label, external: hero.cta.external } : null,
    events,
  }
}
