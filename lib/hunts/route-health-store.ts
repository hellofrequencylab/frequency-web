/**
 * Route health's readers (FH-032): the IO half over lib/hunts/route-health.ts. Reads only tables that
 * exist today (the Hunt, its current version's stops, runs, progress, placements, partner rows and the
 * outbox counts) on the server, after the page has authorised the caller. It selects runs, never a
 * profile id, and writes nothing.
 */
import type { PartnerRow } from './authz'
import { db } from './commerce-store'
import { huntRows, loadReportFacts } from './merchant-report-store'
import type { RouteFacts } from './route-health'

const OUTBOX = ['pending', 'leased', 'done', 'dead'] as const

async function outboxCount(huntId: string, status: (typeof OUTBOX)[number]): Promise<number> {
  const { count, error } = await db().from('hunt_outbox').select('id', { count: 'exact', head: true }).eq('hunt_id', huntId).eq('status', status)
  if (error) throw new Error(`hunt_outbox read failed: ${error.message}`)
  return count ?? 0
}

type PartnerDbRow = { hunt_id: string; space_id: string; status: PartnerRow['status']; effective_at: string | null; revoked_at: string | null; permitted_roles: string[] | null }

/** Everything route health needs for one Hunt, or null when the Hunt is gone. */
export async function loadRouteFacts(huntId: string): Promise<RouteFacts | null> {
  const { data, error } = await db().from('hunts').select('status, owner_space_id, current_version_id').eq('id', huntId).maybeSingle()
  const hunt = data as { status: string; owner_space_id: string | null; current_version_id: string | null } | null
  if (error || !hunt) return null
  const version = hunt.current_version_id

  const [report, partners, runs, progress, placements, missions, ...outbox] = await Promise.all([
    loadReportFacts(huntId),
    huntRows<PartnerDbRow>('hunt_partners', 'hunt_id, space_id, status, effective_at, revoked_at, permitted_roles', huntId, ['space_id']),
    huntRows<{ id: string; state: string; version_id: string }>('hunt_runs', 'id, state, version_id', huntId),
    huntRows<{ run_id: string; mission_key: string; disposition: string; accepted_at: string; version_id: string }>('hunt_progress', 'run_id, mission_key, disposition, accepted_at, version_id', huntId, ['run_id', 'mission_key']),
    huntRows<{ id: string; medium: string; revoked_at: string | null; health_status: string }>('hunt_placements', 'id, medium, revoked_at, health_status', huntId),
    huntRows<{ mission_key: string; title: string; version_id: string }>('hunt_missions', 'mission_key, title, version_id', huntId, ['version_id', 'mission_key']),
    ...OUTBOX.map((status) => outboxCount(huntId, status)),
  ])

  const partnerRows: PartnerRow[] = partners.map((p) => ({ huntId: p.hunt_id, spaceId: p.space_id, status: p.status, effectiveAt: p.effective_at, revokedAt: p.revoked_at, permittedRoles: p.permitted_roles ?? [] }))
  const spaceIds = [...new Set([hunt.owner_space_id, ...partnerRows.map((p) => p.spaceId)].filter((id): id is string => !!id))]
  const names = spaceIds.length ? await db().from('spaces').select('id, name').in('id', spaceIds) : { data: [], error: null }
  if (names.error) throw new Error(`spaces read failed: ${names.error.message}`)

  return {
    ...report,
    hunt: { status: hunt.status, ownerSpaceId: hunt.owner_space_id, currentVersionId: version },
    partners: partnerRows,
    missions: missions.filter((m) => m.version_id === version).map((m) => ({ missionKey: m.mission_key, title: m.title })),
    versionRuns: runs.filter((r) => r.version_id === version).map((r) => ({ id: r.id, state: r.state })),
    progress: progress.filter((p) => p.version_id === version).map((p) => ({ runId: p.run_id, missionKey: p.mission_key, disposition: p.disposition, acceptedAt: p.accepted_at })),
    placements: placements.map((p) => ({ id: p.id, medium: p.medium, revokedAt: p.revoked_at, healthStatus: p.health_status })),
    outbox: { pending: outbox[0], leased: outbox[1], done: outbox[2], dead: outbox[3] },
    venueNames: Object.fromEntries(((names.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])),
  }
}
