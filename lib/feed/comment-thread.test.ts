import { describe, it, expect } from 'vitest'
import {
  assembleThread,
  aggregateReactionState,
  type RawComment,
  type CommentReactionState,
} from './comment-thread'

function row(id: string, parent_id: string | null = 'root', created_at = '2026-01-01T00:00:00Z'): RawComment {
  return {
    id,
    body: `body ${id}`,
    created_at,
    parent_id,
    author: {
      id: `u-${id}`,
      display_name: id,
      handle: id,
      avatar_url: null,
      membership_tier: null,
    },
  }
}

const noReactions = new Map<string, CommentReactionState>()

describe('assembleThread', () => {
  it('nests direct replies under their top-level comment', () => {
    const top = [row('a', 'root'), row('b', 'root')]
    const nested = [row('a1', 'a'), row('a2', 'a'), row('b1', 'b')]

    const { comments, total } = assembleThread(top, nested, noReactions)

    expect(comments.map((c) => c.id)).toEqual(['a', 'b'])
    expect(comments[0].replies.map((r) => r.id)).toEqual(['a1', 'a2'])
    expect(comments[1].replies.map((r) => r.id)).toEqual(['b1'])
    // Total counts the WHOLE subtree: 2 top-level + 3 nested.
    expect(total).toBe(5)
  })

  it('preserves incoming order for top-level and nested rows', () => {
    const top = [row('a'), row('b'), row('c')]
    const nested = [row('c1', 'c'), row('a1', 'a')]
    const { comments } = assembleThread(top, nested, noReactions)
    expect(comments.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(comments.find((c) => c.id === 'c')!.replies.map((r) => r.id)).toEqual(['c1'])
  })

  it('drops a nested row whose parent is not a known top-level comment', () => {
    // A reply-to-a-reply ("a1a", parent "a1") would land here if it leaked past
    // the query scoping — it must NOT nest (we only show one level) and must NOT
    // inflate the count.
    const top = [row('a', 'root')]
    const nested = [row('a1', 'a'), row('a1a', 'a1')]
    const { comments, total } = assembleThread(top, nested, noReactions)
    expect(comments[0].replies.map((r) => r.id)).toEqual(['a1'])
    expect(total).toBe(2) // a + a1, not a1a
  })

  it('defaults reaction state to empty when an id is absent from the map', () => {
    const { comments } = assembleThread([row('a')], [], noReactions)
    expect(comments[0].reaction_count).toBe(0)
    expect(comments[0].viewer_reacted).toBe(false)
  })

  it('applies reaction state to top-level and nested comments', () => {
    const reactions = new Map<string, CommentReactionState>([
      ['a', { reaction_count: 3, viewer_reacted: true }],
      ['a1', { reaction_count: 1, viewer_reacted: false }],
    ])
    const { comments } = assembleThread([row('a', 'root')], [row('a1', 'a')], reactions)
    expect(comments[0].reaction_count).toBe(3)
    expect(comments[0].viewer_reacted).toBe(true)
    expect(comments[0].replies[0].reaction_count).toBe(1)
    expect(comments[0].replies[0].viewer_reacted).toBe(false)
  })

  it('returns an empty thread for no comments', () => {
    expect(assembleThread([], [], noReactions)).toEqual({ comments: [], total: 0 })
  })
})

describe('aggregateReactionState', () => {
  it('counts hearts per post and flags the viewer in one pass', () => {
    const rows = [
      { post_id: 'a', profile_id: 'me' },
      { post_id: 'a', profile_id: 'other' },
      { post_id: 'b', profile_id: 'other' },
    ]
    const map = aggregateReactionState(rows, 'me')
    expect(map.get('a')).toEqual({ reaction_count: 2, viewer_reacted: true })
    expect(map.get('b')).toEqual({ reaction_count: 1, viewer_reacted: false })
    expect(map.has('c')).toBe(false)
  })

  it('returns an empty map for no rows', () => {
    expect(aggregateReactionState([], 'me').size).toBe(0)
  })
})
