// Application + waitlist reads + view-models (Growth OS Engine 3, GE3-1/GE3-4,
// ADR-456). An application is an `applications` row; a waitlist entry is a
// `waitlist_entries` row. These tables are not in the generated DB types until
// regen, so we read through an untyped admin handle (the repo-wide service-role
// convention, ADR-246, see lib/funnels/store.ts). Server-only.
//
// The shapes here are presentation-neutral view-models (PAGE-FRAMEWORK contract
// note): the review-queue admin and any future mobile surface read the same
// Application / WaitlistEntry objects, no review logic trapped in React.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type ApplicationTrack,
  type ApplicationStatus,
  OPEN_STATUSES,
} from './tracks'

// Untyped admin handle — the funnels/circles convention (ADR-246). The
// SupabaseClient return annotation widens off the typed-table union without a cast.
function db(): SupabaseClient {
  return createAdminClient()
}

export interface ApplicationHandoff {
  circleId?: string
  circleSlug?: string
  role?: string
  starterTemplateId?: string
}

export interface Application {
  id: string
  track: ApplicationTrack
  applicantProfileId: string | null
  applicantEmail: string | null
  applicantName: string | null
  answers: Record<string, unknown>
  status: ApplicationStatus
  reviewedBy: string | null
  decidedAt: string | null
  decisionReason: string | null
  handoff: ApplicationHandoff | null
  createdAt: string
}

interface ApplicationRow {
  id: string
  track: ApplicationTrack
  applicant_profile_id: string | null
  applicant_email: string | null
  applicant_name: string | null
  answers: Record<string, unknown> | null
  status: ApplicationStatus
  reviewed_by: string | null
  decided_at: string | null
  decision_reason: string | null
  handoff: ApplicationHandoff | null
  created_at: string
}

const APP_COLS =
  'id, track, applicant_profile_id, applicant_email, applicant_name, answers, status, reviewed_by, decided_at, decision_reason, handoff, created_at'

function toApplication(r: ApplicationRow): Application {
  return {
    id: r.id,
    track: r.track,
    applicantProfileId: r.applicant_profile_id,
    applicantEmail: r.applicant_email,
    applicantName: r.applicant_name,
    answers: r.answers ?? {},
    status: r.status,
    reviewedBy: r.reviewed_by,
    decidedAt: r.decided_at,
    decisionReason: r.decision_reason,
    handoff: r.handoff,
    createdAt: r.created_at,
  }
}

export interface ListApplicationsFilter {
  track?: ApplicationTrack
  status?: ApplicationStatus
  /** When true (and no explicit status), only the open (pending/in_review) rows. */
  openOnly?: boolean
}

/** Applications, newest first, filtered for the review queue. */
export async function listApplications(filter: ListApplicationsFilter = {}): Promise<Application[]> {
  let q = db().from('applications').select(APP_COLS).order('created_at', { ascending: false })
  if (filter.track) q = q.eq('track', filter.track)
  if (filter.status) q = q.eq('status', filter.status)
  else if (filter.openOnly) q = q.in('status', OPEN_STATUSES)
  const { data } = await q
  return ((data as ApplicationRow[] | null) ?? []).map(toApplication)
}

/** One application by id, or null. */
export async function getApplication(id: string): Promise<Application | null> {
  const { data } = await db().from('applications').select(APP_COLS).eq('id', id).maybeSingle()
  const row = data as ApplicationRow | null
  return row ? toApplication(row) : null
}

/** The caller's open application on a track, if any (the apply surface uses this to
 *  show "your application is in review" instead of the form). */
export async function getOpenApplication(
  profileId: string,
  track: ApplicationTrack,
): Promise<Application | null> {
  const { data } = await db()
    .from('applications')
    .select(APP_COLS)
    .eq('applicant_profile_id', profileId)
    .eq('track', track)
    .in('status', OPEN_STATUSES)
    .maybeSingle()
  const row = data as ApplicationRow | null
  return row ? toApplication(row) : null
}

/** Headline counts for the review-queue KPIs. */
export interface ApplicationCounts {
  total: number
  pending: number
  inReview: number
  accepted: number
  declined: number
}

