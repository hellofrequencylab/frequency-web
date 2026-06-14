'use server'

// Journeys v2 — start a Run (ADR-252, J2). A Circle Host launches a Journey as a cohort Run
// for their Circle; the Circle's active members are enrolled. Host-gated.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { startRun, scheduleKickoff } from '@/lib/journeys/runs'

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

  // Host gate: only the Circle's host can start a Run for it.
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('host_id, slug')
    .eq('id', input.circleId)
    .maybeSingle()
  const c = circle as { host_id: string | null; slug: string } | null
  if (!c) return fail('Circle not found.')
  if (c.host_id !== caller.id) return fail('Only the circle host can start a run.')

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

  revalidatePath(`/circles/${c.slug}`)
  return ok({ runId })
}
