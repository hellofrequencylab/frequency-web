import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// "Circles you lead" for the Leader dashboard. Scoped strictly to the caller's own
// stewardship, ADDITIVELY across every way someone can lead a circle (a person can do
// more than one, and ANYONE can host a circle regardless of their ladder rung):
//   • circles I HOST    → circles.host_id = me
//   • circles I GUIDE   → circles in the hubs I guide (hubs.guide_id = me)
//   • circles I MENTOR  → circles in the hubs under the nexuses I mentor (nexuses.mentor_id = me)
// The three sets are UNIONED + de-duped, so a mentor (or a staffer) who also directly hosts
// a circle still sees it. There is no "all circles" branch — every query is keyed to
// `profileId`, so there is no unscoped read.
//
// BUG FIX: the old version was role-EXCLUSIVE (only the host_id query ran when the caller's
// COMMUNITY role was exactly 'host'), so a host whose rung was anything else (a guide/mentor,
// or a staffer like a janitor) saw "Circles you host: 0" even while hosting one. Hosting is a
// per-circle fact, not a rung, so the host_id query now ALWAYS runs.

export type LedCircle = {
  id: string
  name: string
  slug: string
  about: string | null
  type: string
  status: string
  member_count: number
  hub: { id: string; name: string } | null
}

const SELECT = `id, name, slug, about, type, status, member_count, hub_id, host_id,
                hub:hubs!hub_id ( id, name )`

/** Every circle the caller leads (hosts, guides, or mentors), unioned + de-duped, ordered by
 *  name. Cached per request so multiple dashboard blocks share the one read. */
export const getLedCircles = cache(async (profileId: string): Promise<LedCircle[]> => {
  const admin = createAdminClient()
  const byId = new Map<string, LedCircle>()
  const collect = (rows: unknown) => {
    for (const c of (rows ?? []) as LedCircle[]) byId.set(c.id, c)
  }

  // Hubs I guide, and hubs under nexuses I mentor — resolved in parallel with my hosted circles.
  const [{ data: hosted }, { data: guidedHubs }, { data: mentoredNexuses }] = await Promise.all([
    admin.from('circles').select(SELECT).eq('host_id', profileId),
    admin.from('hubs').select('id').eq('guide_id', profileId),
    admin.from('nexuses').select('id').eq('mentor_id', profileId),
  ])
  collect(hosted)

  const hubIds = new Set<string>((guidedHubs ?? []).map((h: { id: string }) => h.id))
  const nexusIds = (mentoredNexuses ?? []).map((n: { id: string }) => n.id)
  if (nexusIds.length > 0) {
    const { data: nexusHubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
    for (const h of (nexusHubs ?? []) as { id: string }[]) hubIds.add(h.id)
  }
  if (hubIds.size > 0) {
    const { data: hubCircles } = await admin.from('circles').select(SELECT).in('hub_id', [...hubIds])
    collect(hubCircles)
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
})

// ── The networks under a leader (the Leadership dashboard, ADR-266) ──────────────────
// "Networks under them" = the hubs a GUIDE stewards and the nexuses a MENTOR stewards.
// Both are scoped strictly to `profileId` (guide_id / mentor_id = me) — never platform-wide,
// matching the getLedCircles scoping above. A plain host steward leads no network → [].

export type LedHub = { id: string; name: string; slug: string; circle_count: number }
export type LedNexus = { id: string; name: string; slug: string; hub_count: number }

/** Hubs this profile GUIDES (hubs.guide_id = me), each with its circle count. */
export async function getLedHubs(profileId: string): Promise<LedHub[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('hubs').select('id, name, slug').eq('guide_id', profileId).order('name')
  const hubs = (data ?? []) as { id: string; name: string; slug: string }[]
  if (hubs.length === 0) return []
  const ids = hubs.map((h) => h.id)
  const { data: circleRows } = await admin.from('circles').select('hub_id').in('hub_id', ids)
  const counts = new Map<string, number>()
  for (const r of (circleRows ?? []) as { hub_id: string | null }[]) {
    if (r.hub_id) counts.set(r.hub_id, (counts.get(r.hub_id) ?? 0) + 1)
  }
  return hubs.map((h) => ({ ...h, circle_count: counts.get(h.id) ?? 0 }))
}

/** Nexuses this profile MENTORS (nexuses.mentor_id = me), each with its hub count. */
export async function getLedNexuses(profileId: string): Promise<LedNexus[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('nexuses').select('id, name, slug').eq('mentor_id', profileId).order('name')
  const nexuses = (data ?? []) as { id: string; name: string; slug: string }[]
  if (nexuses.length === 0) return []
  const ids = nexuses.map((n) => n.id)
  const { data: hubRows } = await admin.from('hubs').select('nexus_id').in('nexus_id', ids)
  const counts = new Map<string, number>()
  for (const r of (hubRows ?? []) as { nexus_id: string | null }[]) {
    if (r.nexus_id) counts.set(r.nexus_id, (counts.get(r.nexus_id) ?? 0) + 1)
  }
  return nexuses.map((n) => ({ ...n, hub_count: counts.get(n.id) ?? 0 }))
}
