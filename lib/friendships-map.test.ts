import { describe, it, expect } from 'vitest'
import { bucketFriendships, type FriendshipRpcRow } from './friendships-map'

function row(p: Partial<FriendshipRpcRow>): FriendshipRpcRow {
  return {
    friendship_id: 'f',
    status: 'accepted',
    i_requested: false,
    requested_at: '2026-06-02T00:00:00Z',
    other_id: 'o',
    other_display_name: 'Other',
    other_handle: 'other',
    other_avatar_url: null,
    ...p,
  }
}

describe('bucketFriendships', () => {
  it('routes pending rows by who requested', () => {
    const out = bucketFriendships([
      row({ friendship_id: 'in', status: 'pending', i_requested: false }),
      row({ friendship_id: 'out', status: 'pending', i_requested: true }),
      row({ friendship_id: 'acc', status: 'accepted' }),
    ])
    expect(out.incoming.map((e) => e.id)).toEqual(['in'])
    expect(out.outgoing.map((e) => e.id)).toEqual(['out'])
    expect(out.accepted.map((e) => e.id)).toEqual(['acc'])
  })

  it('maps the other party into a profile shape, coercing nulls', () => {
    const [e] = bucketFriendships([
      row({ status: 'accepted', other_id: 'x', other_display_name: null, other_handle: null, other_avatar_url: 'a.png' }),
    ]).accepted
    expect(e.other).toEqual({ id: 'x', display_name: '', handle: '', avatar_url: 'a.png' })
  })

  it('ignores unknown statuses', () => {
    const out = bucketFriendships([row({ status: 'blocked' })])
    expect(out.incoming).toHaveLength(0)
    expect(out.outgoing).toHaveLength(0)
    expect(out.accepted).toHaveLength(0)
  })
})
