import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { rosterFromProfileIds } from '@/lib/people/roster-from-ids'
import type { Facet, MemberSummary } from '@/components/people/member-viewer'

// THE EVENT CRM ROSTER (Message Attendees · CRM Everywhere plan 3.2 / ADR-827). The event-scoped
// walk for the scope-neutral roster pipeline (lib/people/roster-from-ids): who is in the set is
// the OWNER RULING — everyone RSVP'd GOING or MAYBE, nothing else. Waitlist and declined rows,
// hosting-circle members who never RSVP'd, and invited non-member guests are all EXCLUDED (the
// Manage page's Roster / Invited sections still show them). `muted` is IGNORED — this is a
// management view, not a push fan-out. Each row is badged with a namespaced `rsvp:going` /
// `rsvp:maybe` facet token (the `role:` / `biz:` convention, app/(main)/admin/crm/member-summaries)
// so the viewer's pure facet filter reads RSVP standing with no extra query.
//
// Service-role reads behind the caller's event-manage gate (the callers gate first; the detail
// action re-checks tenancy against listEventCrmMemberIds). FAIL-SAFE: any read degrades to
// empty — [] / an empty Set — never a throw. Capped at 1000 rows; the viewer filters client-side
// over what it holds (plan risk note: revisit server search only if a real event exceeds the cap).

/** Read cap for one event's CRM roster (plan 3.2). */
const EVENT_CRM_ROSTER_CAP = 1000

/** The two RSVP standings that make someone a Message Attendees row (owner ruling). */
export type CrmRsvpStatus = 'going' | 'maybe'

/** The RSVP facet for the Message Attendees viewer. Option values are the namespaced badge
 *  tokens the roster writes, so the viewer's existing pure `matchesFacets` filters them. */
export const RSVP_FACET: Facet = {
  key: 'rsvp',
  label: 'RSVP',
  options: [
    { value: 'rsvp:going', label: 'Going' },
    { value: 'rsvp:maybe', label: 'Maybe' },
  ],
}

// A permissive chainable query type for the untyped admin handle (event_rsvps rows are read with
// runtime narrowing — ADR-246). Covers .select().eq().in().limit().
interface Q extends Promise<{ data: Record<string, unknown>[] | null }> {
  select: (c: string) => Q
  eq: (col: string, val: string) => Q
  in: (col: string, vals: string[]) => Q
  limit: (n: number) => Q
}
function db(): { from: (t: string) => Q } {
  return createAdminClient() as never
}

/** PURE: raw event_rsvps rows -> profile id => going|maybe, first row wins, anything else
 *  (missing id, waitlist, declined, junk) dropped. Preserves the reader's row order. */
export function rsvpStatusByProfileId(
  rows: readonly Record<string, unknown>[] | null | undefined,
): Map<string, CrmRsvpStatus> {
  const map = new Map<string, CrmRsvpStatus>()
  for (const r of rows ?? []) {
    const pid = r.profile_id
    const status = r.status
    if (typeof pid !== 'string' || !pid) continue
    if (status !== 'going' && status !== 'maybe') continue
    if (!map.has(pid)) map.set(pid, status)
  }
  return map
}

/** PURE: append each row's namespaced `rsvp:<status>` facet token to its badges (the `role:` /
 *  `biz:` badge convention), leaving rows without a known standing untouched. */
export function withRsvpBadges(
  summaries: readonly MemberSummary[],
  statusById: ReadonlyMap<string, CrmRsvpStatus>,
): MemberSummary[] {
  return summaries.map((s) => {
    const status = statusById.get(s.id)
    if (!status) return s
    return { ...s, badges: [...(s.badges ?? []), `rsvp:${status}`] }
  })
}

/** The raw going/maybe RSVP rows for one event, capped. FAIL-SAFE to []. */
async function readRsvpRows(eventId: string): Promise<Record<string, unknown>[]> {
  if (!eventId) return []
  try {
    const { data } = await db()
      .from('event_rsvps')
      .select('profile_id, status')
      .eq('event_id', eventId)
      .in('status', ['going', 'maybe'])
      .limit(EVENT_CRM_ROSTER_CAP)
    return data ?? []
  } catch {
    return []
  }
}

/** THE TENANCY SET for the Message Attendees surface: the profile ids the detail action may
 *  build a detail for — exactly the going/maybe RSVPs, same query as the roster. FAIL-SAFE to
 *  an empty Set (fail-closed for the tenancy check that consumes it). */
export async function listEventCrmMemberIds(eventId: string): Promise<Set<string>> {
  return new Set(rsvpStatusByProfileId(await readRsvpRows(eventId)).keys())
}

/** One event's Message Attendees roster as MemberSummary[] — going/maybe RSVPs through the
 *  scope-neutral pipeline (scored where a score row exists, neutral defaults where not), each
 *  row badged `rsvp:going` / `rsvp:maybe` for the RSVP facet. Caller gates event-manage first. */
export async function loadEventCrmRoster(eventId: string): Promise<MemberSummary[]> {
  const statusById = rsvpStatusByProfileId(await readRsvpRows(eventId))
  const summaries = await rosterFromProfileIds([...statusById.keys()])
  return withRsvpBadges(summaries, statusById)
}
