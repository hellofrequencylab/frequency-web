// Space-follower event reminders (opt-in) — the engine behind
// /api/cron/space-follower-event-reminders.
//
// WHAT: a member who FOLLOWS a Space (space_follows) can opt in to a gentle
// reminder about that Space's upcoming PUBLIC events they have NOT RSVP'd to.
// This reuses the existing event-reminder cadence (7d / 24h / 2h), the same
// tz-correct send window, the same email outbox + events-category unsubscribe
// headers + suppression guard. It is a SEPARATE, strictly opt-in channel that
// leaves the RSVP'd reminder cron (app/api/cron/event-reminders) untouched.
//
// SAFETY INVARIANTS (each enforced below, and mirrored in the pure selector):
//   1. DEFAULT OFF — wantsSpaceEventReminders() reads space_event_reminders,
//      which defaults FALSE. No opt-in => no email. (candidate.optedIn)
//   2. IDEMPOTENT — every send is gated on a fresh insert into
//      space_follower_event_reminders_sent (unique on event_id, profile_id, lead).
//      A re-run's duplicate insert conflicts, so the same (member, event, window)
//      is emailed at most once. (recordFollowerReminderSent + candidate.alreadySent)
//   3. SUPPRESSION-RESPECTING — isSuppressed() pre-check here AND the hard guard
//      inside sendRawEmail. (candidate.suppressed)
//   4. PUBLIC-ONLY — followerReminderEventEligible(): visibility='public',
//      status='published', not cancelled. unlisted/private/circle_only/draft never
//      qualify.
//
// Layered master switch: on top of the opt-in we also require the member's event
// email channel (email_events) to be ON — the same preference the RSVP reminder
// cron respects — so a member who turned event email off globally never receives
// these via a side channel. (candidate.eventsEmailOn)
//
// The tables/columns here are newer than the generated DB types, so reads/writes
// go through the untyped admin client (ADR-246), exactly like lib/spaces/follows.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import { HOME_TZ, zoneAbbrev, eventInstant, resolveZone } from '@/lib/time/zone'
import { shouldSend, wantsSpaceEventReminders } from '@/lib/notification-preferences'
import { isSuppressed } from '@/lib/suppression'
import { listSpaceFollowerIds } from '@/lib/spaces/follows'
import { sendSpaceFollowerEventReminderEmail } from '@/lib/email'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ReminderLead = '7d' | '24h' | '2h'

export const FOLLOWER_REMINDER_LEADS: readonly ReminderLead[] = ['7d', '24h', '2h'] as const

// ── The send window (mirrors app/api/cron/event-reminders/route.ts exactly) ────
const SLACK_MS = 30 * 60 * 1000            // tolerate up to 30 min cron drift
const WEEK_LEAD_MIN_MS = 6.5 * 24 * 60 * 60 * 1000   // now + 6.5d
const WEEK_LEAD_MAX_MS = 7.5 * 24 * 60 * 60 * 1000   // now + 7.5d
// The widest real UTC offset any IANA zone reaches is +/-14h; starts_at stores the
// event's wall-clock as UTC parts, so widen the SQL band by this much then filter
// precisely in code by eventInstant().
const MAX_TZ_OFFSET_MS = 14 * 60 * 60 * 1000

function leadOffsetMs(lead: '24h' | '2h'): number {
  return lead === '24h' ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000
}

/** The precise send window for a lead: the ~7d touch is a one-day band centred on +7d,
 *  the near-term touches are a tight {offset, offset+30min} slack window. Pure. */
export function reminderWindow(lead: ReminderLead, now: number): { start: number; end: number } {
  if (lead === '7d') {
    return { start: now + WEEK_LEAD_MIN_MS, end: now + WEEK_LEAD_MAX_MS }
  }
  const off = leadOffsetMs(lead)
  return { start: now + off, end: now + off + SLACK_MS }
}

// The whenLabel the email copy + subject key off. Kept aligned with the RSVP path's
// vocabulary but never implies an RSVP ("your RSVP") — the reader has none here.
function whenLabelFor(lead: ReminderLead): string {
  if (lead === '7d')  return 'in about a week'
  if (lead === '24h') return 'tomorrow'
  return 'soon'
}

