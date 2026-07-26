'use server'

import { redirect } from 'next/navigation'
import { resolveCircleCrm } from '@/lib/crm/leader-crm-access'
import { listActiveCircleMemberIds } from '@/lib/circles/crm-roster'
import { buildMemberDetail } from '@/lib/crm/member-detail'
import { openScopedDm } from '@/lib/messages/scoped-dm'
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
  return buildMemberDetail(profileId, { audience: 'leader' })
}

/** Open (or reuse) the 1:1 thread with a circle member, then land in it. */
export async function openCircleMemberDm(slug: string, profileId: string): Promise<void> {
  const circle = await resolveCircleCrm(slug)
  if (!circle) throw new Error('You cannot manage this circle.')
  const { conversationId } = await openScopedDm({
    scope: { kind: 'circle', id: circle.id },
    targetProfileId: profileId,
  })
  redirect(`/messages/${conversationId}`)
}
