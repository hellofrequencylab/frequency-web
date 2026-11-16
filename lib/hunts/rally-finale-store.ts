/**
 * The Rally finale reader (FH-031): the IO half of lib/hunts/rally-finale.ts.
 *
 * It READS and nothing else. The Hunt side gives the run, the published version's finale Event and the
 * partner rows; the Events side gives the Event, its seat count (lib/events/capacity.ts, the same count
 * the Event page and the capacity trigger use), the player's own RSVP and ticket rows, and their verified
 * check-in. Every Events read is scoped to the host Event id AND the signed-in profile, so a seat at
 * another Event, or another person's seat, is never loaded. There is no insert, update or function
 * call in this file: the Hunt cannot admit anyone.
 *
 * The caller passes the profile id from `getCallerProfile()` and checks HUNTS_ENABLED; a run that is not
 * that profile's reads as null.
 */
import { hostingSpaceId } from '@/lib/events/belonging'
import { getCapacityInfo } from '@/lib/events/capacity'
import type { PartnerRow } from './authz'
import { db } from './commerce-store'
import { partnerLive } from './partners'
import { parseFinale, projectFinale, type FinaleFacts, type FinaleProjection, type HostEvent } from './rally-finale'

type EventRow = {
  id: string
  title: string
  slug: string
  starts_at: string | null
  capacity: number | null
  is_cancelled: boolean | null
  status: string | null
  removed_at: string | null
  host_space_id: string | null
  space_id: string | null
}

const EVENT_COLS = 'id, title, slug, starts_at, capacity, is_cancelled, status, removed_at, host_space_id, space_id'

const toHostEvent = (e: EventRow): HostEvent => ({
  id: e.id,
  title: e.title,
  slug: e.slug,
  startsAt: e.starts_at,
  capacity: typeof e.capacity === 'number' ? e.capacity : null,
  cancelled: e.is_cancelled === true,
  published: e.status === 'published' && !e.removed_at,
  // The one host resolver (lib/events/belonging.ts). No root tenant is passed: the id is only compared.
  hostSpaceId: hostingSpaceId({ spaceId: e.space_id, hostSpaceId: e.host_space_id }, null),
})

/** The facts for one player's run, read now. Null when the run is missing or not this player's. */
async function loadFinaleFacts(runId: string, profileId: string, now: string): Promise<FinaleFacts | null> {
  const client = db()
  const { data: runRow, error: runError } = await client
    .from('hunt_runs')
    .select('id, hunt_id, version_id, state')
    .eq('id', runId)
    .eq('subject_profile_id', profileId)
    .maybeSingle()
  const run = runRow as { id: string; hunt_id: string; version_id: string; state: string } | null
  if (runError || !run) return null

  const [hunt, version, partners] = await Promise.all([
    client.from('hunts').select('owner_space_id').eq('id', run.hunt_id).maybeSingle(),
    client.from('hunt_versions').select('policy').eq('id', run.version_id).eq('hunt_id', run.hunt_id).maybeSingle(),
    client.from('hunt_partners').select('hunt_id, space_id, status, effective_at, revoked_at').eq('hunt_id', run.hunt_id),
  ])
  if (hunt.error || version.error || partners.error || !hunt.data || !version.data) return null

  const finale = parseFinale((version.data as { policy: unknown }).policy)
  const base = {
    runState: run.state,
    huntOwnerSpaceId: (hunt.data as { owner_space_id: string | null }).owner_space_id,
    livePartnerSpaceIds: ((partners.data ?? []) as { space_id: string; status: PartnerRow['status']; effective_at: string | null; revoked_at: string | null }[])
      .filter((p) => partnerLive({ status: p.status, effectiveAt: p.effective_at, revokedAt: p.revoked_at }, now))
      .map((p) => p.space_id),
  }
  const empty: FinaleFacts = { ...base, finale, event: null, going: 0, rsvps: [], tickets: [], selfCheckedIn: false }
  if (!finale) return empty

  const [event, rsvps, tickets, checkin] = await Promise.all([
    client.from('events').select(EVENT_COLS).eq('id', finale.eventId).maybeSingle(),
    client.from('event_rsvps').select('id, event_id, status, approval_status, attended_at').eq('event_id', finale.eventId).eq('profile_id', profileId),
    client.from('event_tickets').select('id, event_id, status, refunded_at, attended_at').eq('event_id', finale.eventId).eq('buyer_profile_id', profileId),
    client.from('engagement_events').select('id').eq('event_type', 'practice.verified').eq('idempotency_key', `event_checkin:${finale.eventId}:${profileId}`).limit(1),
  ])
  // A read that failed is not a seat and not an empty room: the finale reads as unavailable.
  if (event.error || rsvps.error || tickets.error || checkin.error || !event.data) return empty

  const capacity = await getCapacityInfo(finale.eventId)
  return {
    ...base,
    finale,
    event: toHostEvent(event.data as EventRow),
    going: capacity.going,
    rsvps: ((rsvps.data ?? []) as { id: string; event_id: string; status: string; approval_status: string; attended_at: string | null }[]).map((r) => ({
      id: r.id, eventId: r.event_id, status: r.status, approvalStatus: r.approval_status, attendedAt: r.attended_at,
    })),
    tickets: ((tickets.data ?? []) as { id: string; event_id: string; status: string; refunded_at: string | null; attended_at: string | null }[]).map((t) => ({
      id: t.id, eventId: t.event_id, status: t.status, refundedAt: t.refunded_at, attendedAt: t.attended_at,
    })),
    selfCheckedIn: ((checkin.data ?? []) as unknown[]).length > 0,
  }
}

/** The finale for one player's run, or null when the run is not theirs. */
export async function loadRallyFinale(runId: string, profileId: string, now: string): Promise<FinaleProjection | null> {
  const facts = await loadFinaleFacts(runId, profileId, now)
  return facts ? projectFinale(facts) : null
}

/**
 * The host Event alone, for the organiser's route health (FH-032S): the Event row and its confirmed seat
 * count, with no player's rows. A failed read or a missing Event reads as no Event, which the
 * projection shows as an unavailable finale.
 */
export async function loadHostEvent(eventId: string): Promise<{ event: HostEvent | null; going: number }> {
  const { data, error } = await db().from('events').select(EVENT_COLS).eq('id', eventId).maybeSingle()
  if (error || !data) return { event: null, going: 0 }
  const capacity = await getCapacityInfo(eventId)
  return { event: toHostEvent(data as EventRow), going: capacity.going }
}
