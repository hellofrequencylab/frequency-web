// Journeys v2 — the Run data layer (ADR-252, docs/JOURNEYS.md §3). A Run is one Circle going
// through one Journey together: create it, enroll the Circle, and read the shared cohort
// progress (aggregateCohort). Server-only — typed admin handle (journey_runs / journey_enrollments
// are in the generated types as of ADR-253 step 5).

import { createAdminClient } from '@/lib/supabase/admin'
import { buildJourneyTree, type BlockRow } from './tree'
import { aggregateCohort, type MemberCompletion, type CohortProgress } from './cohort'

function db() {
  return createAdminClient()
}

export interface JourneyRun {
  id: string
  planId: string
  circleId: string
  hostId: string | null
  startedAt: string
  dripIntervalDays: number
  kickoffEventId: string | null
  status: 'active' | 'completed' | 'cancelled'
}

function mapRun(r: Record<string, unknown>): JourneyRun {
  return {
    id: String(r.id),
    planId: String(r.plan_id),
    circleId: String(r.circle_id),
    hostId: (r.host_id as string) ?? null,
    startedAt: String(r.started_at),
    dripIntervalDays: Number(r.drip_interval_days ?? 7),
    kickoffEventId: (r.kickoff_event_id as string) ?? null,
    status: (r.status as JourneyRun['status']) ?? 'active',
  }
}

/** Start a Run for a Circle and enroll its active members. Returns the run id (or null). */
export async function startRun(input: {
  planId: string
  circleId: string
  hostId: string
  startedAt?: Date
  dripIntervalDays?: number
}): Promise<string | null> {
  const { data, error } = await db()
    .from('journey_runs')
    .insert({
      plan_id: input.planId,
      circle_id: input.circleId,
      host_id: input.hostId,
      started_at: (input.startedAt ?? new Date()).toISOString(),
      ...(input.dripIntervalDays ? { drip_interval_days: input.dripIntervalDays } : {}),
    })
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  const runId = String((data as { id: string }).id)

  // Enroll the circle's active members.
  const { data: members } = await db()
    .from('memberships')
    .select('profile_id')
    .eq('circle_id', input.circleId)
    .eq('status', 'active')
  const rows = (members ?? []).map((m) => ({
    profile_id: (m as { profile_id: string }).profile_id,
    plan_id: input.planId,
    run_id: runId,
  }))
  if (rows.length) await db().from('journey_enrollments').insert(rows)
  return runId
}

/** Enroll one member into a Run (idempotent on the unique index). */
export async function enrollInRun(profileId: string, runId: string, planId: string): Promise<void> {
  await db()
    .from('journey_enrollments')
    .upsert({ profile_id: profileId, plan_id: planId, run_id: runId }, { onConflict: 'profile_id,run_id', ignoreDuplicates: true })
}

export async function getRun(runId: string): Promise<JourneyRun | null> {
  const { data } = await db().from('journey_runs').select('*').eq('id', runId).maybeSingle()
  return data ? mapRun(data as Record<string, unknown>) : null
}

export interface KickoffEvent {
  id: string
  slug: string
  title: string
  startsAt: string
}

/** Schedule the kickoff meetup for a Run (build item §11.1 #5): create a Circle Event and link
 *  it on the run (journey_runs.kickoff_event_id). Weekly live touchpoints are a large completion
 *  lift (JOURNEYS.md §3/§10). Returns the event id, or null on failure. */
export async function scheduleKickoff(input: {
  runId: string
  circleId: string
  hostId: string
  startsAt: string
  journeyTitle: string
}): Promise<string | null> {
  const admin = db()
  const slug = `kickoff-${input.runId.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`
  const { data, error } = await admin
    .from('events')
    .insert({
      title: `${input.journeyTitle}: kickoff meetup`,
      description: 'The opening meetup for this Journey. Meet your Circle, set the pace, and start together.',
      scope_id: input.circleId,
      scope_type: 'circle',
      starts_at: new Date(input.startsAt).toISOString(),
      host_id: input.hostId,
      slug,
    })
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  const eventId = String((data as { id: string }).id)
  await admin.from('journey_runs').update({ kickoff_event_id: eventId }).eq('id', input.runId)
  return eventId
}

