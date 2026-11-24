// ITEM THREADS (LIVE-2527, LIVE-2528). Pure: the names and rules every thread surface shares.
//
// A team thread hangs off any item. Plans, to-dos and calendar entries keep theirs in
// space_plan_comments (it carries the cross-Space share rules); events, deals and contacts keep
// theirs in item_comments. Both broadcast new messages from the database to one private topic per
// thread, `thread:<subject_type>:<subject_id>` (migration 20270346310000), and both record what a
// person has read in thread_reads. A Plan's thread, its own and its to-dos', is one topic: 'plan'.

/** The items whose thread lives in item_comments. */
export const ITEM_SUBJECTS = ['event', 'deal', 'contact'] as const
export type ItemSubjectType = (typeof ITEM_SUBJECTS)[number]

/** Every thread kind thread_reads and the live topic know. */
export type ThreadSubjectType = 'plan' | ItemSubjectType

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isItemSubjectType(value: unknown): value is ItemSubjectType {
  return typeof value === 'string' && (ITEM_SUBJECTS as readonly string[]).includes(value)
}

/** The private Broadcast topic a thread's new messages arrive on, or null for a bad id. */
export function threadTopic(type: ThreadSubjectType, id: string): string | null {
  return UUID_RE.test(id) ? `thread:${type}:${id.toLowerCase()}` : null
}

/**
 * The id of the first message the reader has not seen, or null when nothing is new. Their own
 * messages never count as unread, and a thread they have never opened is all new except their own.
 */
export function firstUnreadId(
  messages: readonly { id: string; createdAt: string; authorId: string | null }[],
  lastReadAt: string | null,
  myProfileId: string | null,
): string | null {
  const since = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY
  for (const m of messages) {
    if (m.authorId && m.authorId === myProfileId) continue
    const at = Date.parse(m.createdAt)
    if (Number.isFinite(at) && at > since) return m.id
  }
  return null
}
