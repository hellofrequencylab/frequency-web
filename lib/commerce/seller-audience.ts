import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// ── "Is this buyer already the seller's own audience?" (ADR-913) ────────────────────────────
//
// THE PROMISE THIS IMPLEMENTS: *once you have your contact, Frequency doesn't take a cut.* A sale to
// someone the seller already earned is 0% on every tier, forever. Frequency charges only on the
// INTRODUCTION — the first paid conversion from someone it brought.
//
// 🔴 WHY THIS REPLACES COOKIE ATTRIBUTION. `classifyOrderSource` decided this from two cookies
// (`fq_ref`, `fq_src`) and defaulted to `self` on any miss. Cookies clear, expire, and do not survive
// a phone-to-laptop switch, and every miss billed 0% — so the take-rate ladder existed in code and
// almost never fired. Worse, it could not answer the question a host will eventually ask: *why did you
// charge me for that sale?* A cookie is a guess. A relationship is a row with a timestamp on it.
//
// ⚠️ FAIL-SAFE DIRECTION IS "THEIR AUDIENCE". Any read failure, any ambiguity, any missing id returns
// true → 0%. This is the same posture the cookie classifier took and it is deliberate: under-collecting
// on an error is recoverable, charging a fee we promised not to is not. Every branch here is written so
// the expensive answer for Frequency is the safe one for the member.

/** Every relationship that means "this person is already yours". Any ONE of these is enough. */
export type AudienceSignal =
  | 'self' // the buyer IS the seller
  | 'follows' // follows the Space
  | 'space_member' // an active member of the Space
  | 'crm_contact' // already in the Space's CRM
  | 'personal_contact' // in the seller's OWN contact list (a Crew host with no Space)
  | 'prior_purchase' // has bought from this seller before

export interface AudienceVerdict {
  /** True when the buyer is already the seller's audience → 0% take rate. */
  isOwnAudience: boolean
  /** Which signal decided it, for the receipt a host can be shown. Null when none matched. */
  signal: AudienceSignal | null
  /** True when the verdict came from a failed read rather than a real match (fail-safe to 0%). */
  degraded: boolean
}

const OWN = (signal: AudienceSignal): AudienceVerdict => ({ isOwnAudience: true, signal, degraded: false })
const NOT_OWN: AudienceVerdict = { isOwnAudience: false, signal: null, degraded: false }
const DEGRADED: AudienceVerdict = { isOwnAudience: true, signal: null, degraded: true }

function db(): SupabaseClient {
  return createAdminClient()
}

/** Did this query find at least one row? Any error is a NON-answer, not a "no".
 *
 *  `PromiseLike`, not `Promise`: a PostgREST filter builder is a THENABLE that only becomes a promise
 *  when awaited, so a `Promise<...>` parameter type rejects every call site here. */
async function found(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<boolean | null> {
  try {
    const { data, error } = await run()
    if (error) return null
    return ((data as unknown[] | null) ?? []).length > 0
  } catch {
    return null
  }
}

/**
 * Is `buyerProfileId` already part of `seller`'s audience?
 *
 * `sellerSpaceId` is the hosting Space when there is one; `sellerProfileId` is the person who receives
 * the money (for a Space sale that is the Space owner). BOTH are consulted, because a Crew host with
 * no Space still has an audience — their own contact list — and a Space sale should also honour a
 * relationship the owner holds personally.
 *
 * Checks run cheapest-exact-match first and short-circuit, so the common case (a follower) costs one
 * indexed lookup.
 */
export async function buyerIsSellersAudience(input: {
  sellerSpaceId?: string | null
  sellerProfileId?: string | null
  buyerProfileId?: string | null
}): Promise<AudienceVerdict> {
  const buyer = input.buyerProfileId?.trim() || null
  const space = input.sellerSpaceId?.trim() || null
  const seller = input.sellerProfileId?.trim() || null

  // No buyer identity = we cannot prove Frequency introduced them, so we do not charge.
  if (!buyer) return DEGRADED
  // Buying from yourself is never a network sale (also guarded upstream, kept here so this function is
  // correct standalone).
  if (seller && seller === buyer) return OWN('self')
  // No seller identity at all: nothing to compare against.
  if (!space && !seller) return DEGRADED

  const checks: Array<{ signal: AudienceSignal; run: () => Promise<boolean | null> }> = []

  if (space) {
    checks.push({
      signal: 'follows',
      run: () =>
        found(() =>
          db()
            .from('space_follows')
            .select('id')
            .eq('space_id', space)
            .eq('follower_profile_id', buyer)
            .limit(1),
        ),
    })
    checks.push({
      signal: 'space_member',
      run: () =>
        found(() =>
          db()
            .from('space_members')
            .select('id')
            .eq('space_id', space)
            .eq('profile_id', buyer)
            .eq('status', 'active')
            .limit(1),
        ),
    })
    checks.push({
      signal: 'crm_contact',
      run: () =>
        found(() =>
          db().from('contacts').select('id').eq('space_id', space).eq('profile_id', buyer).limit(1),
        ),
    })
  }

  if (seller) {
    // A member's OWN list (network_contacts.owner_id). This is the signal that makes the promise true
    // for a Crew host who runs events without a Space — without it, every sale they make would be
    // network-rated and the "your own people are free" line would be false for exactly the tier we
    // are asking to upgrade.
    checks.push({
      signal: 'personal_contact',
      run: () =>
        found(() =>
          db()
            .from('network_contacts')
            .select('id')
            .eq('owner_id', seller)
            .eq('linked_profile_id', buyer)
            .limit(1),
        ),
    })
  }

  // Bought before = unambiguously theirs, whatever the CRM says. Last because it is the widest read.
  checks.push({
    signal: 'prior_purchase',
    run: () => hasPriorSettledPurchase({ space, seller, buyer }),
  })

  let sawFailure = false
  for (const check of checks) {
    const hit = await check.run()
    if (hit === true) return OWN(check.signal)
    if (hit === null) sawFailure = true
  }

  // A read failed and nothing else matched: we cannot honestly say Frequency introduced them.
  if (sawFailure) return DEGRADED
  return NOT_OWN
}

/**
 * Has this buyer already paid this seller for an event?
 *
 * Two steps rather than one join: the seller's event ids first, then a bounded ticket lookup. A
 * PostgREST embedded-filter join across an untyped table is the kind of query that silently returns
 * [] when the relationship name is wrong — and [] here means "charge them", which is the wrong
 * direction to be silently wrong in.
 */
async function hasPriorSettledPurchase(args: {
  space: string | null
  seller: string | null
  buyer: string
}): Promise<boolean | null> {
  try {
    // Only events that could have produced a settled ticket for this seller.
    let q = db().from('events').select('id').limit(500)
    if (args.space && args.seller) q = q.or(`host_space_id.eq.${args.space},host_id.eq.${args.seller}`)
    else if (args.space) q = q.eq('host_space_id', args.space)
    else if (args.seller) q = q.eq('host_id', args.seller)
    else return false

    const { data: evs, error: evErr } = await q
    if (evErr) return null
    const ids = ((evs as { id: string }[] | null) ?? []).map((e) => e.id)
    if (ids.length === 0) return false

    return await found(() =>
      db()
        .from('event_tickets')
        .select('id')
        .in('event_id', ids)
        .eq('buyer_profile_id', args.buyer)
        .not('succeeded_at', 'is', null)
        .is('refunded_at', null)
        .limit(1),
    )
  } catch {
    return null
  }
}
