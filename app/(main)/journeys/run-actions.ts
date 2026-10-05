'use server'

// Journeys v2 — start a Run (ADR-252, J2). A Run is one Circle going through one Journey
// together; the Circle's active members are enrolled. Gated through lib/journeys/run-gate
// (ADR-842): whoever manages the Circle (`circle.editSettings`), a steward of the Space that owns
// the Circle, or platform staff.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import {
  startRun,
  scheduleKickoff,
  getRun,
  setPhaseEvent,
  setRunEndState,
  type PhaseEventKind,
  type RunEndState,
} from '@/lib/journeys/runs'
import { resolveRunGate, journeysOfferedBySpace } from '@/lib/journeys/run-gate'
import { checkFreeEnrol } from '@/lib/journeys/free-enrol-gate'
import { JOURNEY_FULL_MESSAGE } from '@/lib/journeys/journey-access'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import { planMeta } from '@/lib/journey-plans'
import { buildJourneyTree, type BlockRow } from '@/lib/journeys/tree'
import { phaseUnlockAt } from '@/lib/journeys/schedule'

const DAY_MS = 86_400_000

export async function startJourneyRunAction(input: {
  planId: string
  circleId: string
  dripIntervalDays?: number
  /** Optional kickoff meetup date (ISO/local datetime) — schedules a Circle Event (§11.1 #5). */
  kickoffAt?: string | null
  journeyTitle?: string
}): Promise<ActionResult<{ runId: string }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  // WHO may start it (ADR-842): whoever manages the Circle (its host, its admins, the guide or
  // mentor who leads the parent area), a steward of the Space that owns the Circle, or platform
  // staff. One shared seam so the Space Circles surface and the Circle page agree.
  const gate = await resolveRunGate(input.circleId, caller.id)
  if (!gate.circleSlug) return fail('Circle not found.')
  if (!gate.allowed) return fail('Only the circle team or the space team can start a run.')

  // WHAT they may pick, for a SPACE Circle: only a Journey that Space offers. Checked here and
  // not just in the picker, so a smuggled plan id is refused rather than quietly run.
  if (gate.spaceId) {
    const offered = await journeysOfferedBySpace(gate.spaceId)
    if (!offered.some((p) => p.id === input.planId)) {
      return fail('Pick a Journey this space offers.')
    }
  }

  // WHAT they may pick, for ANY Circle (SCAN-724): a Run enrols the whole roster and the learn page
  // reads that enrolment as full access, so this door meets the same price, tier and seat gate as
  // the solo free door (ADR-1397). Without it a member could start a Run of a priced public Journey
  // for their own circle and unlock it for everyone free, or run a private draft that is not theirs.
  // The author-or-manager escape mirrors adoptJourney: they are not buying their own program.
  const meta = await planMeta(input.planId)
  if (!meta) return fail('Journey not found.')
  const isOwner =
    (!!meta.author_id && meta.author_id === caller.id) ||
    (await getJourneyCapabilities(input.planId)).has('journey.editSettings')
  if (meta.visibility === 'private' && !isOwner) return fail('Journey not found.')
  const free = await checkFreeEnrol(input.planId, caller.id, { isOwner })
  if (!free.ok) return fail(free.error)
  const seats = await rosterSeatCheck(input.planId, input.circleId)
  if (!seats.ok) return fail(seats.error)

  const runId = await startRun({
    planId: input.planId,
    circleId: input.circleId,
    hostId: caller.id,
    dripIntervalDays: input.dripIntervalDays,
  })
  if (!runId) return fail('Could not start the run.')

  // Schedule the kickoff meetup if the host picked a date (build item §11.1 #5). Best-effort:
  // a failed kickoff event doesn't fail the run itself.
  if (input.kickoffAt) {
    await scheduleKickoff({
      runId,
      circleId: input.circleId,
      hostId: caller.id,
      startsAt: input.kickoffAt,
      journeyTitle: input.journeyTitle?.trim() || 'Your journey',
    })
  }

  revalidatePath(`/circles/${gate.circleSlug}`)
  return ok({ runId })
}

/** Does the Journey's enroll_cap hold the WHOLE roster a Run would enrol? checkFreeEnrol only reserves
 *  the caller's own seat; startRun enrols every active member of the Circle at once. Members already
 *  enrolled in the plan keep their seat and are not counted twice. FAIL-SAFE like the free door: a
 *  broken count admits (worst case a few seats over), never locks a Journey. */
