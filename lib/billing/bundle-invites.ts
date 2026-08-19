// HOUSEHOLD / CIRCLE BUNDLE SEAT INVITES (ADR-370 · migration 20270226000100). The third piece of
// the multi-seat bundle, after the checkout (lib/billing/bundle-checkout.ts) and the webhook
// seating branch (lib/billing/bundle-seats.ts): filling or changing a seat AFTER the purchase.
//
// WHY AN INVITE AND NOT A DIRECT ASSIGNMENT (the owner's ruling). A seat GRANTS A MEMBERSHIP TIER
// and takes over profiles.membership_tier, recording what the person held before so leaving
// restores it. That is a change to somebody else's account, and the repo already settled the
// question once for the same reason: lib/circles/handoff.ts + circle_transfer_offers exist because
// a Circle carries members and cannot be pushed onto a person who never agreed (ADR-845). This
// module follows that shape exactly — the PURE gates split from the IO, one pending row per pair
// guarded by a partial unique index, the table service-role only.
//
// WHY THE INVITE TARGETS A PROFILE ID. space_invites targets an EMAIL because a Space teammate may
// not have an account yet and the invite IS the acquisition path. A bundle seat is the opposite: it
// is a column ON a profile (household_bundle_id) plus that profile's membership_tier, and
// public.profiles carries no email at all. There is nothing an email could be seated into, so the
// owner addresses an invite by @handle and it resolves to a real profile before the row is written
// — the same DEFAULT-DENY createBundleCheckout already applies to its seat list.
//
// 🔴 THE SEAT WRITE IS accept_bundle_invite_atomic, AND IT MUST STAY THAT WAY. Seating someone
// touches the same rows the Stripe webhook writes, but it MUST NOT advance
// profiles.household_bundle_event_at: that column orders Stripe events, and a stamp pushed to now()
// makes the real customer.subscription.deleted look stale, so it is dropped and a CANCELED bundle
// stays seated with everyone on a paid tier for free. The acceptance therefore goes through its own
// function, which writes the seat and nothing else. Pinned by
// supabase/tests/household_bundle_invites.test.sql.
//
// SEATS CANNOT BE OVERSOLD. A bundle was bought with a fixed seat count, stamped into the Stripe
// metadata at checkout and recorded onto the owner's profile by the seating RPC. A PENDING invite
// counts against that cap exactly like a filled seat, and the count plus the insert happen inside
// one transaction under the per-bundle advisory lock, so two sends racing for one seat cannot both
// win. bundleSeatsRemaining (lib/pricing/bundle.ts) is the pure arithmetic both sides read.
//
// GATED: every caller sits behind bundleSellable() = billingLive() AND bundle_household_enabled,
// both default OFF and FAIL-SAFE FALSE, so no invite is ever written on an unflipped platform.
// Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import { getHouseholdBundle } from '@/lib/pricing/settings'
import { bundleSeatsRemaining, type HouseholdBundleConfig } from '@/lib/pricing/bundle'
import type { EntitlementTier } from '@/lib/core/entitlement'

// ── The pure gates ────────────────────────────────────────────────────────────────────────────
// Split from the IO so the authority rules are unit-testable without Stripe or a database, exactly
// like canOfferCircle in lib/circles/handoff.ts.

/** Copy, kept in one place so the action and the surface never word the same refusal twice. */
const NOT_SIGNED_IN = 'Sign in first.'
const NOT_THE_OWNER = 'Only the member who bought the bundle can manage its seats.'
const NOT_YOUR_INVITE = 'That seat was offered to someone else.'
const INVITE_SELF = 'You already hold a seat on your own bundle.'
const NO_SEATS = 'Every seat on this bundle is taken or already offered.'

export interface SeatInviteDecision {
  allowed: boolean
  reason: string
}

/** How many seats an owner may still OFFER: the purchased count, less the seats already filled AND
 *  the invites still waiting for an answer. PURE.
 *
 *  Counting pending invites is the whole oversell guard. Without it an owner sends five invites for
 *  three seats, three people accept, and the last two land on nothing after being told they had a
 *  seat. Delegates the arithmetic to bundleSeatsRemaining so there is one definition of "remaining".
 */
