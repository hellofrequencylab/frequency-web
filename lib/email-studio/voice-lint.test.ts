import { describe, it, expect } from 'vitest'
import { lintVoice } from './voice-lint'

// The voice lint is the machine-checkable floor under authored email copy (the hard
// rule: no em dashes). It is pure, so its policy is a truth table here — a regression
// that lets an em dash through, or stops flagging a banned phrase, fails the build.
// The presets suite (presets.test.ts) applies the same floor to every shipped preset.

describe('lintVoice — the hard em-dash rule', () => {
  it('flags an em dash as the hard, ship-blocking violation', () => {
    const r = lintVoice('You are in — welcome to Frequency')
    expect(r.hasEmDash).toBe(true)
    expect(r.violations.some((v) => v.rule === 'em-dash')).toBe(true)
  })

  it('flags an en dash too', () => {
    expect(lintVoice('pages 3–5').hasEmDash).toBe(true)
  })

  it('passes clean, plain copy', () => {
    const r = lintVoice('You are in. Here is your invite to Frequency.')
    expect(r.hasEmDash).toBe(false)
    expect(r.violations).toHaveLength(0)
  })
})

describe('lintVoice — soft warnings', () => {
  it('flags a banned vibe-verb', () => {
    const r = lintVoice('Tap into the community near you')
    expect(r.hasEmDash).toBe(false)
    expect(r.violations.some((v) => v.rule === 'banned-phrase')).toBe(true)
  })

  it('flags more than one exclamation point', () => {
    const r = lintVoice('Welcome! You are in! Let us go!')
    expect(r.violations.some((v) => v.rule === 'exclamation')).toBe(true)
  })

  it('allows a single exclamation point', () => {
    const r = lintVoice('You are in. Welcome!')
    expect(r.violations.some((v) => v.rule === 'exclamation')).toBe(false)
  })
})

// BLD-004 (BLD-000 ruling 3): the banned words are Frequency's rule for Frequency's own copy. Owner and theme names
// are exempt, and what an owner writes gets the same findings as suggestions, never as bans.
describe('lintVoice: owner and theme names are exempt (BLD-004)', () => {
  it('reads a banned word inside a named Space or theme as a name, not a phrase', () => {
    expect(lintVoice('Tribe Collective meets on Thursday.').violations.some((v) => v.rule === 'banned-phrase')).toBe(true)
    expect(lintVoice('Tribe Collective meets on Thursday.', { exempt: ['Tribe Collective'] }).violations).toHaveLength(0)
    expect(lintVoice('Elevate Studio opens its doors.', { exempt: ['Elevate Studio', 'New World'] }).violations).toHaveLength(0)
  })

  it('still flags the phrase when it appears outside the name', () => {
    const r = lintVoice('Tribe Collective will help you level up.', { exempt: ['Tribe Collective'] })
    expect(r.violations.map((v) => v.detail).join(' ')).toContain('level up')
    expect(r.violations.map((v) => v.detail).join(' ')).not.toContain('"tribe"')
  })

  it('softens the finding into a suggestion when an owner wrote the copy', () => {
    const r = lintVoice('Come level up with us.', { author: 'owner' })
    expect(r.violations.some((v) => v.rule === 'banned-phrase')).toBe(false)
    expect(r.violations.some((v) => v.rule === 'suggestion')).toBe(true)
  })

  it('keeps Frequency\'s own copy on the banned list by default', () => {
    expect(lintVoice('Come level up with us.').violations.some((v) => v.rule === 'banned-phrase')).toBe(true)
  })
})
