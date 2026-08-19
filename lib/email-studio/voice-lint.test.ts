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
