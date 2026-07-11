// READ-ONLY Market projection of ticketed EVENTS into the Tickets rail (ADR-596 / audit #2, and
// NAMING.md "Ticket"). Today the Tickets rail shows only commerce_products with product_kind
// 'ticket' (authored in the Shop console). A ticketed event is "a thin projection of a ticketed
// event": events stay the SOURCE OF TRUTH. This module NEVER writes commerce_products rows and
// adds no schema. It reads listable, upcoming/ongoing events that carry >= 1 ACTIVE ticket tier and
// shapes each into a MarketItem the ProductCard already renders, with an explicit `href` that
// deep-links to the event's ticket flow (/events/<slug>) instead of /market/<id>.
//
// Query shape mirrors the memberCount batching pattern in lib/spaces/discovery.ts: ONE events read
// + ONE grouped ticket-tiers read keyed by event_id (never N+1), plus small batched spaces + host
// reads for owner labels. All columns read here are in the generated DB types, so the typed admin
// client is used throughout (no untyped casts).
//
// FAIL-SOFT by construction: any error yields [] so the rail degrades to "just commerce tickets"
// rather than throwing.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { posterSignedUrlMap } from '@/lib/events/poster-media'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import type { MarketItem } from './types'

/** One read-only ticketed-event projection. A MarketItem with a guaranteed `href` (the event ticket
 *  flow) and `projected: true`, so the Tickets rail renders it through the shared ProductCard while
 *  it can never route to /market/<id> (which would 404 — there is no commerce_products row). */
export type ProjectedTicket = MarketItem & { href: string; projected: true }

/** The active-tier fields we read to compute a "from" price. Mirrors event_ticket_types. */
type TierRow = {
  event_id: string
  pricing_mode: string
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
}

/** The event fields the projection reads. */
type EventRow = {
  id: string
  slug: string
  title: string
  description: string | null
  currency: string | null
  starts_at: string
  is_demo: boolean | null
  cover_image_path: string | null
  poster_path: string | null
  space_id: string | null
  host_id: string | null
  organizer_name: string | null
}

/**
 * The cheapest active tier's effective price, in whole cents, or `null` when the event is free (no
 * tier carries a positive price). Per-tier effective price: a `fixed` tier uses `price_cents`; a
 * buyer-chosen mode (pwyc / sliding_scale / donation) uses `suggested_cents` then `min_cents`; a
 * `free` tier contributes nothing. The "from" price is the minimum positive effective price across
 * the active tiers. PURE — the unit under test.
 */
export function ticketFromPriceCents(tiers: TierRow[]): number | null {
  const priced = tiers
    .map((t) =>
      t.pricing_mode === 'free' ? 0 : t.price_cents ?? t.suggested_cents ?? t.min_cents ?? 0,
    )
    .filter((c): c is number => typeof c === 'number' && c > 0)
  return priced.length ? Math.min(...priced) : null
}

/**
 * List READ-ONLY Market projections of ticketed events for the Tickets rail. Returns listable
 * (`visibility='public'`, `status='published'`, not cancelled) events that are upcoming OR ongoing
 * and carry >= 1 ACTIVE ticket tier, soonest first. Each item is shaped for the shared ProductCard:
 * a synthetic id (`event:<id>`), the event title/description, a cover image (uploaded cover, else the
 * scanned poster), a "from" price (null when free), an explicit `href` to /events/<slug>, the owner
 * label (hosting Space name if space-owned, else the host / organizer) surfaced as the card's context
 * line, `productKind: 'ticket'`, and `projected: true`. FAIL-SOFT: `[]` on any error.
 */
