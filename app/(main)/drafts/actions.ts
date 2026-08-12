'use server'

// ─────────────────────────────────────────────────────────────────────────────
// THE DRAFTS SURFACE — server actions (ADR-998; ADR-988 the governed create layer).
//
// Two actions, and neither one is an authority. Both hand straight to lib/ai/vera/create-entity.ts,
// which re-derives the caller from the session, refuses a proposal that is not theirs, refuses one
// that is stale or already spent, re-checks the entity's gate AT THE MOMENT OF THE WRITE, and
// claims the audit row with a conditional update so it can only ever be spent once.
//
// NOTHING HERE IS AUTONOMOUS. Both actions run only from a member's own tap in their own session.
// The confirm half has no tool key and appears in no tool registry, which is the whole of the
// propose-and-confirm gate expressed as reachability rather than as an instruction in a prompt.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache'
import { confirmProposalWithRegisteredCommit, dismissCreateProposal } from '@/lib/ai/vera/create-entity'
import { getMyProfileId } from '@/lib/auth'
import { discardStagedDraft } from '@/lib/studio/draft-store'
import type { ActionResult } from '@/lib/action-result'

/** Make the thing. The governed layer owns every check; this only refreshes the list after. */
export async function confirmDraftAction(
  proposalId: string,
): Promise<ActionResult<{ entity: string; href: string | null }>> {
  const res = await confirmProposalWithRegisteredCommit(proposalId)
  revalidatePath('/drafts')
  return res
}

/** Throw the draft away. Conditional on it still being open, so a dismissed or already-confirmed
 *  proposal cannot be dismissed twice, and a dismissed one can never afterwards be confirmed. */
export async function dismissDraftAction(proposalId: string): Promise<ActionResult<void>> {
  const res = await dismissCreateProposal(proposalId)
  revalidatePath('/drafts')
  return res
}

/**
 * Erase one unfinished wizard draft (ADR-1001). The member's one-click erasure, matching the
 * `ai_member_context` posture: unfinished text we hold is theirs to see and theirs to delete.
 *
 * Owner-scoped by construction. The profile id comes from the SESSION, so the scope the client
 * sends can only ever select among that same person's own drafts and can address nothing else.
 * The copy in the browser they typed it in is left alone and ages out on its own within the week.
 */
export async function binUnfinishedDraftAction(scope: string): Promise<boolean> {
  const profileId = await getMyProfileId()
  if (!profileId || !scope) return false
  await discardStagedDraft(profileId, scope)
  revalidatePath('/drafts')
  return true
}
