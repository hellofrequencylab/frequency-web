// LICENSED PER-SEAT BILLING + SEAT-LIMIT ENFORCEMENT (Pricing ladder Phase D, ADR-465,
// docs/PRICING-LADDER-PLAN.md §5 + §2). A Space buys operator seats licensed (the owner sets a count
// the Team add-on / the Nonprofit seat item bills, `spaces.seat_quantity`); this module is the seat
// arithmetic + the server-side enforcement that the picker, the billing surface, and the invite/role
// actions all read.
//
// TWO HALVES, like the rest of lib/spaces/*:
//   1. PURE (no Supabase/Next imports) — the seat arithmetic, fully unit-testable:
//        - operatorRoleConsumesSeat(role) — WHICH roles count against the seat allowance.
//        - licensedSeats(seatQuantity)    — the base 1 + the licensed count.
//        - seatLimitReached(used, licensed) / seatsRemaining(...) — the gate primitive.
//   2. IO (admin client; service-role) — read a Space's licensed count + used (active operator)
//        seats in ONE query each, set the licensed count (owner action, double-gated on space-admin
//        role server-side), and the billing_live-GATED enforcement the invite/role actions call.
//
// THE SEAT-COUNTING RULE (decided for ADR-465 — documented in the PR body):
//   * An OPERATOR seat is consumed by an ACTIVE member whose role is admin / moderator / editor.
//     These are the roles that DO things on a Space (manage, moderate, edit), so they are the seats
//     a Team / Nonprofit plan pays for.
//   * A VIEWER ("Member") never consumes an operator seat — free/audience members are unlimited.
//   * The OWNER is covered by the BASE allowance (every Space gets 1 seat free, the owner's), so the
//     licensed total is base 1 + spaces.seat_quantity. The owner holds no space_members row, so they
//     are never counted in `usedSeats` (which counts members only); the base 1 accounts for them.
//   * A SUSPENDED / INVITED member confers no authority (only an ACTIVE row does, see
//     getSpaceCapabilities), so neither consumes a seat. An outstanding INVITE is not yet a seat; the
//     seat is consumed when the invitee ACCEPTS (acceptInvite), where enforcement re-checks.
//
// THE BILLING-LIVE GATE (the P1 invariant — nothing blocks while billing is OFF): every enforcement
// path is GATED on billingLive(). While OFF the grant-all behavior is preserved (an invite never hits
// a seat wall), so Phase D ships dark exactly like A/B/C. The limit activates the moment billing flips
// live, with no further code change.

import { createAdminClient } from '@/lib/supabase/admin'
import { billingLive } from '@/lib/pricing/settings'
import { atLeastSpaceRole, type SpaceRole } from './membership'

// ── PURE: the seat arithmetic (no IO, fully testable) ───────────────────────────────────────────

/** The base operator allowance every Space gets free, before any licensed seats: the owner's seat.
 *  So the licensed total is BASE_SEAT_ALLOWANCE + spaces.seat_quantity. */
export const BASE_SEAT_ALLOWANCE = 1 as const

/** The active-member roles that consume an operator seat (admin / moderator / editor). The single
 *  source the `usedSeats` query filters on; kept in lock-step with operatorRoleConsumesSeat. */
export const SEAT_CONSUMING_ROLES: readonly SpaceRole[] = ['editor', 'moderator', 'admin'] as const

/** Whether a space role CONSUMES an operator seat. PURE, fail-closed. An operator seat is a role that
 *  DOES things on a Space (admin / moderator / editor); a viewer ("Member") is free audience and never
 *  consumes one. An unknown / null role consumes nothing (fail-closed). The threshold is "at least
 *  editor" on the existing ladder (viewer < editor < moderator < admin). */
export function operatorRoleConsumesSeat(role: SpaceRole | string | null | undefined): boolean {
  return atLeastSpaceRole(role, 'editor')
}

/** The total LICENSED operator seats for a Space: the base allowance (the owner) plus the licensed
 *  count the owner is billed for (spaces.seat_quantity). PURE. A null/garbage/negative count floors to
 *  0 added seats, so the minimum is the base allowance (1). */
export function licensedSeats(seatQuantity: number | null | undefined): number {
  const n = typeof seatQuantity === 'number' && Number.isFinite(seatQuantity) ? Math.floor(seatQuantity) : 0
  return BASE_SEAT_ALLOWANCE + Math.max(0, n)
}

/** How many operator seats remain, given the used count + the licensed total. PURE, never negative. */
export function seatsRemaining(used: number, licensed: number): number {
  return Math.max(0, licensed - Math.max(0, used))
}

/** Whether ADDING one more operator seat would EXCEED the licensed allowance. PURE. True when the
 *  Space is already at (or somehow over) its licensed total, so the next operator invite/promotion has
 *  no seat. The one seat-limit gate primitive. */
export function seatLimitReached(used: number, licensed: number): boolean {
  return Math.max(0, used) >= licensed
}

// ── IO: licensed count + used (active operator) seats, the setter, + the enforcement ────────────
// `spaces.seat_quantity` and `space_members` are reached through the admin client. seat_quantity is in
// the generated types; space_members is not (ADR-246), so it is reached untyped like lib/spaces/
// membership.ts. Reads FAIL-SAFE (a hiccup never wrongly blocks an invite while OFF, and never wrongly
// grants a seat while live — see each helper).

