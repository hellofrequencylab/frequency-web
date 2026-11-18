// Course credentials (owner 2026-11-18): Attended and Certified, stored, public by id, shareable.
// Server-only, admin client only: both tables are service-role only (the migration header,
// supabase/migrations/20270346092000_course_credentials.sql). Every caller gates its own authority:
//   · the public page reads ONE credential by its id and shows the holder's display name, the course
//     and the date, nothing else
//   · Attended is issued by the follow-up cron when a Run's last session is behind it
//   · a submission is written for the signed-in holder only (app/(marketing)/courses/[slug]/certify)
//   · a review (certify or return) is a staff action (app/(main)/admin/content/journeys/credential-actions.ts)
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

export type { CredentialLevel } from './credentials-types'
import type { CredentialLevel } from './credentials-types'

export interface PublicCredential {
  id: string
  level: CredentialLevel
  issuedAt: string
  revoked: boolean
  holder: { name: string; handle: string | null }
  course: { title: string; slug: string }
}

interface SubmissionRow {
  id: string
  planId: string
  courseTitle: string
  courseSlug: string
  holder: { name: string; handle: string | null }
  body: string
  createdAt: string
}

const LEVEL_LABEL: Record<CredentialLevel, string> = { attended: 'Attended', certified: 'Certified' }

/** "Attended" / "Certified". */
export function levelLabel(level: CredentialLevel): string {
  return LEVEL_LABEL[level]
}