export function bundleSeatsOpen(
  config: HouseholdBundleConfig,
  seatedCount: number,
  pendingInviteCount: number,
): number {
  return bundleSeatsRemaining(config, Math.max(0, seatedCount) + Math.max(0, pendingInviteCount))
}

/** May this viewer OFFER a seat on this bundle to that person? PURE.
 *
 *  Owner-only, and seat-bounded. The invitee's agreement is collected by the accept step rather
 *  than checked here, which is the same split canOfferCircle makes: the offer changes nothing on
 *  its own. */
export function canSendBundleSeatInvite(facts: {
  viewerProfileId: string | null
  /** The bundle, keyed by its owner. Null when the viewer owns no live bundle. */
  ownerProfileId: string | null
  toProfileId: string
  seatsOpen: number
}): SeatInviteDecision {
  if (!facts.viewerProfileId) return { allowed: false, reason: NOT_SIGNED_IN }
  if (!facts.ownerProfileId || facts.ownerProfileId !== facts.viewerProfileId) {
    return { allowed: false, reason: NOT_THE_OWNER }
  }
  if (facts.toProfileId === facts.viewerProfileId) return { allowed: false, reason: INVITE_SELF }
  if (facts.seatsOpen <= 0) return { allowed: false, reason: NO_SEATS }
  return { allowed: true, reason: '' }
}

/** May this viewer REVOKE a pending invite? PURE. The owner alone, mirroring who may send. */
export function canRevokeBundleSeatInvite(facts: {
  viewerProfileId: string | null
  ownerProfileId: string | null
}): SeatInviteDecision {
  if (!facts.viewerProfileId) return { allowed: false, reason: NOT_SIGNED_IN }
  if (!facts.ownerProfileId || facts.ownerProfileId !== facts.viewerProfileId) {
    return { allowed: false, reason: NOT_THE_OWNER }
  }
  return { allowed: true, reason: '' }
}

/** May this viewer ACCEPT or DECLINE an invite? PURE. The invitee alone, and deliberately NOT the
 *  owner: an owner who could accept on someone's behalf is the direct assignment this whole module
 *  exists to avoid. */
export function canAnswerBundleSeatInvite(facts: {
  viewerProfileId: string | null
  toProfileId: string | null
}): SeatInviteDecision {
  if (!facts.viewerProfileId) return { allowed: false, reason: NOT_SIGNED_IN }
  if (!facts.toProfileId || facts.toProfileId !== facts.viewerProfileId) {
    return { allowed: false, reason: NOT_YOUR_INVITE }
  }
  return { allowed: true, reason: '' }
}

// ── The shapes the surfaces read ──────────────────────────────────────────────────────────────

/** One person on a bundle, seated. */
export interface BundleSeatPerson {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  /** The bundle owner (the payer), who occupies a seat and points at themselves. */
  isOwner: boolean
}

/** One outstanding offer, from either side of it. */
export interface BundleSeatInvite {
  id: string
  ownerProfileId: string
  toProfileId: string
  /** The OTHER party's name, so one shape serves the owner's list and the invitee's inbox. */
  personName: string
  personHandle: string
  personAvatarUrl: string | null
  status: string
  createdAt: string
  expiresAt: string
}

/** Everything the owner's seat manager renders. */
export interface BundleSeatBoard {
  /** Does the viewer own a LIVE bundle? False for everyone else, which hides the whole surface. */
  ownsBundle: boolean
  /** The seat count the bundle was bought with. */
  seats: number
  /** The member tier each seat is granted. */
  tier: EntitlementTier
  seated: BundleSeatPerson[]
  pending: BundleSeatInvite[]
  /** Seats neither filled nor offered. */
  seatsOpen: number
}

const EMPTY_BOARD: BundleSeatBoard = {
  ownsBundle: false,
  seats: 0,
  tier: 'crew',
  seated: [],
  pending: [],
  seatsOpen: 0,
}

