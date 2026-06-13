'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin/audit'
import { isJanitor } from '@/lib/core/roles'
import { addDemoMembers as genMembers, addDemoCircle as genCircle } from '@/lib/demo/generate'
import { deletePlansByAuthors } from '@/lib/journey-plans'

// Crown-jewel gate: the STAFF axis (web_role janitor, ADR-208), not the deprecated
// community 'janitor' rung.
async function requireJanitor() {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')
}

// Demo content lives across these tables (see docs/DEMO-SYSTEM.md). Purge deletes
// children before parents so FK constraints are satisfied regardless of cascade
// behaviour; dependent rows (reactions, memberships, RSVPs, friendships, dispatches,
// wall posts) cascade from these. `hubs` come AFTER `circles` (circles.hub_id is
// NO ACTION) and BEFORE `profiles` (hubs.guide_id is SET NULL, not cascade).
const DEMO_TABLES = ['posts', 'events', 'practices', 'circles', 'hubs', 'profiles'] as const

// Flip the global demo switch. Reversible — hides/shows all is_demo content at
// once via the gating in lib/platform-flags.ts + the feed RPCs.
export async function setDemoMode(enabled: boolean) {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('platform_flags')
    .upsert({ key: 'demo_mode', value: enabled, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout') // demo gating touches many surfaces
}

// Permanently delete ALL seeded demo content. Irreversible — use when real
// content is ready. Janitor-only.
export async function purgeDemoContent() {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')
  const callerId = caller.id

  // Untyped cast: hubs.is_demo isn't in the generated types yet (cast pattern).
  const admin = createAdminClient()
  // Demo journeys have no is_demo flag and author_id is ON DELETE SET NULL, so
  // remove plans by their demo author BEFORE the profiles go (items + adoptions
  // cascade from the plan).
  const { data: demoProfiles } = await admin.from('profiles').select('id').eq('is_demo', true)
  const demoIds = (demoProfiles ?? []).map((p) => (p as { id: string }).id)
  await deletePlansByAuthors(demoIds)
  for (const table of DEMO_TABLES) {
    const { error } = await admin.from(table).delete().eq('is_demo', true)
    if (error) throw new Error(`${table}: ${error.message}`)
  }

  // Audit the irreversible purge (P8). Best-effort.
  await logAdminAction({ actorId: callerId, action: 'demo.purge', targetType: 'platform', targetId: null, detail: { profiles: demoIds.length } })

  revalidatePath('/', 'layout')
}

// --- Grow the network -----------------------------------------------------
// Add demo content that auto-populates its relative content (memberships, a
// post, reactions, a streak, achievements, a practice adoption; a new circle
// also gets a host, a roster, a practice, and an upcoming event). lib/demo/generate.

export async function addMembersToCircle(circleId: string, count: number) {
  await requireJanitor()
  const n = await genMembers(circleId, count)
  revalidatePath('/', 'layout')
  return n
}

export async function addCircle(input: { name: string; channel: string; city?: string; size?: number }) {
  await requireJanitor()
  if (!input.name?.trim()) throw new Error('A circle needs a name.')
  const res = await genCircle({ ...input, name: input.name.trim() })
  revalidatePath('/', 'layout')
  return res
}

// --- Select & delete ------------------------------------------------------
// Granular teardown: remove specific demo circles or members (vs the all-or-
// nothing purge). Posts/events use a polymorphic scope_id (no FK cascade from
// circles), so they are deleted explicitly; profile deletes cascade the rest.

export async function deleteDemoCircles(ids: string[]) {
  await requireJanitor()
  if (!ids.length) return
  const admin = createAdminClient()
  // children first (scope_id is not an FK, so no cascade from circles)
  await admin.from('posts').delete().eq('is_demo', true).in('scope_id', ids)
  await admin.from('events').delete().eq('is_demo', true).in('scope_id', ids)
  const { error } = await admin.from('circles').delete().eq('is_demo', true).in('id', ids)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export async function deleteDemoMembers(ids: string[]) {
  await requireJanitor()
  if (!ids.length) return
  const admin = createAdminClient()
  // profile delete cascades memberships, authored posts, reactions, rsvps, etc.
  const { error } = await admin.from('profiles').delete().eq('is_demo', true).in('id', ids)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}
