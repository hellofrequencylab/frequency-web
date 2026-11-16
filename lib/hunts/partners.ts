/**
 * Hunt partner invites, acceptance and withdrawal (FH-029). Pure: no database, no Next, no network.
 * lib/hunts/partner-store.ts loads the facts fresh for each request and writes what this decides.
 * The terms a partner accepts are docs/hunts/PARTNER-AGREEMENT.md.
 *
 * Rules, each pinned by partners.test.ts:
 * - An invite is bound to one Hunt, one Space and one NAMED steward of that Space. There is no token:
 *   the link only names the Hunt and the Space. Acceptance checks that the signed-in person is the named
 *   steward and is a steward of that Space right now, so a forwarded link confers nothing.
 * - The invite pins the terms version it was sent with (the sha256 of the agreement text). Acceptance
 *   is refused when the terms are not owner approved, or when they changed since the invite was sent:
 *   a new version needs a new invite.
 * - A partner is live only while its row is accepted, effective and not revoked. Withdrawal and
 *   revocation end it at once. Nothing here touches a claim, so credit already earned stays.
 * - Publish refuses a stop placed at a venue Space that is not the Hunt's own Space and has no live
 *   partner row. The claim side of the same rule is in SQL (`hunt_claim_apply`, migration
 *   20270346075000), because that function is the only writer of a credit.
 */
import { createHash } from 'node:crypto'
import type { PartnerRow } from './authz'

/**
 * The terms version an invite pins. `hash` is the sha256 of docs/hunts/PARTNER-AGREEMENT.md and
 * `approved` mirrors its owner approval marker (ledger row FH-028S). partners.test.ts reads the file and
 * fails when either drifts, so the terms cannot change, or become approved, without this line changing
 * in the same commit. While `approved` is false no venue can accept.
 */
export const PARTNER_TERMS = {
  hash: 'e160de00cd3c167c52fc1152e16a13f50cc124ed305cf3c9c8d95c355b6574e6',
  approved: false,
} as const

export type PartnerTerms = { hash: string; approved: boolean }

/** The version of a terms text: the sha256 of its exact bytes. */
export const partnerTermsHash = (text: string): string => createHash('sha256').update(text).digest('hex')

/** What an accepted venue's staff may do (the Partner Space column in docs/hunts/ROLE-MATRIX.md). */
export const PARTNER_DEFAULT_ROLES: readonly string[] = ['operator']

/** A partner row plus the two facts an invite adds: who it names and which terms it pins. */
export type PartnerInvite = PartnerRow & { inviteeProfileId: string | null; termsVersion: string | null }

/** Is this partner row in force at `now`? The same rule lib/hunts/authz.ts applies to a venue's staff. */
export function partnerLive(row: Pick<PartnerRow, 'status' | 'effectiveAt' | 'revokedAt'>, now: string): boolean {
  const at = Date.parse(now)
  return (
    row.status === 'accepted' &&
    row.effectiveAt !== null &&
    Date.parse(row.effectiveAt) <= at &&
    (row.revokedAt === null || Date.parse(row.revokedAt) > at)
  )
}

type InviteRefusal = 'own_space' | 'not_a_steward' | 'already_partner'

/** May the organiser send this invite? The named person must be a steward of the Space right now. */
export function decideInvite(input: {
  current: Pick<PartnerRow, 'status' | 'effectiveAt' | 'revokedAt'> | null
  ownerSpaceId: string | null
  spaceId: string
  inviteeIsStewardNow: boolean
  now: string
}): { ok: true } | { ok: false; reason: InviteRefusal } {
  if (input.ownerSpaceId && input.ownerSpaceId === input.spaceId) return { ok: false, reason: 'own_space' }
  if (!input.inviteeIsStewardNow) return { ok: false, reason: 'not_a_steward' }
  if (input.current && partnerLive(input.current, input.now)) return { ok: false, reason: 'already_partner' }
  return { ok: true }
}

