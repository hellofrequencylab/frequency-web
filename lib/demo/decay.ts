// Demo decay — the "naturally disappears" engine (ADR-081, Phase 3).
//
// As real content grows in an area, demo content recedes then purges itself, so
// scaffolding never outlives its purpose and nobody has to clean up by hand.
// Two mechanisms, both keyed off the existing is_demo flag + geo (no schema):
//
//  (A) Area decay — for each DEMO circle, count REAL active circles nearby:
//        >= PURGE_REAL_CIRCLES  -> the area is self-sustaining: purge the demo
//                                  circle (its posts/events/circle + any demo
//                                  members it orphaned).
//        >= 1                   -> the area is sprouting: prune the demo circle's
//                                  oldest demo posts (thin the feed).
//  (B) Neighbor decay — a claimed/real circle sheds its demo "neighbours" as it
//        gains real members, down to a floor that reaches 0 once it stands alone.
//
// Reused by the nightly cron (app/api/cron/demo-decay) and an admin dry-run.
// Deletes only; idempotent; converges. dryRun reports without writing.

import { createAdminClient } from '@/lib/supabase/admin'
import { isoDaysAgo } from '@/lib/utils'
import { log } from '@/lib/log'

const R_MI = 12 // area radius
const PURGE_REAL_CIRCLES = 3 // real circles nearby -> area self-sustaining
const PRUNE_AGE_DAYS = 30 // demo posts older than this get pruned in sprouting areas
const NEIGHBOR_CLEAR_AT = 5 // real members in a circle -> drop all demo neighbours
const NEIGHBOR_FLOOR_BASE = 8 // floor of demo neighbours at 0 real members

export type DecayReport = {
  dryRun: boolean
  demoCircles: number
  realCircles: number
  purgedCircles: number
  prunedCircles: number
  prunedPosts: number
  trimmedNeighbours: number
  orphansRemoved: number
}

type Circle = { id: string; latitude: number | null; longitude: number | null }

function boxDeg(lat: number) {
  const dLat = R_MI * 0.0145
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  return { dLat, dLng }
}

// Delete any of these demo profiles that no longer belong to ANY circle.
async function removeOrphans(
  d: ReturnType<typeof createAdminClient>,
  profileIds: string[],
  dryRun: boolean,
): Promise<number> {
  if (!profileIds.length) return 0
  const { data: still } = await d.from('memberships').select('profile_id').in('profile_id', profileIds)
  const kept = new Set((still ?? []).map((m) => (m as { profile_id: string }).profile_id))
  const orphans = profileIds.filter((id) => !kept.has(id))
  if (!orphans.length) return 0
  if (!dryRun) await d.from('profiles').delete().eq('is_demo', true).in('id', orphans)
  return orphans.length
}

export async function runDecay({ dryRun }: { dryRun: boolean }): Promise<DecayReport> {
  const d = createAdminClient()
  const report: DecayReport = {
    dryRun, demoCircles: 0, realCircles: 0, purgedCircles: 0,
    prunedCircles: 0, prunedPosts: 0, trimmedNeighbours: 0, orphansRemoved: 0,
  }

  const [{ data: demo }, { data: real }] = await Promise.all([
    d.from('circles').select('id, latitude, longitude').eq('is_demo', true),
    d.from('circles').select('id, latitude, longitude').eq('is_demo', false).eq('status', 'active'),
  ])
  const demoCircles = (demo ?? []) as Circle[]
  const reals = ((real ?? []) as Circle[]).filter((c) => c.latitude != null && c.longitude != null)
  report.demoCircles = demoCircles.length
  report.realCircles = reals.length

  const realNear = (lat: number, lng: number) => {
    const { dLat, dLng } = boxDeg(lat)
    return reals.filter((c) => Math.abs((c.latitude as number) - lat) <= dLat && Math.abs((c.longitude as number) - lng) <= dLng).length
  }

  // ── (A) Area decay ──────────────────────────────────────────────────────
  for (const c of demoCircles) {
    if (c.latitude == null || c.longitude == null) continue
    const near = realNear(c.latitude, c.longitude)

    if (near >= PURGE_REAL_CIRCLES) {
      const { data: mems } = await d.from('memberships').select('profile_id').eq('circle_id', c.id)
      const memberIds = (mems ?? []).map((m) => (m as { profile_id: string }).profile_id)
      if (!dryRun) {
        await d.from('posts').delete().eq('is_demo', true).eq('scope_id', c.id)
        await d.from('events').delete().eq('is_demo', true).eq('scope_id', c.id)
        await d.from('circles').delete().eq('is_demo', true).eq('id', c.id)
      }
      report.orphansRemoved += await removeOrphans(d, memberIds, dryRun)
      report.purgedCircles++
    } else if (near >= 1) {
      const cutoff = isoDaysAgo(PRUNE_AGE_DAYS)
      const { data: old } = await d
        .from('posts').select('id').eq('is_demo', true).eq('scope_id', c.id).lt('created_at', cutoff)
      const ids = (old ?? []).map((p) => (p as { id: string }).id)
      if (ids.length) {
        if (!dryRun) await d.from('posts').delete().in('id', ids)
        report.prunedPosts += ids.length
        report.prunedCircles++
      }
    }
  }

  // ── (B) Neighbour decay on real circles carrying demo members ───────────
  for (const rc of reals.slice(0, 500)) {
    const { data: ms } = await d
      .from('memberships')
      .select('id, profile_id, joined_at, profile:profiles!inner ( is_demo )')
      .eq('circle_id', rc.id)
    const rows = (ms ?? []) as Array<{ id: string; profile_id: string; joined_at: string; profile: { is_demo: boolean } }>
    const demoMembers = rows.filter((r) => r.profile?.is_demo)
    if (!demoMembers.length) continue
    const realMembers = rows.length - demoMembers.length

    const floor = realMembers >= NEIGHBOR_CLEAR_AT ? 0 : Math.max(2, NEIGHBOR_FLOOR_BASE - realMembers * 2)
    const overflow = demoMembers.length - floor
    if (overflow <= 0) continue

    // shed the most-recently-added demo neighbours first
    const toRemove = demoMembers
      .sort((a, b) => (a.joined_at < b.joined_at ? 1 : -1))
      .slice(0, overflow)
    const removeMembershipIds = toRemove.map((r) => r.id)
    const removedProfileIds = toRemove.map((r) => r.profile_id)
    if (!dryRun) await d.from('memberships').delete().in('id', removeMembershipIds)
    report.trimmedNeighbours += removeMembershipIds.length
    report.orphansRemoved += await removeOrphans(d, removedProfileIds, dryRun)
  }

  log.info('demo.decay', { ...report })
  return report
}
