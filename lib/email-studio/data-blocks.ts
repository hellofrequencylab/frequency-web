import 'server-only'

// The SEND-TIME data binding for the Event and Circle cards (EMAIL-025), the Product card's two siblings
// (lib/email-studio/product-block.ts). Each card carries a REFERENCE (the picked row's id) plus a SNAPSHOT of
// the title / lines / image / link taken when it was picked. Just before an EmailDoc is rendered
// (lib/email-studio/send.ts), resolveDataBlockRefs refreshes every placed card from the live row, so an email
// always ships the current date, venue, cover and link. Fail-safe, like the Product card: a removed or
// unreadable row keeps the last-known snapshot, never a blank or a crash. The renderer stays pure (it reads
// the bag); the live read lives here, which is what makes a reads-live block legal in email
// (docs/EDITOR-ARCHITECTURE.md T-2, ADR-977).
//
// Server-only: the reads go through the admin client so a scheduled send (no session) resolves the same as
// the composer. Voice canon: no em dashes in any copy this module emits.

import { createAdminClient } from '@/lib/supabase/admin'
import { formatEventWhen } from '@/lib/time/zone'
import { resolveEventHeroUrl } from '@/lib/events/hero-url'
import { LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import type { EmailRenderLayout } from './render-layout'
import { legacySpaceLayoutWriteError } from '@/lib/entity-blocks/legacy-write-guard'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'

// Canonical site URL, inlined from the env rather than imported from @/lib/site (the same fan-out reasoning
// as product-block.ts: lib/site drags the nav registry into every send compile).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://frequencylocal.com'

/** The public event page. */
function eventUrl(slug: string): string {
  return `${SITE_URL}/events/${slug}`
}

/** The public circle page. */
function circleUrl(slug: string): string {
  return `${SITE_URL}/circles/${slug}`
}

/** What the Event card stores and renders. `when` is the absolute date line in the event's own zone. */
export interface EventCardSnapshot {
  title: string
  when: string
  where: string
  image: string
  url: string
}

/** What the Circle card stores and renders. */
export interface CircleCardSnapshot {
  title: string
  blurb: string
  image: string
  url: string
}

interface EventRow {
  id: string
  slug: string | null
  title: string | null
  starts_at: string | null
  time_zone: string | null
  venue_name: string | null
  city: string | null
  hide_address: boolean | null
  is_cancelled: boolean | null
  removed_at: string | null
  cover_image_path: string | null
  poster_path: string | null
  details: Record<string, unknown> | null
}

interface CircleRow {
  id: string
  slug: string | null
  name: string | null
  about: string | null
  image_url: string | null
  status: string | null
}

const EVENT_COLUMNS =
  'id, slug, title, starts_at, time_zone, venue_name, city, hide_address, is_cancelled, removed_at, cover_image_path, poster_path, details'
const CIRCLE_COLUMNS = 'id, slug, name, about, image_url, status'

/** A one-line "where" for an event: the venue when the host shows it, else the city, else nothing. */
export function eventWhereLine(ev: Pick<EventRow, 'venue_name' | 'city' | 'hide_address'>): string {
  const venue = ev.hide_address ? '' : (ev.venue_name ?? '').trim()
  const city = (ev.city ?? '').trim()
  if (venue && city && venue !== city) return `${venue}, ${city}`
  return venue || city
}

/** The first sentence or so of a circle's About, bounded for a card. */
export function circleBlurb(about: string | null | undefined, max = 160): string {
  const text = (about ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))
  return `${cut.slice(0, stop > 40 ? stop : max).trim()}...`
}

async function eventSnapshot(ev: EventRow): Promise<EventCardSnapshot> {
  let image = ''
  try {
    image = (await resolveEventHeroUrl(ev)) ?? ''
  } catch {
    image = ''
  }
  const title = ev.is_cancelled && ev.title ? `Cancelled: ${ev.title}` : (ev.title ?? '')
  return {
    title,
    when: formatEventWhen(ev.starts_at, ev.time_zone),
    where: eventWhereLine(ev),
    image,
    url: ev.slug ? eventUrl(ev.slug) : '',
  }
}

function circleSnapshot(c: CircleRow): CircleCardSnapshot {
  return {
    title: c.name ?? '',
    blurb: circleBlurb(c.about),
    image: c.image_url ?? '',
    url: c.slug ? circleUrl(c.slug) : '',
  }
}

/** One event as a send-ready snapshot, or null when it is gone (removed, or unreadable). */
export async function loadEventSnapshot(id: string): Promise<EventCardSnapshot | null> {
  try {
    const { data } = await createAdminClient().from('events').select(EVENT_COLUMNS).eq('id', id).is('removed_at', null).maybeSingle()
    return data ? eventSnapshot(data as unknown as EventRow) : null
  } catch {
    return null
  }
}