export interface SeatInviteResult {
  ok: boolean
  reason: string
}

// ── Untyped table access (ADR-246) ────────────────────────────────────────────────────────────
// household_bundle_invites and the three household_bundle_* profile columns are not in the
// generated Database types yet (the migration is applied separately), so they are reached through
// an untyped `from` accessor and typed loosely here — the repo convention, matching
// lib/spaces/invites.ts.

interface LooseQuery {
  select: (cols: string) => LooseQuery
  insert: (row: Record<string, unknown>) => LooseQuery
  update: (row: Record<string, unknown>) => LooseQuery
  eq: (col: string, val: unknown) => LooseQuery
  in: (col: string, vals: readonly unknown[]) => LooseQuery
  gt: (col: string, val: unknown) => LooseQuery
  order: (col: string, opts: { ascending: boolean }) => LooseQuery
  limit: (n: number) => LooseQuery
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
  then: (
    resolve: (r: { data: Record<string, unknown>[] | null; error: { code?: string } | null }) => unknown,
  ) => Promise<unknown>
}

function table(name: string): LooseQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => LooseQuery }
  return db.from(name)
}

/** The RPC shapes. Not yet in the generated Database types, so they are called through a localized
 *  method cast — the same convention apply_bundle_seating_atomic uses in lib/billing/bundle-seats.ts. */
