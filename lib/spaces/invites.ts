// SPACE INVITES — invite a teammate to a Space by email (ENTITY-SPACES-SYSTEM §3.2, the team layer).
//
// Today only the Space OWNER is auto-seated (spaces.owner_profile_id) and there is no way to add a
// second person. This module is the missing seam: a Space OWNER (or admin) creates a PENDING invite
// for an email at a role; the invitee accepts via a tokened link (/spaces/invite/<token>), which
// seats them in space_members via addSpaceMember (lib/spaces/membership.ts) and marks the invite
// accepted.
//
// SHAPE (mirrors lib/spaces/memberships.ts): the PURE helpers (email/role validation, token
// generation, expiry) have no Supabase/Next imports, so they are fully unit-testable
// (lib/spaces/invites.test.ts). The IO (the admin-client reads/writes through an untyped cast, the
// table is not in the generated DB types yet, ADR-246) and the ACTION IMPLEMENTATIONS are below them.
// This module has NO 'use server' directive (so it can ALSO export the pure helpers + types the test
// and the server-component reads need). The thin 'use server' wrappers the CLIENT components call
// live in lib/spaces/invites-actions.ts.
//
// AUTHORITY: createInvite / listInvites / revokeInvite are gated on canManageMembers (owner / admin,
// see lib/spaces/entitlements.ts). acceptInvite is for the AUTHENTICATED invitee. The server is the
// authority for every gate (P5): reads fail-safe (empty / null), writes fail-closed on a permission
// miss. EMAIL DELIVERY IS OUT OF SCOPE for now — createInvite returns the link/token so the owner
// can share it by hand; sending the email is a later, additive step (never a refactor, P4).

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { addSpaceMember, isSpaceRole, type SpaceRole } from '@/lib/spaces/membership'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  inviteAcceptUrl,
  type InviteStatus,
  type SpaceInvite,
  type CreatedInvite,
} from '@/lib/spaces/invites-shared'

// Re-export the client-safe surface so existing server + test imports from '@/lib/spaces/invites'
// keep resolving. The lifecycle type, the row + result shapes, and the pure accept-link helper now
// live in invites-shared.ts (no server imports) so a CLIENT component can import them without
// pulling this module's server-only IO graph into the browser bundle.
export { inviteAcceptUrl } from '@/lib/spaces/invites-shared'
export type { InviteStatus, SpaceInvite, CreatedInvite } from '@/lib/spaces/invites-shared'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────
// InviteStatus / SpaceInvite / CreatedInvite live in invites-shared.ts (client-safe) and are
// imported + re-exported above, so server-side and test imports from this module are unchanged.

const INVITE_STATUSES: readonly InviteStatus[] = ['pending', 'accepted', 'revoked'] as const

// ── PURE: validation + token + link (no IO, fully testable) ─────────────────────────────────────

/** A string is a known InviteStatus (fail-closed for unknowns / future enum values). */
export function isInviteStatus(v: unknown): v is InviteStatus {
  return typeof v === 'string' && (INVITE_STATUSES as readonly string[]).includes(v)
}

/** Normalize a raw email to its canonical comparison form (trimmed + lower-cased), or null if it is
 *  not a plausible email. Deliberately permissive (one @, a dot in the domain, no spaces) — the goal
 *  is to reject obvious junk, not to RFC-validate; the real check is whether it matches a profile on
 *  accept. Pure + fail-closed. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (!email || email.length > 254) return null
  // One @, non-empty local part, a dotted domain, and no whitespace anywhere.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

/** Coerce a raw role to a valid SpaceRole, defaulting to 'editor' (the common "add a teammate"
 *  case). Pure; mirrors the table default. */
export function normalizeInviteRole(raw: unknown): SpaceRole {
  return isSpaceRole(raw) ? raw : 'editor'
}

/** Generate a single-use, unguessable invite token. crypto where available (a v4 UUID with the
 *  dashes stripped, doubled for length), with a non-crypto fallback so the helper never throws.
 *  Pure (no IO). */
