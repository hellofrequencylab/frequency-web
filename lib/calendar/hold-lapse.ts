import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/queue/outbox'
import { routeNotification } from '@/lib/notifications/router'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { dayInZone, hourInZone } from '@/lib/time/zone'
import { calendarSettingsPath } from './plan-notify-core'
import {
  holdKey,
  holdMove,
  holdRecipient,
  holdReleasedCopy,
  holdWarningCopy,
  isNotifyHour,
  overdueCopy,
  overdueKey,
  overdueNudges,
  type OverdueTask,
} from './hold-lapse-core'

// THE HOLD SWEEP (calendar suite pass 8 · LIVE-1709), the IO half. Run hourly by
// /api/cron/calendar-holds. Three jobs, one pass, every one idempotent:
//
//   1. RELEASE a lapsed hold: the Plan's `hold_until` is before the Space's local today. If the Plan
//      is still a Pencil, its unpublished Pencil dates are TOMBSTONED (removed_at, the same soft delete the Delete button
//      uses, so a date can be brought back with `removed_at = null`), the Plan drops to `plan`
//      (a someday Plan) and `hold_until` clears. Dates already published as events are never touched.
//   2. WARN with one day left, once per hold.
//   3. NUDGE the assignee of a to-do that was due yesterday, once per person per Space per day.
//
// Everything for a Space happens in ONE local hour (hold-lapse-core NOTIFY_HOUR), so the hour is
// the Space's own morning, not a UTC instant. A Space with no stored zone is read in the platform
// home zone (lib/time/zone.ts), the same fallback every other reader of a Space day uses.
//
// IDEMPOTENT BY CONSTRUCTION, NOT BY A STAMP (no migration): the release order is entries first,
// then the Plan row, so a failure half-way leaves the hold still lapsed and the next hour retries
// it; the Plan update is conditional on the exact `hold_until` it read, so two overlapping runs
// release once and only the winner tells the owner. A send carries an outbox dedupeKey naming the
// hold or the day, so a re-fired run cannot tell anyone twice.
//
// NOT RECORDED IN THE PLAN'S EDIT HISTORY: space_plan_activity rows are signed by a signed-in
// actor under RLS and a cron has none. The release is logged here instead (one structured line per
// release), and the owner is told. NOT SENT: persona, Journey, Circle topic or wellness data. The
// only things in a message are a Plan or to-do title the team wrote and the Space's calendar link.
//
// authz-delegated: system sweep. It acts on no caller's input; every write is bound to the Plan id
// and Space id it just read, and every recipient is resolved from the rows, never from a request.

const PLAN_BATCH_DEFAULT = 2000

interface SweepOptions {
  limit?: number
  exhausted?: () => boolean
}

interface SweepResult {
  released: number
  warned: number
  nudged: number
  /** Notices the gate or the outbox did not take (muted, suppressed, already sent). */
  quiet: number
  failed: number
  remaining: number
}

interface SpaceFacts {
  id: string
  slug: string
  ownerProfileId: string | null
  today: string
  notifyNow: boolean
}

type Admin = ReturnType<typeof createAdminClient>

/** The whole sweep. Never throws: a row that cannot be read or written logs one line and the rest go on. */
export async function runCalendarHoldSweep(now: Date, opts: SweepOptions = {}): Promise<SweepResult> {
  const out: SweepResult = { released: 0, warned: 0, nudged: 0, quiet: 0, failed: 0, remaining: 0 }
  const exhausted = opts.exhausted ?? (() => false)
  const limit = opts.limit ?? PLAN_BATCH_DEFAULT
  try {
    const admin = createAdminClient()
    const spaces = new Map<string, SpaceFacts>()
    await releaseAndWarn(admin, now, limit, exhausted, spaces, out)
    if (!exhausted()) await nudgeOverdue(admin, now, limit, exhausted, spaces, out)
  } catch (err) {
    out.failed += 1
    log.error('calendar.holds.sweep_failed', { error: err instanceof Error ? err.message : String(err) })
  }
  return out
}