/** The kickoff Event linked to a Run (for the player banner), or null. */
export async function getKickoffEvent(runId: string): Promise<KickoffEvent | null> {
  const { data: run } = await db().from('journey_runs').select('kickoff_event_id').eq('id', runId).maybeSingle()
  const eventId = (run as { kickoff_event_id: string | null } | null)?.kickoff_event_id
  if (!eventId) return null
  const { data: ev } = await db().from('events').select('id, slug, title, starts_at').eq('id', eventId).maybeSingle()
  if (!ev) return null
  const e = ev as { id: string; slug: string; title: string; starts_at: string }
  return { id: e.id, slug: e.slug, title: e.title, startsAt: e.starts_at }
}

/** The Run a member is enrolled in for a plan (their cohort), or null (solo / no run). */
export async function getMemberRunForPlan(profileId: string, planId: string): Promise<JourneyRun | null> {
  const { data } = await db()
    .from('journey_enrollments')
    .select('run_id')
    .eq('profile_id', profileId)
    .eq('plan_id', planId)
    .not('run_id', 'is', null)
    .limit(1)
  const runId = (data?.[0] as { run_id: string | null } | undefined)?.run_id
  return runId ? getRun(runId) : null
}

/** A member's SOLO enrollment start for a plan (run_id null), or null — the drip anchor
 *  for someone taking a Journey on their own (the cohort path uses run.startedAt instead). */
export async function getSoloEnrollmentStart(profileId: string, planId: string): Promise<string | null> {
  const { data } = await db()
    .from('journey_enrollments')
    .select('started_at')
    .eq('profile_id', profileId)
    .eq('plan_id', planId)
    .is('run_id', null)
    .order('started_at', { ascending: true })
    .limit(1)
  return (data?.[0] as { started_at: string | null } | undefined)?.started_at ?? null
}

/** Active Runs for a Circle (most recent first). */
export async function listRunsForCircle(circleId: string): Promise<JourneyRun[]> {
  const { data } = await db()
    .from('journey_runs')
    .select('*')
    .eq('circle_id', circleId)
    .order('started_at', { ascending: false })
  return (data ?? []).map((r) => mapRun(r as Record<string, unknown>))
}

const BLOCK_COLS = 'id, parent_id, block_type, sort_order, title, required, est_minutes, practice_id'

function toBlock(r: Record<string, unknown>): BlockRow {
  return {
    id: String(r.id),
    parent_id: (r.parent_id as string) ?? null,
    block_type: (r.block_type as string) ?? 'practice',
    sort_order: Number(r.sort_order ?? 0),
    title: (r.title as string) ?? null,
    required: (r.required as boolean) ?? true,
    est_minutes: (r.est_minutes as number) ?? null,
    practice_id: (r.practice_id as string) || null,
  }
}

/** The shared cohort progress for a Run — each member's tree rolled into one meter. */
export async function getCohortProgress(runId: string, planId: string): Promise<CohortProgress> {
  const [{ data: enr }, { data: items }] = await Promise.all([
    db().from('journey_enrollments').select('profile_id').eq('run_id', runId),
    db().from('journey_plan_items').select(BLOCK_COLS).eq('plan_id', planId),
  ])
  const memberIds = (enr ?? []).map((e) => (e as { profile_id: string }).profile_id)
  const blocks = (items ?? []).map((i) => toBlock(i as Record<string, unknown>))
  const phaseIds = buildJourneyTree(blocks, []).phases.map((p) => p.id)

  if (!memberIds.length) return aggregateCohort([], phaseIds)

  const { data: prog } = await db()
    .from('journey_lesson_progress')
    .select('profile_id, item_id')
    .eq('plan_id', planId)
    .in('profile_id', memberIds)
  const doneByMember = new Map<string, string[]>()
  for (const row of prog ?? []) {
    const r = row as { profile_id: string; item_id: string }
    const list = doneByMember.get(r.profile_id) ?? []
    list.push(r.item_id)
    doneByMember.set(r.profile_id, list)
  }

  const members: MemberCompletion[] = memberIds.map((pid) => {
    const tree = buildJourneyTree(blocks, doneByMember.get(pid) ?? [])
    return {
      profileId: pid,
      percent: tree.percent,
      completedPhaseIds: tree.phases.filter((p) => p.complete).map((p) => p.id),
      journeyComplete: tree.complete,
    }
  })
  return aggregateCohort(members, phaseIds)
}
