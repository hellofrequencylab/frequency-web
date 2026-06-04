'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { buildPlan, previewPlan, commitPlan, type AreaSpec } from '@/lib/demo/engine'
import { runDecay, type DecayReport } from '@/lib/demo/decay'

async function requireJanitor() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'janitor')) throw new Error('Unauthorized')
}

// Run the decay pass on demand (dry run = report without writing).
export async function runDemoDecay(dryRun: boolean): Promise<DecayReport> {
  await requireJanitor()
  const report = await runDecay({ dryRun })
  if (!dryRun) revalidatePath('/', 'layout')
  return report
}

// Step 5: render a non-destructive preview of what the spec would generate.
export async function previewArea(spec: AreaSpec) {
  await requireJanitor()
  return previewPlan(buildPlan(spec))
}

// Step 6: generate + write the area via the service-role admin client
// (auth.role() = 'service_role' satisfies the economy guard).
export async function seedArea(spec: AreaSpec) {
  await requireJanitor()
  const counts = await commitPlan(buildPlan(spec))
  revalidatePath('/', 'layout')
  return counts
}

// Per-area teardown: remove demo content inside a lat/lng box around the centre.
// Bounding box (no PostGIS needed): ~1mi ≈ 0.0145° lat, longitude scaled by cos(lat).
export async function purgeArea(centerLat: number, centerLng: number, radiusMi: number) {
  await requireJanitor()
  const d = createAdminClient()
  const dLat = radiusMi * 0.0145
  const dLng = dLat / Math.max(0.2, Math.cos((centerLat * Math.PI) / 180))

  const { data: circles } = await d
    .from('circles')
    .select('id')
    .eq('is_demo', true)
    .gte('latitude', centerLat - dLat).lte('latitude', centerLat + dLat)
    .gte('longitude', centerLng - dLng).lte('longitude', centerLng + dLng)
  const ids = (circles ?? []).map((c) => (c as { id: string }).id)
  if (!ids.length) return { circles: 0 }

  // members of those circles (demo only), then content, then the circles.
  const { data: mems } = await d.from('memberships').select('profile_id').in('circle_id', ids)
  const profileIds = [...new Set((mems ?? []).map((m) => (m as { profile_id: string }).profile_id))]
  await d.from('posts').delete().eq('is_demo', true).in('scope_id', ids)
  await d.from('events').delete().eq('is_demo', true).in('scope_id', ids)
  await d.from('circles').delete().eq('is_demo', true).in('id', ids)
  if (profileIds.length) await d.from('profiles').delete().eq('is_demo', true).in('id', profileIds)

  revalidatePath('/', 'layout')
  return { circles: ids.length, members: profileIds.length }
}
