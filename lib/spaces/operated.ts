// "Spaces you run" — the Spaces a profile OWNS or ADMINS (the operator's own set).
//
// One BATCHED derivation (no N+1) used by two callers: the operator-context switcher
// (lib/context/operator-context.ts, which re-validates the chosen operator target
// against this real set) and the "Spaces you run" hub (/spaces/operating). It folds
// the two ways a person operates a Space into one list:
//   1. OWNERSHIP — `spaces.owner_profile_id = me` (the operator who stood it up).
//   2. ADMIN MEMBERSHIP — an ACTIVE `space_members` row with role `admin`.
// A Space the person merely belongs to at a lower role (viewer/editor/moderator) is NOT
// "a space you run" — only the ADMIN rung (the canManageMembers authority) counts here, so
// this list mirrors exactly the Spaces the existing manage gate (resolveSpaceManageAccess /
// canManageMembers) would let them administer.
//
// Service-role reads (the admin client, like the rest of the Spaces layer); FAIL-SAFE to `[]`
// on any error. `space_members` isn't in the generated DB types yet, so it is reached through an
// untyped client (ADR-246), the same shape lib/spaces/membership.ts + discovery.ts use.
//
// NOTE: this is a DERIVATION over existing tables (spaces.owner_profile_id + space_members) —
// there is no "operator" table and none is needed. Authority is never read from a cookie here;
// it is re-derived from the DB every call.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from './store'
import { spaceManageHref, type Space, type SpaceType } from './types'

/** One Space the caller runs, with the cheap bits the hub + the switcher need. */
export interface OperatedSpace {
  id: string
  slug: string
  /** Display brand name when set, else the plain Space name (resolved here so callers stay dumb). */
  name: string
  type: SpaceType
  /** Operator-supplied logo URL, or null. */
  logoUrl: string | null
  /** The owner-management entry point for this Space (its `/manage` console or legacy `/settings`). */
  manageHref: string
  /** How the caller runs it: the Space owner, or an active `admin` member. */
  via: 'owner' | 'admin'
  /** Count of ACTIVE members of this Space, or null when unavailable/omitted. */
  memberCount: number | null
}

