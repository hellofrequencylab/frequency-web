import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { completenessScore, isRealName } from '@/lib/crm/completeness'
import { rosterFromProfileIds } from '@/lib/people/roster-from-ids'
import type { MemberSummary } from '@/components/people/member-viewer'

// THE SPACE RESONANCE ROSTER (Community Resonance = the space CRM). The admin Resonance CRM roster reads
// the SCORED matview (listMembersByFilter), which is empty for a space whose members aren't scored yet —
// so a space with 44 real members showed "No members scored yet". This lists the space's ACTUAL people:
// EVERY active member (scored or not) PLUS every imported contact/lead, mapped into the SAME MemberSummary
// the member-viewer renders — so "all contacts and members appear here", newest first. Service-role reads
// behind the caller's space-manage gate (the callers gate first). FAIL-SAFE: any read degrades to [].
//
// The ids -> scores -> summaries pipeline itself is the scope-neutral lib/people/roster-from-ids
// (CRM Everywhere plan 1.4), shared with the event/circle rosters; this module owns only the SPACE
// walk (who is in the set) and the space-specific contact/lead rows.
//
// Dedupe: a contact stitched to a member (contacts.profile_id in the member set) is dropped so a person
// never appears twice. A pure lead (profile_id null, or not a member) is kept as a `contact:<id>` row.

const CONTACT_ID_PREFIX = 'contact:'

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

/** ALL active members of a space as MemberSummary[] — scored where a score row exists, neutral defaults
 *  where not — via the shared scope-neutral pipeline, so it reads identically to the admin Resonance CRM. */
export async function loadSpaceResonanceMembers(spaceId: string): Promise<MemberSummary[]> {
  const profileIds = await listActiveSpaceMemberIds(spaceId)
  return rosterFromProfileIds(profileIds)
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
      // meta (the rich imported fields: phone/company/title/city/website/tags/notes/custom) + engagement
      // signals ride along so the row can carry a COMPLETENESS score for the "Most complete" sort.
      .from('contacts')
      .select('id, email, display_name, consent_state, created_at, profile_id, meta, engagement_score, last_seen_at')
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
      const rawName = typeof r.display_name === 'string' ? r.display_name.trim() : ''
      const name = rawName || email.split('@')[0] || 'Contact'
      const createdAt = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN

      // COMPLETENESS: read the imported extras out of meta (importer writes these keys, lib/crm/import/
      // commit.ts) and weight them so a filled-out contact outranks a bare email import. A contact stitched
      // to a real profile counts as a member; any engagement signal counts as activity.
      const meta = r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta) ? (r.meta as Record<string, unknown>) : {}
      const filled = (v: unknown): boolean =>
        typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v != null
      const custom = meta.custom
      const completeness = completenessScore({
        hasRealName: isRealName(rawName, email),
        hasPhone: filled(meta.phone),
        hasCompany: filled(meta.company),
        hasTitle: filled(meta.title),
        hasCity: filled(meta.city),
        hasWebsite: filled(meta.website),
        hasTags: filled(meta.tags),
        hasNotes: filled(meta.notes),
        hasCustomFields: !!custom && typeof custom === 'object' && Object.keys(custom as object).length > 0,
        isMember: profileId != null,
        hasActivity: (typeof r.engagement_score === 'number' && r.engagement_score > 0) || filled(r.last_seen_at),
      })

      out.push({
        id: `${CONTACT_ID_PREFIX}${id}`,
        handle: email, // synthetic (no real profile handle); the pane suppresses the /people link for leads
        displayName: name,
        avatarUrl: null,
        // No tier/lifecycle badge (a lead has no resonance score), so the tier/lifecycle facets simply do
        // not surface leads. Headline names it a lead so the row still reads clearly.
        badges: [],
        headline: 'Contact',
        sortValues: {
          joined: Number.isFinite(createdAt) ? createdAt : 0,
          activeThisWeek: 0,
          completeness,
        },
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
