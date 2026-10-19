import { describe, expect, it } from 'vitest'
import {
  cardLine,
  formatCode,
  formatRewardValue,
  normalizeProgramInput,
  readVisitReply,
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
    expect(readVisitReply({ stamped: true, stamps: 2, required: 6, earned: false }, 'Free coffee')).toEqual({
      stamps: 2,
      required: 6,
      rewardTitle: 'Free coffee',
      earnedCode: null,
    })
    expect(
      readVisitReply({ stamped: true, stamps: 0, required: 6, earned: true, reward_code: 'ABC234', reward_title: 'Free coffee' }, 'x'),
    ).toMatchObject({ earnedCode: 'ABC234', rewardTitle: 'Free coffee' })
  })

  it('reads a program that is off as nothing', () => {
    expect(readVisitReply({ stamped: false, stamps: 0, required: 0, earned: false }, 'x')).toBeNull()
    expect(readVisitReply(null, 'x')).toBeNull()
  })
})
