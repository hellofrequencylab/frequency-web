import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { summariesFromRows } from '@/app/(main)/admin/crm/member-summaries'
import type { MemberListRow } from '@/lib/dashboard/scores'
import type { ResonanceTier } from '@/lib/traits/compute'
import type { MemberSummary } from '@/components/people/member-viewer'

// THE SPACE RESONANCE ROSTER (Community Resonance = the space CRM). The admin Resonance CRM roster reads
// the SCORED matview (listMembersByFilter), which is empty for a space whose members aren't scored yet —
// so a space with 44 real members showed "No members scored yet". This lists the space's ACTUAL people:
// EVERY active member (scored or not) PLUS every imported contact/lead, mapped into the SAME MemberSummary
// the member-viewer renders — so "all contacts and members appear here", newest first. Service-role reads
// behind the caller's space-manage gate (the callers gate first). FAIL-SAFE: any read degrades to [].
//
// Dedupe: a contact stitched to a member (contacts.profile_id in the member set) is dropped so a person
// never appears twice. A pure lead (profile_id null, or not a member) is kept as a `contact:<id>` row.

const CONTACT_ID_PREFIX = 'contact:'

// Neutral defaults for a member with NO score row yet, matching the codebase's synthetic-row convention
// (lib/dashboard/scores listMembersByFilter): not flagged as needs-help, not buried.
const UNSCORED_HEALTH = 60
const UNSCORED_TIER: ResonanceTier = 'cooling'
const UNSCORED_LIFECYCLE = 'new'
const TIER_VALUES: readonly string[] = ['resonant', 'cooling', 'at_risk']

// A permissive chainable query type for the untyped admin handle (space_members / contacts aren't in the
// generated types — ADR-246). Every builder method returns the same chainable, which is itself awaitable to
// a list result; maybeSingle resolves a single row. Covers .select().eq().eq(), .select().in(),
// .select().eq().order().limit(), and .select().eq().maybeSingle().
interface Q extends Promise<{ data: Record<string, unknown>[] | null }> {
  select: (c: string) => Q
  eq: (col: string, val: string) => Q
  in: (col: string, vals: string[]) => Q
  order: (col: string, o: { ascending: boolean }) => Q
  limit: (n: number) => Q
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
}
function db(): { from: (t: string) => Q } {
  return createAdminClient() as never
}

/** Every ACTIVE person of a space: the space_members rows (status='active') UNION the owner (who holds no
 *  membership row). Deduped profile-id list. FAIL-SAFE to []. */
export async function listActiveSpaceMemberIds(spaceId: string): Promise<string[]> {
  if (!spaceId) return []
  const ids = new Set<string>()
  try {
    const { data } = await db()
      .from('space_members')
      .select('profile_id, status')
      .eq('space_id', spaceId)
      .eq('status', 'active')
    for (const r of data ?? []) {
      const pid = r.profile_id
      if (typeof pid === 'string' && pid) ids.add(pid)
    }
  } catch {
    /* fall through */
  }
  try {
    const { data } = await db().from('spaces').select('owner_profile_id').eq('id', spaceId).maybeSingle()
    const owner = data?.owner_profile_id
    if (typeof owner === 'string' && owner) ids.add(owner)
  } catch {
    /* fall through */
  }
  return [...ids]
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

/** ALL active members of a space as MemberSummary[] — scored where a score row exists, neutral defaults
 *  where not — via the shared roster mapper, so it reads identically to the admin Resonance CRM. */
export async function loadSpaceResonanceMembers(spaceId: string): Promise<MemberSummary[]> {
  const profileIds = await listActiveSpaceMemberIds(spaceId)
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

/** The space's imported CONTACTS/leads as MemberSummary rows, id-prefixed `contact:` so they never collide
 *  with member (profile-id) rows. Dedupes out any contact already present as a member (contacts.profile_id
 *  in `excludeProfileIds`). Newest first. FAIL-SAFE to []. */
export async function loadSpaceResonanceContacts(
  spaceId: string,
  excludeProfileIds: Set<string>,
): Promise<MemberSummary[]> {
  if (!spaceId) return []
  try {
    const { data } = await db()
      .from('contacts')
      .select('id, email, display_name, consent_state, created_at, profile_id')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(500)
    const out: MemberSummary[] = []
    for (const r of data ?? []) {
      const id = r.id
      const email = typeof r.email === 'string' ? r.email : ''
      if (typeof id !== 'string' || !email) continue
      const profileId = typeof r.profile_id === 'string' ? r.profile_id : null
      if (profileId && excludeProfileIds.has(profileId)) continue // already a member row
      const name =
        (typeof r.display_name === 'string' && r.display_name.trim()) || email.split('@')[0] || 'Contact'
      const createdAt = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN
      out.push({
        id: `${CONTACT_ID_PREFIX}${id}`,
        handle: email, // synthetic (no real profile handle); the pane suppresses the /people link for leads
        displayName: name,
        avatarUrl: null,
        // No tier/lifecycle badge (a lead has no resonance score), so the tier/lifecycle facets simply do
        // not surface leads. Headline names it a lead so the row still reads clearly.
        badges: [],
        headline: 'Contact',
        sortValues: { joined: Number.isFinite(createdAt) ? createdAt : 0, activeThisWeek: 0 },
      })
    }
    return out
  } catch {
    return []
  }
}

/** THE unified space Resonance roster: every active member + every un-stitched contact, newest first.
 *  The single source the space Community Resonance master-detail renders. Caller gates space-manage. */
export async function loadSpaceResonanceRoster(spaceId: string): Promise<MemberSummary[]> {
  const members = await loadSpaceResonanceMembers(spaceId)
  const memberIds = new Set(members.map((m) => m.id))
  const contacts = await loadSpaceResonanceContacts(spaceId, memberIds)
  return [...members, ...contacts]
}

/** Whether a member-viewer row id is a contact (lead) id rather than a member profile id. */
export function isContactRowId(id: string): boolean {
  return id.startsWith(CONTACT_ID_PREFIX)
}

/** The raw contact uuid inside a `contact:<uuid>` row id. */
export function contactIdFromRowId(id: string): string {
  return id.startsWith(CONTACT_ID_PREFIX) ? id.slice(CONTACT_ID_PREFIX.length) : id
}
