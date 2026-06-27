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

/** Per-comment reaction state the viewer's reaction bar seeds from. `reaction_count`
 *  / `viewer_reacted` are the rolled-up totals (any emoji); `reactions` is the raw
 *  rows so the emoji `ReactionBar` can group them per emoji for grouped counts. */
export type CommentReactionState = {
  reaction_count: number
  viewer_reacted: boolean
}

/** A single reaction row on a comment: one per (comment, profile, emoji). The
 *  `ReactionBar` groups these by `reaction_type` to show per-emoji counts and
 *  highlight the viewer's own. */
export type ReactionRow = {
  reaction_type: string
  profile_id: string
}

/** A comment enriched with its reaction state plus the raw reaction rows (the
 *  emoji bar groups `reactions`; `reaction_count` / `viewer_reacted` stay for any
 *  consumer that only needs the rolled-up totals). */
export type CommentLeaf = RawComment & CommentReactionState & { reactions: ReactionRow[] }

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
 * @param reactions  per-post rolled-up reaction state, keyed by post id (any emoji).
 * @param reactionRows  per-post RAW reaction rows, keyed by post id, so each leaf
 *                   carries the rows the emoji `ReactionBar` groups. Optional;
 *                   defaults to no rows (every leaf gets an empty `reactions` array).
 *
 * Top-level comments stay in their incoming order (caller sorts ascending by
 * created_at); nested replies likewise. Reaction state defaults to zero/false/[]
 * for any id missing from the maps.
 */
export function assembleThread(
  topLevel: RawComment[],
  nested: RawComment[],
  reactions: Map<string, CommentReactionState>,
  reactionRows: Map<string, ReactionRow[]> = new Map(),
): CommentThread {
  const reactionFor = (id: string): CommentReactionState & { reactions: ReactionRow[] } => ({
    ...(reactions.get(id) ?? { reaction_count: 0, viewer_reacted: false }),
    reactions: reactionRows.get(id) ?? [],
  })

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
 * Aggregate raw `post_reactions` rows into per-post rolled-up state for the
 * viewer. One pass over every reaction row across every comment id — no N+1.
 * Counts ALL emoji together (the rolled-up total / "did the viewer react at all").
 *
 * @param rows       `{ post_id, profile_id }` reactions over the subtree.
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

/**
 * Bucket raw reaction rows by their post id, preserving emoji + profile so the
 * emoji `ReactionBar` can group per-emoji counts and highlight the viewer's own.
 * One pass over every row across the subtree — no N+1.
 */
export function groupReactionRows(
  rows: Array<{ post_id: string } & ReactionRow>,
): Map<string, ReactionRow[]> {
  const map = new Map<string, ReactionRow[]>()
  for (const { post_id, reaction_type, profile_id } of rows) {
    const list = map.get(post_id) ?? []
    list.push({ reaction_type, profile_id })
    map.set(post_id, list)
  }
  return map
}
