import { describe, expect, it } from 'vitest'
import { daysBetween, huntLine, huntLiveBlocker, huntSlug, huntWindow, normalizeHuntInput, readHuntReply } from './hunts'

const good = {
  title: 'Main Street Passport',
  description: '  Visit every shop on the block.  ',
  startsOn: '2026-11-01',
  endsOn: '2026-12-15',
  rewardTitle: 'A $25 gift card',
  rewardValueCents: 2500,
  rewardNote: '',
}

describe('normalizeHuntInput', () => {
  it('accepts a two to ten week hunt with a named reward', () => {
    const r = normalizeHuntInput(good)
    expect('input' in r && r.input.description).toBe('Visit every shop on the block.')
    expect('input' in r && r.input.rewardNote).toBeNull()
  })
  it('refuses a window under two weeks or over ten', () => {
    expect(normalizeHuntInput({ ...good, endsOn: '2026-11-10' })).toEqual({ error: 'A hunt runs two to ten weeks.' })
    expect(normalizeHuntInput({ ...good, endsOn: '2027-02-01' })).toEqual({ error: 'A hunt runs two to ten weeks.' })
  })
  it('needs a name, two dates and a reward', () => {
    expect(normalizeHuntInput({ ...good, title: 'ab' })).toEqual({ error: 'Give the hunt a name.' })
    expect(normalizeHuntInput({ ...good, endsOn: 'soon' })).toEqual({ error: 'Pick a start day and an end day.' })
    expect(normalizeHuntInput({ ...good, rewardTitle: ' ' })).toEqual({ error: 'Name the reward for finishing the hunt.' })
  })
  it('clamps the value to the ceiling and never below zero', () => {
    const r = normalizeHuntInput({ ...good, rewardValueCents: 999_999 })
    expect('input' in r && r.input.rewardValueCents).toBe(100_000)
    const n = normalizeHuntInput({ ...good, rewardValueCents: -5 })
    expect('input' in n && n.input.rewardValueCents).toBe(0)
  })
})

describe('the math', () => {
  it('counts days and prints the window', () => {
    expect(daysBetween('2026-11-01', '2026-12-15')).toBe(44)
    expect(daysBetween('x', '2026-12-15')).toBeNull()
    expect(huntWindow('2026-11-01', '2026-12-15')).toBe('Nov 1 to Dec 15')
  })
  it('makes a slug from the title and a tail', () => {
    expect(huntSlug('Main Street Passport!', 'K7Q2MX')).toBe('main-street-passport-k7q2mx')
    expect(huntSlug('', '')).toBe('hunt-x')
  })
  it('blocks going live under three accepted stops', () => {
    const stop = (status: 'accepted' | 'invited') => ({ spaceId: 'a', spaceName: 'A', spaceSlug: 'a', status, host: false })
    expect(huntLiveBlocker({ stops: [stop('accepted'), stop('accepted'), stop('invited')], endsOn: '2026-12-15' }, '2026-11-01')).toMatch(/3 stops/)
    expect(huntLiveBlocker({ stops: [stop('accepted'), stop('accepted'), stop('accepted')], endsOn: '2026-12-15' }, '2026-11-01')).toBeNull()
    expect(huntLiveBlocker({ stops: [stop('accepted'), stop('accepted'), stop('accepted')], endsOn: '2026-10-01' }, '2026-11-01')).toMatch(/end day/)
  })
  it('counts stops down and announces the finish', () => {
    expect(huntLine({ stopsDone: 3, stopsTotal: 5, completed: false })).toBe('2 stops to go')
    expect(huntLine({ stopsDone: 4, stopsTotal: 5, completed: false })).toBe('1 stop to go')
    expect(huntLine({ stopsDone: 5, stopsTotal: 5, completed: true })).toBe('You finished the hunt')
  })
})

describe('readHuntReply', () => {
  it('narrows the list and drops malformed rows', () => {
    const out = readHuntReply([
      { hunt_id: 'h1', slug: 's', title: 'T', host_space_id: 'sp', stops_done: 5, stops_total: 5, completed: true, earned: true, reward_code: 'ABCDEF', reward_title: 'Gift card' },
      { hunt_id: 'h2', slug: 's2', stops_total: 0 },
      null,
    ])
    expect(out).toHaveLength(1)
    expect(out[0].earnedCode).toBe('ABCDEF')
    expect(readHuntReply({ not: 'a list' })).toEqual([])
  })
})
