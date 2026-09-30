'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { buildPlan, previewPlan, commitPlan, type AreaSpec } from '@/lib/demo/engine'
import { getDemographicPalette } from '@/lib/demo/ai-palette'
import { deletePlansByAuthors } from '@/lib/journey-plans'
import { runDecay, type DecayReport } from '@/lib/demo/decay'

// Crown-jewel gate: the STAFF axis (web_role janitor, ADR-208).
async function requireJanitor() {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')
}

// Build the plan, fetching a demographic AI palette first when requested (and
// available); buildPlan falls back to its template pools when palette is null.
async function planFor(spec: AreaSpec) {
  const palette = spec.aiPolish
    ? await getDemographicPalette({ areaName: spec.areaName, lat: spec.centerLat, lng: spec.centerLng, channels: spec.channels })
    : null
  return buildPlan(spec, palette)
}

// The decay pass on demand, as two actions rather than one with a dry-run flag the browser sends
// (HYG-143, CodeQL js/user-controlled-bypass): which one the panel calls is the choice, and the
// write path never branches on a value from the request.
// Preview: report what the pass would touch, write nothing.
export async function previewDemoDecay(): Promise<DecayReport> {
  await requireJanitor()
  return runDecay({ dryRun: true })
}

// Run: apply the pass, then refresh every page that reads demo rows.
export async function runDemoDecay(): Promise<DecayReport> {
  await requireJanitor()
  const report = await runDecay({ dryRun: false })
  revalidatePath('/', 'layout')
  return report
}

// Step 5: render a non-destructive preview of what the spec would generate.
export async function previewArea(spec: AreaSpec) {
  await requireJanitor()
  return previewPlan(await planFor(spec))
}

// Step 6: generate + write the area via the service-role admin client
// (auth.role() = 'service_role' satisfies the economy guard).
export async function seedArea(spec: AreaSpec) {
  await requireJanitor()
  const counts = await commitPlan(await planFor(spec))
  revalidatePath('/', 'layout')
  return counts
}

// Per-area teardown: remove demo content inside a lat/lng box around the centre.
// Bounding box (no PostGIS needed): ~1mi ≈ 0.0145° lat, longitude scaled by cos(lat).
export async function purgeArea(centerLat: number, centerLng: number, radiusMi: number) {
  await requireJanitor()
  // Untyped cast: hubs.is_demo isn't in the generated types yet (cast pattern).
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
  // Demo hubs (run by a demo guide who's a member of these circles) — delete after
  // the circles (circles.hub_id is NO ACTION) and before profiles (guide_id SET NULL).
  if (profileIds.length) await d.from('hubs').delete().eq('is_demo', true).in('guide_id', profileIds)
  // Demo journeys have no is_demo column; identify them by their demo author and
  // delete BEFORE the profiles (author_id is ON DELETE SET NULL, not cascade).
  // Friendships, dispatches, and wall posts all cascade from the demo author.
  await deletePlansByAuthors(profileIds)
  if (profileIds.length) await d.from('profiles').delete().eq('is_demo', true).in('id', profileIds)

  revalidatePath('/', 'layout')
  return { circles: ids.length, members: profileIds.length }
}
