import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { listTasks, listTasksInPlans, type CrmTask } from '@/lib/crm/tasks'
import { listPlanShareRows, listPlansSharedWith, listSharedPlanIds } from './plans-store'
import { assigneeChoices, mergeSharedTasks, type AssigneeChoice } from './shared-tasks-core'

// SHARED TO-DOS, the IO half (PROG-CAL7 Together, LIVE-544).
//
// THE INVARIANT: crm_tasks is reached through the service role, so every widened read here is
// bound to plan ids the caller's SESSION proved first. `listSharedPlanIds` reads space_plan_shares
// on the session, where RLS returns only the accepted shares addressed to the caller's own Space;
// the admin read that follows is `in('plan_id', those)` and nothing wider. A Space that was never
// shared a Plan gets an empty id list and the same list it had before.

/** This Space's own to-dos, then the to-dos of every Plan shared with it, marked with the host. */
export async function listTasksWithShared(spaceId: string): Promise<CrmTask[]> {
  const own = await listTasks({ spaceId, limit: 500 })
  const sharedIds = await listSharedPlanIds(spaceId)
  if (sharedIds.length === 0) return own
  const [shared, plans] = await Promise.all([listTasksInPlans(sharedIds, 500), listPlansSharedWith(spaceId)])
  const hostIds = [...new Set(plans.map((p) => p.spaceId))]
  const names = await readSpaceNames(hostIds)
  const hostNameByPlan = new Map(plans.map((p) => [p.id, names.get(p.spaceId) ?? null]))
  return mergeSharedTasks(own, shared, hostNameByPlan)
}

/**
 * Everyone a to-do of this Plan may be handed to: the host Space's owner and active members, and
 * the same for every Space holding an accepted share the session can see (the host sees all of
 * them; a guest sees the host and itself). Names are read on the session and fall back to the
 * Space when the profile sits across a regional wall.
 */
export async function assigneeChoicesForPlan(planId: string, hostSpaceId: string): Promise<AssigneeChoice[]> {
  const shares = await listPlanShareRows(planId)
  const spaceIds = [...new Set([hostSpaceId, ...shares.filter((s) => s.status === 'accepted').map((s) => s.guest_space_id)])]
  const spaces = await readSpaces(spaceIds)
  const people: { profileId: string; spaceId: string }[] = []
  for (const sp of spaces) {
    if (sp.ownerProfileId) people.push({ profileId: sp.ownerProfileId, spaceId: sp.id })
    const members = await listSpaceMembers(sp.id)
    for (const m of members) if (m.status === 'active') people.push({ profileId: m.profileId, spaceId: sp.id })
  }
  const names = await readProfileNames(people.map((p) => p.profileId))
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]))
  return assigneeChoices(
    people.map((p) => ({ profileId: p.profileId, spaceName: spaceName.get(p.spaceId) ?? null, displayName: names.get(p.profileId) ?? null })),
  )
}

async function readSpaces(ids: readonly string[]): Promise<{ id: string; name: string | null; ownerProfileId: string | null }[]> {
  if (ids.length === 0) return []
  try {
    const { data } = await (await createClient()).from('spaces').select('id, name, owner_profile_id').in('id', [...ids])
    return ((data ?? []) as { id: string; name: string | null; owner_profile_id: string | null }[]).map((r) => ({
      id: r.id,
      name: r.name,
      ownerProfileId: r.owner_profile_id,
    }))
  } catch {
    return []
  }
}

async function readSpaceNames(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const s of await readSpaces(ids)) if (s.name) out.set(s.id, s.name)
  return out
}

async function readProfileNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 200)
  const out = new Map<string, string>()
  if (unique.length === 0) return out
  try {
    const { data } = await (await createClient()).from('profiles').select('id, display_name').in('id', unique)
    for (const r of (data ?? []) as { id: string; display_name: string | null }[]) if (r.display_name) out.set(r.id, r.display_name)
  } catch {
    // A wall between regions is expected; the picker falls back to the Space.
  }
  return out
}
