/**
 * The partner store (FH-029): the IO half of lib/hunts/partners.ts over `hunt_partners`.
 *
 * Every Hunt table is service role only, so this file is the tenancy wall for the partner screens. The
 * organiser side runs behind the Hunt gate (lib/hunts/authz.ts `publish`: owner and admin). The venue
 * side never trusts the link: it reads the row and the caller's standing in the Space fresh for every
 * call, and a caller who is neither the named steward nor a current steward of the Space reads nothing.
 *
 * "Steward" of a Space is its owner or an ACTIVE admin member. Platform staff standing does not count:
 * an agreement binds the venue, so a person who answers for it has to belong to it.
 *
 * Every state change is one conditional update on the status it expects, so two answers racing each
 * other cannot both land, and each one writes a `hunt_audit` row. Nothing here writes a claim, a
 * progress row or a reward: withdrawal ends the partner and leaves earned credit alone.
 */
import { getSpaceMembership } from '@/lib/spaces/membership'
import { getSpaceById, getSpaceBySlug } from '@/lib/spaces/store'
import type { PartnerRow } from './authz'
import { db } from './commerce-store'
import { parseTrailDraft } from './draft'
import {
  decideInvite,
  decideSteward,
  partnerLive,
  PARTNER_DEFAULT_ROLES,
  PARTNER_TERMS,
  revokeTarget,
  type PartnerInvite,
  type PartnerTerms,
  type StewardAction,
  type StewardRefusal,
} from './partners'
import { authorizeHuntAction } from './store'

type Row = {
  hunt_id: string
  space_id: string
  status: PartnerRow['status']
  effective_at: string | null
  revoked_at: string | null
  permitted_roles: string[] | null
  invitee_profile_id: string | null
  terms_version: string | null
}
const COLS = 'hunt_id, space_id, status, effective_at, revoked_at, permitted_roles, invitee_profile_id, terms_version'

const toInvite = (r: Row): PartnerInvite => ({
  huntId: r.hunt_id,
  spaceId: r.space_id,
  status: r.status,
  effectiveAt: r.effective_at,
  revokedAt: r.revoked_at,
  permittedRoles: r.permitted_roles ?? [],
  inviteeProfileId: r.invitee_profile_id,
  termsVersion: r.terms_version,
})

async function loadRow(huntId: string, spaceId: string): Promise<PartnerInvite | null> {
  const { data, error } = await db().from('hunt_partners').select(COLS).eq('hunt_id', huntId).eq('space_id', spaceId).maybeSingle()
  return error || !data ? null : toInvite(data as Row)
}

/** Is this person the Space's owner or an active admin member, read now? */
export async function isStewardNow(spaceId: string, profileId: string): Promise<boolean> {
  const space = await getSpaceById(spaceId)
  if (!space) return false
  if (space.ownerProfileId && space.ownerProfileId === profileId) return true
  const membership = await getSpaceMembership(spaceId, profileId)
  return !!membership && membership.status === 'active' && membership.role === 'admin'
}

async function audit(huntId: string, actorId: string, action: string, spaceId: string, after: Record<string, unknown>): Promise<void> {
  const { error } = await db().from('hunt_audit').insert({
    hunt_id: huntId,
    actor_profile_id: actorId,
    action,
    target_kind: 'partner',
    target_id: spaceId,
    after_state: after,
  })
  if (error) throw new Error(`hunt_audit failed: ${error.message}`)
}

// ── The organiser ────────────────────────────────────────────────────────────────────────────────

export type PartnerListItem = Readonly<{
  spaceId: string
  spaceName: string
  stewardName: string | null
  status: PartnerRow['status']
  live: boolean
  termsCurrent: boolean
}>