function formatAbsolute(iso: string): string {
  // starts_at holds the event's wall-clock as UTC PARTS. Render those parts as the
  // event's own local time, then label with the community HOME zone abbrev.
  const d = new Date(iso)
  const base = d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'UTC',
  }).replace(',', '').replace(' at ', ' · ')
  const abbr = zoneAbbrev(iso, HOME_TZ)
  return abbr ? `${base} ${abbr}` : base
}

// ── Pure eligibility gate — PUBLIC events only ─────────────────────────────────

export interface FollowerReminderEvent {
  id:           string
  space_id:     string | null
  visibility:   string | null
  status:       string | null
  is_cancelled: boolean | null
}

/** SAFETY INVARIANT (public-only): true only for a PUBLIC, published, non-cancelled event
 *  that belongs to a Space. Mirrors passesCalendarGate's public clause but EXCLUDES unlisted
 *  (a follower reminder is a push we initiate, not a link the member followed). Pure. */
export function followerReminderEventEligible(e: FollowerReminderEvent): boolean {
  return (
    !!e.space_id &&
    e.is_cancelled !== true &&
    (e.status ?? 'published') === 'published' &&
    e.visibility === 'public'
  )
}

// ── Pure recipient selection (the four invariants, one filter) ─────────────────

export interface FollowerReminderCandidate {
  profileId:           string
  /** SAFETY 1: space_event_reminders is ON (opt-in, default false). */
  optedIn:             boolean
  /** Layered master switch: the member's event email channel (email_events) is on. */
  eventsEmailOn:       boolean
  /** Excluded by design: the member RSVP'd to this event (any status) -> the RSVP cron covers them. */
  hasRsvp:             boolean
  /** SAFETY 3: the address is on the email suppression list. */
  suppressed:          boolean
  /** A deliverable email address exists for the member. */
  hasDeliverableEmail: boolean
  /** SAFETY 2: a ledger row already exists for this (event, member, lead). */
  alreadySent:         boolean
}

/** The ONE recipient decision, pure + exhaustively unit-tested. A follower is emailed only
 *  when every safety invariant holds: opted in, event-email on, NOT RSVP'd, NOT suppressed,
 *  has a deliverable email, and NOT already sent. Any single failure drops them. */
export function selectFollowerReminderRecipients(
  candidates: FollowerReminderCandidate[],
): string[] {
  return candidates
    .filter(
      (c) =>
        c.optedIn &&
        c.eventsEmailOn &&
        !c.hasRsvp &&
        !c.suppressed &&
        c.hasDeliverableEmail &&
        !c.alreadySent,
    )
    .map((c) => c.profileId)
}

// ── Idempotency ledger ─────────────────────────────────────────────────────────

/** Record that (event, member, lead) is being reminded. Returns TRUE only when THIS call
 *  created the row (safe to send), FALSE when it already existed (unique conflict) or on any
 *  error (fail-closed: never send when we cannot prove we hold the single slot). This
 *  insert-before-send ordering + the UNIQUE (event_id, profile_id, lead) index is the
 *  never-double-send guarantee, even across concurrent cron runs. */
async function recordFollowerReminderSent(eventId: string, profileId: string, lead: ReminderLead): Promise<boolean> {
  try {
    const admin = createAdminClient() as any
    const { error } = await admin
      .from('space_follower_event_reminders_sent')
      .insert({ event_id: eventId, profile_id: profileId, lead })
    // A unique violation (23505) means another run already claimed this slot: do NOT send.
    if (error) return false
    return true
  } catch {
    return false
  }
}

/** The profile ids already reminded for this (event, lead) — a prefilter so we do not even
 *  build candidates for members we know are done. The insert above is the real guard; this
 *  only trims work. FAIL-SAFE: empty set on any error (the insert still prevents a dup). */
