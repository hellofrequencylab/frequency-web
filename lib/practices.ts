// Practices backbone: the North-Star feature (DEVELOPMENT-MAP Stage A). A practice
// is the thing a member actually does. Logging one emits `practice.verified` (the
// WAM North-Star event) + zaps + an attendance streak tick. Two paths to a practice:
// a host assigns one to a circle, or a member adopts one for themselves; both log
// against the same practice. Server-only (admin client + app-code authz in callers).
//
// The practices/* tables are new; until `supabase gen types` is re-run they are not
// in the generated Database types, so this module reads/writes through an untyped
// admin handle. Drop the cast after regen (see docs/START-HERE.md).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { track } from '@/lib/analytics/track'
import { awardZapsForAction } from '@/lib/zaps'
import { recordStreakActivity } from '@/lib/achievements'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export interface Practice {
  id: string
  title: string
  description: string | null
  created_by: string | null
  is_public: boolean
  created_at: string
}

const PRACTICE_COLS = 'id, title, description, created_by, is_public, created_at'

// --- Library + reads ------------------------------------------------------

export async function listPublicPractices(): Promise<Practice[]> {
  const { data } = await db()
    .from('practices')
    .select(PRACTICE_COLS)
    .eq('is_public', true)
    .order('created_at', { ascending: true })
  return (data as Practice[] | null) ?? []
}

export async function getCircleActivePractice(circleId: string): Promise<Practice | null> {
  const { data } = await db()
    .from('circle_practices')
    .select(`practice:practices(${PRACTICE_COLS})`)
    .eq('circle_id', circleId)
    .eq('active', true)
    .maybeSingle()
  const row = data as { practice: Practice | null } | null
  return row?.practice ?? null
}

export async function getMemberPractices(profileId: string): Promise<Practice[]> {
  const { data } = await db()
    .from('member_practices')
    .select(`practice:practices(${PRACTICE_COLS})`)
    .eq('profile_id', profileId)
    .eq('active', true)
    .order('created_at', { ascending: false })
  const rows = (data as { practice: Practice | null }[] | null) ?? []
  return rows.map((r) => r.practice).filter((p): p is Practice => !!p)
}

// --- Mutations (callers enforce authz: host for circle, self for personal) -

export async function createPractice(input: {
  title: string
  description?: string | null
  createdBy: string
  isPublic?: boolean
}): Promise<Practice | null> {
  const { data } = await db()
    .from('practices')
    .insert({
      title: input.title,
      description: input.description ?? null,
      created_by: input.createdBy,
      is_public: input.isPublic ?? true,
    })
    .select(PRACTICE_COLS)
    .maybeSingle()
  return (data as Practice | null) ?? null
}

/** Set the circle's current practice (one active per circle). Caller must be host+. */
export async function setCirclePractice(
  circleId: string,
  practiceId: string,
  setBy: string,
): Promise<void> {
  const client = db()
  await client
    .from('circle_practices')
    .update({ active: false })
    .eq('circle_id', circleId)
    .eq('active', true)
  await client
    .from('circle_practices')
    .insert({ circle_id: circleId, practice_id: practiceId, set_by: setBy, active: true })

  // Lifecycle reward: activating a circle (its first practice). Idempotency keyed
  // per circle, so it fires once even if the practice changes later. Routes
  // through the ledger; will land in the Vault for free hosts once ADR-037 ships.
  try {
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `circle_activated:${circleId}`,
      source: 'web',
      eventType: 'circle.activated',
      actorProfileId: setBy,
      context: { circleId },
    })
    if (recorded) await awardZapsForAction(setBy, 'circle_activate')
  } catch {
    // a reward failure must never block setting the practice
  }
}

/** A member adopts a practice for themselves (re-activates if previously dropped). */
export async function adoptPractice(profileId: string, practiceId: string): Promise<void> {
  await db()
    .from('member_practices')
    .upsert(
      { profile_id: profileId, practice_id: practiceId, active: true },
      { onConflict: 'profile_id,practice_id' },
    )
  // Activation-funnel step 4 (ADR-075). Best-effort; never blocks the adopt.
  await track('practice.adopted', { practiceId }, profileId)
}

export async function dropMemberPractice(profileId: string, practiceId: string): Promise<void> {
  await db()
    .from('member_practices')
    .update({ active: false })
    .eq('profile_id', profileId)
    .eq('practice_id', practiceId)
}

// --- Activity history -----------------------------------------------------

export interface PracticeLogEntry {
  logged_for: string
  title: string | null
}

/** A member's recent practice logs (newest first), with the practice title. */
export async function getRecentPracticeLogs(
  profileId: string,
  limit = 60,
): Promise<PracticeLogEntry[]> {
  const { data } = await db()
    .from('practice_logs')
    .select('logged_for, practice:practices(title)')
    .eq('profile_id', profileId)
    .order('logged_for', { ascending: false })
    .limit(limit)
  const rows = (data as { logged_for: string; practice: { title: string } | null }[] | null) ?? []
  return rows.map((r) => ({ logged_for: r.logged_for, title: r.practice?.title ?? null }))
}

/** A member's adopted practices that they have NOT yet logged today. Powers the
 *  "log today's practice" prompt on the feed. Empty if none adopted or all logged. */
export async function getPracticesToLogToday(profileId: string): Promise<Practice[]> {
  const mine = await getMemberPractices(profileId)
  if (mine.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await db()
    .from('practice_logs')
    .select('practice_id')
    .eq('profile_id', profileId)
    .eq('logged_for', today)
  const logged = new Set(((data as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id))
  return mine.filter((p) => !logged.has(p.id))
}

// --- The North-Star emitter ----------------------------------------------

export interface LogPracticeResult {
  /** false = already logged this practice today (idempotent). */
  logged: boolean
  zapsAwarded: number
}

/**
 * Log that a member did a practice. Exactly-once per (member, practice, day):
 * emits `practice.verified` (WAM), writes a durable log row, and awards zaps +
 * an attendance streak tick. `circleId` records the circle context when the
 * practice came from a circle assignment.
 */
export async function logPractice(input: {
  profileId: string
  practiceId: string
  circleId?: string | null
}): Promise<LogPracticeResult> {
  const { profileId, practiceId, circleId = null } = input
  const day = new Date().toISOString().slice(0, 10) // yyyy-mm-dd

  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `practice_log:${profileId}:${practiceId}:${day}`,
    source: 'web',
    eventType: 'practice.verified',
    actorProfileId: profileId,
    context: { practiceId, circleId, kind: 'practice_log' },
    verifiedAt: new Date(),
  })
  if (!recorded) return { logged: false, zapsAwarded: 0 }

  // Durable log row (unique on profile+practice+day mirrors the idempotency key).
  await db()
    .from('practice_logs')
    .upsert(
      { profile_id: profileId, practice_id: practiceId, circle_id: circleId, logged_for: day },
      { onConflict: 'profile_id,practice_id,logged_for', ignoreDuplicates: true },
    )

  // Verified practice earns zaps + an attendance streak tick (same as a check-in).
  let zapsAwarded = 0
  try {
    zapsAwarded = (await awardZapsForAction(profileId, 'practice_logged')).amount
  } catch {
    // never let a reward read break the log
  }
  await recordStreakActivity(profileId, 'attendance').catch(() => {})

  return { logged: true, zapsAwarded }
}
