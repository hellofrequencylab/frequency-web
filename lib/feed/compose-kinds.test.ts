import { describe, it, expect } from 'vitest'
import { dispatchScopesFor, normalizePollOptions, DISPATCH_VISIBILITY, isDispatchScope } from './compose-kinds'
import { applyVote, votePercent, type PollView } from './poll-tally'
import { shareLine } from './share-line'

// LIVE-682: the composer's kinds. One rule decides what the box offers and what createPost accepts.

describe('normalizePollOptions', () => {
  it('trims, drops empties and case-insensitive repeats', () => {
    expect(normalizePollOptions([' Yes ', '', 'yes', 'No'])).toEqual({ ok: true, options: ['Yes', 'No'] })
  })
  it('needs two different options', () => {
    expect(normalizePollOptions(['Only', 'only']).ok).toBe(false)
  })
  it('holds at most six and caps each label', () => {
    expect(normalizePollOptions(['a', 'b', 'c', 'd', 'e', 'f', 'g']).ok).toBe(false)
    expect(normalizePollOptions(['x'.repeat(81), 'b']).ok).toBe(false)
  })
})

describe('dispatchScopesFor', () => {
  it('gives a member nothing', () => {
    expect(dispatchScopesFor({ communityRole: 'member', isStaff: false, hasRegion: true })).toEqual([])
  })
  it('gives a host their Circle and Hub', () => {
    expect(dispatchScopesFor({ communityRole: 'host', isStaff: false, hasRegion: true })).toEqual(['circle', 'hub'])
  })
  it('adds the Nexus for a Mentor with a region, and only then', () => {
    expect(dispatchScopesFor({ communityRole: 'mentor', isStaff: false, hasRegion: true })).toEqual(['circle', 'hub', 'nexus'])
    expect(dispatchScopesFor({ communityRole: 'mentor', isStaff: false, hasRegion: false })).toEqual(['circle', 'hub'])
  })
  it('adds Everyone for staff', () => {
    expect(dispatchScopesFor({ communityRole: 'member', isStaff: true, hasRegion: false })).toEqual(['circle', 'hub', 'everyone'])
  })
  it('maps each scope to a post visibility the feed already reads', () => {
    expect(DISPATCH_VISIBILITY).toEqual({ circle: 'group', hub: 'cluster', nexus: 'region', everyone: 'public' })
    expect(isDispatchScope('hub')).toBe(true)
    expect(isDispatchScope('global')).toBe(false)
  })
})

describe('applyVote', () => {
  const poll: PollView = {
    options: [
      { id: 'a', label: 'A', votes: 2 },
      { id: 'b', label: 'B', votes: 1 },
    ],
    total: 3,
    myOptionId: null,
  }
  it('adds a first vote', () => {
    expect(applyVote(poll, 'a')).toMatchObject({ total: 4, myOptionId: 'a', options: [{ votes: 3 }, { votes: 1 }] })
  })
  it('moves a vote to another option', () => {
    expect(applyVote({ ...poll, myOptionId: 'a' }, 'b')).toMatchObject({ total: 3, myOptionId: 'b', options: [{ votes: 1 }, { votes: 2 }] })
  })
  it('takes a vote back on a second tap', () => {
    expect(applyVote({ ...poll, myOptionId: 'b' }, 'b')).toMatchObject({ total: 2, myOptionId: null, options: [{ votes: 2 }, { votes: 0 }] })
  })
  it('ignores an option not on the poll', () => {
    expect(applyVote(poll, 'z')).toBe(poll)
  })
  it('reads 0% before anyone votes', () => {
    expect(votePercent(0, 0)).toBe(0)
    expect(votePercent(1, 3)).toBe(33)
  })
})

describe('shareLine', () => {
  it('links a Practice and a Journey, keeping the link intact', () => {
    expect(shareLine({ kind: 'practice', label: 'Box [breath]', href: '/practices/p1' })).toBe('I’m practicing [Box breath](/practices/p1)')
    expect(shareLine({ kind: 'journey', label: 'Sleep well', href: '/journeys/sleep' })).toBe('I’m on the [Sleep well](/journeys/sleep) Journey')
  })
})
