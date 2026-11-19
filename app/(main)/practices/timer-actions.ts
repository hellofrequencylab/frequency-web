'use server'

// Vera's timer recommendation for the Practice editor and the create flow (LIVE-2396).
//
// READ-ONLY. This action looks at what the author has typed and answers with setup IDs from the
// closed catalog (lib/practices/timer-setups.ts). It writes nothing: the author taps a setup, and
// that tap saves through the editor's own autosave (or rides the create action), where every
// column is re-validated. Vera never writes a word here (ADR-1939, ruling 4); the model can only
// choose IDs, and a missing or unusable answer falls back to the offline recommender, so the
// author always gets suggestions.

import { getMyProfileId } from '@/lib/auth'
import { canCreate } from '@/lib/core/load-capabilities'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { suggestTimerPicks } from '@/lib/ai/practice-timer-suggest'
import { recommendTimerPicks, type TimerPick, type TimerSignals } from '@/lib/practices/timer-setups'

export interface TimerSuggestResult {
  picks: TimerPick[]
  /** True when Vera chose these; false when they came from the offline recommender. */
  vera: boolean
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export async function suggestPracticeTimerAction(input: TimerSignals): Promise<ActionResult<TimerSuggestResult>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  if (!(await canCreate('practice.create'))) return fail('Not signed in')
  // The client sends the author's own unsaved words. Never trusted for shape or size.
  const minutes = typeof input?.durationMin === 'number' && Number.isFinite(input.durationMin) && input.durationMin > 0
    ? Math.min(600, Math.round(input.durationMin))
    : null
  const signals: TimerSignals = {
    title: text(input?.title, 120),
    summary: text(input?.summary, 200),
    description: text(input?.description, 400),
    body: text(input?.body, 8000),
    durationMin: minutes,
  }
  const picks = await suggestTimerPicks({ ...signals, profileId })
  if (picks) return ok({ picks, vera: true })
  return ok({ picks: recommendTimerPicks(signals), vera: false })
}