export async function applicationCounts(apps: Application[]): Promise<ApplicationCounts> {
  return {
    total: apps.length,
    pending: apps.filter((a) => a.status === 'pending').length,
    inReview: apps.filter((a) => a.status === 'in_review').length,
    accepted: apps.filter((a) => a.status === 'accepted').length,
    declined: apps.filter((a) => a.status === 'declined').length,
  }
}

/** Resolve applicant display names (+ handles) for a set of profile ids, for the
 *  queue rows. Returns a map keyed by profile id. */
export async function applicantNames(
  profileIds: string[],
): Promise<Map<string, { displayName: string; handle: string | null }>> {
  const out = new Map<string, { displayName: string; handle: string | null }>()
  const ids = Array.from(new Set(profileIds.filter(Boolean)))
  if (!ids.length) return out
  const { data } = await db().from('profiles').select('id, display_name, handle').in('id', ids)
  for (const p of (data as Array<{ id: string; display_name: string | null; handle: string | null }> | null) ?? []) {
    out.set(p.id, { displayName: p.display_name ?? 'Member', handle: p.handle })
  }
  return out
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

export type WaitlistTrack = 'seeker' | 'builder' | 'city'
export type WaitlistStatus = 'waiting' | 'invited' | 'converted' | 'removed'

export interface WaitlistEntry {
  id: string
  track: WaitlistTrack
  profileId: string | null
  email: string | null
  name: string | null
  locality: string | null
  position: number | null
  referredByProfileId: string | null
  cohort: string | null
  status: WaitlistStatus
  createdAt: string
}

interface WaitlistRow {
  id: string
  track: WaitlistTrack
  profile_id: string | null
  email: string | null
  name: string | null
  locality: string | null
  position: number | null
  referred_by_profile_id: string | null
  cohort: string | null
  status: WaitlistStatus
  created_at: string
}

const WL_COLS =
  'id, track, profile_id, email, name, locality, position, referred_by_profile_id, cohort, status, created_at'

function toWaitlist(r: WaitlistRow): WaitlistEntry {
  return {
    id: r.id,
    track: r.track,
    profileId: r.profile_id,
    email: r.email,
    name: r.name,
    locality: r.locality,
    position: r.position,
    referredByProfileId: r.referred_by_profile_id,
    cohort: r.cohort,
    status: r.status,
    createdAt: r.created_at,
  }
}

/** Waitlist entries by position (then newest), filtered for the manager. */
export async function listWaitlist(filter: { track?: WaitlistTrack; status?: WaitlistStatus } = {}): Promise<
  WaitlistEntry[]
> {
  let q = db()
    .from('waitlist_entries')
    .select(WL_COLS)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (filter.track) q = q.eq('track', filter.track)
  if (filter.status) q = q.eq('status', filter.status)
  const { data } = await q
  return ((data as WaitlistRow[] | null) ?? []).map(toWaitlist)
}

/** Counts for the waitlist KPIs. */
export async function waitlistCounts(entries: WaitlistEntry[]): Promise<{
  total: number
  waiting: number
  invited: number
  converted: number
}> {
  return {
    total: entries.length,
    waiting: entries.filter((e) => e.status === 'waiting').length,
    invited: entries.filter((e) => e.status === 'invited').length,
    converted: entries.filter((e) => e.status === 'converted').length,
  }
}

/** The current tail position on a track (the next joiner sits at +1). The
 *  referral-position engine (GE3-5, deferred) will replace this plain append. */
export async function nextWaitlistPosition(track: WaitlistTrack): Promise<number> {
  const { data } = await db()
    .from('waitlist_entries')
    .select('position')
    .eq('track', track)
    .order('position', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const top = (data as { position: number | null } | null)?.position ?? 0
  return (top ?? 0) + 1
}

/** The caller's waitlist entry on a track, if any (the waitlist surface shows their
 *  position instead of the join form). */
export async function getMyWaitlistEntry(
  profileId: string,
  track: WaitlistTrack,
): Promise<WaitlistEntry | null> {
  const { data } = await db()
    .from('waitlist_entries')
    .select(WL_COLS)
    .eq('profile_id', profileId)
    .eq('track', track)
    .maybeSingle()
  const row = data as WaitlistRow | null
  return row ? toWaitlist(row) : null
}
