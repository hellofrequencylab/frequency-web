import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { buildPlanShareEmail } from '@/lib/email'
import { routeNotification } from '@/lib/notifications/router'
import { listSpaceCollaborationApprovers } from '@/lib/spaces/collaborations'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { getSpaceById } from '@/lib/spaces/store'
import { getTaskInPlans } from '@/lib/crm/tasks'
import { listPlanShareRows } from './plans-store'
import {
  calendarSettingsPath,
  planAssignCopy,
  planCommentCopy,
  planShareCopy,
  recipientsWithoutActor,
  type PlanShareMoment,
} from './plan-notify-core'

// WHO HEARS ABOUT A SHARED PLAN (PROG-CAL7 Together, LIVE-545). Three moments, one send each,
// to the OTHER team, through the notification registry (lib/notifications/registry.ts) so the
// recipient's own preference switches and the suppression list decide every channel. The
// person who did the thing never hears about it.
//
// BEST EFFORT, NEVER IN THE WAY. Every door calls `notifyPlanMoment` after its write landed and
// carries on: a recipient whose profile cannot be read costs that send, never the change. Each
// failure logs one structured line first (the LIVE-543 rule).
//
// THE ADMIN CLIENT IS FOR RECIPIENTS ONLY: an approver's address lives on auth.users, and a
// teammate's display name may sit across a regional wall the caller's session cannot read. No
// row is written through it, and no id it reads comes from the browser: the doors hand in ids
// their own session already proved (the Plan, the share, the to-do).

type PlanMomentInput =
  | {
      event: 'plan.share'
      moment: PlanShareMoment
      planId: string
      planTitle: string
      /** The Space that hears about it: the guest on an offer, the host on an answer. */
      toSpaceId: string
      /** The Space on the other side, named in the copy. */
      fromSpaceId: string
      actorProfileId: string
    }
  | {
      event: 'plan.comment'
      planId: string
      planTitle: string
      hostSpaceId: string
      /** The Space the author wrote from. */
      authorSpaceId: string
      actorProfileId: string
      taskId: string | null
      body: string
    }
  | {
      event: 'plan.assign'
      planId: string
      planTitle: string
      hostSpaceId: string
      actorProfileId: string
      assigneeProfileId: string
      todoTitle: string
    }

interface PlanMomentResult {
  recipients: number
  enqueued: number
}

/** One moment, fanned out to the other team. Never throws. */
export async function notifyPlanMoment(input: PlanMomentInput): Promise<PlanMomentResult> {
  const out: PlanMomentResult = { recipients: 0, enqueued: 0 }
  try {
    switch (input.event) {
      case 'plan.share':
        return await notifyShare(input, out)
      case 'plan.comment':
        return await notifyComment(input, out)
      case 'plan.assign':
        return await notifyAssign(input, out)
    }
  } catch (err) {
    log.warn('calendar.plan_notify.failed', { event: input.event, plan_id: input.planId, error: err instanceof Error ? err.message : String(err) })
    return out
  }
}

async function notifyShare(input: Extract<PlanMomentInput, { event: 'plan.share' }>, out: PlanMomentResult): Promise<PlanMomentResult> {
  const [to, from] = await Promise.all([getSpaceById(input.toSpaceId), getSpaceById(input.fromSpaceId)])
  if (!to || !from) return out
  const approvers = recipientsWithoutActor(await listSpaceCollaborationApprovers(to.id), input.actorProfileId)
  const copy = planShareCopy(input.moment, from.name, input.planTitle)
  const path = calendarSettingsPath(to.slug)
  for (const profileId of approvers) {
    const person = await recipientFor(profileId)
    if (!person) continue
    const email = person.email
      ? buildPlanShareEmail({
          to: person.email,
          recipientName: person.name,
          recipientProfileId: profileId,
          moment: input.moment,
          otherSpaceName: from.name,
          planTitle: input.planTitle,
          calendarPath: path,
        })
      : undefined
    const routed = await routeNotification(
      'plan.share',
      { profileId, email: person.email, subject: { subjectType: 'space', subjectId: to.id } },
      { ...copy, url: path, tag: `plan-share:${input.planId}:${input.moment}`, ...(email ? { email } : {}) },
    )
    out.recipients += 1
    out.enqueued += routed.enqueuedCount
  }
  return out
}