export type StewardAction = 'accept' | 'decline' | 'withdraw'

export type StewardRefusal = 'no_invite' | 'not_invitee' | 'not_steward_now' | 'terms_not_approved' | 'terms_changed' | 'not_a_partner'

type StewardDecision =
  | { ok: true; from: PartnerRow['status']; to: 'accepted' | 'declined' | 'withdrawn' }
  | { ok: false; reason: StewardRefusal }

/**
 * What the venue side may do to its own row. Accept and decline belong to the named steward only;
 * withdraw belongs to any current steward of the Space, because the person who accepted may have left.
 * `actorIsStewardNow` is read this request, never from the invite.
 */
export function decideSteward(
  action: StewardAction,
  input: { invite: PartnerInvite | null; actorId: string; actorIsStewardNow: boolean; terms: PartnerTerms; now: string },
): StewardDecision {
  const { invite, actorId, actorIsStewardNow, terms, now } = input
  if (!invite) return { ok: false, reason: 'no_invite' }

  if (action === 'withdraw') {
    if (!actorIsStewardNow) return { ok: false, reason: 'not_steward_now' }
    if (!partnerLive(invite, now)) return { ok: false, reason: 'not_a_partner' }
    return { ok: true, from: 'accepted', to: 'withdrawn' }
  }

  if (invite.status !== 'invited') return { ok: false, reason: 'no_invite' }
  // The forwarded link: whoever opens it is not the person the invite names.
  if (!invite.inviteeProfileId || invite.inviteeProfileId !== actorId) return { ok: false, reason: 'not_invitee' }
  // The named person left the Space, or lost the role, after the invite was sent.
  if (!actorIsStewardNow) return { ok: false, reason: 'not_steward_now' }
  if (action === 'decline') return { ok: true, from: 'invited', to: 'declined' }
  if (!terms.approved) return { ok: false, reason: 'terms_not_approved' }
  if (!invite.termsVersion || invite.termsVersion !== terms.hash) return { ok: false, reason: 'terms_changed' }
  return { ok: true, from: 'invited', to: 'accepted' }
}

/** The organiser's revoke: a live partner is suspended, an unanswered invite expires. Null means nothing to end. */
export function revokeTarget(row: Pick<PartnerRow, 'status'> | null): { from: 'accepted' | 'invited'; to: 'suspended' | 'expired' } | null {
  if (row?.status === 'accepted') return { from: 'accepted', to: 'suspended' }
  if (row?.status === 'invited') return { from: 'invited', to: 'expired' }
  return null
}

/**
 * The venue Spaces that stop a publish: every venue a stop is placed at that is not the Hunt's own
 * Space and has no live partner row. Empty means the publish may go on.
 */
export function publishVenueBlocks(input: {
  huntId: string
  ownerSpaceId: string | null
  venueSpaceIds: readonly (string | null)[]
  partners: readonly PartnerRow[]
  now: string
}): string[] {
  const venues = [...new Set(input.venueSpaceIds.filter((v): v is string => !!v && v !== input.ownerSpaceId))]
  return venues
    .filter((venue) => !input.partners.some((p) => p.huntId === input.huntId && p.spaceId === venue && partnerLive(p, input.now)))
    .sort()
}

/** What a steward reads for each refusal. A forwarded link and a missing invite read the same. */
export function stewardRefusalMessage(reason: StewardRefusal): string {
  switch (reason) {
    case 'not_steward_now':
      return 'Only a current steward of this Space can answer for it.'
    case 'terms_not_approved':
      return 'The partner terms are not final yet, so this invite cannot be accepted today.'
    case 'terms_changed':
      return 'The partner terms changed after this invite was sent. Ask the organiser for a new invite.'
    case 'not_a_partner':
      return 'This Space is not an active partner on this Hunt.'
    default:
      return 'There is no open invite here for you.'
  }
}
