// The viewer's MANAGED Spaces — the reader behind the header mega-menu launcher
// (WEBSITE-CHANGES-PLAN §6 E.3, decision D3 = launcher only). A "managed" Space is
// one the viewer can actually steward: they OWN it (spaces.owner_profile_id) OR
// they hold an ACTIVE space_members role at editor+ (editor / moderator / admin) —
// the same canEditProfile authority the owner back-end gates on
// (lib/spaces/entitlements.ts, spaceCapabilitiesFor.canEditProfile). A plain viewer
// membership does NOT count: a viewer can't manage, so the launcher wouldn't link
// them anywhere they could edit.
//
// Backed by the service-role admin client plus untyped casts (neither `space_members`
// nor the `spaces` brand columns are in the generated DB types yet, ADR-246 — the same
// shape lib/spaces/membership.ts / discovery.ts use). The server is the authority and
// this is read-only; it re-resolves the viewer's own id at the call boundary, never
// trusts a client-passed id, and is FAIL-SAFE: any error (or a pre-migration table)
// yields [] so the launcher degrades to its empty "create your first Space" state
// rather than throwing.
//
// TENANCY: every row is keyed to THIS viewer's ownership or active membership. We
// never widen past the owner id + the viewer's own membership rows, so the result can
// only ever contain Spaces the caller is entitled to steward (no cross-tenant leak).
//
// SHAPE: no 'use server' directive here, so SERVER components/readers import
// listManagedSpaces directly. The thin 'use server' wrapper the CLIENT mega-menu calls
// lives in lib/spaces/managed-actions.ts (a server-action module may export only async
// functions, so this reader cannot live there).

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { atLeastSpaceRole, isSpaceRole } from './membership'
import { normalizeSpaceType, spaceManageHref, type SpaceType } from './types'

/** One managed Space as the launcher consumes it — the brand anchor, its type, the
 *  viewer's relationship to it, and the deep-link target. Camel-cased; only the fields
 *  a launcher row needs. */
export interface ManagedSpace {
  id: string
  slug: string
  /** Display brand name when set, else the plain Space name (resolved here so the row stays dumb). */
  name: string
  type: SpaceType
  /** True when the viewer OWNS this Space; false when they reach it via an editor+ membership. */
  isOwner: boolean
  /** The owner-management entry for this Space — where a manager lands to steward it. The unified
   *  /manage console for the console types, the legacy /settings hub otherwise (spaceManageHref). */
  settingsHref: string
}

// The columns the launcher projects. `brand_name` rides the untyped select below (it isn't fully in
// the generated types yet, ADR-246), so the brand can lead the row when set.
const SPACE_COLS = 'id, slug, name, type, status, brand_name'

type ManagedSpaceRow = {
  id: string
  slug: string
  name: string
  type: string
  status: string
  brand_name: string | null
}

