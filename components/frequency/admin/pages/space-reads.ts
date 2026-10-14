import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { DAY_MS, type CheckinRow } from './checkin-stats'

// THE SPACE READS THE FREQUENCY ADMIN BODIES ADD (Overview, Contacts, Economy). Read-only, fail-quiet, and
// rendered only behind the Space console's manage gate (the bodies' callers authorized first).
//
// CHECK-INS. The verified check-in ledger is `engagement_events` (practice.verified), written by the event
// check-in action with `context.eventId` and `context.kind = 'event_checkin'` (app/(main)/events/actions.ts),
// the same rows loadEventCoreStats counts per event. A Space's check-ins are those rows for the Space's own
// events. A read failure returns null, so a body shows the design's empty value rather than a zero.
//
// REVENUE BY WEEK. spaceEarningsSummary is the one canonical earnings read (orders, tickets and gifts, with
// partial refunds netted). It takes a trailing window, so a week is the difference of two windows: the
// same arithmetic, never a second copy of it.

const EVENT_BATCH = 100
// PostgREST caps every response at max_rows (1000, supabase/config.toml), whatever .limit() asks for, so
// both reads page with .range() until a short page. The ceilings only bound a runaway read.
const PAGE = 1000
const MAX_EVENTS = 5_000
const MAX_ROWS = 50_000

/** The Space's events whose start falls after `sinceIso` (all of them when omitted), newest first, capped. */
async function spaceEventIds(spaceId: string, sinceIso?: string): Promise<string[]> {
  let q = createAdminClient().from('events').select('id').eq('space_id', spaceId)
  // Check-ins land on or after an event's day, so an event that started before the window holds none of
  // the window's rows (the margin covers a multi-day event).
  if (sinceIso) q = q.gte('starts_at', new Date(Date.parse(sinceIso) - 14 * DAY_MS).toISOString())
  const ids: string[] = []
  for (let from = 0; from < MAX_EVENTS; from += PAGE) {
    const { data, error } = await q.order('starts_at', { ascending: false }).order('id').range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { id: string }[]
    for (const r of rows) ids.push(r.id)
    if (rows.length < PAGE) break
  }
  return ids
}

/** Every verified check-in on this Space's events since `sinceDays` ago (all time when omitted). Null on a
 *  read failure. Request-cached, so Overview's KPIs, chart and Needs-you share one read. */
export const loadSpaceCheckins = cache(async (spaceId: string, sinceDays?: number): Promise<CheckinRow[] | null> => {
  if (!spaceId) return []
  try {
    const since = sinceDays ? new Date(Date.now() - sinceDays * DAY_MS).toISOString() : undefined
    const ids = await spaceEventIds(spaceId, since)
    if (ids.length === 0) return []
    const out: CheckinRow[] = []
    for (let i = 0; i < ids.length && out.length < MAX_ROWS; i += EVENT_BATCH) {
      for (let from = 0; out.length < MAX_ROWS; from += PAGE) {
        let q = createAdminClient()
          .from('engagement_events')
          .select('id, actor_profile_id, created_at, event_id:context->>eventId')
          .eq('event_type', 'practice.verified')
          .eq('context->>kind', 'event_checkin')
          .in('context->>eventId', ids.slice(i, i + EVENT_BATCH))
        if (since) q = q.gte('created_at', since)
        const { data, error } = await q.order('id').range(from, from + PAGE - 1)
        if (error) throw error
        const rows = (data ?? []) as unknown as { actor_profile_id: string | null; created_at: string; event_id: string | null }[]
        for (const r of rows) {
          const at = Date.parse(r.created_at)
          if (r.actor_profile_id && Number.isFinite(at)) out.push({ profileId: r.actor_profile_id, at, ...(r.event_id ? { eventId: r.event_id } : {}) })
        }
        if (rows.length < PAGE) break
      }
    }
    return out
  } catch (error) {
    console.error('[frequency/admin] space check-ins read failed:', error)
    return null
  }
})

export interface RevenueSeries {
  /** Net cents per week, oldest first; the last week ends now. */
  weeks: number[]
  last30: number
  prior30: number
}

/** Net revenue per week for the last `weeks` weeks, and the last two 30-day windows. Null on a failure. */
export const loadSpaceRevenueSeries = cache(async (spaceId: string, weeks = 12): Promise<RevenueSeries | null> => {
  if (!spaceId) return null
  try {
    const windows = Array.from({ length: weeks }, (_, i) => (i + 1) * 7)
    const [cumulative, d30, d60] = await Promise.all([
      Promise.all(windows.map((days) => spaceEarningsSummary(spaceId, days, true))),
      spaceEarningsSummary(spaceId, 30, true),
      spaceEarningsSummary(spaceId, 60, true),
    ])
    const nets = cumulative.map((s) => s.netCents)
    // nets[i] covers the last (i+1) weeks; week i (newest first) is its difference from the window before.
    const newestFirst = nets.map((v, i) => v - (i === 0 ? 0 : nets[i - 1]))
    return { weeks: newestFirst.reverse(), last30: d30.netCents, prior30: d60.netCents - d30.netCents }
  } catch (error) {
    console.error('[frequency/admin] space revenue series read failed:', error)
    return null
  }
})

export interface MembershipBilling {
  /** Paying memberships: an active Stripe subscription whose payment status reconciled to active. */
  paying: number
  /** Their list price normalised to a month, in cents (a yearly price divided by 12). */
  monthlyCents: number
}

type LooseRows<T> = {
  select: (cols: string) => LooseQuery<T>
}
type LooseQuery<T> = {
  eq: (col: string, v: string) => LooseQuery<T>
  in: (col: string, v: string[]) => LooseQuery<T>
  not: (col: string, op: string, v: null) => LooseQuery<T>
  order: (col: string) => LooseQuery<T>
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
}

