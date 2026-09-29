import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/log'
import type { PlanCommentRow } from './plan-comments'

// COMMENT IO (PROG-CAL7 Together, LIVE-542). Caller session, never the admin client: RLS on
// space_plan_comments (20270345009400) is the lock, and it admits exactly the host Space and an
// accepted guest through the 20270345007300 share helpers. A stranger's read comes back empty and
// a stranger's write is refused by Postgres, whatever the action above believed.
//
// Every failure is logged first (the 2026-09-21 lesson in plans-store.ts): a thread that renders
// empty over a refused read is an invisible regression.

const COMMENT_COLS = 'id, plan_id, task_id, space_id, author_profile_id, body, created_at, removed_at'
const THREAD_LIMIT = 500

async function db() {
  return await createClient()
}

function commentIoFailed(op: string, error: unknown): void {
  const e = (error ?? null) as { message?: string; code?: string } | null
  log.error(`calendar.plan_comment.${op}_failed`, {
    db_error: e?.message ?? String(error ?? 'unknown'),
    db_code: e?.code ?? null,
  })
}

/** Every comment of a Plan the session may read, oldest first, taken-back ones included. */
export async function listPlanCommentRows(planId: string): Promise<PlanCommentRow[]> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_comments')
      .select(COMMENT_COLS)
      .eq('plan_id', planId)
      .order('created_at', { ascending: true })
      .limit(THREAD_LIMIT)
    if (error || !data) {
      commentIoFailed('list', error)
      return []
    }
    return data as PlanCommentRow[]
  } catch (err) {
    commentIoFailed('list', err)
    return []
  }
}

/** Write one comment as the caller, from the Space they are working the Plan in. The insert
 *  policy proves all three (the Plan is reachable, the Space is theirs, the author is them). */
export async function insertPlanComment(comment: {
  planId: string
  taskId: string | null
  spaceId: string
  authorProfileId: string
  body: string
}): Promise<{ id: string } | { error: string }> {
  try {
    const { data, error } = await (await db())
      .from('space_plan_comments')
      .insert({
        plan_id: comment.planId,
        task_id: comment.taskId,
        space_id: comment.spaceId,
        author_profile_id: comment.authorProfileId,
        body: comment.body,
      })
      .select('id')
      .limit(1)
    if (error || !data?.[0]) {
      commentIoFailed('insert', error)
      return { error: 'That comment could not be posted.' }
    }
    return { id: (data[0] as { id: string }).id }
  } catch (err) {
    commentIoFailed('insert', err)
    return { error: 'That comment could not be posted.' }
  }
}

/** The author takes back their own comment. The function marks the caller's own unremoved row and
 *  nothing else, and says whether it did. */
export async function removePlanCommentRow(commentId: string): Promise<boolean> {
  try {
    const { data, error } = await (await db()).rpc('remove_plan_comment', { p_comment_id: commentId })
    if (error) {
      commentIoFailed('remove', error)
      return false
    }
    return data === true
  } catch (err) {
    commentIoFailed('remove', err)
    return false
  }
}

/** Display names for the authors the session may read. A profile across the wall is not readable
 *  (profiles RLS is regional), so a missing name is expected, not an error, and the words fall
 *  back to the Space. */
export async function resolveCommentAuthors(profileIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))].slice(0, 200)
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    const { data } = await (await db()).from('profiles').select('id, display_name').in('id', ids)
    for (const r of (data ?? []) as { id: string; display_name: string | null }[]) {
      if (r.display_name) out.set(r.id, r.display_name)
    }
    return out
  } catch (err) {
    commentIoFailed('authors', err)
    return out
  }
}

/** Names of the Spaces comments were written from. An active Space is readable by anyone. */
export async function resolveCommentSpaces(spaceIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(spaceIds.filter(Boolean))].slice(0, 50)
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    const { data } = await (await db()).from('spaces').select('id, name').in('id', ids)
    for (const r of (data ?? []) as { id: string; name: string | null }[]) {
      if (r.name) out.set(r.id, r.name)
    }
    return out
  } catch (err) {
    commentIoFailed('spaces', err)
    return out
  }
}