/** Read a Space's LICENSED seat count (spaces.seat_quantity, the owner-set figure the Team /
 *  Nonprofit item bills). FAIL-SAFE to 0 (the base allowance still applies via licensedSeats). */
export async function getSpaceSeatQuantity(spaceId: string): Promise<number> {
  try {
    const db = createAdminClient()
    const { data } = (await db
      .from('spaces')
      .select('seat_quantity')
      .eq('id', spaceId)
      .maybeSingle()) as { data: { seat_quantity?: number | null } | null }
    const n = data?.seat_quantity
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  } catch {
    return 0
  }
}

/** Count the USED operator seats of a Space in ONE query: the ACTIVE members whose role consumes a
 *  seat (admin / moderator / editor). The owner holds no member row (covered by the base allowance),
 *  so they are never in this count. Viewers, suspended, and invited rows are excluded server-side.
 *  FAIL-SAFE to 0. No N+1 — a single filtered count. */
export async function usedSeats(spaceId: string): Promise<number> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string, opts: { count: 'exact'; head: true }) => {
          eq: (c: string, v: string) => {
            eq: (c2: string, v2: string) => {
              in: (c3: string, vals: string[]) => Promise<{ count: number | null; error: unknown }>
            }
          }
        }
      }
    }
    const { count, error } = await db
      .from('space_members')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .in('role', SEAT_CONSUMING_ROLES as unknown as string[])
    if (error || typeof count !== 'number') return 0
    return Math.max(0, count)
  } catch {
    return 0
  }
}

/** A Space's seat picture: licensed total (base + seat_quantity), used (active operator) seats, and
 *  the remaining headroom. The shape the surfaces render ("3 of 5 seats used"). */
export interface SeatUsage {
  /** The owner-set licensed seat count (spaces.seat_quantity). */
  seatQuantity: number
  /** The total licensed operator seats (base allowance + seatQuantity). */
  licensed: number
  /** Active members consuming an operator seat (admin / moderator / editor). */
  used: number
  /** Seats left before the licensed allowance is reached (never negative). */
  remaining: number
  /** Whether the Space is at/over its licensed allowance. */
  full: boolean
}

/** Resolve a Space's full seat usage in two parallel reads (the licensed count + the used count).
 *  FAIL-SAFE: a read error yields the base allowance with 0 used. Server-only. */
export async function getSeatUsage(spaceId: string): Promise<SeatUsage> {
  const [seatQuantity, used] = await Promise.all([getSpaceSeatQuantity(spaceId), usedSeats(spaceId)])
  const licensed = licensedSeats(seatQuantity)
  return {
    seatQuantity,
    licensed,
    used,
    remaining: seatsRemaining(used, licensed),
    full: seatLimitReached(used, licensed),
  }
}

/** Set a Space's LICENSED seat count (spaces.seat_quantity). Service-role write, server-mediated.
 *  authz-delegated: the CALLER (the owner action / the billing webhook) authorizes; this is the raw
 *  setter. Clamps to >= 0 (the base allowance is added on read). Returns true on success. */
export async function setSpaceSeatQuantity(spaceId: string, seatQuantity: number): Promise<boolean> {
  const clean =
    typeof seatQuantity === 'number' && Number.isFinite(seatQuantity) ? Math.max(0, Math.floor(seatQuantity)) : 0
  try {
    const db = createAdminClient()
    const { error } = await db
      .from('spaces')
      .update({ seat_quantity: clean } as never)
      .eq('id', spaceId)
    return !error
  } catch {
    return false
  }
}

/** The outcome of a seat check: `allowed` true means the operator seat may be taken; false carries a
 *  clean, member-facing reason + the seat usage so the surface can say "X of Y seats used". */
export interface SeatCheck {
  allowed: boolean
  /** A clean failure message when not allowed (voice rules, no em dashes). */
  reason?: string
  usage: SeatUsage
}

/** Whether adding ONE more operator member at `role` is allowed, ENFORCING the licensed seat limit.
 *  GATED on billingLive(): while billing is OFF this ALWAYS allows (grant-all preserved, the P1
 *  invariant) so the seat wall never blocks an invite in the dark phase; it activates the moment
 *  billing flips live. A non-seat role (viewer) always passes (it consumes no seat). Server-only.
 *
 *  Re-check server-side in the action (never trust the client): the invite/role actions call this
 *  after their own authorization, so the limit is enforced where the write happens, not on the page. */
export async function checkSeatForOperatorInvite(
  spaceId: string,
  role: SpaceRole | string | null | undefined,
): Promise<SeatCheck> {
  const usage = await getSeatUsage(spaceId)
  // A viewer / non-operator role never consumes a seat, so it always passes (even while live).
  if (!operatorRoleConsumesSeat(role)) return { allowed: true, usage }
  // GATE: while billing is OFF, grant-all is preserved (no seat wall in the dark phase).
  if (!(await billingLive())) return { allowed: true, usage }
  if (seatLimitReached(usage.used, usage.licensed)) {
    return {
      allowed: false,
      usage,
      reason: `This space is using all ${usage.licensed} of its operator seats. Add a seat on the plan and billing page to invite another teammate.`,
    }
  }
  return { allowed: true, usage }
}
