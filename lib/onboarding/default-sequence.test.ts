import { describe, it, expect } from 'vitest'
import { DEFAULT_ONBOARDING_SEQUENCE } from './default-sequence'
import { parseSequenceDef } from './sequence-schema'
import { getStepDef, SEQUENCE_ACTION_KEYS } from './step-registry'

// The code default is the resolver's fail-safe AND the behaviour-preserving mirror of today's
// steady-state flow (app/onboarding/form.tsx). These lock that the default reproduces the four
// steps through the registry, so a future cutover to the SequenceRunner changes nothing.

describe('default onboarding sequence', () => {
  const def = DEFAULT_ONBOARDING_SEQUENCE

  it('mirrors the four steps of the current flow, in order', () => {
    expect(def.steps.map((s) => s.type)).toEqual(['identity', 'profile', 'region', 'review'])
    expect(def.steps.map((s) => s.label)).toEqual(['You', 'About you', 'Your region', 'Review'])
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
