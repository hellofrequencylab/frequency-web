import { describe, it, expect } from 'vitest'
import { DEFAULT_ONBOARDING_SEQUENCE, withConsentStep, CONSENT_STEP } from './default-sequence'
import { parseSequenceDef } from './sequence-schema'
import { getStepDef, SEQUENCE_ACTION_KEYS } from './step-registry'
import { hasConsentStep } from './step-types'

// The code default is the resolver's fail-safe AND the behaviour-preserving mirror of today's
// steady-state flow (app/onboarding/form.tsx). These lock that the default reproduces that flow
// through the registry, so a future cutover to the SequenceRunner changes nothing.
//
// 2026-09-06 (LIVE-168): five steps, not four. form.tsx renders its email opt-in card ON the review
// screen; here it is its own `consent` step, because completeOnboarding records an omitted
// `emailOptIn` as consent WITHHELD and the runner has to be able to see whether a flow asks.

describe('default onboarding sequence', () => {
  const def = DEFAULT_ONBOARDING_SEQUENCE

  it('mirrors the steps of the current flow, in order, with the opt-in before the review', () => {
    expect(def.steps.map((s) => s.type)).toEqual(['identity', 'profile', 'region', 'consent', 'review'])
    expect(def.steps.map((s) => s.label)).toEqual(['You', 'About you', 'Your region', 'Your inbox', 'Review'])
  })

  it('asks the marketing-email question, so nobody is recorded as declining by omission', () => {
    expect(hasConsentStep(def.steps)).toBe(true)
  })

  it('is a structurally valid SequenceDef (parses as config would)', () => {
    expect(parseSequenceDef(def)).not.toBeNull()
  })

  it('every step type is registered in the code step-registry', () => {
    for (const step of def.steps) {
      expect(getStepDef(step.type), `unregistered step type: ${step.type}`).toBeDefined()
    }
  })

  it("each step's content passes its type's contentSchema", () => {
    for (const step of def.steps) {
      const reg = getStepDef(step.type)!
      const result = reg.contentSchema.safeParse(step.content ?? {})
      expect(result.success, `content for ${step.type} failed schema`).toBe(true)
    }
  })

  it('only the terminal step names an action, and it is a known key', () => {
    const withAction = def.steps.filter((s) => s.action)
    expect(withAction).toHaveLength(1)
    const terminal = def.steps[def.steps.length - 1]
    expect(terminal.action).toBe('completeOnboarding')
    expect(SEQUENCE_ACTION_KEYS).toContain(terminal.action)
  })

  it('carries no em dashes in any step copy (voice canon)', () => {
    for (const step of def.steps) {
      for (const value of Object.values(step.content ?? {})) {
        if (typeof value === 'string') expect(value).not.toContain('—')
      }
    }
  })
})

// ── withConsentStep: the runner's fail-safe for a flow that does not ask (LIVE-168) ──────────────
describe('withConsentStep', () => {
  it('leaves a flow that already asks untouched', () => {
    expect(withConsentStep(DEFAULT_ONBOARDING_SEQUENCE.steps)).toEqual([...DEFAULT_ONBOARDING_SEQUENCE.steps])
  })

  it('inserts the consent step BEFORE the terminal step, so the action stays last', () => {
    const steps = [
      { id: 'identity', type: 'identity' },
      { id: 'review', type: 'review', action: 'completeOnboarding' as const },
    ]
    const out = withConsentStep(steps)
    expect(out.map((s) => s.type)).toEqual(['identity', 'consent', 'review'])
    expect(out[out.length - 1].action).toBe('completeOnboarding')
    expect(out[1]).toBe(CONSENT_STEP)
  })

  it('is a no-op on an empty flow (there is no terminal step to sit before)', () => {
    expect(withConsentStep([])).toEqual([])
  })
})