async function spaceFacts(admin: Admin, ids: readonly string[], now: Date, into: Map<string, SpaceFacts>): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !into.has(id))
  if (missing.length === 0) return
  const { data, error } = await admin.from('spaces').select('id, slug, owner_profile_id, time_zone').in('id', missing)
  if (error || !data) {
    log.error('calendar.holds.spaces_unreadable', { db_error: error?.message ?? null })
    return
  }
  for (const row of data as unknown as { id: string; slug: string; owner_profile_id: string | null; time_zone: string | null }[]) {
    into.set(row.id, {
      id: row.id,
      slug: row.slug,
      ownerProfileId: row.owner_profile_id,
      today: dayInZone(now, row.time_zone),
      notifyNow: isNotifyHour(hourInZone(now, row.time_zone)),
    })
  }
}

/** One push, through the notification registry, with an outbox key so a repeat is a no-op. */
async function tell(
  event: 'plan.hold_warning' | 'plan.hold_released' | 'plan.todo_overdue',
  profileId: string,
  spaceId: string,
  ctx: { title: string; body: string; url: string; tag: string },
  dedupe: string,
  out: SweepResult,
): Promise<boolean> {
  try {
    const routed = await routeNotification(
      event,
      { profileId, subject: { subjectType: 'space', subjectId: spaceId } },
      ctx,
      {},
      { enqueueJob: async (kind, payload) => void (await enqueue(kind, payload, { dedupeKey: `${dedupe}:${kind}` })) },
    )
    if (routed.enqueuedCount === 0) out.quiet += 1
    return routed.enqueuedCount > 0
  } catch (err) {
    out.failed += 1
    log.warn('calendar.holds.notify_failed', { event, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

async function releaseAndWarn(
  admin: Admin,
  now: Date,
  limit: number,
  exhausted: () => boolean,
  spaces: Map<string, SpaceFacts>,
  out: SweepResult,
): Promise<void> {
  // Two days past UTC today reaches every zone's "tomorrow"; everything older is already lapsed or about to be.
  const horizon = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10)
  const { data: plans, error } = await admin
    .from('space_plans')
    .select('id, space_id, title, stage, owner_profile_id, created_by, hold_until')
    .not('hold_until', 'is', null)
    .is('archived_at', null)
    .lte('hold_until', horizon)
    .order('hold_until', { ascending: true })
    .limit(limit)
  if (error || !plans) {
    out.failed += 1
    log.error('calendar.holds.plans_unreadable', { db_error: error?.message ?? null })
    return
  }
  out.remaining += plans.length >= limit ? 1 : 0
  await spaceFacts(admin, plans.map((p) => p.space_id), now, spaces)

  for (const plan of plans) {
    if (exhausted()) {
      out.remaining += 1
      continue
    }
    const space = spaces.get(plan.space_id)
    if (!space || !space.notifyNow || !plan.hold_until) continue
    const move = holdMove(plan.hold_until, space.today)
    if (move === 'hold') continue
    const to = holdRecipient({ ownerProfileId: plan.owner_profile_id, createdBy: plan.created_by }, space.ownerProfileId)
    const url = calendarSettingsPath(space.slug)

    if (move === 'warn') {
      if (!to) continue
      const copy = holdWarningCopy(plan.title)
      if (await tell('plan.hold_warning', to, space.id, { ...copy, url, tag: `plan-hold:${plan.id}` }, holdKey('warn', plan.id, plan.hold_until), out)) out.warned += 1
      continue
    }

    // RELEASE. A Plan that is no longer a Pencil (it moved on while it held) keeps its dates: they are
    // the team's call now, so only the stale hold day clears.
    if (plan.stage !== 'pencil') {
      const cleared = await admin.from('space_plans').update({ hold_until: null }).eq('space_id', plan.space_id).eq('id', plan.id).eq('hold_until', plan.hold_until)
      if (cleared.error) {
        out.failed += 1
        log.error('calendar.holds.release_failed', { plan_id: plan.id, step: 'clear', db_error: cleared.error.message })
      }
      continue
    }
    // A Pencil: entries first (a failure leaves the hold lapsed, so the next hour retries), then the
    // Plan, conditional on the exact day it read so a second run releases nothing and tells no one.
    const dropped = await admin
      .from('space_calendar_entries')
      .update({ removed_at: now.toISOString(), removed_by: null })
      .eq('space_id', plan.space_id)
      .eq('plan_id', plan.id)
      .eq('kind', 'pencil')
      .is('published_event_id', null)
      .is('removed_at', null)
      .select('id')
    if (dropped.error) {
      out.failed += 1
      log.error('calendar.holds.release_failed', { plan_id: plan.id, step: 'entries', db_error: dropped.error.message })
      continue
    }
    const claimed = await admin
      .from('space_plans')
      .update({ hold_until: null, stage: 'plan', updated_at: now.toISOString() })
      .eq('space_id', plan.space_id)
      .eq('id', plan.id)
      .eq('hold_until', plan.hold_until)
      .eq('stage', 'pencil')
      .select('id')
    if (claimed.error) {
      out.failed += 1
      log.error('calendar.holds.release_failed', { plan_id: plan.id, step: 'plan', db_error: claimed.error.message })
      continue
    }
    if (!claimed.data?.length) continue // another run won; it tells the owner
    out.released += 1
    log.info('calendar.holds.released', { plan_id: plan.id, space_id: plan.space_id, hold_until: plan.hold_until, dates_released: dropped.data?.length ?? 0 })
    if (to) {
      const copy = holdReleasedCopy(plan.title)
      await tell('plan.hold_released', to, space.id, { ...copy, url, tag: `plan-hold:${plan.id}` }, holdKey('released', plan.id, plan.hold_until), out)
    }
  }
}

async function nudgeOverdue(
  admin: Admin,
  now: Date,
  limit: number,
  exhausted: () => boolean,
  spaces: Map<string, SpaceFacts>,
  out: SweepResult,
): Promise<void> {
  const from = new Date(now.getTime() - 3 * 86_400_000).toISOString()
  const to = new Date(now.getTime() + 86_400_000).toISOString()
  const { data: tasks, error } = await admin
    .from('crm_tasks')
    .select('id, title, status, due_at, space_id, plan_id, assignee_profile_id')
    .eq('status', 'open')
    .not('plan_id', 'is', null)
    .not('space_id', 'is', null)
    .not('assignee_profile_id', 'is', null)
    .gte('due_at', from)
    .lte('due_at', to)
    .limit(limit)
  if (error || !tasks) {
    out.failed += 1
    log.error('calendar.holds.tasks_unreadable', { db_error: error?.message ?? null })
    return
  }
  if (tasks.length === 0) return
  out.remaining += tasks.length >= limit ? 1 : 0
  await spaceFacts(admin, tasks.map((t) => t.space_id as string), now, spaces)
  const planIds = [...new Set(tasks.map((t) => t.plan_id as string))]
  const { data: plans } = await admin.from('space_plans').select('id, title, archived_at').in('id', planIds)
  const planTitle = new Map((plans ?? []).filter((p) => !p.archived_at).map((p) => [p.id, p.title]))

  const bySpace = new Map<string, OverdueTask[]>()
  for (const t of tasks) {
    const title = planTitle.get(t.plan_id as string)
    const space = spaces.get(t.space_id as string)
    if (title === undefined || !space?.notifyNow) continue
    const list = bySpace.get(space.id) ?? []
    list.push({ id: t.id, title: t.title, planTitle: title, assigneeProfileId: t.assignee_profile_id, dueDay: t.due_at ? t.due_at.slice(0, 10) : null, status: t.status })
    bySpace.set(space.id, list)
  }

  for (const [spaceId, list] of bySpace) {
    if (exhausted()) {
      out.remaining += 1
      break
    }
    const space = spaces.get(spaceId)
    if (!space) continue
    // Who works this Space: its owner and its active editors, moderators and admins. A viewer or a
    // guest-side assignee has no calendar settings to land on.
    const workers = new Set<string>()
    if (space.ownerProfileId) workers.add(space.ownerProfileId)
    for (const m of await listSpaceMembers(spaceId)) if (m.status === 'active' && m.role !== 'viewer') workers.add(m.profileId)
    for (const nudge of overdueNudges(list, space.today, (id) => workers.has(id))) {
      const copy = overdueCopy(nudge)
      if (await tell('plan.todo_overdue', nudge.profileId, spaceId, { ...copy, url: calendarSettingsPath(space.slug), tag: `plan-overdue:${spaceId}` }, overdueKey(nudge.profileId, spaceId, space.today), out)) out.nudged += 1
    }
  }
}