// Untyped handle (ADR-246): the two tables are not in lib/database.types.ts until the types are regenerated.
type Untyped = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as unknown as Untyped

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One credential for its public page, or null. */
export async function getPublicCredential(id: string): Promise<PublicCredential | null> {
  if (!UUID_RE.test(id)) return null
  try {
    const { data } = await db()
      .from('course_credentials')
      .select('id, level, issued_at, revoked_at, plan:plan_id (title, slug), holder:profile_id (display_name, handle)')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    const r = data as {
      id: string
      level: CredentialLevel
      issued_at: string
      revoked_at: string | null
      plan: { title: string; slug: string } | null
      holder: { display_name: string | null; handle: string | null } | null
    }
    if (!r.plan) return null
    return {
      id: r.id,
      level: r.level,
      issuedAt: r.issued_at,
      revoked: Boolean(r.revoked_at),
      holder: { name: r.holder?.display_name || 'A Frequency member', handle: r.holder?.handle ?? null },
      course: { title: r.plan.title, slug: r.plan.slug },
    }
  } catch (err) {
    log.warn('credentials.read_failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** A person's live credentials, newest first (their profile and the course page's "you hold this"). */
export async function listCredentialsFor(profileId: string): Promise<{ id: string; level: CredentialLevel; planId: string; issuedAt: string }[]> {
  try {
    const { data } = await db()
      .from('course_credentials')
      .select('id, level, plan_id, issued_at')
      .eq('profile_id', profileId)
      .is('revoked_at', null)
      .order('issued_at', { ascending: false })
    return ((data ?? []) as { id: string; level: CredentialLevel; plan_id: string; issued_at: string }[]).map((r) => ({
      id: r.id,
      level: r.level,
      planId: r.plan_id,
      issuedAt: r.issued_at,
    }))
  } catch (err) {
    log.warn('credentials.list_failed', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}

/** Issue (idempotent on plan, person, level). Returns the credential id. */
async function issueCredential(args: {
  planId: string
  profileId: string
  level: CredentialLevel
  issuedBy?: string | null
  runKey?: string | null
}): Promise<string | null> {
  const { data, error } = await db()
    .from('course_credentials')
    .upsert(
      {
        plan_id: args.planId,
        profile_id: args.profileId,
        level: args.level,
        issued_by: args.issuedBy ?? null,
        run_key: args.runKey ?? null,
      },
      { onConflict: 'plan_id,profile_id,level', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return (data as { id: string }).id
  const { data: existing } = await db()
    .from('course_credentials')
    .select('id')
    .eq('plan_id', args.planId)
    .eq('profile_id', args.profileId)
    .eq('level', args.level)
    .maybeSingle()
  return (existing as { id: string } | null)?.id ?? null
}

/**
 * ATTENDED: everyone a host marked as having come to EVERY session of a Run (event_rsvps.attended_at,
 * set by door check-in, the host's attendance list, or the "Did you make it?" yes). Members only: a
 * credential belongs to a profile. Called once a Run's last session is behind it; idempotent.
 * Returns the newly relevant (profile, credential) pairs.
 */
export async function issueAttendedForRun(runKey: string): Promise<{ profileId: string; credentialId: string; planId: string }[]> {
  const admin = db()
  const { data: sessions } = await admin
    .from('events')
    .select('id, journey_id')
    .eq('details->>runKey', runKey)
    .eq('is_cancelled', false)
  const rows = ((sessions ?? []) as { id: string; journey_id: string | null }[]).filter((s) => s.journey_id)
  if (rows.length === 0) return []
  const planId = rows[0]!.journey_id!
  const ids = rows.map((r) => r.id)
  const { data: seats } = await admin
    .from('event_rsvps')
    .select('event_id, profile_id')
    .in('event_id', ids)
    .not('profile_id', 'is', null)
    .not('attended_at', 'is', null)
  const count = new Map<string, Set<string>>()
  for (const s of (seats ?? []) as { event_id: string; profile_id: string }[]) {
    const set = count.get(s.profile_id) ?? new Set<string>()
    set.add(s.event_id)
    count.set(s.profile_id, set)
  }
  const out: { profileId: string; credentialId: string; planId: string }[] = []
  for (const [profileId, set] of count) {
    if (set.size < ids.length) continue
    const credentialId = await issueCredential({ planId, profileId, level: 'attended', runKey })
    if (credentialId) out.push({ profileId, credentialId, planId })
  }
  return out
}

/** The holder's own submissions for a course, newest first. */
export async function mySubmissions(planId: string, profileId: string): Promise<{ id: string; status: string; reviewerNote: string | null; createdAt: string }[]> {
  const { data } = await db()
    .from('community_book_submissions')
    .select('id, status, reviewer_note, created_at')
    .eq('plan_id', planId)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(5)
  return ((data ?? []) as { id: string; status: string; reviewer_note: string | null; created_at: string }[]).map((r) => ({
    id: r.id,
    status: r.status,
    reviewerNote: r.reviewer_note,
    createdAt: r.created_at,
  }))
}

/** Write a submission for the holder. Fails when one is already waiting. */
export async function submitCommunityBook(planId: string, profileId: string, body: string): Promise<{ ok: true } | { ok: false; reason: 'open' | 'error' }> {
  const { error } = await db().from('community_book_submissions').insert({ plan_id: planId, profile_id: profileId, body })
  if (!error) return { ok: true }
  if (/duplicate|unique/i.test(error.message)) return { ok: false, reason: 'open' }
  log.error('credentials.submit_failed', { error: error.message })
  return { ok: false, reason: 'error' }
}

/** The review queue, oldest first. */
export async function reviewQueue(limit = 50): Promise<SubmissionRow[]> {
  try {
    const { data } = await db()
      .from('community_book_submissions')
      .select('id, plan_id, body, created_at, plan:plan_id (title, slug), holder:profile_id (display_name, handle)')
      .eq('status', 'submitted')
      .order('created_at', { ascending: true })
      .limit(limit)
    return ((data ?? []) as {
      id: string
      plan_id: string
      body: string
      created_at: string
      plan: { title: string; slug: string } | null
      holder: { display_name: string | null; handle: string | null } | null
    }[]).map((r) => ({
      id: r.id,
      planId: r.plan_id,
      courseTitle: r.plan?.title ?? 'A course',
      courseSlug: r.plan?.slug ?? '',
      holder: { name: r.holder?.display_name || 'A member', handle: r.holder?.handle ?? null },
      body: r.body,
      createdAt: r.created_at,
    }))
  } catch (err) {
    log.warn('credentials.queue_failed', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}

/** Decide one submission. Certifying issues the Certified credential. Returns the holder and credential. */
export async function decideSubmission(args: {
  id: string
  decision: 'certified' | 'returned'
  reviewerId: string
  note: string | null
}): Promise<{ profileId: string; planId: string; credentialId: string | null } | null> {
  const admin = db()
  const { data } = await admin
    .from('community_book_submissions')
    .update({
      status: args.decision,
      reviewer_note: args.note,
      reviewed_by: args.reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.id)
    .eq('status', 'submitted')
    .select('profile_id, plan_id')
    .maybeSingle()
  const row = data as { profile_id: string; plan_id: string } | null
  if (!row) return null
  const credentialId =
    args.decision === 'certified'
      ? await issueCredential({ planId: row.plan_id, profileId: row.profile_id, level: 'certified', issuedBy: args.reviewerId })
      : null
  return { profileId: row.profile_id, planId: row.plan_id, credentialId }
}
