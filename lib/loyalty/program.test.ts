import { describe, expect, it } from 'vitest'
import {
  cardLine,
  formatCode,
  formatRewardValue,
  normalizeProgramInput,
  readStanding,
  readVisitReply,
  standingLine,
  visitsLeft,
} from './program'

describe('normalizeProgramInput', () => {
  it('turns a priced reward on with the defaults', () => {
    const r = normalizeProgramInput({ status: 'on', rewardTitle: ' Free coffee ', rewardValueCents: 550 })
    expect('input' in r && r.input).toEqual({
      status: 'on',
      stampsRequired: 6,
      welcomeStamps: 1,
      rewardTitle: 'Free coffee',
      rewardValueCents: 550,
      rewardNote: null,
      surpriseOdds: 10,
      geofence: false,
    })
  })

  it('refuses to turn on without a reward title, and allows an empty draft off', () => {
    expect(normalizeProgramInput({ status: 'on' })).toEqual({ error: 'Name the reward before turning Regulars on.' })
    expect('input' in normalizeProgramInput({ status: 'off' })).toBe(true)
  })

  it('clamps stamps and welcome stamps to the card limits', () => {
    const r = normalizeProgramInput({ status: 'off', stampsRequired: 40, welcomeStamps: 9, rewardValueCents: -4 })
    expect('input' in r && r.input.stampsRequired).toBe(12)
    expect('input' in r && r.input.welcomeStamps).toBe(2)
    expect('input' in r && r.input.rewardValueCents).toBe(0)
  })

  it('keeps at least two visits to earn', () => {
    expect(normalizeProgramInput({ status: 'off', stampsRequired: 3, welcomeStamps: 2, rewardTitle: 'x' })).toEqual({
      error: 'Welcome stamps must leave at least two visits to earn.',
    })
  })
})

describe('card copy', () => {
  it('counts visits down to the reward', () => {
    expect(visitsLeft(4, 6)).toBe(2)
    expect(visitsLeft(9, 6)).toBe(1)
    expect(cardLine(5, 6, 'free coffee')).toBe('1 more visit to your free coffee')
    expect(cardLine(0, 6, '')).toBe('6 more visits to your reward')
  })

  it('prints values and codes plainly', () => {
    expect(formatRewardValue(600)).toBe('$6')
    expect(formatRewardValue(550)).toBe('$5.50')
    expect(formatRewardValue(0)).toBeNull()
    expect(formatCode('k7q2mx')).toBe('K7Q 2MX')
  })
})

describe('readVisitReply', () => {
  it('reads a stamp and an earned reward', () => {
    expect(readVisitReply({ stamped: true, stamps: 2, required: 6, earned: false }, 'Free coffee', '2026-12-01')).toEqual({
      stamps: 2,
      required: 6,
      rewardTitle: 'Free coffee',
      earnedCode: null,
      surprise: false,
      standing: { regular: false, streakWeeks: 0 },
    })
    expect(
      readVisitReply({ stamped: true, stamps: 0, required: 6, earned: true, reward_code: 'ABC234', reward_title: 'Free coffee' }, 'x', '2026-12-01'),
    ).toMatchObject({ earnedCode: 'ABC234', rewardTitle: 'Free coffee' })
  })

  it('reads a program that is off as nothing', () => {
    expect(readVisitReply({ stamped: false, stamps: 0, required: 0, earned: false }, 'x', '2026-12-01')).toBeNull()
    expect(readVisitReply(null, 'x', '2026-12-01')).toBeNull()
  })
})

describe('readStanding (LIVE-943)', () => {
  it('names a regular at three visits inside 30 days and lets it lapse', () => {
    expect(readStanding(['2026-12-01', '2026-11-20', '2026-11-05'], '2026-12-01').regular).toBe(true)
    expect(readStanding(['2026-12-01', '2026-11-20', '2026-10-25'], '2026-12-01').regular).toBe(false)
    expect(readStanding(['2026-11-01', '2026-10-25', '2026-10-20'], '2026-12-15').regular).toBe(false)
  })
  it('counts weeks in a row, forgives one missed week, and ends at two misses', () => {
    expect(readStanding(['2026-12-01', '2026-11-24', '2026-11-17'], '2026-12-01').streakWeeks).toBe(3)
    expect(readStanding(['2026-12-01', '2026-11-17', '2026-11-10'], '2026-12-01').streakWeeks).toBe(3)
    expect(readStanding(['2026-12-01', '2026-11-10'], '2026-12-01').streakWeeks).toBe(1)
    expect(readStanding(['2026-11-24', '2026-11-17'], '2026-12-01').streakWeeks).toBe(2)
    expect(readStanding([], '2026-12-01')).toEqual({ regular: false, streakWeeks: 0 })
  })
  it('prints the standing line only when there is something to say', () => {
    expect(standingLine({ regular: false, streakWeeks: 1 })).toBeNull()
    expect(standingLine({ regular: true, streakWeeks: 3 })).toBe('A regular here · 3 weeks running')
  })
  it('turns the surprise odds off only on an explicit zero', () => {
    const off = normalizeProgramInput({ status: 'off', surpriseOdds: 0 })
    expect('input' in off && off.input.surpriseOdds).toBe(0)
    const on = normalizeProgramInput({ status: 'off' })
    expect('input' in on && on.input.surpriseOdds).toBe(10)
  })
})
