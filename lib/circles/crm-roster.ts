import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { rosterFromProfileIds } from '@/lib/people/roster-from-ids'
import { resolvePlaceTreeProfileIds } from '@/lib/messaging/place-tree'
import type { MemberSummary } from '@/components/people/member-viewer'

// MESSAGE CIRCLE ROSTERS (CRM Everywhere plan 4.3 / ADR-827). The circle + hub/nexus legs of the
// scope-neutral roster pipeline: each scope resolves its audience to PROFILE IDS, then flows through
// the ONE shared rosterFromProfileIds pipeline so every leader surface reads identically to the admin
// Resonance CRM. Two shapes per scope: `load*CrmRoster` (the display roster, MemberSummary[]) and
// `list*MemberIds` (the TENANCY set the detail/DM actions check an id against — plan invariant:
// gate -> tenancy -> build, verbatim on every scope).
//
// Audience per the owner ruling: a circle's ACTIVE members (memberships status 'active') plus its
// host; a hub/nexus reaches the active members of every circle in its subtree via the ONE tested
// place-tree walk (resolvePlaceTreeProfileIds - 20k cap, fail-safe []).
//
// Service-role reads behind the CALLER's gate (the route/action gates first). FAIL-SAFE: any read
// degrades to empty, never throws.

// Circles are capped (circles.member_cap), so a circle roster is small by construction. A hub/nexus
// subtree is not: cap the DISPLAY read at 1000 ids (the viewer filters client-side over what it
// holds; the TENANCY set stays the full walk so any legitimate member's detail still opens).
const PLACE_TREE_ROSTER_DISPLAY_CAP = 1000

/** Pure: the roster id set as an ordered list — member ids first (input order), the host appended
 *  when not already a member. Drops non-strings/blanks, dedupes. Exported for unit tests. */
export function unionRosterIds(memberIds: unknown[], hostId?: string | null): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (v: unknown) => {
    if (typeof v !== 'string' || v.length === 0 || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }
  for (const id of memberIds) push(id)
  push(hostId ?? undefined)
  return out
}

/** The circle's TENANCY set: every ACTIVE membership plus the host. The detail + DM actions check a
 *  profile id against this set before building anything. FAIL-SAFE to an empty set. */
export async function listActiveCircleMemberIds(circleId: string): Promise<Set<string>> {
  if (!circleId) return new Set()
  try {
    const admin = createAdminClient()
    const [{ data: circle }, { data: mems }] = await Promise.all([
      admin.from('circles').select('host_id').eq('id', circleId).maybeSingle(),
      admin.from('memberships').select('profile_id').eq('circle_id', circleId).eq('status', 'active'),
    ])
    const hostId = (circle as { host_id: string | null } | null)?.host_id ?? null
    return new Set(unionRosterIds((mems ?? []).map((m) => m.profile_id), hostId))
  } catch {
    return new Set()
  }
}

/** The Message Circle display roster: active members ∪ host, through the shared roster pipeline.
 *  Small by construction (circles are capped). [] on any failure. */
export async function loadCircleCrmRoster(circleId: string): Promise<MemberSummary[]> {
  const ids = await listActiveCircleMemberIds(circleId)
  return rosterFromProfileIds([...ids])
}

/** A hub/nexus scope for the subtree rosters below. */
export interface PlaceTreeCrmScope {
  kind: 'hub' | 'nexus'
  id: string
}

/** The hub/nexus TENANCY set: active members of every circle in the subtree, via the ONE tested
 *  place-tree walk (hub -> circles, nexus -> hubs -> circles; 20k cap; fail-safe empty). */
export async function listPlaceTreeMemberIds(scope: PlaceTreeCrmScope): Promise<Set<string>> {
  const ids = await resolvePlaceTreeProfileIds({ type: scope.kind, id: scope.id })
  return new Set(ids)
}

/** The hub/nexus display roster, capped at 1000 ids for the read (the viewer filters client-side
 *  over what it holds; a subtree bigger than that revisits server search if it ever happens). */
export async function loadPlaceTreeCrmRoster(scope: PlaceTreeCrmScope): Promise<MemberSummary[]> {
  const ids = await resolvePlaceTreeProfileIds({ type: scope.kind, id: scope.id })
  return rosterFromProfileIds(ids.slice(0, PLACE_TREE_ROSTER_DISPLAY_CAP))
}