export async function listTicketedEventProjections(
  opts: { limit?: number } = {},
): Promise<ProjectedTicket[]> {
  try {
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100)
    const now = new Date()
    const nowIso = now.toISOString()
    // "Upcoming" floors at the start of TODAY in the community HOME zone (starts_at stores the
    // wall-clock as UTC parts) so an event later today still lists; "ongoing" is any event whose
    // end is still in the future. One OR captures both (mirrors app/(main)/events/index-data.ts).
    const listableFrom = `${dayInZone(now, HOME_TZ)}T00:00:00.000Z`
    const admin = createAdminClient()

    // ── ONE events read ──────────────────────────────────────────────────────────────
    const { data: eventData, error: eventErr } = await admin
      .from('events')
      .select(
        'id, slug, title, description, currency, starts_at, is_demo, cover_image_path, poster_path, space_id, host_id, organizer_name',
      )
      .eq('visibility', 'public')
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .or(`starts_at.gte.${listableFrom},ends_at.gte.${nowIso}`)
      .order('starts_at', { ascending: true })
      .limit(limit)
      .returns<EventRow[]>()
    if (eventErr || !eventData || eventData.length === 0) return []
    const events = eventData

    // ── ONE grouped ticket-tiers read keyed by event_id (batched, never N+1) ──────────
    const eventIds = events.map((e) => e.id)
    const { data: tierData } = await admin
      .from('event_ticket_types')
      .select('event_id, pricing_mode, price_cents, min_cents, suggested_cents')
      .in('event_id', eventIds)
      .eq('active', true)
      .returns<TierRow[]>()
    const tiersByEvent = new Map<string, TierRow[]>()
    for (const t of tierData ?? []) {
      const list = tiersByEvent.get(t.event_id) ?? []
      list.push(t)
      tiersByEvent.set(t.event_id, list)
    }

    // Only events that actually have an active tier are ticketed events worth projecting.
    const ticketed = events.filter((e) => (tiersByEvent.get(e.id)?.length ?? 0) > 0)
    if (ticketed.length === 0) return []

    // Owner labels: batched spaces + host-profile reads (fail-soft to no names).
    const spaceIds = [...new Set(ticketed.map((e) => e.space_id).filter((id): id is string => !!id))]
    const spaceNames = new Map<string, string>()
    if (spaceIds.length > 0) {
      const { data: spaceRows } = await admin.from('spaces').select('id, name, brand_name').in('id', spaceIds)
      for (const s of spaceRows ?? []) {
        spaceNames.set(s.id, s.brand_name?.trim() || s.name?.trim() || '')
      }
    }
    const hostIds = [...new Set(ticketed.map((e) => e.host_id).filter((id): id is string => !!id))]
    const hostNames = new Map<string, string>()
    if (hostIds.length > 0) {
      const { data: hostRows } = await admin.from('profiles').select('id, display_name').in('id', hostIds)
      for (const h of hostRows ?? []) {
        if (h.display_name?.trim()) hostNames.set(h.id, h.display_name.trim())
      }
    }

    // Cover images: uploaded cover (public event-media URL) leads; else the scanned poster (a
    // short-lived signed URL from the private bucket, batch-signed in one storage call).
    const posterPaths = ticketed
      .filter((e) => !e.cover_image_path && e.poster_path)
      .map((e) => e.poster_path as string)
    const posterUrlByPath = posterPaths.length ? await posterSignedUrlMap(posterPaths) : new Map<string, string>()

    return ticketed.map((e): ProjectedTicket => {
      let cover: string | null = null
      if (e.cover_image_path) {
        cover = admin.storage.from('event-media').getPublicUrl(e.cover_image_path).data?.publicUrl ?? null
      } else if (e.poster_path) {
        cover = posterUrlByPath.get(e.poster_path) ?? null
      }
      const spaceName = e.space_id ? spaceNames.get(e.space_id) : ''
      const hostName = e.host_id ? hostNames.get(e.host_id) : ''
      const ownerLabel = spaceName || hostName || e.organizer_name?.trim() || 'Frequency'
      return {
        id: `event:${e.id}`,
        ownerKind: e.space_id ? 'space' : 'profile',
        ownerProfileId: e.host_id ?? null,
        ownerSpaceId: e.space_id ?? null,
        entityId: '',
        productKind: 'ticket',
        vertical: 'shop',
        title: e.title,
        description: e.description ?? null,
        images: cover ? [cover] : [],
        priceCents: ticketFromPriceCents(tiersByEvent.get(e.id) ?? []),
        currency: e.currency ?? 'usd',
        stock: null,
        category: ownerLabel,
        status: 'active',
        bookingSpaceId: null,
        condition: null,
        marketPublished: true,
        tags: [],
        metadata: {},
        isDemo: !!e.is_demo,
        createdAt: e.starts_at,
        updatedAt: e.starts_at,
        href: `/events/${e.slug}`,
        projected: true,
      }
    })
  } catch {
    return []
  }
}