/** The organiser's partner list, or null when the Hunt is missing or not the caller's to run. */
export async function listPartners(huntId: string, actorId: string, now: string): Promise<{ partners: PartnerListItem[]; termsApproved: boolean } | null> {
  const hunt = await authorizeHuntAction(huntId, { profileId: actorId }, 'publish')
  if (!hunt) return null
  const { data } = await db().from('hunt_partners').select(COLS).eq('hunt_id', huntId).order('invited_at', { ascending: false })
  const rows = ((data ?? []) as Row[]).map(toInvite)
  const stewardIds = [...new Set(rows.map((r) => r.inviteeProfileId).filter((v): v is string => !!v))]
  const { data: people } = stewardIds.length
    ? await db().from('profiles').select('id, display_name').in('id', stewardIds)
    : { data: [] }
  const names = new Map(((people ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]))
  const spaces = await Promise.all(rows.map((r) => getSpaceById(r.spaceId)))
  return {
    termsApproved: PARTNER_TERMS.approved,
    partners: rows.map((r, i) => ({
      spaceId: r.spaceId,
      spaceName: spaces[i]?.name ?? 'A Space',
      stewardName: (r.inviteeProfileId && names.get(r.inviteeProfileId)) || null,
      status: r.status,
      live: partnerLive(r, now),
      termsCurrent: r.termsVersion === PARTNER_TERMS.hash,
    })),
  }
}

export type OrganiserRefusal = 'forbidden' | 'not_a_steward' | 'own_space' | 'already_partner' | 'nothing_to_end' | 'changed' | 'failed'
type InviteResult = { ok: true } | { ok: false; reason: OrganiserRefusal }

/**
 * Invite a Space, naming the steward who may answer. The Space comes from its slug and the steward from
 * their handle; both are looked up here, and the steward must hold the role right now. Re-inviting a
 * Space that declined, withdrew or let an invite lapse reopens its one row with the current terms.
 */
export async function invitePartner(huntId: string, actorId: string, input: { spaceSlug: string; stewardHandle: string }, now: string): Promise<InviteResult> {
  const hunt = await authorizeHuntAction(huntId, { profileId: actorId }, 'publish')
  if (!hunt) return { ok: false, reason: 'forbidden' }
  const space = await getSpaceBySlug(input.spaceSlug)
  const handle = input.stewardHandle.trim().replace(/^@/, '').toLowerCase()
  const { data: person } = handle
    ? await db().from('profiles').select('id').eq('handle', handle).maybeSingle()
    : { data: null }
  const stewardId = (person as { id: string } | null)?.id ?? null
  // One answer for a missing Space, a missing person and a person without the role: the form is not a lookup tool.
  const notSteward: InviteResult = { ok: false, reason: 'not_a_steward' }
  if (!space || !stewardId) return notSteward

  const current = await loadRow(huntId, space.id)
  const verdict = decideInvite({
    current,
    ownerSpaceId: hunt.ownerSpaceId,
    spaceId: space.id,
    inviteeIsStewardNow: await isStewardNow(space.id, stewardId),
    now,
  })
  if (!verdict.ok) return verdict

  const { error } = await db().from('hunt_partners').upsert(
    {
      hunt_id: huntId,
      space_id: space.id,
      status: 'invited',
      invited_by: actorId,
      invited_at: now,
      invitee_profile_id: stewardId,
      terms_version: PARTNER_TERMS.hash,
      accepted_by: null,
      effective_at: null,
      revoked_at: null,
      permitted_roles: [...PARTNER_DEFAULT_ROLES],
    },
    { onConflict: 'hunt_id,space_id' },
  )
  if (error) return { ok: false, reason: 'failed' }
  await audit(huntId, actorId, 'partner_invited', space.id, { status: 'invited', invitee_profile_id: stewardId, terms_version: PARTNER_TERMS.hash })
  return { ok: true }
}

/** End a partner (suspended) or an unanswered invite (expired). New proof at that venue stops; credit stays. */
export async function revokePartner(huntId: string, actorId: string, spaceId: string, now: string): Promise<InviteResult> {
  const hunt = await authorizeHuntAction(huntId, { profileId: actorId }, 'publish')
  if (!hunt) return { ok: false, reason: 'forbidden' }
  const target = revokeTarget(await loadRow(huntId, spaceId))
  if (!target) return { ok: false, reason: 'nothing_to_end' }
  const { data, error } = await db()
    .from('hunt_partners')
    .update({ status: target.to, revoked_at: now })
    .eq('hunt_id', huntId)
    .eq('space_id', spaceId)
    .eq('status', target.from)
    .select('space_id')
  if (error || (data ?? []).length !== 1) return { ok: false, reason: 'changed' }
  await audit(huntId, actorId, target.to === 'suspended' ? 'partner_suspended' : 'partner_invite_expired', spaceId, { status: target.to })
  return { ok: true }
}