/** What the Space's paying memberships bring in a month, at each tier's list price (Memberships head:
 *  "$2,860 a month"). Only a membership with a Stripe subscription whose payment status is `active` counts;
 *  a free join, a pending one and a past-due one do not, so the figure is never a price list times a member
 *  count. Yearly memberships count a twelfth of their yearly price; a one-time tier counts nothing. Read-only,
 *  paged past the row cap; null on a read failure (the body shows the empty value). The table and the two
 *  ADR-1374 columns are read loose: they are newer than lib/database.types.ts (the memberships module's seam). */
export const loadSpaceMembershipBilling = cache(async (spaceId: string): Promise<MembershipBilling | null> => {
  if (!spaceId) return null
  try {
    const admin = createAdminClient()
    const memberships: { tier_id: string; billing_interval: string | null }[] = []
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await (admin.from('space_memberships') as unknown as LooseRows<{ tier_id: string; billing_interval: string | null }>)
        .select('tier_id, billing_interval')
        .eq('space_id', spaceId)
        .eq('status', 'active')
        .eq('payment_status', 'active')
        .not('stripe_subscription_id', 'is', null)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = data ?? []
      memberships.push(...rows)
      if (rows.length < PAGE) break
    }
    if (memberships.length === 0) return { paying: 0, monthlyCents: 0 }
    type TierPrice = { id: string; price_cents: number | null; annual_price_cents: number | null; interval: string | null }
    const tierIds = [...new Set(memberships.map((m) => m.tier_id))]
    const { data: tiers, error } = await (admin.from('space_membership_tiers') as unknown as LooseRows<TierPrice>)
      .select('id, price_cents, annual_price_cents, interval')
      .eq('space_id', spaceId)
      .in('id', tierIds)
      .order('id')
      .range(0, PAGE - 1)
    if (error) throw error
    const price = new Map((tiers ?? []).map((t) => [t.id, t]))
    let monthly = 0
    for (const m of memberships) {
      const t = price.get(m.tier_id)
      if (!t) continue
      const cents = t.price_cents ?? 0
      if (t.interval === 'once') continue
      // A tier published before ADR-1374 as a yearly twin bills price_cents once a year.
      if (t.interval === 'year') monthly += cents / 12
      else if (m.billing_interval === 'year' && t.annual_price_cents && t.annual_price_cents > 0) monthly += t.annual_price_cents / 12
      else monthly += cents
    }
    return { paying: memberships.length, monthlyCents: Math.round(monthly) }
  } catch (error) {
    console.error('[frequency/admin] space membership billing read failed:', error)
    return null
  }
})

export interface FollowerCounts {
  total: number
  /** Follows that began in the last 30 days. An unfollow deletes its row, so there is no honest prior
   *  period to compare with, and the KPI carries this as a note rather than a trend. */
  last30: number
}

/** The Space's followers (space_follows), all time and the last 30 days. Two exact head counts, so no row
 *  cap applies. Null on a read failure. */
export const loadSpaceFollowerCounts = cache(async (spaceId: string): Promise<FollowerCounts | null> => {
  if (!spaceId) return null
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString()
    const [all, recent] = await Promise.all([
      admin.from('space_follows').select('id', { count: 'exact', head: true }).eq('space_id', spaceId),
      admin.from('space_follows').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).gte('created_at', since),
    ])
    if (all.error) throw all.error
    if (recent.error) throw recent.error
    return { total: all.count ?? 0, last30: recent.count ?? 0 }
  } catch (error) {
    console.error('[frequency/admin] space follower counts read failed:', error)
    return null
  }
})

/** Every going RSVP (event, person) on these events, paged past the row cap. Null on a read failure. */
export async function loadGoingRsvps(eventIds: readonly string[]): Promise<{ eventId: string; profileId: string }[] | null> {
  if (eventIds.length === 0) return []
  try {
    const out: { eventId: string; profileId: string }[] = []
    for (let i = 0; i < eventIds.length; i += EVENT_BATCH) {
      for (let from = 0; out.length < MAX_ROWS; from += PAGE) {
        const { data, error } = await createAdminClient()
          .from('event_rsvps')
          .select('id, event_id, profile_id')
          .in('event_id', eventIds.slice(i, i + EVENT_BATCH))
          .eq('status', 'going')
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        const rows = (data ?? []) as { event_id: string | null; profile_id: string | null }[]
        for (const r of rows) if (r.event_id && r.profile_id) out.push({ eventId: r.event_id, profileId: r.profile_id })
        if (rows.length < PAGE) break
      }
    }
    return out
  } catch (error) {
    console.error('[frequency/admin] going RSVPs read failed:', error)
    return null
  }
}

export interface CircleTotals {
  /** Circles the Space holds that are not archived (every visibility: an owner read). */
  circles: number
  /** Their member_count, summed: seats, so a person in two Circles counts twice. */
  seats: number
}

/** The Space's live Circles and the seats in them, paged past the row cap. Null on a read failure. */
export const loadSpaceCircleTotals = cache(async (spaceId: string): Promise<CircleTotals | null> => {
  if (!spaceId) return null
  try {
    let circles = 0
    let seats = 0
    for (let from = 0; from < MAX_EVENTS; from += PAGE) {
      const { data, error } = await createAdminClient()
        .from('circles')
        .select('id, member_count')
        .eq('space_id', spaceId)
        .neq('status', 'archived')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as { member_count: number | null }[]
      circles += rows.length
      for (const r of rows) seats += r.member_count ?? 0
      if (rows.length < PAGE) break
    }
    return { circles, seats }
  } catch (error) {
    console.error('[frequency/admin] space circle totals read failed:', error)
    return null
  }
})