async function alreadySentProfileIds(eventId: string, lead: ReminderLead): Promise<Set<string>> {
  try {
    const admin = createAdminClient() as any
    const { data } = await admin
      .from('space_follower_event_reminders_sent')
      .select('profile_id')
      .eq('event_id', eventId)
      .eq('lead', lead)
    const ids = new Set<string>()
    for (const r of (data as Array<{ profile_id?: string }> | null) ?? []) {
      if (r.profile_id) ids.add(r.profile_id)
    }
    return ids
  } catch {
    return new Set()
  }
}

// ── The RSVP'd set for an event (any status) — the exclusion contract ──────────

/** Profile ids that have ANY RSVP row for the event (going / waitlist / not-going alike). These
 *  members are EXCLUDED from follower reminders by design: the RSVP'd reminder cron already covers
 *  a 'going' RSVP, and anyone who engaged with the RSVP at all should not also get the softer
 *  "you follow this Space" nudge. FAIL-SAFE: emails no one on error (returns a set that, combined
 *  with the fail-closed candidate, drops sends) — here we throw-safe to an empty set but the outer
 *  loop treats a read failure conservatively by skipping the event. */
async function rsvpProfileIds(admin: any, eventId: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await admin
      .from('event_rsvps')
      .select('profile_id')
      .eq('event_id', eventId)
    if (error) return null
    const ids = new Set<string>()
    for (const r of (data as Array<{ profile_id?: string }> | null) ?? []) {
      if (r.profile_id) ids.add(r.profile_id)
    }
    return ids
  } catch {
    return null
  }
}

/** Accepted co-host profile ids for an event, excluded alongside the primary host (never remind someone
 *  about an event they co-host). FAIL-SAFE: null on error, which the caller treats as skip-the-event
 *  (conservative), the same posture as the RSVP read. */
async function cohostProfileIds(admin: any, eventId: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await admin
      .from('event_cohosts')
      .select('profile_id')
      .eq('event_id', eventId)
      .eq('status', 'accepted')
    if (error) return null
    const ids = new Set<string>()
    for (const r of (data as Array<{ profile_id?: string }> | null) ?? []) {
      if (r.profile_id) ids.add(r.profile_id)
    }
    return ids
  } catch {
    return null
  }
}

// ── Orchestration (one lead) ───────────────────────────────────────────────────

type EventRow = {
  id:           string
  title:        string
  starts_at:    string
  location:     string | null
  slug:         string
  time_zone:    string | null
  space_id:     string | null
  visibility:   string | null
  status:       string | null
  is_cancelled: boolean | null
  host_id:      string | null
}

type ProfileRow = { id: string; display_name: string | null; auth_user_id: string | null }

