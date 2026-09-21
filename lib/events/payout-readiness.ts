// PAYOUT READINESS FOR MANY EVENTS, IN ONE WAVE (EVT-PRICE-HONESTY).
//
// The IO half of `buyerMaySeePrice`. Every buyer-facing listing holds a page of events and needs one
// bit per event -- "can the person Stripe would pay actually receive this money?" -- before it may
// print a number. Asking `getConnectStatus` per card is one round trip per row on a page that
// already runs several, so this resolves the whole page in two reads: the hosting spaces' owners,
// then the batched readiness map `getConnectReadyMap` was built for (LIVE-126).
//
// 🔴 THE PAYEE IS NOT ALWAYS THE HOST. A space-hosted event pays the space OWNER (ADR-819), which is
// the same resolution lib/billing/tickets.ts does before a sale and app/(main)/events/admin-actions.ts
// does beside the price control. Keying on `host_id` alone would tell a buyer the money will land
// when it is a different person's account that has to exist -- and it would do so on exactly the
// events most likely to be priced.
//
// FAILS CLOSED, in agreement with `ticketSellerVerdict` and `getConnectReadyMap`: an event whose
// payee cannot be resolved, or whose readiness read fails, is ABSENT from the returned map and every
// caller reads absent as not ready. The cost of a false negative is a card that says nothing about
// price. The cost of a false positive is a stranger being shown a number nobody can be paid.

import { createAdminClient } from '@/lib/supabase/admin'
import { getConnectReadyMap } from '@/lib/billing/connect'
import { canSellTickets } from './ticket-eligibility'

/** The three columns this needs off an event row. Anything wider satisfies it. */
export interface EventPayeeRow {
  id: string
  host_id?: string | null
  /** Set when a Space hosts the event, in which case its OWNER is the payee (ADR-819). */
  host_space_id?: string | null
}

/**
 * Which of these events have a payee who can actually receive money?
 *
 * Returns ONLY the ready event ids, so `map[id]` is `true` or `undefined` and never a `false` a
 * caller might read as "answered". Two reads regardless of page size; zero Stripe calls.
 */
export async function eventPayoutReadyMap(events: readonly EventPayeeRow[]): Promise<Record<string, boolean>> {
  if (events.length === 0) return {}

  // One read for the hosting spaces' owners. Only space-hosted events need it, and a page with none
  // skips the round trip entirely.
  const spaceIds = [...new Set(events.map((e) => e.host_space_id).filter((v): v is string => !!v))]
  const ownerBySpace = new Map<string, string>()
  if (spaceIds.length > 0) {
    const { data, error } = await createAdminClient()
      .from('spaces')
      .select('id, owner_profile_id')
      .in('id', spaceIds)
    // Fails closed (an unresolved space leaves its events with no payee, so they are absent from the
    // result and read as not ready), but it SAYS SO. AGENTS.md: every fail-safe needs something that
    // notices it fired, and a silent one here reads as "these hosts have not connected Stripe".
    if (error) console.error('[event-payout] hosting space owner read failed', error.message)
    for (const row of (data ?? []) as { id: string; owner_profile_id: string | null }[]) {
      if (row.owner_profile_id) ownerBySpace.set(row.id, row.owner_profile_id)
    }
  }

  const payeeByEvent = new Map<string, string>()
  for (const e of events) {
    const payee = e.host_space_id ? ownerBySpace.get(e.host_space_id) : (e.host_id ?? null)
    if (payee) payeeByEvent.set(e.id, payee)
  }

  const readyByPayee = await getConnectReadyMap([...new Set(payeeByEvent.values())])

  const out: Record<string, boolean> = {}
  for (const [eventId, payee] of payeeByEvent) {
    // Through the shared predicate rather than reading the map directly, so this agrees with the
    // event form, the settings module and the buy path by construction instead of by hand.
    if (canSellTickets({ payoutsReady: readyByPayee[payee] })) out[eventId] = true
  }
  return out
}

/**
 * The same question for ONE event, with a THIRD answer: `null` = could not determine.
 *
 * 🔴 THE THIRD ANSWER IS THE POINT, and it exists for the crawl-facing callers. A listing may
 * safely read an unanswerable question as "not ready" -- the cost is a card with no price stat. The
 * structured-data callers cannot: `payouts_ready: false` tells `eventSchema` to DROP the Offer, so
 * collapsing an infrastructure failure onto `false` would silently strip the price out of every
 * event's rich result the first time a build ran without a service-role key. `null` means the
 * caller publishes the Offer exactly as it did before, which is the right direction for a claim
 * nobody has actually checked.
 *
 * Catches rather than propagates for the same reason: these run on statically prerendered public
 * routes, and a payout read is not a reason for an event page to fail to build.
 */
export async function eventPayoutReadyOrUnknown(event: EventPayeeRow): Promise<boolean | null> {
  try {
    return (await eventPayoutReadyMap([event]))[event.id] === true
  } catch (err) {
    console.error('[event-payout] readiness read threw; publishing no verdict', err)
    return null
  }
}
