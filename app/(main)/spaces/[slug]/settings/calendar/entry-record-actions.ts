'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { getCalendarEntryRow } from '@/lib/calendar/entries-store'
import { listEntryActivityRows, recordPlanActivity } from '@/lib/calendar/plan-activity-store'
import { latestActivity, mapPlanActivityRow, type PlanActivityView } from '@/lib/calendar/plan-activity'
import {
  insertPlanComment,
  listEntryCommentRows,
  removePlanCommentRow,
  resolveCommentAuthors,
  resolveCommentSpaces,
} from '@/lib/calendar/plan-comments-store'
import { mapPlanCommentRow, orderThread, parseCommentBody, type PlanCommentView } from '@/lib/calendar/plan-comments'

// THE RECORD AND THE THREAD OF A STANDALONE CALENDAR ENTRY (calendar suite pass 2).
//
// A Pencil or a block that is not on a Plan had no edit history and nowhere to talk. The same two
// tables that serve a Plan (space_plan_activity, space_plan_comments) now take an entry as their
// subject (20270346027000). Gate, twice: here, the caller edits this Space and it has the
// `events` function; and in the database, where the policies admit only the Space team that can
// write the entry. Every read and write runs on the caller's own session.
//
// AN ENTRY ON A PLAN SPEAKS THROUGH ITS PLAN. Giving it a thread of its own would split one
// conversation in two, so the doors below refuse an entry that has a Plan and say where to go.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveEditor(slug: string): Promise<{ spaceId: string; profileId: string } | null> {
  if (typeof slug !== 'string') return null
  const caller = await getCallerProfile()
  if (!caller?.id) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile || !spaceFunctionAccess(space, 'events', caps.role)) return null
  return { spaceId: space.id, profileId: caller.id }
}

/** The caller as editor, with the entry proven to be this Space's own and not on a Plan. */
async function standaloneEntry(
  slug: string,
  entryId: string,
): Promise<{ spaceId: string; profileId: string } | { error: string }> {
  const editor = await resolveEditor(slug)
  if (!editor) return { error: 'You do not have access to this calendar.' }
  if (typeof entryId !== 'string' || !UUID_RE.test(entryId)) return { error: 'That date no longer exists.' }
  const entry = await getCalendarEntryRow(editor.spaceId, entryId)
  if (!entry) return { error: 'That date no longer exists.' }
  if (entry.plan_id) return { error: 'That date is on a Plan. Use the Plan for its history and notes.' }
  return editor
}

/** The latest changes to a standalone entry, newest first. */
export async function listEntryActivity(slug: string, entryId: string): Promise<ActionResult<PlanActivityView[]>> {
  const editor = await standaloneEntry(slug, entryId)
  if ('error' in editor) return fail(editor.error)
  const rows = await listEntryActivityRows(entryId)
  const [actors, spaces] = await Promise.all([
    resolveCommentAuthors(rows.map((r) => r.actor_profile_id).filter((id): id is string => id !== null)),
    resolveCommentSpaces(rows.map((r) => r.actor_space_id)),
  ])
  return ok(
    latestActivity(
      rows.map((r) =>
        mapPlanActivityRow(
          r,
          {
            actorName: r.actor_profile_id ? (actors.get(r.actor_profile_id) ?? null) : null,
            spaceName: spaces.get(r.actor_space_id) ?? null,
          },
          editor.profileId,
        ),
      ),
    ),
  )
}

/** Every comment under a standalone entry, oldest first, taken-back ones included. */
export async function listEntryComments(slug: string, entryId: string): Promise<ActionResult<PlanCommentView[]>> {
  const editor = await standaloneEntry(slug, entryId)
  if ('error' in editor) return fail(editor.error)
  const rows = await listEntryCommentRows(entryId)
  const [authors, spaces] = await Promise.all([
    resolveCommentAuthors(rows.map((r) => r.author_profile_id).filter((id): id is string => id !== null)),
    resolveCommentSpaces(rows.map((r) => r.space_id)),
  ])
  return ok(
    orderThread(
      rows.map((r) =>
        mapPlanCommentRow(
          r,
          {
            authorName: r.author_profile_id ? (authors.get(r.author_profile_id) ?? null) : null,
            spaceName: spaces.get(r.space_id) ?? null,
          },
          editor.profileId,
        ),
      ),
    ),
  )
}

/** Post a comment under a standalone entry, as the caller, from this Space. */
export async function postEntryComment(slug: string, entryId: string, rawBody: unknown): Promise<ActionResult<{ id: string }>> {
  const editor = await standaloneEntry(slug, entryId)
  if ('error' in editor) return fail(editor.error)
  const parsed = parseCommentBody(rawBody)
  if ('error' in parsed) return fail(parsed.error)
  const res = await insertPlanComment({
    entryId,
    taskId: null,
    spaceId: editor.spaceId,
    authorProfileId: editor.profileId,
    body: parsed.body,
  })
  if ('error' in res) return fail(res.error)
  await recordPlanActivity({
    entryId,
    actorProfileId: editor.profileId,
    actorSpaceId: editor.spaceId,
    kind: 'comment',
    summary: 'Left a note on this date.',
  })
  revalidatePath(`/spaces/${slug}/settings/calendar`)
  return ok({ id: res.id })
}

/** The author takes back their own comment. The database marks the caller's own unremoved row and
 *  nothing else, so a stranger's id and a second press both come back as a refusal. */
export async function removeEntryComment(slug: string, entryId: string, commentId: string): Promise<ActionResult<void>> {
  const editor = await standaloneEntry(slug, entryId)
  if ('error' in editor) return fail(editor.error)
  if (typeof commentId !== 'string' || !UUID_RE.test(commentId)) return fail('That comment is already gone.')
  const marked = await removePlanCommentRow(commentId)
  if (!marked) return fail('Only the person who wrote a comment can take it back.')
  return ok()
}
