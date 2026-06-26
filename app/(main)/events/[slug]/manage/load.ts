import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCapacityInfo, type CapacityInfo } from '@/lib/events/capacity'
import { listPendingApprovals } from '@/lib/events/rsvp-depth'
import { listQuestions, listEventAnswers, type EventQuestion } from '@/lib/events/questions'

// Read layer for the host Manage Dashboard (EVENTS-REWORK A2). Pure reads on the
// admin client; the page already authorized the caller as host/cohost before
// calling any of these. Each loader is independent so the page can put them
// behind their own <Suspense> (PAGE-FRAMEWORK §5) and they fetch in parallel.

export interface ManageGuest {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  status: 'going' | 'maybe' | 'waitlist' | 'not_going'
  plusOnes: number
  plusOneNames: string[]
  approvalStatus: 'none' | 'pending' | 'approved'
  /** Has this guest logged a verified check-in for the event? */
  checkedIn: boolean
  createdAt: string
}

interface RsvpRow {
  profile_id: string
  status: ManageGuest['status']
  plus_ones: number | null
  plus_one_names: string[] | null
  approval_status: ManageGuest['approvalStatus'] | null
  created_at: string
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

/** The full RSVP roster with the depth columns the dashboard reads (plus_one_names,
 *  approval_status are newer than the generated types → untyped client). */
export async function loadRoster(eventId: string): Promise<ManageGuest[]> {
  const admin = createAdminClient()
  const [rsvpRes, checkedIn] = await Promise.all([
    // event_rsvps is typed, but plus_one_names / approval_status are newer than the
    // generated types; the select string is loosely typed and the row payload is
    // cast below (ADR-246: cast the payload, not the client).
    admin
      .from('event_rsvps')
      .select(
        'profile_id, status, plus_ones, plus_one_names, approval_status, created_at, profile:profiles!profile_id ( id, display_name, handle, avatar_url )',
      )
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
    loadCheckedInIds(eventId),
  ])

  return ((rsvpRes.data ?? []) as unknown as RsvpRow[])
    .filter((r) => r.profile != null)
    .map((r) => ({
      profileId: r.profile!.id,
      displayName: r.profile!.display_name,
      handle: r.profile!.handle,
      avatarUrl: r.profile!.avatar_url,
      status: r.status,
      plusOnes: Math.max(0, r.plus_ones ?? 0),
      plusOneNames: Array.isArray(r.plus_one_names) ? r.plus_one_names : [],
      approvalStatus: r.approval_status ?? 'none',
      checkedIn: checkedIn.has(r.profile!.id),
      createdAt: r.created_at,
    }))
}

/** Profile ids that have logged a verified check-in for this event. Check-in is
 *  recorded once per (event, profile) in the append-only engagement ledger with a
 *  deterministic idempotency_key (events/actions.checkInEvent), so a prefix match
 *  on that key is the canonical "who showed up" read. */
async function loadCheckedInIds(eventId: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('engagement_events')
    .select('actor_profile_id')
    .eq('event_type', 'practice.verified')
    .like('idempotency_key', `event_checkin:${eventId}:%`)
  const ids = new Set<string>()
  for (const row of (data ?? []) as { actor_profile_id: string | null }[]) {
    if (row.actor_profile_id) ids.add(row.actor_profile_id)
  }
  return ids
}

export interface RosterAnalytics {
  capacity: CapacityInfo
  going: number
  maybe: number
  waitlist: number
  /** confirmed attendees + the headcount they're each bringing */
  headcount: number
  /** verified check-ins logged so far */
  checkedIn: number
  /** % of capacity filled by confirmed 'going' rows (null = unlimited) */
  utilization: number | null
}

/** Headline analytics for the StatCard row. Derived from the roster (no extra
 *  query) plus the canonical capacity read (the same one the Invite uses). */
export async function loadAnalytics(
  eventId: string,
  roster: ManageGuest[],
): Promise<RosterAnalytics> {
  const capacity = await getCapacityInfo(eventId)
  const goingGuests = roster.filter((g) => g.status === 'going')
  const going = goingGuests.length
  const maybe = roster.filter((g) => g.status === 'maybe').length
  const waitlist = roster.filter((g) => g.status === 'waitlist').length
  const checkedIn = roster.filter((g) => g.checkedIn).length
  const headcount = going + goingGuests.reduce((sum, g) => sum + g.plusOnes, 0)
  // Utilize the fresh roster count (computed above), not capacity.going from the
  // separate capacity read, so the % matches the going number shown beside it.
  const utilization =
    capacity.capacity != null && capacity.capacity > 0
      ? Math.round((going / capacity.capacity) * 100)
      : null
  return { capacity, going, maybe, waitlist, headcount, checkedIn, utilization }
}

export interface PendingGuest {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  status: 'going' | 'maybe' | 'waitlist' | 'not_going'
  createdAt: string
}

/** The approval queue, joined to profiles for display. */
export async function loadPendingApprovals(eventId: string): Promise<PendingGuest[]> {
  const pending = await listPendingApprovals(eventId)
  if (pending.length === 0) return []

  const ids = pending.map((p) => p.profileId)
  const profiles = await profileMap(ids)
  return pending.map((p) => {
    const prof = profiles.get(p.profileId)
    return {
      profileId: p.profileId,
      displayName: prof?.displayName ?? 'A member',
      handle: prof?.handle ?? '',
      avatarUrl: prof?.avatarUrl ?? null,
      status: p.status,
      createdAt: p.createdAt,
    }
  })
}

export interface QuestionnaireData {
  questions: EventQuestion[]
  /** answers grouped by respondent, in roster order, each carrying their name */
  responses: {
    profileId: string
    displayName: string
    handle: string
    answers: Record<string, string>
  }[]
}

/** Questions + the answer roster, shaped for the responses table + CSV export. */
export async function loadQuestionnaire(eventId: string): Promise<QuestionnaireData> {
  const [questions, answers] = await Promise.all([
    listQuestions(eventId),
    listEventAnswers(eventId),
  ])
  if (questions.length === 0) return { questions, responses: [] }

  const respondentIds = Array.from(new Set(answers.map((a) => a.profileId)))
  const profiles = await profileMap(respondentIds)

  const byRespondent = new Map<string, Record<string, string>>()
  for (const a of answers) {
    const bucket = byRespondent.get(a.profileId) ?? {}
    bucket[a.questionId] = a.answer
    byRespondent.set(a.profileId, bucket)
  }

  const responses = Array.from(byRespondent.entries()).map(([profileId, answerMap]) => {
    const prof = profiles.get(profileId)
    return {
      profileId,
      displayName: prof?.displayName ?? 'A member',
      handle: prof?.handle ?? '',
      answers: answerMap,
    }
  })

  return { questions, responses }
}

export interface SentDispatch {
  id: string
  title: string | null
  body: string
  createdAt: string
  authorName: string | null
  toDispatch: boolean
  toSms: boolean
}

/** The Event Dispatches the host has already posted, newest first. */
export async function loadSentDispatches(eventId: string): Promise<SentDispatch[]> {
  // event_dispatches isn't in lib/database.types.ts yet, so the typed client narrows
  // the table name to `never`. Widen this ONE read to an untyped client — the
  // genuinely-untyped case the ADR-246 rule allows (same convention as the
  // lib/events/* data layer + the event Detail page, which read/write these rows).
  // eslint-disable-next-line no-restricted-syntax -- event_dispatches not in generated types yet (ADR-246 exception)
  const admin = createAdminClient() as unknown as SupabaseClient
  const { data } = await admin
    .from('event_dispatches')
    .select(
      'id, title, body, created_at, to_dispatch, to_sms, author:profiles!author_id ( display_name )',
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(50)

  type Row = {
    id: string
    title: string | null
    body: string
    created_at: string
    to_dispatch: boolean | null
    to_sms: boolean | null
    author: { display_name: string | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map((d) => ({
    id: d.id,
    title: d.title,
    body: d.body,
    createdAt: d.created_at,
    authorName: d.author?.display_name ?? null,
    toDispatch: !!d.to_dispatch,
    toSms: !!d.to_sms,
  }))
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface ProfileLite {
  displayName: string
  handle: string
  avatarUrl: string | null
}

/** Batch-resolve profile display fields for a set of ids. */
async function profileMap(ids: string[]): Promise<Map<string, ProfileLite>> {
  const map = new Map<string, ProfileLite>()
  if (ids.length === 0) return map
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .in('id', ids)
  for (const p of (data ?? []) as {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }[]) {
    map.set(p.id, { displayName: p.display_name, handle: p.handle, avatarUrl: p.avatar_url })
  }
  return map
}
