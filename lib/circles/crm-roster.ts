import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { rosterFromProfileIds } from '@/lib/people/roster-from-ids'
import type { MemberSummary } from '@/components/people/member-viewer'

// MESSAGE CIRCLE ROSTERS (CRM Everywhere plan 4.3 / ADR-827). The circle leg of the scope-neutral
// roster pipeline: the scope resolves its audience to PROFILE IDS, then flows through the ONE shared
// rosterFromProfileIds pipeline so every leader surface reads identically to the admin Resonance
// CRM. Two shapes: `loadCircleCrmRoster` (the display roster, MemberSummary[]) and
// `listActiveCircleMemberIds` (the TENANCY set the detail/DM actions check an id against — plan
// invariant: gate -> tenancy -> build).
//
// Audience per the owner ruling: a circle's ACTIVE members (memberships status 'active') plus its
// host. The hub/nexus legs were never wired to a surface and left with the SCAN-502 sweep
// (ADR-1583); a hub/nexus roster would walk the place tree (resolvePlaceTreeProfileIds).
//
// Service-role reads behind the CALLER's gate (the route/action gates first). FAIL-SAFE: any read
// degrades to empty, never throws.

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
