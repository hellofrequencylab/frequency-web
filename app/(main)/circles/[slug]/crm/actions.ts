'use server'

import { redirect, unstable_rethrow } from 'next/navigation'
import { resolveCircleCrm } from '@/lib/crm/leader-crm-access'
import { listActiveCircleMemberIds } from '@/lib/circles/crm-roster'
import { buildMemberDetail } from '@/lib/crm/member-detail'
import { openScopedDm } from '@/lib/messages/scoped-dm'
import { fail, type ActionResult } from '@/lib/action-result'
import type { CrmMemberDetail } from '@/components/people/member-viewer'

// MESSAGE CIRCLE server actions (CRM Everywhere plan 4.4 / ADR-827). Both actions re-run the FULL
// gate per request (the client only ever passes ids; `slug` is bound server-side by the page):
//   detail: circle.moderate gate -> TENANCY (the id must be in THIS circle's active-member set,
//   so a host can never read an arbitrary platform member by guessing an id) -> the shared
//   buildMemberDetail with the leader altitude trim (no staff CRM internals).
//   DM: circle.moderate gate -> openScopedDm (its own leadership + audience gate, block check,
//   rate limits) -> redirect into the thread.

/** Load one circle member's leader-trimmed detail. Gate -> tenancy -> build, verbatim. */
export async function loadCircleCrmDetail(slug: string, profileId: string): Promise<CrmMemberDetail> {
  const circle = await resolveCircleCrm(slug)
  if (!circle) throw new Error('You cannot manage this circle.')
  const memberIds = await listActiveCircleMemberIds(circle.id)
  if (!memberIds.has(profileId)) throw new Error('That person is not in this circle.')
  // The Path lane (ADR-827 ruling 3): this circle's comms only, fail-closed in the assembler.
  return buildMemberDetail(profileId, { audience: 'leader', scope: { kind: 'circle', id: circle.id } })
}

/** Open (or reuse) the 1:1 thread with a circle member, then land in it. A refusal (blocked pair,
 *  rate limit, not-in-scope) returns the ActionResult error for the dm button to render inline —
 *  never a throw into the route error boundary; unstable_rethrow keeps NEXT_REDIRECT flowing. */
export async function openCircleMemberDm(slug: string, profileId: string): Promise<ActionResult> {
  let conversationId: string
  try {
    const circle = await resolveCircleCrm(slug)
    if (!circle) return fail('You cannot manage this circle.')
    ;({ conversationId } = await openScopedDm({
      scope: { kind: 'circle', id: circle.id },
      targetProfileId: profileId,
    }))
  } catch (err) {
    unstable_rethrow(err)
    return fail(err instanceof Error ? err.message : 'Something went wrong. Try again.')
  }
  redirect(`/messages/${conversationId}`)
}
