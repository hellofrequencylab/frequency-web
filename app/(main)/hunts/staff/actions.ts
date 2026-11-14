'use server'

// The held-claim review action (FH-020T). It establishes the caller itself, refuses when
// HUNTS_CLAIMS_ENABLED is off, asks lib/hunts/authz.ts decide('review_claim') (through the store, with
// facts read fresh) whether this member may decide this claim, and only then calls reviewClaim.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { reviewClaim } from '@/lib/hunts/staff-review'
import { mayReviewClaim } from '@/lib/hunts/staff-queue-store'
import { huntRpc } from '@/lib/hunts/staff-store'

const WORDS = {
  credited: 'Approved. The player gets credit.',
  rejected: 'Turned down.',
  already_decided: 'Someone else already decided this one.',
  already_credited: 'That stop is already credited.',
  claim_not_found: 'We could not find that claim.',
  run_not_active: 'That run is no longer active.',
  key_conflict: 'Something went wrong. Reload and try again.',
} as const

export async function reviewHeldClaimAction(input: {
  claimId: string
  decision: 'approve' | 'reject'
  reason: string
  idempotencyKey: string
}): Promise<ActionResult<{ message: string }>> {
  if (!huntSwitchOn('claims')) return fail('Trails are not open yet.')
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (input.decision !== 'approve' && input.decision !== 'reject') return fail('Choose approve or turn down.')
  if (typeof input.claimId !== 'string' || !input.claimId || input.claimId.length > 100) return fail('We could not find that claim.')
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) return fail('Reload and try again.')
  if (reason.length > 280) return fail('Keep the reason under 280 characters.')
  if (input.decision === 'reject' && reason.length < 3) return fail('Say why you are turning it down.')

  if (!(await mayReviewClaim(caller.id, input.claimId, Math.floor(Date.now() / 1000)))) return fail(WORDS.claim_not_found)

  try {
    const out = await reviewClaim(huntRpc(), {
      claimId: input.claimId,
      reviewerId: caller.id,
      decision: input.decision,
      reason,
      idempotencyKey: input.idempotencyKey,
    })
    revalidatePath('/hunts/staff/review')
    return ok({ message: WORDS[out.result] })
  } catch {
    return fail('Something went wrong. Try again.')
  }
}