// The untyped `spaces` query-builder surface this reader uses (brand columns aren't fully in the
// generated types yet) — the same loose shape lib/spaces/discovery.ts types for the table.
type SpacesQuery = {
  select: (cols: string) => SpacesQuery
  eq: (col: string, val: string) => SpacesQuery
  in: (col: string, vals: string[]) => SpacesQuery
  order: (col: string, opts: { ascending: boolean }) => SpacesQuery
  then: (
    resolve: (r: { data: ManagedSpaceRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

/** The untyped admin-client `spaces` builder (brand columns aren't fully in the generated types). */
function spacesTable(): SpacesQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => SpacesQuery }
  return db.from('spaces')
}

// `space_members` isn't in the generated DB types yet (ADR-246) — reach it through an untyped `from`
// accessor and type the builder loosely, the same shape lib/spaces/membership.ts uses.
type MembershipRow = { space_id: string; role: string; status: string }

type MembersQuery = {
  select: (cols: string) => MembersQuery
  eq: (col: string, val: string) => MembersQuery
  then: (
    resolve: (r: { data: MembershipRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function membersTable(): MembersQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => MembersQuery }
  return db.from('space_members')
}

/** The Space ids the viewer can MANAGE through an ACTIVE editor+ membership (editor / moderator /
 *  admin). A plain `viewer` role is excluded — it confers no edit authority. FAIL-SAFE: [] on any
 *  error or a missing table. */
async function manageableMemberSpaceIds(profileId: string): Promise<string[]> {
  try {
    const result = (await membersTable()
      .select('space_id, role, status')
      .eq('profile_id', profileId)) as { data: MembershipRow[] | null; error: unknown }
    if (result.error || !result.data) return []
    const ids = new Set<string>()
    for (const row of result.data) {
      // Only an ACTIVE membership at editor+ confers management (invited/suspended carry none, and a
      // plain viewer can't edit). Mirrors spaceCapabilitiesFor.canEditProfile.
      if (row.status !== 'active') continue
      if (isSpaceRole(row.role) && atLeastSpaceRole(row.role, 'editor')) ids.add(row.space_id)
    }
    return [...ids]
  } catch {
    return []
  }
}

/**
 * The Spaces the signed-in viewer MANAGES — the ones they own OR hold an active editor+ membership
 * in — for the header mega-menu launcher. Returns each Space's brand anchor, type, ownership flag,
 * and its settings-hub deep link, ordered by name. Excludes suspended/archived Spaces (a manager
 * can't steward a dead Space). FAIL-SAFE: [] for a signed-out viewer or on any error. REQUEST-CACHED.
 *
 * Tenancy-safe by construction: the only rows fetched are those keyed to this viewer's owner id or
 * their own active membership rows, so the result can never contain a Space they aren't entitled to
 * manage.
 */
export const listManagedSpaces = cache(async (): Promise<ManagedSpace[]> => {
  try {
    const profileId = await getMyProfileId()
    if (!profileId) return []

    const memberIds = await manageableMemberSpaceIds(profileId)

    // Two narrow reads, unioned in app code: the Spaces this viewer OWNS, and the Spaces their
    // active editor+ memberships point at. Both are keyed strictly to the viewer, so neither can
    // reach past the caller's entitlement.
    const ownedPromise = (spacesTable()
      .select(SPACE_COLS)
      .eq('owner_profile_id', profileId)
      .order('name', { ascending: true })) as unknown as Promise<{
      data: ManagedSpaceRow[] | null
      error: unknown
    }>
    const memberPromise: Promise<{ data: ManagedSpaceRow[] | null; error: unknown }> =
      memberIds.length > 0
        ? (spacesTable()
            .select(SPACE_COLS)
            .in('id', memberIds)
            .order('name', { ascending: true }) as unknown as Promise<{
            data: ManagedSpaceRow[] | null
            error: unknown
          }>)
        : Promise.resolve({ data: [], error: null })

    const [owned, member] = await Promise.all([ownedPromise, memberPromise])

    // De-dupe (an owner can also carry a membership row), owner-ness wins, drop dead Spaces.
    const byId = new Map<string, ManagedSpace>()
    const ownedIds = new Set((owned.data ?? []).map((r) => r.id))
    for (const r of owned.data ?? []) {
      if (r.status !== 'active') continue
      byId.set(r.id, mapManaged(r, true))
    }
    for (const r of member.data ?? []) {
      if (r.status !== 'active' || byId.has(r.id)) continue
      byId.set(r.id, mapManaged(r, ownedIds.has(r.id)))
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
})

function mapManaged(r: ManagedSpaceRow, isOwner: boolean): ManagedSpace {
  return {
    id: r.id,
    slug: r.slug,
    name: r.brand_name?.trim() || r.name,
    type: normalizeSpaceType(r.type),
    isOwner,
    settingsHref: spaceManageHref(normalizeSpaceType(r.type), r.slug),
  }
}
