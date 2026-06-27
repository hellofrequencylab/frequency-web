// Comment-thread assembly — the pure shaping logic behind `fetchReplies`, kept
// out of the server action so it can be unit-tested without a database.
//
// A "comment" is a `posts` row with `parent_id` set. We show ONE level of
// nesting: top-level comments (parent_id = the root post) each carry a `replies`
// array of their direct children. Anything deeper than one level flattens onto
// that same level (we never indent past `ml-8`) — see `assembleThread`.

/** Author shape carried by every comment row (drives avatar + ProfileFlair). */
export type CommentAuthor = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  /** Entitlement tier — drives endorsement (PB.1i: flair keys off the tier). */
  membership_tier: string | null
  current_season_rank?: string | null
  current_streak?: number
  achievement_count?: number
}

/** A raw comment row as fetched (before nesting/reaction state is applied). */
export type RawComment = {
  id: string
  body: string | null
  created_at: string
  parent_id: string | null
  author: CommentAuthor | null
}

/** Per-comment reaction state the viewer's heart button seeds from. */
export type CommentReactionState = {
  reaction_count: number
  viewer_reacted: boolean
}

/** A comment enriched with its reaction state. */
export type CommentLeaf = RawComment & CommentReactionState

/** A top-level comment plus its (one level of) nested replies. */
export type CommentNode = CommentLeaf & {
  /** Direct replies to THIS comment (one level only). */
  replies: CommentLeaf[]
}

/** The assembled thread: a flat array of top-level comments, each with nested
 *  replies, plus the TOTAL count across the whole subtree (top-level + nested). */
export type CommentThread = {
  comments: CommentNode[]
  /** Total comments in the subtree — what the comment counter should show. */
  total: number
}

/**
 * Build a 2-level comment tree from two flat row sets.
 *
 * @param topLevel   rows whose `parent_id` is the root post (direct children).
 * @param nested     rows whose `parent_id` is one of the top-level comment ids.
 *                   A reply whose parent is NOT a known top-level comment is
 *                   dropped (defensive — the queries already scope `nested` to
 *                   top-level ids, so this only guards against deeper rows).
 * @param reactions  per-post reaction state, keyed by post id (heart only).
 *
 * Top-level comments stay in their incoming order (caller sorts ascending by
 * created_at); nested replies likewise. Reaction state defaults to zero/false
 * for any id missing from the map.
 */
export function assembleThread(
  topLevel: RawComment[],
  nested: RawComment[],
  reactions: Map<string, CommentReactionState>,
): CommentThread {
  const reactionFor = (id: string): CommentReactionState =>
    reactions.get(id) ?? { reaction_count: 0, viewer_reacted: false }

  const nodes: CommentNode[] = topLevel.map((c) => ({
    ...c,
    ...reactionFor(c.id),
    replies: [],
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  let nestedCount = 0
  for (const reply of nested) {
    // A reply's parent must be a known top-level comment to nest under it. The
    // SQL already guarantees this (parent_id IN topIds); the guard keeps the
    // assembler honest if a deeper row ever slips through.
    if (!reply.parent_id) continue
    const parent = byId.get(reply.parent_id)
    if (!parent) continue
    parent.replies.push({ ...reply, ...reactionFor(reply.id) })
    nestedCount += 1
  }

  return { comments: nodes, total: nodes.length + nestedCount }
}

/**
 * Aggregate raw `post_reactions` rows into per-post state for the viewer.
 * One pass over all heart rows across every comment id — no N+1.
 *
 * @param rows       `{ post_id, profile_id }` heart reactions over the subtree.
 * @param viewerId   the caller's profile id (decides `viewer_reacted`).
 */
export function aggregateReactionState(
  rows: Array<{ post_id: string; profile_id: string }>,
  viewerId: string,
): Map<string, CommentReactionState> {
  const map = new Map<string, CommentReactionState>()
  for (const { post_id, profile_id } of rows) {
    const cur = map.get(post_id) ?? { reaction_count: 0, viewer_reacted: false }
    cur.reaction_count += 1
    if (profile_id === viewerId) cur.viewer_reacted = true
    map.set(post_id, cur)
  }
  return map
}
