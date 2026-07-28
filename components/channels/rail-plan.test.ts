import { describe, it, expect } from 'vitest'
import {
  channelRailModules,
  channelPulseTiles,
  isChannelPulseQuiet,
  type ChannelPulseInput,
} from './rail-plan'

describe('channelRailModules — what the Channel scope rail carries per tab', () => {
  it('carries all three modules on Home, Feed and About', () => {
    for (const tab of ['home', 'feed', 'about'] as const) {
      expect(channelRailModules(tab), tab).toEqual(['activity', 'upcoming', 'groups'])
    }
  })

  it('drops the Circles module on the directory tab (the body is already the full directory)', () => {
    expect(channelRailModules('groups')).toEqual(['activity', 'upcoming'])
  })

  it('always keeps the pulse and the upcoming strip, on every tab', () => {
    for (const tab of ['home', 'feed', 'groups', 'about'] as const) {
      expect(channelRailModules(tab), tab).toContain('activity')
      expect(channelRailModules(tab), tab).toContain('upcoming')
    }
  })
})

describe('channelPulseTiles — raw counts to rail tiles', () => {
  const base: ChannelPulseInput = { tunedIn: 1, circleCount: 1, postCount: 0, roomMessages7d: 0 }

  it('keeps zero tiles (a new Channel is the normal resting state, not a failure)', () => {
    const tiles = channelPulseTiles(base, 'Circles')
    expect(tiles.map((t) => t.key)).toEqual(['tuned-in', 'groups', 'posts', 'room'])
    expect(tiles.map((t) => t.value)).toEqual([1, 1, 0, 0])
  })

  it('drops the room tile only when the Channel has no open room', () => {
    const tiles = channelPulseTiles({ ...base, roomMessages7d: null }, 'Circles')
    expect(tiles.map((t) => t.key)).toEqual(['tuned-in', 'groups', 'posts'])
  })

  it('labels the group tile with the Channel kind (Chapters on a Program)', () => {
    expect(channelPulseTiles(base, 'Chapters')[1].label).toBe('Chapters')
    expect(channelPulseTiles(base, 'Circles')[1].label).toBe('Circles')
  })
})

describe('isChannelPulseQuiet — whether to add the orienting line', () => {
  it('is quiet with no posts and no room traffic', () => {
    expect(isChannelPulseQuiet({ tunedIn: 1, circleCount: 1, postCount: 0, roomMessages7d: 0 })).toBe(true)
    expect(isChannelPulseQuiet({ tunedIn: 9, circleCount: 3, postCount: 0, roomMessages7d: null })).toBe(true)
  })

  it('is not quiet once anything has been said', () => {
    expect(isChannelPulseQuiet({ tunedIn: 1, circleCount: 0, postCount: 2, roomMessages7d: 0 })).toBe(false)
    expect(isChannelPulseQuiet({ tunedIn: 1, circleCount: 0, postCount: 0, roomMessages7d: 5 })).toBe(false)
  })
})
