/**
 * The station's fact loader (FH-022). Every Hunt table is service role only, so this file is the tenancy
 * wall for the redemption routes: it reads, fresh for each request, the grant, its reward and Trail, the
 * Hunt's role grants and partner rows, and the caller's standing in each venue Space, and hands them to
 * lib/hunts/redemption.ts, which decides. Nothing is cached, so revoking a staff member or a partner
 * stops the next redemption. It writes nothing; the writes are the two service-role functions.
 *
 * "Staff" of a venue Space is a member who may edit the Space (`canEditProfile`), the same narrow
 * standing the door uses (lib/hunts/staff-store.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import type { PartnerRow, RoleGrant } from './authz'
import type { StationFacts } from './redemption'

// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

type GrantRow = {
  id: string
  hunt_id: string
  profile_id: string
  state: string
  expires_at: string | null
  reward_title: string
  reward_kind: string
  trail_title: string
}

/** One grant with the issuer's words. `profile_id` stays inside the server: the view that leaves it carries no player. */
export async function loadGrant(grantId: string): Promise<GrantRow | null> {
  const { data, error } = await db()
    .from('hunt_reward_grants')
    .select('id, hunt_id, profile_id, state, expires_at, reward_id')
    .eq('id', grantId)
    .maybeSingle()
  const g = data as { id: string; hunt_id: string; profile_id: string; state: string; expires_at: string | null; reward_id: string } | null
  if (error || !g) return null
  const reward = await db().from('hunt_rewards').select('title, kind, version_id').eq('id', g.reward_id).maybeSingle()
  const r = reward.data as { title: string; kind: string; version_id: string } | null
  if (reward.error || !r) return null
  // A Hunt has no title column: the Trail's title is published with its version (policy.trail.title), the slug is the fallback.
  const [version, hunt] = await Promise.all([
    db().from('hunt_versions').select('trail_title:policy->trail->>title').eq('id', r.version_id).eq('hunt_id', g.hunt_id).maybeSingle(),
    db().from('hunts').select('slug').eq('id', g.hunt_id).maybeSingle(),
  ])
  if (version.error || hunt.error) return null
  const trailTitle = (version.data as { trail_title: string | null } | null)?.trail_title?.trim()
  const slug = (hunt.data as { slug: string } | null)?.slug
  return {
    id: g.id,
    hunt_id: g.hunt_id,
    profile_id: g.profile_id,
    state: g.state,
    expires_at: g.expires_at,
    reward_title: r.title,
    reward_kind: r.kind,
    trail_title: trailTitle || slug || 'A Trail',
  }
}

/** A player's own grant, for issuing a token. Null when it is not theirs, so a grant id never leaks. */
export async function loadOwnGrant(profileId: string, grantId: string): Promise<{ id: string; state: string; expires_at: string | null } | null> {
  const { data, error } = await db()
    .from('hunt_reward_grants')
    .select('id, state, expires_at')
    .eq('id', grantId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return error ? null : (data as { id: string; state: string; expires_at: string | null } | null)
}

/**
 * Facts for deciding `redeem_reward` on one Hunt. The venue is the first venue Space (the Hunt's own
 * Space, then its accepted partners) where this member is current staff; a Hunt role holder with no
 * venue standing gets a null venue and is judged by their role alone.
 */
export async function loadStationFacts(staffId: string, huntId: string): Promise<StationFacts | null> {
  const client = db()
  const [hunt, roles, partners] = await Promise.all([
    client.from('hunts').select('id, visibility, owner_profile_id, owner_space_id').eq('id', huntId).maybeSingle(),
    client.from('hunt_roles').select('hunt_id, profile_id, role, expires_at, revoked_at').eq('hunt_id', huntId),
    client.from('hunt_partners').select('hunt_id, space_id, status, effective_at, revoked_at, permitted_roles').eq('hunt_id', huntId),
  ])
  const h = hunt.data as { id: string; visibility: 'private' | 'unlisted' | 'public'; owner_profile_id: string | null; owner_space_id: string | null } | null
  if (hunt.error || roles.error || partners.error || !h) return null

  const grants: RoleGrant[] = ((roles.data ?? []) as { hunt_id: string; profile_id: string; role: RoleGrant['role']; expires_at: string | null; revoked_at: string | null }[]).map((r) => ({
    huntId: r.hunt_id,
    profileId: r.profile_id,
    role: r.role,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  }))
  const partnerRows: PartnerRow[] = ((partners.data ?? []) as { hunt_id: string; space_id: string; status: PartnerRow['status']; effective_at: string | null; revoked_at: string | null; permitted_roles: string[] }[]).map((p) => ({
    huntId: p.hunt_id,
    spaceId: p.space_id,
    status: p.status,
    effectiveAt: p.effective_at,
    revokedAt: p.revoked_at,
    permittedRoles: p.permitted_roles ?? [],
  }))

  const candidates = [...new Set([h.owner_space_id, ...partnerRows.filter((p) => p.status === 'accepted').map((p) => p.spaceId)].filter((id): id is string => !!id))]
  const staffVenueSpaceIds: string[] = []
  for (const spaceId of candidates) {
    const space = await getSpaceById(spaceId)
    if (!space) continue
    const caps = await getSpaceCapabilities(space, staffId)
    if (caps.canEditProfile) staffVenueSpaceIds.push(spaceId)
  }

  return {
    hunt: { id: h.id, visibility: h.visibility, ownerProfileId: h.owner_profile_id, ownerSpaceId: h.owner_space_id },
    grants,
    partners: partnerRows,
    actor: { profileId: staffId },
    venueSpaceId: staffVenueSpaceIds[0] ?? null,
    staffVenueSpaceIds,
  }
}