export function generateInviteToken(): string {
  try {
    return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  } catch {
    // Fallback: still high-entropy enough for a short-lived, single-use, server-checked link.
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random()
      .toString(36)
      .slice(2)}`
  }
}

/** Whether an ISO timestamp is in the past relative to `now` (default: real now). Pure + fail-safe:
 *  an unparseable value reads as EXPIRED (fail-closed — a bad timestamp never grants access). */
export function isExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return true
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return true
  return t <= now
}

// ── IO: the untyped admin-client seam (table not in generated types yet, ADR-246) ──────────────

type InviteRow = {
  id: string
  space_id: string
  email: string
  role: string
  token: string
  status: string
  invited_by: string | null
  expires_at: string
  created_at: string
}

const INVITE_COLS = 'id, space_id, email, role, token, status, invited_by, expires_at, created_at'

// The chainable query-builder surface these helpers use. `space_invites` is not in the generated DB
// types, so `createAdminClient().from('space_invites')` would fail the typed-table overload — reach
// the table through an untyped `from` accessor (ADR-246) and type the builder loosely here. Mirrors
// the shape in lib/spaces/membership.ts.
type InvitesQuery = {
  select: (cols: string) => InvitesQuery
  eq: (col: string, val: string) => InvitesQuery
  order: (col: string, opts: { ascending: boolean }) => InvitesQuery
  insert: (rows: Record<string, unknown>[]) => InvitesQuery
  update: (patch: Record<string, unknown>) => InvitesQuery
  maybeSingle: () => Promise<{ data: InviteRow | null; error: unknown }>
  then: (
    resolve: (r: { data: InviteRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

/** The untyped `space_invites` query builder (the table isn't in the generated types yet, ADR-246). */
function invitesTable(): InvitesQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => InvitesQuery }
  return db.from('space_invites')
}

/** Map a raw row to a typed SpaceInvite, fail-closed: an unknown role/status drops the row (returns
 *  null) so a future enum value the build doesn't know never resolves. */
function mapInvite(r: InviteRow): SpaceInvite | null {
  if (!isSpaceRole(r.role) || !isInviteStatus(r.status)) return null
  return {
    id: r.id,
    spaceId: r.space_id,
    email: r.email,
    role: r.role,
    token: r.token,
    status: r.status,
    invitedBy: r.invited_by,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }
}

// ── PUBLIC SERVER ACTIONS (all gated / validated server-side) ──────────────────────────────────

/**
 * Create (or refresh) a PENDING invite for an email at a role. Gated on canManageMembers (owner /
 * admin). Validates the email + role, generates a fresh token, then REFRESHES the live invite for the
 * email if one exists (new token + role + expiry) or inserts a new one, so re-inviting the same email
 * never piles up. CHECK-THEN-WRITE in app code (an expression partial index is not a usable PostgREST
 * upsert target, the codebase convention for the booking/membership partial indexes); the partial
 * unique index (space_id, lower(email)) WHERE status='pending' is the race backstop. Returns the
 * invite + the ready-to-share accept link (email delivery is NOT built yet — the owner shares the
 * link by hand). Fail-closed on permission.
 */
export async function createInvite(
  spaceId: string,
  email: string,
  role: SpaceRole,
): Promise<ActionResult<CreatedInvite>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to invite a teammate.')

  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return fail('Enter a valid email address.')
  const cleanRole = normalizeInviteRole(role)

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canManageMembers)
    return fail('You do not have permission to invite teammates to this space.')

  const token = generateInviteToken()
  // Refresh the 14-day window on every (re-)invite so a refreshed link is freshly live.
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  try {
    // Is there already a LIVE invite for this email in this Space? Refresh it in place (the email is
    // stored lower-cased, so the comparison matches the partial-unique index's lower(email)).
    let existing: InviteRow | null = null
    try {
      const { data } = await invitesTable()
        .select(INVITE_COLS)
        .eq('space_id', spaceId)
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .maybeSingle()
      existing = data
    } catch {
      existing = null
    }

    if (existing) {
      const { data, error } = await invitesTable()
        .update({ role: cleanRole, token, invited_by: profileId, expires_at: expiresAt })
        .eq('id', existing.id)
        .select(INVITE_COLS)
        .maybeSingle()
      if (error || !data) return fail('Could not create the invite. Try again.')
      const invite = mapInvite(data)
      if (!invite) return fail('Could not create the invite. Try again.')
      return ok({ invite, acceptUrl: inviteAcceptUrl(invite.token) })
    }

    const { data, error } = await invitesTable()
      .insert([
        {
          space_id: spaceId,
          email: normalizedEmail,
          role: cleanRole,
          token,
          status: 'pending',
          invited_by: profileId,
          expires_at: expiresAt,
        },
      ])
      .select(INVITE_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not create the invite. Try again.')
    const invite = mapInvite(data)
    if (!invite) return fail('Could not create the invite. Try again.')
    return ok({ invite, acceptUrl: inviteAcceptUrl(invite.token) })
  } catch {
    return fail('Could not create the invite. Try again.')
  }
}

/**
 * A Space's PENDING invites, newest first. Gated on canManageMembers (owner / admin). The owner list
 * renders these with their role + a copyable accept link + a revoke control. FAIL-SAFE to [] for an
 * anonymous / unauthorized caller or any error; unknown roles/statuses are dropped (fail-closed).
 */
export async function listInvites(spaceId: string): Promise<SpaceInvite[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canManageMembers) return []

  try {
    const { data, error } = await invitesTable()
      .select(INVITE_COLS)
      .eq('space_id', spaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return data.flatMap((r) => {
      const m = mapInvite(r)
      return m ? [m] : []
    })
  } catch {
    return []
  }
}

/**
 * Revoke a pending invite. Reads the row (admin client) to resolve its Space, gates on
 * canManageMembers for THAT Space (owner / admin), then flips status to 'revoked' (which frees the
 * one-live-invite slot so the email can be re-invited). Fail-closed on permission.
 */
export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage invites.')

  let row: InviteRow | null = null
  try {
    const { data } = await invitesTable().select(INVITE_COLS).eq('id', inviteId).maybeSingle()
    row = data
  } catch {
    row = null
  }
  if (!row) return fail('Invite not found.')

  const space = await getSpaceById(row.space_id)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canManageMembers)
    return fail('You do not have permission to manage invites for this space.')

  try {
    const { error } = await invitesTable().update({ status: 'revoked' }).eq('id', inviteId)
    if (error) return fail('Could not revoke the invite. Try again.')
  } catch {
    return fail('Could not revoke the invite. Try again.')
  }
  return ok()
}

/**
 * Accept an invite by its token, for the AUTHENTICATED invitee. Validates that the token resolves to
 * a PENDING, NOT-EXPIRED invite, then seats the caller in space_members at the invite's role
 * (addSpaceMember, status 'active') and marks the invite accepted. Returns the Space slug on success
 * so the route can redirect into the Space. Fail-closed: an unknown / expired / already-used token,
 * or an anonymous caller, never seats anyone.
 *
 * The invite is matched to a person on LOGIN, not by email equality: whoever is signed in when they
 * open the link is seated. The token is the single-use secret, so possession of the link is the
 * grant (the standard "accept on login" flow); the email on the invite is who it was addressed to.
 */
export async function acceptInvite(
  token: string,
): Promise<ActionResult<{ spaceSlug: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to accept this invite.')

  const clean = typeof token === 'string' ? token.trim() : ''
  if (!clean) return fail('This invite link is not valid.')

  let row: InviteRow | null = null
  try {
    const { data } = await invitesTable().select(INVITE_COLS).eq('token', clean).maybeSingle()
    row = data
  } catch {
    row = null
  }
  const invite = row ? mapInvite(row) : null
  if (!invite) return fail('This invite link is not valid.')
  if (invite.status !== 'pending') return fail('This invite has already been used.')
  if (isExpired(invite.expiresAt)) return fail('This invite has expired. Ask for a new one.')

  const space = await getSpaceById(invite.spaceId)
  if (!space) return fail('That space is no longer available.')

  // Seat the invitee. addSpaceMember upserts on (space_id, profile_id), so accepting is idempotent
  // (a person who already has a row has it set to the invite's role + active).
  const seated = await addSpaceMember({
    spaceId: invite.spaceId,
    profileId,
    role: invite.role,
    status: 'active',
    invitedBy: invite.invitedBy,
  })
  if (!seated) return fail('Could not add you to the space. Try again.')

  // Mark the invite accepted (best-effort: the seat is the real outcome; a failed status update
  // leaves a stale pending row, harmlessly re-acceptable, but does not block the seated member).
  try {
    await invitesTable()
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id)
  } catch {
    // Ignore: the member is seated; the pending row is cosmetic at this point.
  }

  return ok({ spaceSlug: space.slug })
}
