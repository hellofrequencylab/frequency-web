'use server'
// NETWORK-ONLY TOOLS, the server actions (SCAN-983). Each one re-resolves the caller's standing on the
// Network parent (networkToolsAccess) and re-reads the chapter it touches: never trust the page.
import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { addSpaceMember, getSpaceMembership, updateSpaceMemberRole } from '@/lib/spaces/membership'
import { checkSeatForOperatorInvite, operatorRoleConsumesSeat } from '@/lib/spaces/seats'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { NETWORK_PLAN } from '@/lib/pricing/plans'
import { isNetworkChapter, type NetworkEventDecision } from './network-tools'
import {
  chapterShowsEvent, deleteCentralAdmin, insertCentralAdmin, networkToolsAccess, readToolsSpace, writeEventDecision,
} from './network-tools-store'

const DENIED = 'Only the Network owner or a central admin can do this.'

async function gate(parentId: string) {
  const callerId = await getMyProfileId()
  const access = await networkToolsAccess(parentId, callerId)
  return access && callerId ? { ...access, callerId } : null
}

/** The person must already be on the parent's roster: the network's one membership. */
async function onParentRoster(parentId: string, profileId: string): Promise<boolean> {
  const row = await getSpaceMembership(parentId, profileId)
  return row?.status === 'active'
}

/** Give a person admin of a Space, taking an operator seat only when they do not already hold one. */
async function makeAdmin(spaceId: string, profileId: string, by: string): Promise<string | null> {
  const current = await getSpaceMembership(spaceId, profileId)
  if (current?.status === 'active' && current.role === 'admin') return null
  if (!(current?.status === 'active' && operatorRoleConsumesSeat(current.role))) {
    const seat = await checkSeatForOperatorInvite(spaceId, 'admin')
    if (!seat.allowed) return seat.reason ?? 'This Space has no operator seats left. Add a seat to add a leader.'
  }
  const row = await addSpaceMember({ spaceId, profileId, role: 'admin', status: 'active', invitedBy: by })
  return row ? null : 'Could not save this leader. Try again.'
}

export async function approveNetworkEvent(parentId: string, chapterId: string, eventId: string, decision: NetworkEventDecision): Promise<ActionResult> {
  if (decision !== 'approved' && decision !== 'declined') return fail('Pick Approve or Decline.')
  const access = await gate(parentId)
  if (!access) return fail(DENIED)
  const chapter = await readToolsSpace(chapterId)
  if (!isNetworkChapter(chapter, access.parent) || !chapter) return fail('This chapter is no longer part of your Network.')
  if (!await chapterShowsEvent(chapter, eventId)) return fail('This event is no longer on the chapter calendar.')
  if (!await writeEventDecision(parentId, chapterId, eventId, decision, access.callerId)) return fail('Could not save your decision. Try again.')
  revalidatePath('/spaces', 'layout')
  return ok()
}

export async function setChapterLeader(parentId: string, chapterId: string, profileId: string, leader: boolean): Promise<ActionResult> {
  const access = await gate(parentId)
  if (!access) return fail(DENIED)
  const chapter = await readToolsSpace(chapterId)
  if (!isNetworkChapter(chapter, access.parent)) return fail('This chapter is no longer part of your Network.')
  if (!profileId || profileId === access.parent.owner_profile_id) return fail('Pick someone other than the Network owner.')
  if (leader) {
    if (!await onParentRoster(parentId, profileId)) return fail('Add this person to your Network first.')
    const error = await makeAdmin(chapterId, profileId, access.callerId)
    if (error) return fail(error)
  } else {
    // Stepping down keeps them in the chapter as a member.
    if (!await updateSpaceMemberRole(chapterId, profileId, 'viewer')) return fail('Could not update this leader. Try again.')
  }
  revalidatePath('/spaces', 'layout')
  return ok()
}

export async function setCentralAdmin(parentId: string, profileId: string, named: boolean): Promise<ActionResult> {
  const access = await gate(parentId)
  if (!access?.isOwner) return fail('Only the Network owner can name central admins.')
  if (!profileId || profileId === access.callerId) return fail('Pick someone other than yourself.')
  if (!named) {
    if (!await deleteCentralAdmin(parentId, profileId)) return fail('Could not update central admins. Try again.')
    revalidatePath('/spaces', 'layout')
    return ok()
  }
  if (!await onParentRoster(parentId, profileId)) return fail('Add this person to your Network first.')
  const refused = await insertCentralAdmin(parentId, profileId, access.callerId)
  if (refused === 'full') return fail(`Your Network has all ${NETWORK_PLAN.centralAdmins} central admins. Remove one to add another.`)
  if (refused) return fail('Could not add this central admin. Try again.')
  const error = await makeAdmin(parentId, profileId, access.callerId)
  if (error) {
    await deleteCentralAdmin(parentId, profileId)
    return fail(error)
  }
  revalidatePath('/spaces', 'layout')
  return ok()
}