async function notifyComment(input: Extract<PlanMomentInput, { event: 'plan.comment' }>, out: PlanMomentResult): Promise<PlanMomentResult> {
  // The other side: the host when a guest wrote, every accepted guest when the host wrote. The
  // share rows come off the caller's session, so a guest sees the host and its own share only.
  const shares = await listPlanShareRows(input.planId)
  const guestIds = shares.filter((s) => s.status === 'accepted').map((s) => s.guest_space_id)
  const otherSpaceIds = input.authorSpaceId === input.hostSpaceId ? guestIds : [input.hostSpaceId]
  const author = await recipientFor(input.actorProfileId)
  const todo = input.taskId ? await getTaskInPlans(input.taskId, [input.planId]) : null
  const copy = planCommentCopy(author?.name ?? 'Someone on the Plan', input.planTitle, todo?.title ?? null, input.body)
  const tag = `plan-comment:${input.planId}:${input.taskId ?? 'plan'}`
  const sent = new Set<string>()
  for (const spaceId of otherSpaceIds) {
    const space = await getSpaceById(spaceId)
    if (!space) continue
    const editors = recipientsWithoutActor(await editorIds(space.id, space.ownerProfileId), input.actorProfileId)
    for (const profileId of editors) {
      if (sent.has(profileId)) continue
      sent.add(profileId)
      const routed = await routeNotification(
        'plan.comment',
        { profileId, subject: { subjectType: 'space', subjectId: space.id } },
        { ...copy, url: calendarSettingsPath(space.slug), tag },
      )
      out.recipients += 1
      out.enqueued += routed.enqueuedCount
    }
  }
  // A note under a to-do reaches the person it was handed to, whichever side they sit on.
  if (todo?.assigneeProfileId && todo.assigneeProfileId !== input.actorProfileId && !sent.has(todo.assigneeProfileId)) {
    const home = await teamOf(todo.assigneeProfileId, [input.hostSpaceId, ...guestIds, input.authorSpaceId])
    if (home) {
      const routed = await routeNotification(
        'plan.comment',
        { profileId: todo.assigneeProfileId, subject: { subjectType: 'space', subjectId: home.id } },
        { ...copy, url: calendarSettingsPath(home.slug), tag },
      )
      out.recipients += 1
      out.enqueued += routed.enqueuedCount
    }
  }
  return out
}

async function notifyAssign(input: Extract<PlanMomentInput, { event: 'plan.assign' }>, out: PlanMomentResult): Promise<PlanMomentResult> {
  if (input.assigneeProfileId === input.actorProfileId) return out
  const shares = await listPlanShareRows(input.planId)
  const guestIds = shares.filter((s) => s.status === 'accepted').map((s) => s.guest_space_id)
  const home = await teamOf(input.assigneeProfileId, [input.hostSpaceId, ...guestIds])
  if (!home) return out
  const actor = await recipientFor(input.actorProfileId)
  const copy = planAssignCopy(actor?.name ?? 'Someone on the Plan', input.todoTitle, input.planTitle)
  const routed = await routeNotification(
    'plan.assign',
    { profileId: input.assigneeProfileId, subject: { subjectType: 'space', subjectId: home.id } },
    { ...copy, url: calendarSettingsPath(home.slug), tag: `plan-assign:${input.planId}` },
  )
  out.recipients = 1
  out.enqueued = routed.enqueuedCount
  return out
}

/** The people who work a Space's calendar: its owner and its active editors, moderators and admins. */
async function editorIds(spaceId: string, ownerProfileId: string | null): Promise<string[]> {
  const ids = new Set<string>()
  if (ownerProfileId) ids.add(ownerProfileId)
  for (const m of await listSpaceMembers(spaceId)) {
    if (m.status === 'active' && m.role !== 'viewer') ids.add(m.profileId)
  }
  return [...ids]
}

/** The first of the candidate Spaces the person works, in the order given: where their link lands. */
async function teamOf(profileId: string, spaceIds: readonly string[]): Promise<{ id: string; slug: string } | null> {
  for (const spaceId of [...new Set(spaceIds)]) {
    const space = await getSpaceById(spaceId)
    if (!space) continue
    if (space.ownerProfileId === profileId) return { id: space.id, slug: space.slug }
    const members = await listSpaceMembers(space.id)
    if (members.some((m) => m.profileId === profileId && m.status === 'active')) return { id: space.id, slug: space.slug }
  }
  return null
}

/** A recipient's display name and address. The address is on auth.users, so this is the one
 *  service-role read in the file; null when the profile cannot be read at all. */
async function recipientFor(profileId: string): Promise<{ email: string | null; name: string } | null> {
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('display_name, auth_user_id').eq('id', profileId).maybeSingle()
  if (!profile) return null
  const name = profile.display_name?.trim() || 'there'
  if (!profile.auth_user_id) return { email: null, name }
  const {
    data: { user },
  } = await admin.auth.admin.getUserById(profile.auth_user_id)
  return { email: user?.email ?? null, name }
}
