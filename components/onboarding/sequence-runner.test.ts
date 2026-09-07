import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { withConsentStep, DEFAULT_ONBOARDING_SEQUENCE } from '@/lib/onboarding/default-sequence'
import { hasConsentStep } from '@/lib/onboarding/step-types'

// ── LIVE-168: the runner must never complete onboarding without asking about email ──────────────
//
// completeOnboarding records `email_marketing` as granted only for an explicit `emailOptIn: true`
// (SCAN-604 stopped consent being granted by omission). The sequence runner's terminal binding did
// not pass the field at all, and the file planned a production cutover to it, so cutting over would
// have recorded consent WITHHELD for every member the runner onboards. The fix has two halves and
// both are pinned here: the flow ASKS (a `consent` step, guaranteed by withConsentStep), and the
// answer REACHES the action (the binding passes emailOptIn).
//
// This is a source-shape test on purpose: the runner is a client component with hooks and a server
// action import, and what needs locking is the wiring, not the pixels.

const RUNNER = readFileSync('components/onboarding/sequence-runner.tsx', 'utf8')
// Comments name the field ON PURPOSE (they are the record of what went wrong), and a shape test
// measures code, not prose.
const CODE = RUNNER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the terminal binding carries the consent answer', () => {
  it('passes emailOptIn to completeOnboarding', () => {
    expect(CODE).toMatch(/emailOptIn:/)
    // `=== true` is the same test the action itself applies: an unasked or declined member is
    // recorded as withheld, never as granted.
    expect(CODE).toMatch(/emailOptIn:\s*d\.emailOptIn === true/)
  })

  it('binds every field the draft carries, so nothing else is dropped in silence', () => {
    for (const field of ['displayName', 'handle', 'bio', 'avatarUrl', 'regionId', 'emailOptIn']) {
      expect(CODE, field).toContain(`${field}:`)
    }
  })
})

describe('the flow the runner walks always asks the question', () => {
  it('the steps the runner renders go through withConsentStep', () => {
    expect(CODE).toMatch(/withConsentStep\(/)
    // The guarantee is applied to the GATED list, so a gate cannot hide the question.
    expect(CODE).toMatch(/withConsentStep\(def\.steps\.filter\(/)
  })

  it('a config-authored flow with no consent step gains one before its terminal step', () => {
    const authored = [
      { id: 'identity', type: 'identity' },
      { id: 'region', type: 'region' },
      { id: 'review', type: 'review', action: 'completeOnboarding' as const },
    ]
    expect(hasConsentStep(authored)).toBe(false)
    const walked = withConsentStep(authored)
    expect(hasConsentStep(walked)).toBe(true)
    expect(walked[walked.length - 1].action).toBe('completeOnboarding')
  })

  it('the code default already asks, so the guarantee is a fail-safe and not the normal path', () => {
    expect(hasConsentStep(DEFAULT_ONBOARDING_SEQUENCE.steps)).toBe(true)
  })
})