// The untyped `space_members` builder (the table isn't in the generated types yet, ADR-246).
type AdminMemberRow = { space_id: string }
type MembersQuery = {
  select: (cols: string) => MembersQuery
  eq: (col: string, val: string) => MembersQuery
  in: (col: string, vals: string[]) => MembersQuery
  limit: (n: number) => MembersQuery
  then: (resolve: (r: { data: AdminMemberRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}

function membersTable(): MembersQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => MembersQuery }
  return db.from('space_members')
}

// The untyped `spaces` builder (owner_profile_id is typed, but the brand/visibility tail is not).
type OwnedSpaceRow = { id: string }
type SpacesQuery = {
  select: (cols: string) => SpacesQuery
  eq: (col: string, val: string) => SpacesQuery
  limit: (n: number) => SpacesQuery
  then: (resolve: (r: { data: OwnedSpaceRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}

function spacesTable(): SpacesQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => SpacesQuery }
  return db.from('spaces')
}

/** Active-member counts per Space across a set of ids — one grouped read, fail-safe to an empty
 *  map (so a missing table or any error just omits counts). Cheap: a single query over the
 *  leading-column space_id index, tallied in app code over the matched ids only. Mirrors
 *  discovery.ts `memberCountsFor`. */
async function memberCountsFor(spaceIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (spaceIds.length === 0) return counts
  try {
    const result = (await membersTable()
      .select('space_id')
      .eq('status', 'active')
      .in('space_id', spaceIds)) as { data: AdminMemberRow[] | null; error: unknown }
    if (result.error || !result.data) return counts
    for (const row of result.data) {
      counts.set(row.space_id, (counts.get(row.space_id) ?? 0) + 1)
    }
    return counts
  } catch {
    return counts
  }
}

/** Build an OperatedSpace view of a resolved Space, marking HOW the caller runs it. PURE. The
 *  `root` platform Space is never "a space you run" — callers filter it out before this. */
function toOperatedSpace(space: Space, via: 'owner' | 'admin', memberCount: number | null): OperatedSpace {
  return {
    id: space.id,
    slug: space.slug,
    name: space.brandName?.trim() || space.name,
    type: space.type,
    logoUrl: space.brandLogoUrl,
    manageHref: spaceManageHref(space.type, space.slug),
    via,
    memberCount,
  }
}

/**
 * The Spaces a profile OWNS or ADMINS, name-ordered, each with its manage href + cheap stats.
 * ONE batched derivation, re-computed from the DB (never a cookie):
 *   1. SELECT spaces WHERE owner_profile_id = me.
 *   2. SELECT space_members WHERE profile_id = me AND role = 'admin' AND status = 'active'.
 *   3. Union the two id sets (ownership wins the `via` label), resolve each Space once, count members.
 * The platform `root` Space and any non-active Space are excluded (you can't "run" the platform).
 * FAIL-SAFE: `[]` on any error. REQUEST-CACHED (React.cache) keyed on the profile id, so the shell +
 * the hub resolve it at most once per request.
 */
export const listOperatedSpaces = cache(
  async (profileId: string | null | undefined): Promise<OperatedSpace[]> => {
    if (!profileId) return []
    try {
      // (1) Owned Space ids + (2) admin-membership Space ids — two cheap reads, in parallel. The
      // untyped builders are thenables (a `then` method), so awaiting them resolves the query; the
      // result payload is cast to its row shape (the discovery.ts pattern for not-yet-typed tables).
      const [ownedRes, adminRes] = (await Promise.all([
        spacesTable().select('id').eq('owner_profile_id', profileId),
        membersTable()
          .select('space_id')
          .eq('profile_id', profileId)
          .eq('role', 'admin')
          .eq('status', 'active'),
      ])) as [
        { data: OwnedSpaceRow[] | null; error: unknown },
        { data: AdminMemberRow[] | null; error: unknown },
      ]

      const ownedIds = new Set((ownedRes.error ? [] : ownedRes.data ?? []).map((r) => r.id))
      const adminIds = new Set((adminRes.error ? [] : adminRes.data ?? []).map((r) => r.space_id))
      // Ownership wins the `via` label, so an owner who also holds an admin row reads as 'owner'.
      const viaFor = (id: string): 'owner' | 'admin' => (ownedIds.has(id) ? 'owner' : 'admin')

      const allIds = [...new Set([...ownedIds, ...adminIds])]
      if (allIds.length === 0) return []

      // Resolve each Space once (getSpaceById is request-cached) + one grouped member-count read.
      const [spaces, counts] = await Promise.all([
        Promise.all(allIds.map((id) => getSpaceById(id))),
        memberCountsFor(allIds),
      ])

      const out: OperatedSpace[] = []
      for (const space of spaces) {
        // Drop a missing/suspended/archived Space and the platform root (never "a space you run").
        if (!space || space.status !== 'active' || space.type === 'root') continue
        out.push(toOperatedSpace(space, viaFor(space.id), counts.get(space.id) ?? null))
      }
      // Name-ordered, so the hub + switcher read alphabetically regardless of which set a Space came from.
      out.sort((a, b) => a.name.localeCompare(b.name))
      return out
    } catch {
      return []
    }
  },
)

/**
 * Cheap EXISTS check: does this profile OWN or actively ADMIN at least one Space? Powers the nav
 * gate for the "My Spaces" operator item (shown only to people who run a Space) without resolving
 * the full operated set. Two `limit(1)` probes in parallel — a networked round-trip a fraction the
 * cost of listOperatedSpaces (no per-Space resolution, no member counts). Note: this does NOT
 * exclude the platform `root` Space or a suspended/archived one, so it can over-report for the rare
 * account that owns ONLY those; the hub itself re-derives the real, filtered set. FAIL-SAFE: `false`
 * on any error (or a missing profile). REQUEST-CACHED, keyed on the profile id.
 */
export const hasOperatedSpaces = cache(
  async (profileId: string | null | undefined): Promise<boolean> => {
    if (!profileId) return false
    try {
      const [ownedRes, adminRes] = (await Promise.all([
        spacesTable().select('id').eq('owner_profile_id', profileId).limit(1),
        membersTable()
          .select('space_id')
          .eq('profile_id', profileId)
          .eq('role', 'admin')
          .eq('status', 'active')
          .limit(1),
      ])) as [
        { data: OwnedSpaceRow[] | null; error: unknown },
        { data: AdminMemberRow[] | null; error: unknown },
      ]
      const ownsOne = !ownedRes.error && (ownedRes.data?.length ?? 0) > 0
      const adminsOne = !adminRes.error && (adminRes.data?.length ?? 0) > 0
      return ownsOne || adminsOne
    } catch {
      return false
    }
  },
)
