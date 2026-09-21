import 'server-only'

// CLAIM-ON-SIGN-IN, THE ORDER LEG (LIVE-396) — the moment a guest's paid Journey becomes theirs.
//
// ── WHY A FOURTH DOOR ────────────────────────────────────────────────────────────────────────────
// The same seam as its three neighbours, for the one artifact that had none:
//   event_rsvps    lib/events/guest-seat-claim.ts                claim_guest_rsvps      (ADR-1033)
//   crm leads      lib/crm/convert-leads-on-sign-in.ts           convert_signup_leads_for_me
//   event_tickets  lib/events/claim-guest-tickets-on-sign-in.ts  claim_guest_tickets
//   commerce_orders  THIS                                        claim_guest_orders
//
// LIVE-396 originally asked for "account creation at fulfilment". That would have been a fourth
// MECHANISM for a problem with three working answers, and would mint accounts nobody asked for out
// of a webhook. The guest buys, the order carries `guest_email` and a NULL buyer, and this attaches
// it once auth.users has PROVEN the address.
//
// ── 🔴 WHY THIS ONE IS NOT JUST AN RPC CALL ──────────────────────────────────────────────────────
// Its three neighbours finish in SQL because attaching the row IS the outcome. Here it is not.
// `journey_enrollments.profile_id` is NOT NULL, so the claim has to CREATE an enrolment rather than
// re-point one — and what "enrolling" means is not one row. `adoptPlan` is the single authority
// (journey-fulfilment.ts: "ONE authority for what enrolling means: the same call the free path
// makes, so a paid learner gets the practices, the adoption row and the solo enrolment exactly as
// everyone else does"). SQL that inserted the enrolment row by itself would hand a paying guest a
// degraded enrolment missing its practices, silently.
//
// So the split is deliberate: `claim_guest_orders()` claims the ORDER on the SESSION client and
// returns the ids, and this module then runs the ORDINARY `enrolByOrder` for each — the same call
// the member webhook makes. One authority, reached from two doors.
//
// ── WHY THE SESSION CLIENT FOR THE RPC ───────────────────────────────────────────────────────────
// The RPC resolves the caller with auth.uid(). Under the service-role client auth.uid() is NULL, it
// matches nobody, and it returns a perfectly healthy empty set having claimed nothing — a silent
// no-op whose return value looks like success. The same trap is documented on all three neighbours.
// `enrolByOrder` is the opposite and makes its own admin client, because granting access is
// operator work the buyer's own session has no business being able to do.
//
// ── BEST-EFFORT, AND NOT A LANDING ───────────────────────────────────────────────────────────────
// Swallowed on every path including failure. The caller is the auth callback: an unattached order
// is recoverable on the next sign-in, a failed login is not. Returns void ON PURPOSE — like the
// lead conversion and the ticket claim, and unlike the seat claim, it must not influence where
// anyone lands; the seat claim already owns that decision.
//
// Idempotent by construction: the SQL only touches orders with a NULL buyer, and `enrolByOrder`
// no-ops on an existing enrolment. A second sign-in claims nothing and is not an error.

import { enrolByOrder } from './journey-fulfilment'

/**
 * The narrow structural handle this module needs from the SESSION-scoped Supabase client. Untyped
 * (ADR-246): `claim_guest_orders` postdates the generated lib/database.types.ts, and `rpc()` is
 * typed from that same generated file, so the caller casts once at the call site. Mirrors the
 * `SessionClient` handles on the three neighbouring claim modules, plus `data` — this door returns
 * the ids it claimed, where theirs return only a count.
 */
export type OrderSessionClient = {
  /** supabase-js resolves `{ data, error }` and never throws, so the outcome is READ, not caught. */
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data?: unknown; error?: { message?: string } | null } | null | void>
}

/** `returns setof uuid` reaches PostgREST as a bare array of strings. Defensive anyway: a shape
 *  change here would otherwise enrol nobody and say nothing. */
function orderIds(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  const out: string[] = []
  for (const row of data) {
    if (typeof row === 'string') {
      out.push(row)
    } else if (row && typeof row === 'object') {
      // PostgREST renders a single-column setof as `[{ claim_guest_orders: "<uuid>" }]` in some
      // versions. Take the first string value rather than pinning a key name.
      const v = Object.values(row as Record<string, unknown>).find((x) => typeof x === 'string')
      if (typeof v === 'string') out.push(v)
    }
  }
  return out
}

/**
 * Attach every settled guest order bought under this member's PROVEN address, then run the ordinary
 * fulfilment for each so a paid Journey grants exactly what the member path grants.
 *
 * @param session the SESSION-scoped Supabase client — see the note above on why the admin client
 *                would claim nothing while reporting success.
 */
export async function claimGuestOrdersOnSignIn(session: OrderSessionClient): Promise<void> {
  let ids: string[] = []
  try {
    // No arguments: the function takes none. The address it acts on is the one auth.users has
    // already proven, which is the entire reason it is safe to grant to `authenticated`.
    const result = await session.rpc('claim_guest_orders')
    const error = result && typeof result === 'object' && 'error' in result ? result.error : null
    if (error) {
      // Logged rather than ignored: a fail-safe nobody can see fired is an invisible regression,
      // and this one stands between somebody and a Journey they paid for.
      console.error('[guest-order-claim] claim_guest_orders failed', { message: error.message })
      return
    }
    ids = orderIds(result && typeof result === 'object' && 'data' in result ? result.data : null)
  } catch (e) {
    console.error('[guest-order-claim] claim_guest_orders threw', {
      error: e instanceof Error ? e.message : String(e),
    })
    return
  }

  if (ids.length === 0) return

  // Sequential on purpose: these are a handful of rows at most, and `adoptPlan` writes several rows
  // per Journey. One failure must not stop the rest, so each is caught on its own — a member with
  // two guest purchases must not lose the second because the first had a deleted plan.
  for (const orderId of ids) {
    try {
      await enrolByOrder(orderId)
    } catch (e) {
      console.error('[guest-order-claim] enrolByOrder failed after claim', {
        orderId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
}
