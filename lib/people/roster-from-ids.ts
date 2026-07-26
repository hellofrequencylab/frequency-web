import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { summariesFromRows } from '@/app/(main)/admin/crm/member-summaries'
import type { MemberListRow } from '@/lib/dashboard/scores'
import type { ResonanceTier } from '@/lib/traits/compute'
import type { MemberSummary } from '@/components/people/member-viewer'

// THE SCOPE-NEUTRAL ROSTER PIPELINE (CRM Everywhere plan 1.4). Any set of profile ids — a space's
// active members, an event's going/maybe RSVPs, a circle's memberships — becomes the member-viewer's
// MemberSummary[] through ONE path: a single batched member_engagement_scores read (no N+1),
// synthetic rows with the codebase's neutral UNSCORED defaults where no score row exists, then the
// shared summariesFromRows mapper — so every roster (scored or not) reads identically to the admin
// Resonance CRM. Extracted verbatim from lib/spaces/resonance-roster.ts so the space roster and the
// new event/circle/hub/nexus rosters compose the same pipeline. Service-role reads behind the
// caller's gate (the callers gate first). FAIL-SAFE: any read degrades gracefully; [] in, [] out.

// Neutral defaults for a member with NO score row yet, matching the codebase's synthetic-row convention
// (lib/dashboard/scores listMembersByFilter): not flagged as needs-help, not buried.
const UNSCORED_HEALTH = 60
const UNSCORED_TIER: ResonanceTier = 'cooling'
const UNSCORED_LIFECYCLE = 'new'
const TIER_VALUES: readonly string[] = ['resonant', 'cooling', 'at_risk']

// A permissive chainable query type for the untyped admin handle (member_engagement_scores is read
// with runtime narrowing — ADR-246). Covers .select().in().
interface Q extends Promise<{ data: Record<string, unknown>[] | null }> {
  select: (c: string) => Q
  in: (col: string, vals: string[]) => Q
}
function db(): { from: (t: string) => Q } {
  return createAdminClient() as never
}

/** Batch-read each member's platform resonance scores (health/tier/lifecycle) for a set of profile ids.
 *  One read for the whole roster (no N+1). Missing rows simply aren't in the map. FAIL-SAFE to empty. */
async function scoresByProfileId(
  profileIds: string[],
): Promise<Map<string, { health: number | null; tier: string | null; lifecycle: string | null }>> {
  const map = new Map<string, { health: number | null; tier: string | null; lifecycle: string | null }>()
  if (profileIds.length === 0) return map
  try {
    const { data } = await db()
      .from('member_engagement_scores')
      .select('profile_id, resonance_health, resonance_tier, lifecycle_stage')
      .in('profile_id', profileIds)
    for (const r of data ?? []) {
      const pid = r.profile_id
      if (typeof pid !== 'string') continue
      map.set(pid, {
        health: typeof r.resonance_health === 'number' ? r.resonance_health : null,
        tier: typeof r.resonance_tier === 'string' ? r.resonance_tier : null,
        lifecycle: typeof r.lifecycle_stage === 'string' ? r.lifecycle_stage : null,
      })
    }
  } catch {
    /* fall through */
  }
  return map
}

/** A set of profile ids as MemberSummary[] — scored where a score row exists, neutral defaults where
 *  not — via the shared roster mapper, so every scope's roster reads identically to the admin
 *  Resonance CRM. The caller owns the scope walk (who is in the set) AND the authorization gate. */
export async function rosterFromProfileIds(profileIds: string[]): Promise<MemberSummary[]> {
  if (profileIds.length === 0) return []
  const scores = await scoresByProfileId(profileIds)
  const rows: MemberListRow[] = profileIds.map((profileId) => {
    const s = scores.get(profileId)
    const tier = s?.tier && TIER_VALUES.includes(s.tier) ? (s.tier as ResonanceTier) : UNSCORED_TIER
    return {
      contactId: null,
      profileId,
      name: '',
      resonanceHealth: typeof s?.health === 'number' ? s.health : UNSCORED_HEALTH,
      resonanceTier: tier,
      lifecycleStage: s?.lifecycle ?? UNSCORED_LIFECYCLE,
    }
  })
  return summariesFromRows(rows)
}