type InviteRpc = {
  (
    name: 'create_bundle_invite_atomic',
    args: { _owner: string; _invitee: string; _seats_fallback: number },
  ): Promise<{ data: { created?: boolean; reason?: string } | null; error: { message: string } | null }>
  (
    name: 'accept_bundle_invite_atomic',
    args: { _invite: string; _member: string; _tier_fallback: string; _seats_fallback: number },
  ): Promise<{ data: { seated?: boolean; reason?: string } | null; error: { message: string } | null }>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** The refusals the SQL reports, said in the product's voice. A reason with no entry here is a
 *  programming error rather than something to show a member, so it degrades to the generic line. */
const SQL_REASON: Record<string, string> = {
  self: INVITE_SELF,
  no_seats: NO_SEATS,
  no_member: 'We could not find that member.',
  already_seated: 'They already have a seat on this bundle.',
  already_invited: 'They already have an invite waiting. Give them a moment to answer it.',
  in_other_bundle: 'They are already on someone else’s bundle.',
  bundle_inactive: 'This bundle is not active, so it has no seats to give.',
  not_found: 'That invite is no longer available.',
  not_yours: NOT_YOUR_INVITE,
  already_answered: 'That invite has already been answered.',
  expired: 'That invite has expired. Ask for a new one.',
  invalid_tier: 'This bundle is not set up to grant a membership yet.',
}

function say(reason: string | undefined, fallback: string): string {
  return (reason && SQL_REASON[reason]) || fallback
}

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────

/** The purchased terms for a bundle, read off the OWNER's profile row where the seating RPC
 *  recorded them. Falls back to the live operator config for a bundle sold before the terms were
 *  stamped, which is the same fallback reconcileBundleSubscription takes for a pre-stamp
 *  subscription. FAIL-SAFE: any read failure degrades to the config, never to an unbounded cap. */
async function purchasedTerms(
  ownerId: string,
): Promise<{ ownsBundle: boolean; config: HouseholdBundleConfig }> {
  const config = await getHouseholdBundle()
  const { data } = await table('profiles')
    .select('id, household_bundle_id, household_bundle_seats, household_bundle_tier')
    .eq('id', ownerId)
    .maybeSingle()
  if (!data) return { ownsBundle: false, config }

  // A LIVE bundle is one whose owner is seated in it. A canceled bundle empties, so this is false
  // the moment the subscription ends, and every seat surface closes with it.
  const ownsBundle = strOrNull(data.household_bundle_id) === ownerId
  const seats = typeof data.household_bundle_seats === 'number' ? data.household_bundle_seats : null
  const tier = data.household_bundle_tier
  return {
    ownsBundle,
    config: {
      ...config,
      seats: seats && seats > 0 ? seats : config.seats,
      tier: tier === 'crew' || tier === 'supporter' ? tier : config.tier,
    },
  }
}

async function peopleById(ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const { data } = (await table('profiles')
    .select('id, display_name, handle, avatar_url')
    .in('id', unique)) as { data: Record<string, unknown>[] | null }
  return new Map((data ?? []).map((r) => [str(r.id), r]))
}

/**
 * The owner's seat manager: who is seated, who has been offered a seat, and how many seats are
 * still open. Returns the closed board (ownsBundle false) for anyone who does not own a live
 * bundle, so the surface renders nothing rather than a half-populated manager.
 */
// authz-delegated: a read-only projection of one bundle keyed by the profile id the caller
// resolved from the session; the gate lives at the call site (the settings action + surface).
export async function loadBundleSeatBoard(ownerId: string | null): Promise<BundleSeatBoard> {
  if (!ownerId) return EMPTY_BOARD
  try {
    const { ownsBundle, config } = await purchasedTerms(ownerId)
    if (!ownsBundle) return EMPTY_BOARD

    const [{ data: seatRows }, { data: inviteRows }] = await Promise.all([
      table('profiles')
        .select('id, display_name, handle, avatar_url')
        .eq('household_bundle_id', ownerId) as unknown as Promise<{ data: Record<string, unknown>[] | null }>,
      table('household_bundle_invites')
        .select('id, owner_profile_id, to_profile_id, status, created_at, expires_at')
        .eq('owner_profile_id', ownerId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20) as unknown as Promise<{ data: Record<string, unknown>[] | null }>,
    ])

    const invitees = await peopleById((inviteRows ?? []).map((r) => str(r.to_profile_id)))

    const seated: BundleSeatPerson[] = (seatRows ?? []).map((r) => ({
      profileId: str(r.id),
      displayName: str(r.display_name),
      handle: str(r.handle),
      avatarUrl: strOrNull(r.avatar_url),
      isOwner: str(r.id) === ownerId,
    }))
    // The owner leads the roster, then everyone else by name, so the list reads the same way twice.
    seated.sort((a, b) =>
      a.isOwner === b.isOwner ? a.displayName.localeCompare(b.displayName) : a.isOwner ? -1 : 1,
    )

    const pending: BundleSeatInvite[] = (inviteRows ?? []).flatMap((r) => {
      const person = invitees.get(str(r.to_profile_id))
      if (!person) return []
      return [
        {
          id: str(r.id),
          ownerProfileId: str(r.owner_profile_id),
          toProfileId: str(r.to_profile_id),
          personName: str(person.display_name),
          personHandle: str(person.handle),
          personAvatarUrl: strOrNull(person.avatar_url),
          status: str(r.status),
          createdAt: str(r.created_at),
          expiresAt: str(r.expires_at),
        },
      ]
    })

    return {
      ownsBundle: true,
      seats: config.seats,
      tier: config.tier,
      seated,
      pending,
      seatsOpen: bundleSeatsOpen(config, seated.length, pending.length),
    }
  } catch {
    // FAIL-SAFE CLOSED: a read failure hides the manager rather than showing a bundle with seats
    // that may not exist.
    return EMPTY_BOARD
  }
}

/**
 * The seats waiting on this member: their inbox. Mirrors listOffersForRecipient in
 * lib/circles/handoff.ts, including the two batched lookups rather than a join.
 */
// authz-delegated: a read-only projection bound to the profile id the caller resolved from the
// session; the gate lives at the call site.
export async function listBundleSeatInvitesForMember(
  profileId: string | null,
): Promise<BundleSeatInvite[]> {
  if (!profileId) return []
  try {
    const { data: rows } = (await table('household_bundle_invites')
      .select('id, owner_profile_id, to_profile_id, status, created_at, expires_at')
      .eq('to_profile_id', profileId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(10)) as { data: Record<string, unknown>[] | null }
    if (!rows?.length) return []

    const owners = await peopleById(rows.map((r) => str(r.owner_profile_id)))
    return rows.flatMap((r) => {
      const person = owners.get(str(r.owner_profile_id))
      if (!person) return []
      return [
        {
          id: str(r.id),
          ownerProfileId: str(r.owner_profile_id),
          toProfileId: str(r.to_profile_id),
          personName: str(person.display_name),
          personHandle: str(person.handle),
          personAvatarUrl: strOrNull(person.avatar_url),
          status: str(r.status),
          createdAt: str(r.created_at),
          expiresAt: str(r.expires_at),
        },
      ]
    })
  } catch {
    return []
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────────────────────

/** Best-effort in-app notice to the invitee, following the pattern every other invite in the repo
 *  uses (a `notifications` row written through the admin client). NEVER fails the action: an invite
 *  that exists but was not announced is recoverable; one that failed because the notice did is not. */
async function notifyInvitee(
  inviteId: string,
  ownerId: string,
  toProfileId: string,
  ownerName: string,
): Promise<void> {
  try {
    await table('notifications').insert({
      recipient_id: toProfileId,
      actor_id: ownerId,
      type: 'bundle_seat_invite',
      reference_type: 'bundle_invite',
      reference_id: inviteId,
      body: `${ownerName} offered you a seat on their Household bundle. Accept it in your plan settings.`,
    })
  } catch {
    /* best-effort */
  }
}

/**
 * Offer a bundle seat to a member, addressed by @handle. Creates a PENDING row and changes nothing
 * else: the invitee keeps their membership exactly as it is until they accept.
 *
 * The oversell guard is create_bundle_invite_atomic, not this function: the seat count and the
 * insert have to be one transaction under the per-bundle lock, or two sends racing for the last
 * seat both read "one free" and both write.
 */
// This helper self-guards: every write is bound to the viewer's OWN profile id, re-read as the
// bundle owner, so no caller-supplied id can seat anyone into somebody else's bundle.
export async function sendBundleSeatInvite(
  handleInput: string,
  viewerProfileId: string | null,
): Promise<SeatInviteResult> {
  if (!viewerProfileId) return { ok: false, reason: NOT_SIGNED_IN }
  const handle = handleInput.trim().replace(/^@/, '').toLowerCase()
  if (!handle) return { ok: false, reason: 'Enter the @handle of the member you want to seat.' }

  try {
    const board = await loadBundleSeatBoard(viewerProfileId)
    if (!board.ownsBundle) return { ok: false, reason: NOT_THE_OWNER }

    const admin = createAdminClient()
    const { data: target } = await admin
      .from('profiles')
      .select('id, display_name')
      .eq('handle', handle)
      .maybeSingle()
    if (!target) return { ok: false, reason: 'We could not find that member.' }

    const decision = canSendBundleSeatInvite({
      viewerProfileId,
      ownerProfileId: viewerProfileId,
      toProfileId: target.id,
      seatsOpen: board.seatsOpen,
    })
    if (!decision.allowed) return { ok: false, reason: decision.reason }

    const rpc = admin.rpc.bind(admin) as unknown as InviteRpc
    const { data, error } = await rpc('create_bundle_invite_atomic', {
      _owner: viewerProfileId,
      _invitee: target.id,
      _seats_fallback: board.seats,
    })
    if (error) {
      console.error('[bundle-invites] create failed', { message: error.message })
      return { ok: false, reason: 'Could not send that invite. Please try again.' }
    }
    if (data?.created !== true) {
      return { ok: false, reason: say(data?.reason, 'Could not send that invite. Please try again.') }
    }

    const { data: me } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', viewerProfileId)
      .maybeSingle()
    const { data: fresh } = (await table('household_bundle_invites')
      .select('id')
      .eq('owner_profile_id', viewerProfileId)
      .eq('to_profile_id', target.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()) as { data: Record<string, unknown> | null }
    if (fresh) {
      await notifyInvitee(str(fresh.id), viewerProfileId, target.id, me?.display_name ?? 'Someone')
    }
    return { ok: true, reason: '' }
  } catch {
    return { ok: false, reason: 'Could not send that invite. Please try again.' }
  }
}

/**
 * Accept or decline a seat. ONLY the invitee may, and accepting runs through
 * accept_bundle_invite_atomic so the seat write is one transaction under the per-bundle lock.
 *
 * 🔴 That function deliberately does not touch profiles.household_bundle_event_at. Do not route an
 * acceptance through apply_bundle_seating_atomic to "reuse" the seating code: it would advance the
 * Stripe ordering stamp and the next real cancellation would be dropped as stale.
 */
export async function respondToBundleSeatInvite(
  inviteId: string,
  action: 'accept' | 'decline',
  viewerProfileId: string | null,
): Promise<SeatInviteResult> {
  if (!inviteId || !viewerProfileId) return { ok: false, reason: NOT_SIGNED_IN }
  try {
    const { data: invite } = (await table('household_bundle_invites')
      .select('id, owner_profile_id, to_profile_id, status')
      .eq('id', inviteId)
      .maybeSingle()) as { data: Record<string, unknown> | null }
    if (!invite) return { ok: false, reason: SQL_REASON.not_found }

    const decision = canAnswerBundleSeatInvite({
      viewerProfileId,
      toProfileId: strOrNull(invite.to_profile_id),
    })
    if (!decision.allowed) return { ok: false, reason: decision.reason }

    if (action === 'decline') {
      // Claimed on status = 'pending', so two clicks answer once. Declining frees the seat the
      // pending invite was holding, with no other write.
      const { data: claimed } = (await table('household_bundle_invites')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', inviteId)
        .eq('status', 'pending')
        .select('id')) as { data: Record<string, unknown>[] | null }
      if (!(claimed ?? []).length) return { ok: false, reason: SQL_REASON.already_answered }
      return { ok: true, reason: '' }
    }

    // The granted tier and seat count fall back to the live operator config only for a bundle sold
    // before the terms were recorded; the SQL prefers what is stamped on the owner's row.
    const config = await getHouseholdBundle()
    const admin = createAdminClient()
    const rpc = admin.rpc.bind(admin) as unknown as InviteRpc
    const { data, error } = await rpc('accept_bundle_invite_atomic', {
      _invite: inviteId,
      _member: viewerProfileId,
      _tier_fallback: config.tier,
      _seats_fallback: config.seats,
    })
    if (error) {
      console.error('[bundle-invites] accept failed', { message: error.message })
      return { ok: false, reason: 'Could not take that seat. Please try again.' }
    }
    if (data?.seated !== true) {
      return { ok: false, reason: say(data?.reason, 'Could not take that seat. Please try again.') }
    }
    return { ok: true, reason: '' }
  } catch {
    return { ok: false, reason: 'Could not answer that invite. Please try again.' }
  }
}

/** Withdraw a pending invite. Only the bundle owner may, resolved the same way sending is. */
export async function revokeBundleSeatInvite(
  inviteId: string,
  viewerProfileId: string | null,
): Promise<SeatInviteResult> {
  if (!inviteId || !viewerProfileId) return { ok: false, reason: NOT_SIGNED_IN }
  try {
    const { data: invite } = (await table('household_bundle_invites')
      .select('id, owner_profile_id, status')
      .eq('id', inviteId)
      .maybeSingle()) as { data: Record<string, unknown> | null }
    if (!invite) return { ok: false, reason: SQL_REASON.not_found }

    const decision = canRevokeBundleSeatInvite({
      viewerProfileId,
      ownerProfileId: strOrNull(invite.owner_profile_id),
    })
    if (!decision.allowed) return { ok: false, reason: decision.reason }

    const { data: claimed } = (await table('household_bundle_invites')
      .update({ status: 'revoked', responded_at: new Date().toISOString() })
      .eq('id', inviteId)
      .eq('status', 'pending')
      .select('id')) as { data: Record<string, unknown>[] | null }
    if (!(claimed ?? []).length) return { ok: false, reason: SQL_REASON.already_answered }
    return { ok: true, reason: '' }
  } catch {
    return { ok: false, reason: 'Could not withdraw that invite. Please try again.' }
  }
}
