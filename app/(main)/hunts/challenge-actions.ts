'use server'

// Saving a Trail's challenges (FH-042S, ADR-1977): the Mystery questions, their hints and the fork and
// stand-in choices, kept apart from the stops. This is the one place a plain answer arrives: it is
// hashed here with hashAnswer (lib/hunts/mystery.ts) and dropped, so only the hash is ever stored and
// the editor gets back whether an answer is set, never the answer or its hash. A blank answer keeps the
// one already set for that stop. Same gate as every creator action: the authoring switch, then the
// signed-in caller, then the Hunt's own edit gate in lib/hunts/store.ts.

import { getCallerProfile } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { challengeViews, mergeChallenges, type ChallengeView } from '@/lib/hunts/challenges'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { hashAnswer } from '@/lib/hunts/mystery'
import { loadChallenges, saveChallenges } from '@/lib/hunts/store'

export type SaveChallengesResult = { revision: number; challenges: ChallengeView[] } | { conflict: true; currentRevision: number }

const MAX_ANSWER = 120

/** The hashes for the answers typed this time, by stop. A Mystery's answer only; anything else is ignored. */
function typedAnswers(input: unknown): Map<number, string> {
  const out = new Map<number, string>()
  for (const item of Array.isArray(input) ? input.slice(0, 10) : []) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    if (r.mystery !== true || typeof r.stop !== 'number' || typeof r.answer !== 'string') continue
    const answer = r.answer.trim().slice(0, MAX_ANSWER)
    if (answer) out.set(r.stop, hashAnswer(answer))
  }
  return out
}

export async function saveChallengesAction(input: { huntId: string; baseRevision: number; challenges: unknown }): Promise<ActionResult<SaveChallengesResult>> {
  if (!huntSwitchOn('authoring')) return fail('Trails are not open yet.')
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')
  if (typeof input.huntId !== 'string' || !Number.isInteger(input.baseRevision) || input.baseRevision < 1) return fail('Those challenges could not be saved.')
  const actor = { profileId: caller.id }
  try {
    const previous = await loadChallenges(input.huntId, actor)
    if (!previous) return fail('Those challenges could not be saved.')
    const challenges = mergeChallenges(input.challenges, typedAnswers(input.challenges), previous)
    const res = await saveChallenges(input.huntId, actor, input.baseRevision, challenges)
    return ok(res.applied ? { revision: res.revision, challenges: challengeViews(challenges) } : { conflict: true, currentRevision: res.currentRevision })
  } catch {
    return fail('Those challenges could not be saved. Try again.')
  }
}
