import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CIRCLE_MAX_CHANNELS,
  anyChannelFilter,
  carriesChannel,
  circleChannelIds,
  countCirclesPerChannel,
  normalizeCircleChannelIds,
  withChannelAdded,
  withChannelFirst,
  withoutChannel,
} from './channels'

// A CIRCLE CARRIES ONE TO THREE CHANNELS (LIVE-666, ADR-1679). The pure vocabulary: the cap, the
// check a pick passes, the reading of a row, and the filter every "which Circles are in this
// Channel" reader widens its column match with.

describe('the cap', () => {
  it('is three, the same line the table draws', () => {
    expect(CIRCLE_MAX_CHANNELS).toBe(3)
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20270345011400_circle_channels.sql'), 'utf8')
    expect(sql).toMatch(/check \(position between 1 and 3\)/)
    expect(sql).toMatch(/unique \(circle_id, position\)/)
  })
})

describe('normalizeCircleChannelIds', () => {
  it('keeps the order picked, trims, and drops blanks and repeats', () => {
    expect(normalizeCircleChannelIds([' a ', '', 'b', 'a'])).toEqual({ ids: ['a', 'b'] })
  })
  it('allows none (a Circle with no Channel) and three', () => {
    expect(normalizeCircleChannelIds([])).toEqual({ ids: [] })
    expect(normalizeCircleChannelIds(['a', 'b', 'c'])).toEqual({ ids: ['a', 'b', 'c'] })
  })
  it('refuses a fourth, and anything that is not an id', () => {
    expect(normalizeCircleChannelIds(['a', 'b', 'c', 'd'])).toEqual({ problem: 'A Circle can carry up to three Channels.' })
    expect(normalizeCircleChannelIds(['a', 3])).toMatchObject({ problem: expect.any(String) })
  })
})

describe('circleChannelIds', () => {
  it('reads the primary first, then the join by position', () => {
    expect(
      circleChannelIds({
        topical_channel_id: 'a',
        circle_channels: [
          { topical_channel_id: 'c', position: 3 },
          { topical_channel_id: 'a', position: 1 },
          { topical_channel_id: 'b', position: 2 },
        ],
      }),
    ).toEqual(['a', 'b', 'c'])
  })
  it('reads a Circle written before the join, and one left without a primary by a Channel delete', () => {
    expect(circleChannelIds({ topical_channel_id: 'a', circle_channels: null })).toEqual(['a'])
    expect(circleChannelIds({ topical_channel_id: null, circle_channels: [{ topical_channel_id: 'b', position: 2 }] })).toEqual(['b'])
    expect(circleChannelIds({})).toEqual([])
  })
  it('finds a Circle under each Channel it carries', () => {
    const row = { topical_channel_id: 'a', circle_channels: [{ topical_channel_id: 'b', position: 2 }, { topical_channel_id: 'c', position: 3 }] }
    for (const id of ['a', 'b', 'c']) expect(carriesChannel(row, id)).toBe(true)
    expect(carriesChannel(row, 'd')).toBe(false)
  })
})

describe('anyChannelFilter', () => {
  it('is the plain column match when nobody carries the Channel second or third', () => {
    expect(anyChannelFilter('x', [])).toBe('topical_channel_id.eq.x')
  })
  it('widens to the second and third carriers', () => {
    expect(anyChannelFilter('x', ['c1', 'c2'])).toBe('topical_channel_id.eq.x,id.in.(c1,c2)')
  })
  it('lets nothing but a plain id into the filter string', () => {
    expect(() => anyChannelFilter('x,status.eq.draft', [])).toThrow(/not available/)
    expect(() => anyChannelFilter('x)', [])).toThrow(/not available/)
    expect(anyChannelFilter('x', ['c1', 'c2),unlisted.eq.true', 'c 3'])).toBe('topical_channel_id.eq.x,id.in.(c1)')
  })
})

describe('the list moves', () => {
  it('takes one out and the next moves up', () => {
    expect(withoutChannel(['a', 'b', 'c'], 'a')).toEqual(['b', 'c'])
  })
  it('puts a Program stamp first, dropping the last at three', () => {
    expect(withChannelFirst(['a', 'b'], 'p')).toEqual(['p', 'a', 'b'])
    expect(withChannelFirst(['a', 'b', 'c'], 'p')).toEqual(['p', 'a', 'b'])
    expect(withChannelFirst(['a', 'p'], 'p')).toEqual(['p', 'a'])
  })
  it('adds at the end, and refuses a fourth', () => {
    expect(withChannelAdded(['a'], 'b')).toEqual({ ids: ['a', 'b'] })
    expect(withChannelAdded(['a', 'b'], 'a')).toEqual({ ids: ['a', 'b'] })
    expect(withChannelAdded(['a', 'b', 'c'], 'd')).toMatchObject({ problem: expect.stringMatching(/up to three/) })
  })
})

describe('countCirclesPerChannel', () => {
  it('counts each Circle once per Channel, primaries and second-or-third carriers together', () => {
    expect(
      countCirclesPerChannel([
        { circle_id: '1', topical_channel_id: 'a' },
        { circle_id: '2', topical_channel_id: 'a' },
        { circle_id: '1', topical_channel_id: 'b' },
        { circle_id: '1', topical_channel_id: 'a' },
        { circle_id: '3', topical_channel_id: null },
      ]),
    ).toEqual({ a: 2, b: 1 })
  })
})
