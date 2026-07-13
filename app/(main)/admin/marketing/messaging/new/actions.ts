'use server'

// Guided-setup build actions (EMAIL-CAMPAIGNS-FUNNELS-PLAN P3, ask #3). The "New" flow
// asks a few best-practice questions, then hands off to one of two builders. Both are
// wired here EXCEPT the Vera draft, which is a documented, clean seam (P5): the tool
// that generates a whole campaign or sequence from the answers is not built yet, so the
// "Let Vera draft it" path currently builds the SAME best-practice scaffold as manual
// and flags that Vera drafting is on the way. When the Vera tool lands (lib/ai/vera/
// tools.ts + the voice primer, docs/EMAIL-CAMPAIGNS-FUNNELS-PLAN §P5), only the `vera`
// branch below changes.
//
// The gate + object creation reuse the existing, tested actions (createFunnel), so this
// adds no new mutation surface. Copy is plain, no em dashes (voice).

import { getMessagingGoal } from '@/lib/messaging/goals'
import { createFunnel } from '@/app/(main)/admin/growth/funnels/actions'
import { ok, fail, type ActionResult } from '@/lib/action-result'

export interface StartBuildInput {
  goalKey: string
  name: string
  /** For a campaign: the audience segment key (passed through to the composer). */
  audience?: string
  tone?: string
  /** 'manual' builds the scaffold; 'vera' is the (deferred) AI-draft path. */
  mode: 'manual' | 'vera'
}

export interface StartBuildResult {
  href: string
  /** True when the caller asked for Vera but got the manual scaffold (Vera is deferred). */
  veraPending: boolean
}

/** Build the object for a goal and return where to send the operator next. Funnels are
 *  created here (the four canonical stages, seeded from the goal); campaigns route to
 *  the working composer, since a one-time send is authored there. */
export async function startBuild(input: StartBuildInput): Promise<ActionResult<StartBuildResult>> {
  const goal = getMessagingGoal(input.goalKey)
  if (!goal) return fail('Pick a goal first.')

  const name = input.name?.trim()
  if (!name) return fail('Give it a name.')

  const veraPending = input.mode === 'vera'

  if (goal.object === 'funnel') {
    const res = await createFunnel({
      name,
      description: goal.blurb,
      goalEvent: goal.goalEvent,
    })
    if ('error' in res) return fail(res.error)
    return ok({ href: `/admin/marketing/messaging/funnels/${res.data.id}`, veraPending })
  }

  // Campaign goal: the composer is the working author surface. Carry the audience as a
  // hint so the composer can preselect it (a query the composer reads; harmless if not).
  const params = new URLSearchParams()
  if (input.audience) params.set('segment', input.audience)
  const query = params.toString()
  return ok({ href: `/admin/marketing/campaigns${query ? `?${query}` : ''}`, veraPending })
}
