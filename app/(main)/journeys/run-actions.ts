'use server'

// Journeys v2 — start a Run (ADR-252, J2). A Run is one Circle going through one Journey
// together; the Circle's active members are enrolled. Gated through lib/journeys/run-gate
// (ADR-842): the Circle's host, a steward of the Space that owns the Circle, or platform staff.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { startRun, scheduleKickoff, getRun, setPhaseEvent, type PhaseEventKind } from '@/lib/journeys/runs'
import { resolveRunGate, journeysOfferedBySpace } from '@/lib/journeys/run-gate'
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

  // WHO may start it (ADR-842): the Circle's host, a steward of the Space that owns the Circle,
  // or platform staff. One shared seam so the Space Circles surface and the Circle page agree.
  const gate = await resolveRunGate(input.circleId, caller.id)
  if (!gate.circleSlug) return fail('Circle not found.')
  if (!gate.allowed) return fail('Only the circle host or the space team can start a run.')

  // WHAT they may pick, for a SPACE Circle: only a Journey that Space offers. Checked here and
  // not just in the picker, so a smuggled plan id is refused rather than quietly run.
  if (gate.spaceId) {
    const offered = await journeysOfferedBySpace(gate.spaceId)
    if (!offered.some((p) => p.id === input.planId)) {
      return fail('Pick a Journey this space offers.')
    }
  }

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