/** One circle as a send-ready snapshot, or null when it is gone (archived, draft, or unreadable). */
export async function loadCircleSnapshot(id: string): Promise<CircleCardSnapshot | null> {
  try {
    const { data } = await createAdminClient()
      .from('circles')
      .select(CIRCLE_COLUMNS)
      .eq('id', id)
      .in('status', [...LISTABLE_CIRCLE_STATUS])
      .maybeSingle()
    return data ? circleSnapshot(data as unknown as CircleRow) : null
  } catch {
    return null
  }
}

/** A Space's upcoming events (operator view: any visibility), soonest first, as pick-ready snapshots. */
export async function listSpaceEventSnapshots(spaceId: string, limit = 12): Promise<Array<EventCardSnapshot & { id: string }>> {
  try {
    const { data } = await createAdminClient()
      .from('events')
      .select(EVENT_COLUMNS)
      .or(`host_space_id.eq.${spaceId},space_id.eq.${spaceId}`)
      .gte('starts_at', new Date().toISOString())
      .is('removed_at', null)
      .order('starts_at', { ascending: true })
      .limit(limit)
    const rows = (data ?? []) as unknown as EventRow[]
    return Promise.all(rows.map(async (ev) => ({ id: ev.id, ...(await eventSnapshot(ev)) })))
  } catch {
    return []
  }
}

/** A Space's live circles (forming or active), newest first, as pick-ready snapshots. */
export async function listSpaceCircleSnapshots(spaceId: string, limit = 12): Promise<Array<CircleCardSnapshot & { id: string }>> {
  try {
    const { data } = await createAdminClient()
      .from('circles')
      .select(CIRCLE_COLUMNS)
      .eq('space_id', spaceId)
      .in('status', [...LISTABLE_CIRCLE_STATUS])
      .order('created_at', { ascending: false })
      .limit(limit)
    return ((data ?? []) as unknown as CircleRow[]).map((c) => ({ id: c.id, ...circleSnapshot(c) }))
  } catch {
    return []
  }
}

// ── The compile step ────────────────────────────────────────────────────────────────────────────────────

/** The two data-bound cards this module owns: the block id, the key its ref sits under, and the loader. */
const DATA_CARDS: ReadonlyArray<{ block: 'eventCard' | 'circleCard'; refKey: string; load: (id: string) => Promise<Record<string, string> | null> }> = [
  { block: 'eventCard', refKey: 'event', load: (id) => loadEventSnapshot(id) as Promise<Record<string, string> | null> },
  { block: 'circleCard', refKey: 'circle', load: (id) => loadCircleSnapshot(id) as Promise<Record<string, string> | null> },
]

function refId(bag: Record<string, unknown>, refKey: string): string {
  const ref = bag[refKey] as { id?: unknown } | undefined
  return typeof ref?.id === 'string' ? ref.id.trim() : ''
}

/** Refresh one card's bag from its live row; the stored snapshot stays when the row is gone. */
async function refreshBag(bag: Record<string, unknown>, card: (typeof DATA_CARDS)[number]): Promise<Record<string, unknown>> {
  const id = refId(bag, card.refKey)
  if (!id) return bag
  const fresh = await card.load(id)
  if (!fresh) return bag // graceful: keep the last-known snapshot
  const next: Record<string, unknown> = { ...bag }
  for (const [k, v] of Object.entries(fresh)) {
    // A live value wins; an empty live value keeps the snapshot (a cover that failed to sign is not "no cover").
    if (typeof v === 'string' && v) next[k] = v
    else if (typeof bag[k] !== 'string') next[k] = v
  }
  return next
}

/**
 * Refresh every placed Event card and Circle card from the live rows. Walks a native node tree (each
 * placement owns its bag; bench and hidden nodes stay as stored) or a legacy layout (one bag per block id).
 * Returns a NEW layout, never mutates the input, and is fail-safe: any error yields the input unchanged.
 */
export async function resolveDataBlockRefs<T extends EmailRenderLayout>(layout: T): Promise<T> {
  try {
    if (legacySpaceLayoutWriteError(layout, null)) {
      const native = upgradeLayout(layout)
      if (!native) return layout
      const rows = await Promise.all(native.rows.map(async (row) => ({
        ...row,
        cells: await Promise.all(row.cells.map(async (cell) => Promise.all(cell.map(async (node) => {
          const card = DATA_CARDS.find((c) => c.block === node.type)
          if (!card || node.hidden || !node.content) return node
          return { ...node, content: await refreshBag(node.content, card) }
        })))),
      })))
      return { ...native, rows } as unknown as T
    }
    const src = (layout as EntityLayout).content
    if (!src || typeof src !== 'object') return layout
    const content = { ...(src as Record<string, Record<string, unknown>>) }
    let changed = false
    for (const card of DATA_CARDS) {
      const bag = content[card.block]
      if (!bag || typeof bag !== 'object') continue
      // The key is a fixed literal from DATA_CARDS, never a user value, so the computed write is injection-safe.
      content[card.block] = await refreshBag(bag, card)
      changed = true
    }
    return changed ? ({ ...layout, content } as T) : layout
  } catch {
    return layout
  }
}
