'use server'

import { redirect, unstable_rethrow } from 'next/navigation'
import { resolveHubCrm } from '@/lib/crm/leader-crm-access'
import { listPlaceTreeMemberIds } from '@/lib/circles/crm-roster'
import { buildMemberDetail } from '@/lib/crm/member-detail'
import { openScopedDm } from '@/lib/messages/scoped-dm'
import { fail, type ActionResult } from '@/lib/action-result'
import type { CrmMemberDetail } from '@/components/people/member-viewer'

// HUB member-CRM server actions (CRM Everywhere plan Phase 4 sibling / ADR-827). Both actions
// re-run the FULL gate per request (`slug` is bound server-side by the page):
//   detail: hub.manage gate -> TENANCY (the id must be an active member of a circle in THIS hub's
//   subtree, so a guide can never read an arbitrary platform member) -> the shared
//   buildMemberDetail with the leader altitude trim.
//   DM: hub.manage gate -> openScopedDm (its own leadership + subtree-membership gate, block
//   check, rate limits) -> redirect into the thread.

/** Load one hub-subtree member's leader-trimmed detail. Gate -> tenancy -> build, verbatim. */
export async function loadHubCrmDetail(slug: string, profileId: string): Promise<CrmMemberDetail> {
  const hub = await resolveHubCrm(slug)
  if (!hub) throw new Error('You cannot manage this hub.')
  const memberIds = await listPlaceTreeMemberIds({ kind: 'hub', id: hub.id })
  if (!memberIds.has(profileId)) throw new Error('That person is not in this hub.')
  return buildMemberDetail(profileId, { audience: 'leader' })
}

/** Open (or reuse) the 1:1 thread with a hub member, then land in it. A refusal (blocked pair,
 *  rate limit, not-in-scope) returns the ActionResult error for the dm button to render inline —
 *  never a throw into the route error boundary; unstable_rethrow keeps NEXT_REDIRECT flowing. */
export async function openHubMemberDm(slug: string, profileId: string): Promise<ActionResult> {
  let conversationId: string
  try {
    const hub = await resolveHubCrm(slug)
    if (!hub) return fail('You cannot manage this hub.')
    ;({ conversationId } = await openScopedDm({
      scope: { kind: 'hub', id: hub.id },
      targetProfileId: profileId,
    }))
  } catch (err) {
    unstable_rethrow(err)
    return fail(err instanceof Error ? err.message : 'Something went wrong. Try again.')
  }
  redirect(`/messages/${conversationId}`)
}
