/**
 * The moderation store (FH-018S live half). Every Hunt table is service role only, so this file is the
 * tenancy wall for reports and the pause switch: it loads, fresh for each request, the facts
 * lib/hunts/moderation-actions.ts decides on, resolves which Trails the caller may moderate, and reads the
 * open-report queue for exactly those Trails. Nothing is cached, so revoking a role stops the next action.
 * It writes nothing; the writes are the two service-role functions (hunt_report_file, hunt_moderate).
 *
 * The queue carries the reason and the count, never who reported: a reporter id stays inside the server.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import type { RoleGrant } from './authz'
import { mayModerate, type ModerationFacts } from './moderation-actions'
import type { HuntModerationReader, HuntModerationScope } from './moderation-reader'
import type { triage } from './moderation'
import { playerHuntState } from './run-store'

// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

/** The Hunt a public or unlisted slug names, for a report. Null for a private Hunt or no such slug. */
export async function visibleHuntIdBySlug(slug: string): Promise<string | null> {
  const { data, error } = await db().from('hunts').select('id').eq('slug', slug).in('visibility', ['public', 'unlisted']).maybeSingle()
  return error ? null : ((data as { id: string } | null)?.id ?? null)
}

/** Facts for deciding pause, resume and close. The owner Space's standing is read this request. */
export async function loadModerationFacts(profileId: string, huntId: string): Promise<ModerationFacts | null> {
  const client = db()
  const [hunt, roles] = await Promise.all([
    client.from('hunts').select('id, visibility, owner_profile_id, owner_space_id').eq('id', huntId).maybeSingle(),
    client.from('hunt_roles').select('hunt_id, profile_id, role, expires_at, revoked_at').eq('hunt_id', huntId),
  ])
  const h = hunt.data as { id: string; visibility: 'private' | 'unlisted' | 'public'; owner_profile_id: string | null; owner_space_id: string | null } | null
  if (hunt.error || roles.error || !h) return null

  const grants: RoleGrant[] = ((roles.data ?? []) as { hunt_id: string; profile_id: string; role: RoleGrant['role']; expires_at: string | null; revoked_at: string | null }[]).map((r) => ({
    huntId: r.hunt_id,
    profileId: r.profile_id,
    role: r.role,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  }))

  let ownerSpaceRole: 'owner' | 'admin' | null = null
  if (h.owner_space_id) {
    const space = await getSpaceById(h.owner_space_id)
    if (space) {
      const caps = await getSpaceCapabilities(space, profileId)
      ownerSpaceRole = caps.isOwner ? 'owner' : caps.isAdmin ? 'admin' : null
    }
  }

  return {
    hunt: { id: h.id, visibility: h.visibility, ownerProfileId: h.owner_profile_id, ownerSpaceId: h.owner_space_id },
    grants,
    partners: [],
    actor: { profileId, ownerSpaceRole },
  }
}

type OpenReportRow = { hunt_id: string; reporter_profile_id: string; reason: string }

/** The Trails with open reports that this caller may pause or close. Work is bounded by the open-report set. */
export async function loadModerationScope(profileId: string): Promise<HuntModerationScope | null> {
  const open = await db().from('hunt_reports').select('hunt_id').eq('state', 'open').limit(500)
  if (open.error) return null
  const huntIds = [...new Set(((open.data ?? []) as { hunt_id: string }[]).map((r) => r.hunt_id))]
  const now = Math.floor(Date.now() / 1000)
  const allowed: string[] = []
  for (const huntId of huntIds) {
    const facts = await loadModerationFacts(profileId, huntId)
    if (facts && mayModerate(facts, 'pause', huntId, now)) allowed.push(huntId)
  }
  return { huntIds: allowed }
}

/** The queue for the Trails in scope only. A failed or partial read throws, so the screen says "unavailable". */
export const moderationReader: HuntModerationReader = async (scope) => {
  if (scope.huntIds.length === 0) return []
  const ids = [...scope.huntIds]
  const client = db()
  const [reports, hunts] = await Promise.all([
    client.from('hunt_reports').select('hunt_id, reporter_profile_id, reason').eq('state', 'open').in('hunt_id', ids).limit(2000),
    client.from('hunts').select('id, slug, status, current_version_id').in('id', ids),
  ])
  if (reports.error || hunts.error) throw new Error('moderation queue unavailable')
  const huntRows = (hunts.data ?? []) as { id: string; slug: string; status: string; current_version_id: string | null }[]
  const versionIds = huntRows.map((h) => h.current_version_id).filter((v): v is string => !!v)
  const versions = versionIds.length
    ? await client.from('hunt_versions').select('id, trail_title:policy->trail->>title').in('id', versionIds)
    : { data: [], error: null }
  if (versions.error) throw new Error('moderation queue unavailable')
  const titleOf = new Map(((versions.data ?? []) as { id: string; trail_title: string | null }[]).map((v) => [v.id, v.trail_title?.trim() ?? '']))

  const rows = (reports.data ?? []) as OpenReportRow[]
  return huntRows.flatMap((h) => {
    const state = playerHuntState(h.status)
    if (!state) return []
    return [{
      huntId: h.id,
      title: (h.current_version_id ? titleOf.get(h.current_version_id) : '') || h.slug,
      state,
      reports: rows.filter((r) => r.hunt_id === h.id).map((r) => ({ reporterId: r.reporter_profile_id, reason: r.reason as Parameters<typeof triage>[0][number]['reason'] })),
    }]
  })
}