async function rosterSeatCheck(planId: string, circleId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient()
    const [{ data: plan }, { data: members }, { count: taken }] = await Promise.all([
      admin.from('journey_plans').select('enroll_cap').eq('id', planId).maybeSingle(),
      admin.from('memberships').select('profile_id').eq('circle_id', circleId).eq('status', 'active'),
      admin.from('journey_enrollments').select('id', { count: 'exact', head: true }).eq('plan_id', planId).is('completed_at', null),
    ])
    const enrollCap = (plan as { enroll_cap: number | null } | null)?.enroll_cap ?? null
    if (enrollCap == null || enrollCap <= 0) return { ok: true }
    const roster = (members ?? []).map((m) => String((m as { profile_id: string }).profile_id))
    let alreadyIn = 0
    if (roster.length) {
      const { count } = await admin
        .from('journey_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', planId)
        .in('profile_id', roster)
      alreadyIn = count ?? 0
    }
    const needed = Math.max(0, roster.length - alreadyIn)
    if ((taken ?? 0) + needed > enrollCap) return { ok: false, error: JOURNEY_FULL_MESSAGE }
    return { ok: true }
  } catch (error) {
    console.error('[journeys] run seat check failed, admitting', { planId, circleId, error })
    return { ok: true }
  }
}

/**
 * End a Run: 'completed' when the Circle finished it, 'cancelled' when it is being called off
 * (ADR-842). Same gate as starting one, resolved from the Run's own Circle, so whoever could
 * start it can end it. Enrollments stay: members keep the progress they earned.
 */
export async function endJourneyRunAction(input: {
  runId: string
  state: RunEndState
}): Promise<ActionResult<void>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  const run = await getRun(input.runId)
  if (!run) return fail('Run not found.')

  const gate = await resolveRunGate(run.circleId, caller.id)
  if (!gate.allowed) return fail('Only the circle team or the space team can end a run.')

  if (!(await setRunEndState(input.runId, input.state))) {
    return fail('That run has already ended.')
  }
  if (gate.circleSlug) revalidatePath(`/circles/${gate.circleSlug}`)
  return ok()
}

/** A Run Host schedules a dated touchpoint Event for a week (phase): the mid-week Circle Meetup or
 *  the weekend Gathering (ADR-307 follow-up). The date is derived from the phase's drip window; the
 *  Host refines the specifics on the Event's own page after. Host-gated to the Run's host. Returns
 *  the new Event's slug so the client can offer to open it. */
export async function schedulePhaseEventAction(input: {
  slug: string
  runId: string
  phaseId: string
  kind: PhaseEventKind
}): Promise<ActionResult<{ eventSlug: string | null }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')
  const run = await getRun(input.runId)
  if (!run) return fail('Run not found.')
  if (run.hostId !== caller.id) return fail('Only the Run host can schedule meetups.')

  // Locate the phase + its index in the Run's plan, to date the event from the drip window.
  const admin = createAdminClient()
  const { data: items } = await admin
    .from('journey_plan_items')
    .select('id, parent_id, block_type, sort_order, title, required, est_minutes, practice_id')
    .eq('plan_id', run.planId)
  const blocks = ((items ?? []) as Record<string, unknown>[]).map(
    (r): BlockRow => ({
      id: String(r.id),
      parent_id: (r.parent_id as string) ?? null,
      block_type: (r.block_type as string) ?? 'practice',
      sort_order: Number(r.sort_order ?? 0),
      title: (r.title as string) ?? null,
      required: (r.required as boolean) ?? true,
      est_minutes: (r.est_minutes as number) ?? null,
      practice_id: (r.practice_id as string) || null,
    }),
  )
  const phases = buildJourneyTree(blocks, []).phases
  const idx = phases.findIndex((p) => p.id === input.phaseId)
  if (idx < 0) return fail('That week is not part of this Run.')

  // Date it from the phase's unlock (the start of that week): Circle Meetup mid-week (+3 days, 6pm),
  // Weekend Gathering on the weekend (+5 days, 11am). The Host refines it on the Event page.
  const unlock = phaseUnlockAt(new Date(run.startedAt), idx, run.dripIntervalDays)
  const when = new Date(unlock.getTime() + (input.kind === 'meetup' ? 3 : 5) * DAY_MS)
  when.setHours(input.kind === 'meetup' ? 18 : 11, 0, 0, 0)
  const weekLabel = phases[idx].title?.trim() || `Week ${idx + 1}`
  const title = input.kind === 'meetup' ? `${weekLabel}: Circle Meetup` : `${weekLabel}: Weekend Gathering`

  const eventId = await setPhaseEvent({
    runId: input.runId,
    phaseId: input.phaseId,
    kind: input.kind,
    circleId: run.circleId,
    hostId: caller.id,
    title,
    startsAt: when.toISOString(),
  })
  if (!eventId) return fail('Could not schedule the event.')

  revalidatePath(`/journeys/${input.slug}/learn`)
  const { data: ev } = await admin.from('events').select('slug').eq('id', eventId).maybeSingle()
  return ok({ eventSlug: (ev as { slug: string } | null)?.slug ?? null })
}
