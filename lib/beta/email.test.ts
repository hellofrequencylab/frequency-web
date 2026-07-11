import { describe, it, expect } from 'vitest'
import { lintVoice, BETA_FUNNEL_PERSONA_PREFIX, BETA_RULE_NAME_PREFIX } from './email'
import { BETA_CAMPAIGN_TEMPLATES, BETA_NURTURE_TEMPLATES } from './email-templates'

// The voice lint is the machine-checkable floor the Ready gate runs (the hard rule:
// no em dashes). It is pure, so its policy is a truth table here — a regression that
// lets an em dash through, or stops flagging a banned phrase, fails the build. The
// authored templates are held to the same floor so we never ship copy we would refuse.

describe('lintVoice — the hard em-dash rule', () => {
  it('flags an em dash as the hard, Ready-blocking violation', () => {
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

describe('authored beta templates are voice-clean', () => {
  const all = [...BETA_CAMPAIGN_TEMPLATES, ...BETA_NURTURE_TEMPLATES]

  it('every template has a subject and body', () => {
    for (const t of all) {
      expect(t.subject.trim().length).toBeGreaterThan(0)
      expect(t.body.trim().length).toBeGreaterThan(0)
    }
  })

  it('no template contains an em dash (the hard rule)', () => {
    for (const t of all) {
      expect(lintVoice(`${t.subject}\n${t.body}`).hasEmDash).toBe(false)
    }
  })

  it('no template trips a banned phrase or double exclamation', () => {
    for (const t of all) {
      const r = lintVoice(`${t.subject}\n${t.body}`)
      expect(r.violations, `${t.label}: ${r.violations.map((v) => v.detail).join('; ')}`).toHaveLength(0)
    }
  })
})

describe('beta scoping markers', () => {
  it('are stable strings the reads + seed agree on', () => {
    expect(BETA_FUNNEL_PERSONA_PREFIX).toBe('beta_')
    expect(BETA_RULE_NAME_PREFIX).toBe('Beta:')
  })
})