// ── The venue ────────────────────────────────────────────────────────────────────────────────────

export type StewardInviteView = Readonly<{
  huntId: string
  spaceId: string
  spaceName: string
  huntTitle: string
  status: PartnerRow['status']
  live: boolean
  /** The caller is the person the open invite names. */
  isInvitee: boolean
  termsApproved: boolean
  termsCurrent: boolean
  termsVersion: string | null
}>

/**
 * What the venue's screen shows, or null. Null covers a missing row, a forwarded link (the caller is
 * not the named steward) and a caller who is not a steward of the Space, so the three look the same.
 */
export async function loadStewardInvite(huntId: string, spaceId: string, actorId: string, now: string, terms: PartnerTerms = PARTNER_TERMS): Promise<StewardInviteView | null> {
  const invite = await loadRow(huntId, spaceId)
  if (!invite) return null
  if (!(await isStewardNow(spaceId, actorId))) return null
  const isInvitee = invite.status === 'invited' && invite.inviteeProfileId === actorId
  if (invite.status === 'invited' && !isInvitee) return null
  const space = await getSpaceById(spaceId)
  const { data: version } = await db().from('hunt_versions').select('policy').eq('hunt_id', huntId).order('version_no', { ascending: false }).limit(1).maybeSingle()
  const title = parseTrailDraft((version as { policy: { trail?: unknown } | null } | null)?.policy?.trail).title
  return {
    huntId,
    spaceId,
    spaceName: space?.name ?? 'Your Space',
    huntTitle: title || 'A Hunt',
    status: invite.status,
    live: partnerLive(invite, now),
    isInvitee,
    termsApproved: terms.approved,
    termsCurrent: invite.termsVersion === terms.hash,
    termsVersion: invite.termsVersion,
  }
}

const AUDIT: Record<'accepted' | 'declined' | 'withdrawn', string> = {
  accepted: 'partner_accepted',
  declined: 'partner_declined',
  withdrawn: 'partner_withdrawn',
}

/**
 * Accept, decline or withdraw as the venue. The row and the caller's standing are read here, now; the
 * decision is lib/hunts/partners.ts `decideSteward`; the write lands only on the status it decided from.
 */
export async function respondAsSteward(
  action: StewardAction,
  input: { huntId: string; spaceId: string; actorId: string; now: string; terms?: PartnerTerms },
): Promise<{ ok: true; status: 'accepted' | 'declined' | 'withdrawn' } | { ok: false; reason: StewardRefusal | 'changed' }> {
  const { huntId, spaceId, actorId, now } = input
  const invite = await loadRow(huntId, spaceId)
  const verdict = decideSteward(action, {
    invite,
    actorId,
    actorIsStewardNow: invite ? await isStewardNow(spaceId, actorId) : false,
    terms: input.terms ?? PARTNER_TERMS,
    now,
  })
  if (!verdict.ok) return verdict

  const patch =
    verdict.to === 'accepted'
      ? { status: 'accepted', accepted_by: actorId, effective_at: now, revoked_at: null }
      : verdict.to === 'withdrawn'
        ? { status: 'withdrawn', revoked_at: now }
        : { status: 'declined' }
  let write = db().from('hunt_partners').update(patch).eq('hunt_id', huntId).eq('space_id', spaceId).eq('status', verdict.from)
  // Accept and decline land only while the row still names this person.
  if (verdict.from === 'invited') write = write.eq('invitee_profile_id', actorId)
  const { data, error } = await write.select('space_id')
  if (error || (data ?? []).length !== 1) return { ok: false, reason: 'changed' }
  await audit(huntId, actorId, AUDIT[verdict.to], spaceId, { status: verdict.to, terms_version: invite?.termsVersion ?? null })
  return { ok: true, status: verdict.to }
}
