import 'server-only'

// WHAT A TAG CAN OPEN, for the CyberUnicorn console's "Any page" tags. A Space's door placard keeps its
// own signed check-in (lib/devices/tag-actions.ts startSpaceTag). Every other tag opens a page: a
// Space, an event, a Journey, a practice, a Circle, a Channel, a person, a partner or its offer, one of the curated site
// destinations, or any Frequency link pasted in. Each one is written as a managed /q/<slug> code filed
// under that page's QR folder (ADR-179), so a tap shows up in the page's Scan activity next to its
// printed QR, counted apart as `medium = nfc`.
//
// Staff only. The search reads with the service role because staff program tags for any page, but it
// keeps the same public boundary universal search keeps: nothing private, draft or removed is offered,
// because a tag on a wall is a public link.

import { createAdminClient } from '@/lib/supabase/admin'
import { applySearchTerms } from '@/lib/search/query'
import { LISTABLE_CIRCLE_STATUS, isListedCircle } from '@/lib/circles/visibility'
import { SITE_DESTINATIONS } from '@/lib/qr/destinations'
import { publicUrlFor, SAFE_FALLBACK } from '@/lib/qr/public-url'
import { SITE_URL } from '@/lib/site'
import { DIRECTORY_VISIBILITY_COLUMNS, isListableInDirectory } from '@/lib/connections/directory-visibility'
import type { TagTarget } from './tag-target-kinds'

const PER_KIND = 4

/**
 * A pasted link to the public page a tag may open, or null when it is not one of ours or has no
 * public page. Takes a full URL (apex or www) or a root-relative path. An owner surface collapses to
 * its entity's public page, the same as a printed QR (lib/qr/public-url.ts), so a tag never opens
 * /manage or /admin. A link that only resolves to the safe fallback is refused rather than quietly
 * written as /discover.
 */
export function tagPathFromLink(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  let path: string
  if (text.startsWith('/')) {
    if (text.startsWith('//') || text.startsWith('/\\')) return null
    path = text
  } else {
    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    } catch {
      return null
    }
    const ours = new URL(SITE_URL).hostname.replace(/^www\./, '')
    if (url.hostname.replace(/^www\./, '') !== ours) return null
    path = url.pathname || '/'
  }
  const resolved = publicUrlFor(path)
  const asked = path.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/'
  if (resolved === SAFE_FALLBACK && asked !== SAFE_FALLBACK) return null
  return resolved
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
}

