/**
 * Route health's readers (FH-032): the IO half over lib/hunts/route-health.ts. Reads only tables that
 * exist today (the Hunt, its current version's stops, runs, progress, placements, partner rows and the
 * outbox counts) on the server, after the page has authorised the caller. It selects runs, never a
 * profile id, and writes nothing.
 *
 * FH-032S adds what FH-029 and FH-031 brought: the steward each partner invite names and the terms it
 * pinned, and the outbox counts for the finale broadcast. The steward and terms columns come from
 * migration 20270346081000; where it is not applied that one read fails soft and the page says the
 * steward and terms are not on record, instead of going dark.
 */
import type { PartnerRow } from './authz'
import { db } from './commerce-store'
import { huntRows, loadReportFacts } from './merchant-report-store'
import { FINALE_BROADCAST_EVENT, parseFinale } from './rally-finale'
import type { RouteFacts } from './route-health'

const OUTBOX = ['pending', 'leased', 'done', 'dead'] as const

async function outboxCount(huntId: string, status: (typeof OUTBOX)[number], eventType?: string): Promise<number> {
  const all = db().from('hunt_outbox').select('id', { count: 'exact', head: true }).eq('hunt_id', huntId).eq('status', status)
  const { count, error } = await (eventType ? all.eq('event_type', eventType) : all)
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

  const [report, partners, runs, progress, placements, missions, invites, versions, ...outbox] = await Promise.all([
    loadReportFacts(huntId),
    huntRows<PartnerDbRow>('hunt_partners', 'hunt_id, space_id, status, effective_at, revoked_at, permitted_roles', huntId, ['space_id']),
    huntRows<{ id: string; state: string; version_id: string }>('hunt_runs', 'id, state, version_id', huntId),
    huntRows<{ run_id: string; mission_key: string; disposition: string; accepted_at: string; version_id: string }>('hunt_progress', 'run_id, mission_key, disposition, accepted_at, version_id', huntId, ['run_id', 'mission_key']),
    huntRows<{ id: string; medium: string; revoked_at: string | null; health_status: string }>('hunt_placements', 'id, medium, revoked_at, health_status', huntId),
    huntRows<{ mission_key: string; title: string; version_id: string }>('hunt_missions', 'mission_key, title, version_id', huntId, ['version_id', 'mission_key']),
    huntRows<{ space_id: string; invitee_profile_id: string | null; terms_version: string | null }>('hunt_partners', 'space_id, invitee_profile_id, terms_version', huntId, ['space_id']).catch(() => []),
    huntRows<{ id: string; policy: unknown }>('hunt_versions', 'id, policy', huntId),
    ...OUTBOX.map((status) => outboxCount(huntId, status)),
    ...OUTBOX.map((status) => outboxCount(huntId, status, FINALE_BROADCAST_EVENT)),
  ])
  const inviteOf = new Map(invites.map((i) => [i.space_id, i]))
  const stewardIds = [...new Set(invites.map((i) => i.invitee_profile_id).filter((id): id is string => !!id))]
  const stewards = stewardIds.length ? await db().from('profiles').select('id, display_name').in('id', stewardIds) : { data: [], error: null }

  const partnerRows: (PartnerRow & { inviteeProfileId?: string | null; termsVersion?: string | null })[] = partners.map((p) => ({
    huntId: p.hunt_id, spaceId: p.space_id, status: p.status, effectiveAt: p.effective_at, revokedAt: p.revoked_at, permittedRoles: p.permitted_roles ?? [],
    inviteeProfileId: inviteOf.get(p.space_id)?.invitee_profile_id, termsVersion: inviteOf.get(p.space_id)?.terms_version,
  }))
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
    // A name that cannot be read is left out: the venue still shows, with no steward named.
    stewardNames: Object.fromEntries(((stewards.data ?? []) as { id: string; display_name: string | null }[]).flatMap((p) => (p.display_name ? [[p.id, p.display_name]] : []))),
    finale: parseFinale(versions.find((v) => v.id === version)?.policy),
    finaleOutbox: { pending: outbox[4], leased: outbox[5], done: outbox[6], dead: outbox[7] },
  }
}
