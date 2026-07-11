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

// ── Section A: page views ─────────────────────────────────────────────────────

export interface PageViewStats {
  /** Lifetime page views for this event's public page. */
  total: number
  /** Page views in the last 7 days. */
  last7: number
}

/** Lifetime + 7-day views of this event's public page. Counted from the durable
 *  engagement ledger (engagement_events, event_type 'nav.page_view'), NOT
 *  interaction_events: the latter carries a first-class `path` column but is
 *  retention-purged, so it can never give a true lifetime figure. The viewed path
 *  lives in the context jsonb (context->>'path'), so this ONE read widens to an
 *  untyped client to filter on the jsonb arrow operator (the genuinely-untyped
 *  case ADR-246 allows). */
export async function loadPageViews(slug: string): Promise<PageViewStats> {
  // eslint-disable-next-line no-restricted-syntax -- jsonb arrow filter (context->>path) isn't expressible on the typed client (ADR-246 exception)
  const admin = createAdminClient() as unknown as SupabaseClient
  const path = `/events/${slug}`
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [totalRes, weekRes] = await Promise.all([
    admin
      .from('engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'nav.page_view')
      .eq('context->>path', path),
    admin
      .from('engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'nav.page_view')
      .eq('context->>path', path)
      .gt('created_at', sevenDaysAgo),
  ])

  return { total: totalRes.count ?? 0, last7: weekRes.count ?? 0 }
}

// ── Section B: RSVP-status breakdown ──────────────────────────────────────────

export interface RsvpBreakdown {
  going: number
  /** status='maybe' — surfaced as "Interested" to match the roster/canon label. */
  interested: number
  waitlist: number
  notGoing: number
  /** approval_status='pending' — a request still waiting on the host. */
  pendingApproval: number
  /** Total RSVP rows (any status). */
  total: number
}

/** RSVP-status counts for the breakdown tiles. One cheap read over event_rsvps. */
export async function loadRsvpBreakdown(eventId: string): Promise<RsvpBreakdown> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_rsvps')
    .select('status, approval_status')
    .eq('event_id', eventId)

  const rows = (data ?? []) as unknown as {
    status: string | null
    approval_status: string | null
  }[]

  const breakdown: RsvpBreakdown = {
    going: 0,
    interested: 0,
    waitlist: 0,
    notGoing: 0,
    pendingApproval: 0,
    total: rows.length,
  }
  for (const r of rows) {
    if (r.status === 'going') breakdown.going += 1
    else if (r.status === 'maybe') breakdown.interested += 1
    else if (r.status === 'waitlist') breakdown.waitlist += 1
    else if (r.status === 'not_going') breakdown.notGoing += 1
    if (r.approval_status === 'pending') breakdown.pendingApproval += 1
  }
  return breakdown
}

// ── Section C: buying-intent follow-up ────────────────────────────────────────

export interface FollowUpCandidate {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  /** started_checkout = a pending ticket; rsvp_no_purchase = RSVP'd, never bought. */
  signal: 'started_checkout' | 'rsvp_no_purchase'
}

/** Members who signalled buying intent but didn't complete, so the host can reach
 *  out. Two buckets, deduped (a started checkout is the stronger signal and wins):
 *    1. Abandoned checkout: a `pending` event_tickets row (checkout started, not
 *       succeeded).
 *    2. RSVP'd (going/maybe) with no `succeeded` ticket — only on events that
 *       actually sell paid tickets (a free event has nothing to buy, so it's
 *       skipped). Anyone who already has a succeeded ticket is never listed.
 *  Untyped admin for the whole read (event_tickets/event_ticket_types carry newer
 *  columns than the generated types; ADR-246 exception). */
export async function loadFollowUps(eventId: string): Promise<FollowUpCandidate[]> {
  // eslint-disable-next-line no-restricted-syntax -- ticketing tables carry columns newer than the generated types (ADR-246 exception)
  const admin = createAdminClient() as unknown as SupabaseClient

  // Does this event sell paid tickets? The RSVP'd-but-didn't-buy bucket is
  // meaningless on a free event, so gate it on a chargeable ticket tier (any tier
  // whose pricing mode is not 'free').
  const { count: pricedCount } = await admin
    .from('event_ticket_types')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('pricing_mode', 'free')
  const priced = (pricedCount ?? 0) > 0

  const [pendingRes, succeededRes] = await Promise.all([
    // Bucket 1 source — intent: checkout started, not succeeded. Newest first.
    admin
      .from('event_tickets')
      .select('buyer_profile_id, created_at')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    // Anyone with a succeeded ticket already bought — never a follow-up.
    admin
      .from('event_tickets')
      .select('buyer_profile_id')
      .eq('event_id', eventId)
      .eq('status', 'succeeded'),
  ])

  const bought = new Set<string>()
  for (const t of (succeededRes.data ?? []) as { buyer_profile_id: string | null }[]) {
    if (t.buyer_profile_id) bought.add(t.buyer_profile_id)
  }

  const order: { id: string; signal: FollowUpCandidate['signal'] }[] = []
  const seen = new Set<string>()
  for (const t of (pendingRes.data ?? []) as { buyer_profile_id: string | null }[]) {
    const id = t.buyer_profile_id
    if (!id || bought.has(id) || seen.has(id)) continue
    seen.add(id)
    order.push({ id, signal: 'started_checkout' })
  }

  // Bucket 2 — RSVP'd (going/maybe) with no succeeded ticket, priced events only.
  if (priced) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('profile_id, status, created_at')
      .eq('event_id', eventId)
      .in('status', ['going', 'maybe'])
      .order('created_at', { ascending: false })
    for (const r of (rsvps ?? []) as { profile_id: string | null }[]) {
      const id = r.profile_id
      if (!id || bought.has(id) || seen.has(id)) continue
      seen.add(id)
      order.push({ id, signal: 'rsvp_no_purchase' })
    }
  }

  if (order.length === 0) return []

  const profiles = await profileMap(order.map((o) => o.id))
  return order
    .map((o) => {
      const prof = profiles.get(o.id)
      if (!prof) return null
      return {
        profileId: o.id,
        displayName: prof.displayName,
        handle: prof.handle,
        avatarUrl: prof.avatarUrl,
        signal: o.signal,
      } satisfies FollowUpCandidate
    })
    .filter((c): c is FollowUpCandidate => c != null)
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