async function processLead(lead: ReminderLead): Promise<{ events: number; sent: number }> {
  const admin = createAdminClient() as any
  const now = Date.now()
  const { start, end } = reminderWindow(lead, now)

  // Widen the raw starts_at band by +/-MAX_TZ_OFFSET so no candidate is missed, then keep only
  // events whose TRUE instant lands in the real window. PUBLIC/published/non-cancelled + has a
  // space, filtered at the SQL layer and re-asserted in code by followerReminderEventEligible.
  const { data: rawEvents } = await admin
    .from('events')
    .select('id, title, starts_at, location, slug, time_zone, space_id, visibility, status, is_cancelled, host_id')
    .gte('starts_at', new Date(start - MAX_TZ_OFFSET_MS).toISOString())
    .lt('starts_at', new Date(end + MAX_TZ_OFFSET_MS).toISOString())
    .eq('is_cancelled', false)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .not('space_id', 'is', null)

  const events = ((rawEvents ?? []) as EventRow[]).filter((ev) => {
    if (!followerReminderEventEligible(ev)) return false
    const inst = eventInstant(ev.starts_at, resolveZone(ev.time_zone))
    return !!inst && inst.getTime() >= start && inst.getTime() < end
  })
  if (!events.length) return { events: 0, sent: 0 }

  // Only ACTIVE spaces surface follower reminders (a suspended/hidden space's public event must
  // not be blasted). Load the space name + slug for the copy.
  const spaceIds = [...new Set(events.map((e) => e.space_id).filter((id): id is string => !!id))]
  const { data: spaceRows } = await admin
    .from('spaces')
    .select('id, name, slug, status')
    .in('id', spaceIds)
    .eq('status', 'active')
  const spaces = new Map<string, { name: string; slug: string }>()
  for (const s of (spaceRows as Array<{ id: string; name: string; slug: string; status: string }> | null) ?? []) {
    spaces.set(s.id, { name: s.name, slug: s.slug })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  let sent = 0

  for (const ev of events) {
    const space = ev.space_id ? spaces.get(ev.space_id) : undefined
    if (!space) continue // space missing / not active -> skip the whole event

    // The followers of this event's Space, minus the host (never remind the host of their own
    // event) and minus anyone who RSVP'd (the exclusion contract).
    const followerIds = await listSpaceFollowerIds(ev.space_id as string)
    if (!followerIds.length) continue

    const rsvps = await rsvpProfileIds(admin, ev.id)
    if (rsvps === null) continue // fail-closed: an unreadable RSVP set means we cannot prove exclusion

    const cohosts = await cohostProfileIds(admin, ev.id)
    if (cohosts === null) continue // fail-closed: cannot prove the co-host exclusion, so skip the event

    const doneIds = await alreadySentProfileIds(ev.id, lead)

    // Trim to real prospects before the per-member IO: not the host or a co-host, not RSVP'd, not sent.
    const prospects = followerIds.filter(
      (pid) => pid !== ev.host_id && !cohosts.has(pid) && !rsvps.has(pid) && !doneIds.has(pid),
    )
    if (!prospects.length) continue

    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, display_name, auth_user_id')
      .in('id', prospects)
    const profiles = new Map<string, ProfileRow>()
    for (const p of (profileRows as ProfileRow[] | null) ?? []) profiles.set(p.id, p)

    // Build a candidate per prospect (resolve email + suppression + prefs), then let the pure
    // selector make the ONE decision. Per-member IO mirrors the RSVP reminder cron's shape.
    const emailByProfile = new Map<string, string>()
    const candidates: FollowerReminderCandidate[] = []

    for (const pid of prospects) {
      const profile = profiles.get(pid)
      let email: string | null = null
      if (profile?.auth_user_id) {
        try {
          const { data } = await admin.auth.admin.getUserById(profile.auth_user_id)
          email = data?.user?.email ?? null
        } catch {
          email = null
        }
      }
      if (email) emailByProfile.set(pid, email)

      const [optedIn, eventsEmailOn, suppressed] = await Promise.all([
        wantsSpaceEventReminders(pid),
        shouldSend(pid, 'email', 'events'),
        email ? isSuppressed(email) : Promise.resolve(true),
      ])

      candidates.push({
        profileId:           pid,
        optedIn,
        eventsEmailOn,
        hasRsvp:             false, // already excluded above; kept explicit for the invariant
        suppressed,
        hasDeliverableEmail: !!email,
        alreadySent:         false, // already excluded above; the insert below is the real guard
      })
    }

    const recipients = selectFollowerReminderRecipients(candidates)

    for (const pid of recipients) {
      const profile = profiles.get(pid)
      const email = emailByProfile.get(pid)
      if (!profile || !email) continue

      // Claim the single (event, member, lead) slot FIRST. Only send if we won it, so a
      // concurrent run can never double-send.
      const claimed = await recordFollowerReminderSent(ev.id, pid, lead)
      if (!claimed) continue

      await sendSpaceFollowerEventReminderEmail({
        to:                 email,
        recipientName:      profile.display_name ?? 'there',
        recipientProfileId: pid,
        spaceName:          space.name,
        eventTitle:         ev.title,
        whenLabel:          whenLabelFor(lead),
        whenAbsolute:       formatAbsolute(ev.starts_at),
        location:           ev.location,
        eventUrl:           `${appUrl}/events/${ev.slug}`,
      })
      sent++
    }
  }

  return { events: events.length, sent }
}

/** Run all three touches. Returns per-lead stats for the cron log. */
export async function runSpaceFollowerEventReminders(): Promise<Record<ReminderLead, { events: number; sent: number }>> {
  const t7  = await processLead('7d')
  const t24 = await processLead('24h')
  const t2  = await processLead('2h')
  return { '7d': t7, '24h': t24, '2h': t2 }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