/** Pages a tag can open, matching `query`. A failed read drops that kind, never the whole list. */
export async function searchTagTargets(query: string): Promise<TagTarget[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const db = createAdminClient()
  const quiet = <T,>(p: PromiseLike<{ data: T[] | null }>) => Promise.resolve(p).then((r) => r.data ?? [], () => [] as T[])

  const [spaces, events, journeys, practices, circles, partners, offers, people, channels] = await Promise.all([
    quiet<{ name: string; brand_name: string | null; slug: string; tagline: string | null }>(
      applySearchTerms(db.from('spaces').select('name, brand_name, slug, tagline'), ['name', 'brand_name', 'slug'], q)
        .neq('visibility', 'private').eq('status', 'active').neq('type', 'root')
        .order('name').limit(PER_KIND),
    ),
    quiet<{ title: string; slug: string; starts_at: string | null; city: string | null }>(
      applySearchTerms(db.from('events').select('title, slug, starts_at, city'), ['title'], q)
        .eq('status', 'published').eq('visibility', 'public').eq('is_cancelled', false).is('removed_at', null)
        .gte('starts_at', new Date(Date.now() - 86_400_000).toISOString())
        .order('starts_at', { ascending: true }).limit(PER_KIND),
    ),
    quiet<{ title: string; slug: string }>(
      applySearchTerms(db.from('journey_plans').select('title, slug'), ['title'], q)
        .eq('visibility', 'public').neq('status', 'rejected')
        .order('title').limit(PER_KIND),
    ),
    quiet<{ title: string; slug: string | null; summary: string | null }>(
      applySearchTerms(db.from('practices').select('title, slug, summary'), ['title'], q)
        .eq('is_public', true).is('merged_into', null).eq('is_demo', false)
        .order('title').limit(PER_KIND),
    ),
    quiet<{ name: string; slug: string; neighborhood: string | null; unlisted: boolean | null }>(
      applySearchTerms(db.from('circles').select('name, slug, neighborhood, unlisted'), ['name'], q)
        .in('status', [...LISTABLE_CIRCLE_STATUS])
        .order('member_count', { ascending: false, nullsFirst: false }).limit(PER_KIND * 2),
    ),
    quiet<{ name: string; slug: string }>(
      applySearchTerms(db.from('partners').select('name, slug'), ['name'], q)
        .eq('status', 'active').order('name').limit(PER_KIND),
    ),
    quiet<{ title: string; partner: { name: string; slug: string; status: string } | null }>(
      applySearchTerms(db.from('partner_offers').select('title, partner:partners!partner_id ( name, slug, status )'), ['title'], q)
        .eq('active', true).limit(PER_KIND),
    ),
    // People: the same privacy boundary as universal search (directory switch, Ghost mode, the shared
    // /network predicate), because a tag on a wall is a public link to that person.
    quiet<{ id: string; display_name: string | null; handle: string | null; directory_visible: boolean | null; ghost_mode: boolean | null; discoverable_by: string | null; location_band: string | null }>(
      applySearchTerms(db.from('profiles').select(`id, display_name, handle, ${DIRECTORY_VISIBILITY_COLUMNS}`), ['display_name', 'handle'], q)
        .eq('directory_visible', true).eq('ghost_mode', false).eq('is_active', true)
        .order('display_name').limit(PER_KIND * 2),
    ),
    quiet<{ name: string; slug: string; category: string | null }>(
      applySearchTerms(db.from('topical_channels').select('name, slug, category'), ['name', 'slug'], q)
        .eq('is_active', true).order('name').limit(PER_KIND),
    ),
  ])

  const words = q.toLowerCase()
  const curated: TagTarget[] = SITE_DESTINATIONS.filter((d) => `${d.label} ${d.group} ${d.path}`.toLowerCase().includes(words))
    .slice(0, PER_KIND)
    .map((d) => ({ kind: 'page', label: d.label, detail: d.value, path: d.path }))

  return [
    ...spaces.map((s): TagTarget => ({ kind: 'space', label: s.brand_name?.trim() || s.name, detail: s.tagline, path: `/spaces/${s.slug}` })),
    ...events.map((e): TagTarget => ({ kind: 'event', label: e.title, detail: [shortDate(e.starts_at), e.city].filter(Boolean).join(' · ') || null, path: `/events/${e.slug}` })),
    ...journeys.map((j): TagTarget => ({ kind: 'journey', label: j.title, detail: null, path: `/journeys/${j.slug}` })),
    ...practices.filter((p) => p.slug).map((p): TagTarget => ({ kind: 'practice', label: p.title, detail: p.summary, path: `/practices/${p.slug}` })),
    ...circles.filter((c) => isListedCircle(c.unlisted)).slice(0, PER_KIND).map((c): TagTarget => ({ kind: 'circle', label: c.name, detail: c.neighborhood, path: `/circles/${c.slug}` })),
    ...people
      .filter((p) => p.handle && isListableInDirectory(p as Parameters<typeof isListableInDirectory>[0]))
      .slice(0, PER_KIND)
      .map((p): TagTarget => ({ kind: 'person', label: p.display_name?.trim() || `@${p.handle}`, detail: `@${p.handle}`, path: `/people/${p.handle}` })),
    ...channels.map((c): TagTarget => ({ kind: 'channel', label: c.name, detail: c.category, path: `/channels/${c.slug}` })),
    ...partners.map((p): TagTarget => ({ kind: 'partner', label: p.name, detail: null, path: `/partners/${p.slug}` })),
    ...offers
      .filter((o) => o.partner?.status === 'active')
      .map((o): TagTarget => ({ kind: 'offer', label: o.title, detail: `at ${o.partner!.name}`, path: `/partners/${o.partner!.slug}` })),
    ...curated,
  ]
}
