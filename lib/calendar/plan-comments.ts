// THE THREAD UNDER A PLAN (PROG-CAL7 Together, LIVE-542). Two teams working one Plan talk here:
// a comment on the Plan itself, or under one of its to-dos. Nothing in this file does IO. The
// session reads and writes live in lib/calendar/plan-comments-store.ts and the doors in
// app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts.
//
// A COMMENT IS A RECORD. The table (20270345009400) has no update policy: a sentence the other
// Space has read is never rewritten. The author may take their own back, and the thread then says
// so in place rather than closing the gap, because a thread that quietly loses a line is a thread
// the other team cannot trust.
//
// WHO SAID IT. A profile may not be readable across the Space wall (profiles RLS is regional), so
// every comment carries the Space it was written from, and the words a person reads fall back to
// the Space's name when the author's cannot be resolved. Never an id.

export const PLAN_COMMENT_MAX = 4000

/** A `space_plan_comments` row as the session client returns it. */
export interface PlanCommentRow {
  id: string
  plan_id: string
  task_id: string | null
  space_id: string
  author_profile_id: string | null
  body: string
  created_at: string
  removed_at: string | null
}

/** One comment as the drawer renders it, with the names already resolved server-side. */
export interface PlanCommentView {
  id: string
  planId: string
  taskId: string | null
  spaceId: string
  authorProfileId: string | null
  authorName: string | null
  spaceName: string | null
  body: string
  createdAt: string
  removed: boolean
  /** Whether the caller wrote it, so the drawer offers Take back on this one and no other. */
  mine: boolean
}

/** The body a person typed, trimmed and bounded, or the sentence that says why not. */
export function parseCommentBody(raw: unknown): { body: string } | { error: string } {
  const body = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : ''
  if (!body) return { error: 'Write something first.' }
  if (body.length > PLAN_COMMENT_MAX) return { error: `Keep it under ${PLAN_COMMENT_MAX} characters.` }
  return { body }
}

export function mapPlanCommentRow(
  row: PlanCommentRow,
  names: { authorName: string | null; spaceName: string | null },
  callerProfileId: string | null,
): PlanCommentView {
  return {
    id: row.id,
    planId: row.plan_id,
    taskId: row.task_id,
    spaceId: row.space_id,
    authorProfileId: row.author_profile_id,
    authorName: names.authorName,
    spaceName: names.spaceName,
    body: row.body,
    createdAt: row.created_at,
    removed: row.removed_at !== null,
    mine: row.author_profile_id !== null && row.author_profile_id === callerProfileId,
  }
}

/** Oldest first, newest last, so the composer sits under the latest word. Stable on ties. */
export function orderThread<T extends { createdAt: string; id: string }>(comments: readonly T[]): T[] {
  return [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

/** The Plan's own thread (taskId null) or the thread under one to-do. */
export function threadFor<T extends { taskId: string | null }>(comments: readonly T[], taskId: string | null): T[] {
  return comments.filter((c) => c.taskId === taskId)
}

/** Live comments per to-do, for the count beside each row. Taken-back ones are not a conversation. */
export function countByTask<T extends { taskId: string | null; removed: boolean }>(comments: readonly T[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of comments) {
    if (!c.taskId || c.removed) continue
    out.set(c.taskId, (out.get(c.taskId) ?? 0) + 1)
  }
  return out
}

/** Who said it, as a person reads it. The author's name when it resolved, else their Space, else
 *  the honest fallback. No long dash anywhere. */
export function authorWords(c: Pick<PlanCommentView, 'authorName' | 'spaceName' | 'mine'>): string {
  if (c.mine) return 'You'
  if (c.authorName && c.spaceName) return `${c.authorName} (${c.spaceName})`
  if (c.authorName) return c.authorName
  if (c.spaceName) return `Someone at ${c.spaceName}`
  return 'Someone on the Plan'
}

/** The line a taken-back comment leaves behind. */
export const REMOVED_WORDS = 'Taken back by the person who wrote it.'
