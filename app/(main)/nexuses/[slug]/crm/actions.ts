'use server'

import { redirect } from 'next/navigation'
import { resolveNexusCrm } from '@/lib/crm/leader-crm-access'
import { listPlaceTreeMemberIds } from '@/lib/circles/crm-roster'
import { buildMemberDetail } from '@/lib/crm/member-detail'
import { openScopedDm } from '@/lib/messages/scoped-dm'
import type { CrmMemberDetail } from '@/components/people/member-viewer'

// NEXUS member-CRM server actions (CRM Everywhere plan Phase 4 sibling / ADR-827). Both actions
// re-run the FULL gate per request (`slug` is bound server-side by the page):
//   detail: nexus.manage gate -> TENANCY (the id must be an active member of a circle in THIS
//   nexus's subtree, so a mentor can never read an arbitrary platform member) -> the shared
//   buildMemberDetail with the leader altitude trim.
//   DM: nexus.manage gate -> openScopedDm (its own leadership + subtree-membership gate, block
//   check, rate limits) -> redirect into the thread.

/** Load one nexus-subtree member's leader-trimmed detail. Gate -> tenancy -> build, verbatim. */
export async function loadNexusCrmDetail(slug: string, profileId: string): Promise<CrmMemberDetail> {
  const nexus = await resolveNexusCrm(slug)
  if (!nexus) throw new Error('You cannot manage this nexus.')
  const memberIds = await listPlaceTreeMemberIds({ kind: 'nexus', id: nexus.id })
  if (!memberIds.has(profileId)) throw new Error('That person is not in this nexus.')
  return buildMemberDetail(profileId, { audience: 'leader' })
}

/** Open (or reuse) the 1:1 thread with a nexus member, then land in it. */
export async function openNexusMemberDm(slug: string, profileId: string): Promise<void> {
  const nexus = await resolveNexusCrm(slug)
  if (!nexus) throw new Error('You cannot manage this nexus.')
  const { conversationId } = await openScopedDm({
    scope: { kind: 'nexus', id: nexus.id },
    targetProfileId: profileId,
  })
  redirect(`/messages/${conversationId}`)
}
